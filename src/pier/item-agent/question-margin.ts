import { decimal, fail, format, type State } from '../model';
import { amount, extended, money } from '../money';
import { reports } from '../reports';

/** Use the same retained shipment layers and reserved cost layers as Reports. */
export function marginQuestion(s: State, params: URLSearchParams, now: string) {
  const from = s.shipments.map(shipment => shipment.createdAt.slice(0, 10)).sort()[0] ?? now.slice(0, 10);
  const report = reports(s, new URLSearchParams({ from }), now), orderId = params.get('orderId');
  const selected = s.orders.filter(order => order.documentType !== 'quote' && (!orderId || order.id === orderId));
  if (orderId && !selected.length) fail('NOT_FOUND', 'Choose a current sales order.');
  const orders = selected.map(order => {
    const lines = order.lines.map((line: any) => {
      const quantity = decimal(line.quantity) - decimal(line.cancelled), evidence = report.orderCosts[line.id];
      const coveredQuantity = evidence ? decimal(evidence.quantity) : 0n;
      const coveredCost = evidence?.cost ?? (coveredQuantity === 0n ? money(0n) : null);
      const revenue = typeof line.price === 'string' ? money(extended(format(quantity), line.price)) : null;
      const coveredRevenue = typeof line.price === 'string' ? money(extended(format(coveredQuantity), line.price)) : null;
      const cost = quantity === coveredQuantity ? coveredCost : null;
      return { orderLineId: line.id, itemId: line.itemId, unit: s.items.find(item => item.id === line.itemId)?.unit,
        quantity: format(quantity), dispatched: line.dispatched, costedQuantity: format(coveredQuantity),
        uncostedQuantity: format(quantity > coveredQuantity ? quantity - coveredQuantity : 0n),
        revenue, cost, margin: revenue === null || cost === null ? null : money(amount(revenue) - amount(cost)),
        coveredRevenue, coveredCost, coveredMargin: coveredRevenue === null || coveredCost === null ? null : money(amount(coveredRevenue) - amount(coveredCost)),
      };
    });
    const sum = (field: 'revenue' | 'cost' | 'margin') => lines.some((line: any) => line[field] === null) ? null : money(lines.reduce((n: bigint, line: any) => n + amount(line[field]), 0n));
    const margin = sum('margin');
    return { orderId: order.id, reference: order.reference, version: order.version, currency: 'USD', lines,
      revenue: sum('revenue'), cost: sum('cost'), margin,
      assessment: margin === null ? 'Unknown: unpriced demand or incomplete retained cost evidence.' : amount(margin) < 0n ? 'Loss on recorded goods revenue and retained costs.' : 'Non-negative recorded goods margin.',
      shipments: report.margin.rows.filter(row => row.orderId === order.id),
      reservations: s.reservations.filter(r => r.orderId === order.id).map(r => ({ reservationId: r.id, orderLineId: r.orderLineId, itemId: r.itemId, locationId: r.locationId, quantity: format(BigInt(r.quantity)) })),
    };
  });
  return { currency: 'USD', method: report.method, asOf: report.asOf, orders,
    uncertainty: 'Operational goods margin uses Reports’ retained shipment COGS and current reserved layers. Backordered or unvalued quantities have unknown cost, never zero cost. Revenue excludes cancelled units; financial credits, returns, tax and shipping revenue are not reconciled here. Reserved cost can change before dispatch.' };
}
