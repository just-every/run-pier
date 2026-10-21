import { forecast } from './replenishment';
import { overdueDispatch } from "./floor/dispatch-board";
import { decimal, fail, format, type State } from './model';
import { stockInactivity } from './stock-inactivity';
import { amount, extended, money } from './money';
import { takeLayers, valuationLedger, type Layer } from './valuation-ledger';

function date(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('REPORT_DATE', `Choose a valid ${name} date.`);
  return value;
}
const valueOf = (layers: Layer[]) => layers.some(l => l.value === null) ? null : layers.reduce((n, l) => n + l.value!, 0n);
const display = (n: bigint | null) => n === null ? null : money(n);
type Margin = { key?: string; quantity: string; revenue: string | null; cost: string | null; margin: string | null; [key: string]: any };
function group(rows: Margin[], field: string) {
  const groups = new Map<string, Margin[]>();
  for (const row of rows) groups.set(row[field], [...(groups.get(row[field]) ?? []), row]);
  return [...groups].map(([key, lines]) => ({ key, ...marginTotal(lines) }));
}
function marginTotal(rows: Margin[]) {
  const total = (field: string) => rows.some(row => row[field] === null) ? null : rows.reduce((n, row) => n + amount(row[field]), 0n);
  const revenue = total('revenue'), cost = total('cost');
  return { quantity: format(rows.reduce((n, row) => n + decimal(row.quantity), 0n)), revenue: display(revenue), cost: display(cost), margin: display(revenue === null || cost === null ? null : revenue - cost) };
}

export function reports(s: State, params: URLSearchParams, now = new Date().toISOString()) {
  const today = now.slice(0, 10), asOf = date(params.get('asOf') || today, 'as-of');
  const from = date(params.get('from') || asOf.slice(0, 7) + '-01', 'start');
  const to = date(params.get('to') || asOf, 'end');
  if (from > to || to > asOf || asOf > today) fail('REPORT_DATE', 'Use a start date before the end date, and an end date on or before the as-of date.');
  const rawDays = params.get('days') || String(s.slowStockPolicies[0]?.deadDays ?? 180);
  if (!/^\d{1,5}$/.test(rawDays) || Number(rawDays) < 1 || Number(rawDays) > 36500) fail('REPORT_DAYS', 'Use a whole number of days between 1 and 36500.');
  const days = Number(rawDays), end = asOf + 'T23:59:59.999Z';
  const ledger = valuationLedger(s, end);
  const valuationRows = ledger.positions.filter(p => p.layers.some(l => l.quantity > 0n)).map(p => {
    const layers = p.layers.filter(l => l.quantity > 0n);
    return { itemId: p.itemId, locationId: p.locationId, status: p.status,
      quantity: format(layers.reduce((n, l) => n + l.quantity, 0n)), value: display(valueOf(layers)),
      unvaluedQuantity: format(layers.filter(l => l.value === null).reduce((n, l) => n + l.quantity, 0n)),
      layers: layers.map(l => ({ ...l, quantity: format(l.quantity), value: display(l.value) })),
    };
  });
  const allLayers = ledger.positions.flatMap(p => p.layers).filter(l => l.quantity > 0n);
  const closing = valueOf(allLayers);
  const consumed = new Map([...ledger.consumed].map(([key, layers]) => [key, structuredClone(layers)]));
  const rows: Margin[] = [];
  const lineCosts = new Map<string, Layer[]>();
  const costed = (orderLineId: string, layers: Layer[]) => lineCosts.set(orderLineId, [...(lineCosts.get(orderLineId) ?? []), ...layers]);
  for (const shipment of s.shipments.filter(sh => sh.createdAt <= end)) {
    const order = s.orders.find(o => o.id === shipment.orderId)!;
    for (const line of shipment.lines) {
      const source = consumed.get(`${shipment.id}:${line.itemId}`) ?? [];
      const layers = takeLayers(source, decimal(line.quantity));
      costed(line.orderLineId, layers);
      if (shipment.createdAt.slice(0, 10) < from || shipment.createdAt.slice(0, 10) > to) continue;
      const orderLine = order.lines.find((l: any) => l.id === line.orderLineId);
      const revenue = typeof orderLine?.price === 'string' ? extended(line.quantity, orderLine.price) : null;
      const cost = valueOf(layers);
      rows.push({ shipmentId: shipment.id, orderId: order.id, itemId: line.itemId, customerId: order.customerId,
        channel: order.channel ?? 'manual', date: shipment.createdAt, quantity: line.quantity,
        revenue: display(revenue), cost: display(cost), margin: display(revenue === null || cost === null ? null : revenue - cost) });
    }
  }
  // Reserved quantities take their bin's sellable layers in reservation order,
  // the order dispatch will consume them in; a shortfall leaves the line unvalued.
  const reservedLayers = new Map(ledger.positions.filter(p => p.status === 'sellable').map(p => [`${p.itemId}:${p.locationId}`, structuredClone(p.layers.filter(l => l.quantity > 0n))]));
  for (const reservation of s.reservations) {
    const layers = reservedLayers.get(`${reservation.itemId}:${reservation.locationId}`) ?? [];
    const quantity = BigInt(reservation.quantity), held = layers.reduce((n, l) => n + l.quantity, 0n);
    costed(reservation.orderLineId, quantity > held ? [...takeLayers(layers, held), { quantity: quantity - held, value: null, sourceId: '', receivedAt: '' }] : takeLayers(layers, quantity));
  }
  const orderCosts = Object.fromEntries([...lineCosts].map(([orderLineId, layers]) => [orderLineId, { quantity: format(layers.reduce((n, l) => n + l.quantity, 0n)), cost: display(valueOf(layers)) }]));
  const inactivity = stockInactivity(s, valuationRows, end);
  const deadRows = inactivity.filter(row => row.inactiveDays >= days);
  const t = ledger.totals, expected = t.receipts + t.openings + t.returns + t.adjustments - t.cogs;
  const lowStock = forecast({ s, now, commandId: '', actor: { id: '', name: '', role: 'viewer', sessionId: '', operatorVersion: 0 } }).filter(f => f.configured && f.low);
  return { lowStock, overdueOrders: overdueDispatch(s, asOf), currency: 'USD', asOf, from, to, timezone: 'UTC', method: ledger.method, methodHistory: ledger.history,
    valuation: { rows: valuationRows, total: display(closing), unvaluedQuantity: format(allLayers.filter(l => l.value === null).reduce((n, l) => n + l.quantity, 0n)),
      reconciliation: { ...Object.fromEntries(Object.entries(t).map(([key, n]) => [key, ledger.incomplete.has(key as keyof typeof t) ? null : money(n)])), closing: display(closing), difference: closing === null || ledger.incomplete.size ? null : money(closing - expected) } },
    margin: { rows, bySku: group(rows, 'itemId'), byChannel: group(rows, 'channel'), byCustomer: group(rows, 'customerId'), ...marginTotal(rows),
      unpricedLines: rows.filter(r => r.revenue === null).length, unvaluedLines: rows.filter(r => r.cost === null).length },
    // Each order line's own cost: the layers its dispatches consumed and its reservations hold.
    orderCosts,
    inactivity,
    deadStock: { days, rows: deadRows, total: deadRows.some(r => r.value === null) ? null : money(deadRows.reduce((n, r) => n + amount(r.value!), 0n)) },
  };
}
