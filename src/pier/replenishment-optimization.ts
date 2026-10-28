import { decimal, format, SCALE, type Context } from './model';
import { amount, money } from './money';
import { adjustedForecast } from './replenishment-forecast';
import { compareReplenishment } from './replenishment-alternatives';
import { effectivePolicy } from './replenishment-scope';
import { signedQuantity, supplyPosition } from './replenishment-position';
import { valuationLedger } from './valuation-ledger';
import { reviewedTransfers } from './replenishment-transfers';
import { returnCost } from './returns-cost';

const positive = (n: bigint) => n > 0n ? n : 0n;

/** Completed and still-overdue supplier commitments both contribute evidence. */
function reliability(c: Context, supplierId: string, itemId: string) {
  const rows = c.s.purchaseOrders.filter(po => po.supplierId === supplierId && po.status === 'committed' && po.lines.some((l: any) => l.itemId === itemId))
    .flatMap(po => {
      const due = po.confirmation?.promiseDate ?? po.promiseDate;
      const lines = po.lines.filter((l: any) => l.itemId === itemId);
      const receipts = c.s.receipts.filter(r => r.poId === po.id && r.status === 'posted' && r.lines.some((l: any) => l.itemId === itemId));
      const complete = lines.every((l: any) => decimal(l.received) >= decimal(l.quantity));
      const through = complete ? receipts.map(r => r.createdAt.slice(0, 10)).sort().at(-1) : c.now.slice(0, 10);
      if (!through || !due || (!complete && through <= due)) return [];
      return [{ poId: po.id, receiptIds: receipts.map(r => r.id), complete, lateDays: Math.max(0, Math.ceil((Date.parse(through) - Date.parse(due)) / 86_400_000)) }];
    });
  return { samples: rows, delayDays: rows.length ? Math.max(...rows.map(r => r.lateDays)) : null,
    onTime: rows.filter(r => r.complete && r.lateDays === 0).length,
    basis: 'Worst observed delay among completed or currently overdue item commitments; no supplier guarantee is inferred without evidence.' };
}

function realizedMargin(c: Context, itemId: string) {
  if (c.actor.role !== 'owner') return { quantity: '0', revenue: null, cost: null, margin: null, shipmentIds: [], unitRevenue: null,
    basis: 'Current owner authority is required for sales revenue and realized margin. No wider commercial read grant is introduced by a forecast.' };
  const ledger = valuationLedger(c.s, c.now);
  let quantity = 0n, revenue = 0n, cost = 0n;
  const shipmentIds: string[] = [], returnIds: string[] = [];
  let returnedQuantity = 0n, returnValue = 0n, recoveredCost = 0n;
  for (const shipment of c.s.shipments.filter(sh => sh.createdAt <= c.now)) {
    const lines = shipment.lines.filter((l: any) => l.itemId === itemId && !l.components);
    if (!lines.length) continue;
    const order = c.s.orders.find(o => o.id === shipment.orderId);
    const prices = lines.map((line: any) => order?.lines.find((l: any) => l.id === line.orderLineId)?.price);
    const layers = ledger.consumed.get(`${shipment.id}:${itemId}`);
    if (prices.some((price: any) => typeof price !== 'string') || !layers?.length || layers.some(l => l.value === null)) continue;
    quantity += lines.reduce((n: bigint, line: any) => n + decimal(line.quantity), 0n);
    revenue += lines.reduce((n: bigint, line: any, index: number) => n + decimal(line.quantity) * decimal(prices[index]), 0n);
    cost += layers.reduce((n, l) => n + l.value!, 0n); shipmentIds.push(shipment.id);
  }
  for (const returned of c.s.returns.filter(r => shipmentIds.includes(r.shipmentId) && r.itemId === itemId && r.createdAt <= c.now)) {
    const shipment = c.s.shipments.find(sh => sh.id === returned.shipmentId)!;
    const line = shipment.lines.find((l: any) => l.id === returned.shipmentLineId)!;
    const price = c.s.orders.find(o => o.id === shipment.orderId)?.lines.find((l: any) => l.id === line.orderLineId)?.price;
    const restored = returnCost(c.s, returned, c.now);
    if (typeof price !== 'string' || restored === null) continue;
    returnedQuantity += decimal(returned.quantity); returnValue += decimal(returned.quantity) * decimal(price);
    // Quarantined and damaged goods do not recover sellable cost for planning.
    recoveredCost += decimal(returned.quantity) ? amount(restored) * decimal(returned.restocked ?? '0') / decimal(returned.quantity) : 0n;
    returnIds.push(returned.id);
  }
  const netRevenue = revenue - returnValue, netCost = cost - recoveredCost;
  return { quantity: format(quantity), revenue: money(netRevenue), cost: money(netCost), margin: money(netRevenue - netCost), shipmentIds,
    returnedQuantity: format(returnedQuantity), returnValue: money(returnValue), recoveredCost: money(recoveredCost), returnIds,
    unitRevenue: quantity ? format(netRevenue / quantity) : null,
    basis: 'Retained priced native shipments with known consumed valuation layers, less returned sales at their original price and sellable recovered cost. Return value is conservatively reserved before a refund settles. Unpriced, unvalued and kit lines are excluded; no margin is invented.' };
}

export function optimization(c: Context, f: any, cashCeiling: string, transferQuotes?: any) {
  const forecast = adjustedForecast(c, { ...f, includedWarehousesForDemand: f.scope === 'company' ? f.includedWarehouses : [f.warehouse] });
  const margin = realizedMargin(c, f.itemId);
  const budget = decimal(cashCeiling) * SCALE;
  const purchases = c.s.supplierItems.filter(t => t.itemId === f.itemId).flatMap(terms => {
    const supplier = reliability(c, terms.supplierId, f.itemId);
    const delay = supplier.delayDays ?? 0;
    const candidate = { ...f, terms, supplierId: terms.supplierId, packSize: terms.packSize, minimum: terms.minimum, unitPrice: terms.price,
      leadDays: (terms.supplierId === f.supplierId ? f.leadDays : terms.leadDays) + delay, observedSold: forecast.expected };
    const comparison = compareReplenishment(candidate, cashCeiling);
    const cash = comparison.options.find(o => o.name === 'cash-constrained')!;
    const service = compareReplenishment({ ...candidate, observedSold: forecast.high }, cashCeiling).options.find(o => o.name === 'stretch')!;
    return [cash, service].map(option => ({ ...option, kind: 'purchase', supplierId: terms.supplierId, reliability: supplier,
      objective: option === cash ? 'cash' : 'service',
      expectedContribution: margin.unitRevenue === null ? null : money(decimal(option.quantity) * decimal(margin.unitRevenue) - amount(option.expectedLandedCost)),
      command: { type: 'replenishment.plan', payload: { stateVersion: c.s.version + 1, lines: [{ itemId: f.itemId, warehouse: f.warehouse, supplierId: terms.supplierId, quantity: option.quantity }] } } }));
  });
  const transfers = f.scope === 'company' ? [] : f.includedWarehouses.filter((warehouse: string) => warehouse !== f.warehouse).flatMap((warehouse: string) => {
    const position = supplyPosition(c, f.itemId, warehouse);
    const buffer = effectivePolicy(c, f.itemId, warehouse).policy?.safetyStock ?? '0';
    const free = positive(signedQuantity(position.onHand) - signedQuantity(position.openDemand) - signedQuantity(position.outboundTransfers) - decimal(buffer));
    const need = positive(decimal(forecast.high) * BigInt(f.leadDays + 2 * f.reviewDays) / BigInt(f.windowDays) + decimal(f.safetyStock) - signedQuantity(f.position) - decimal(f.draftQuantity));
    const quantity = free < need ? free : need;
    return [{ kind: 'transfer', fromWarehouse: warehouse, toWarehouse: f.warehouse, quantity: format(quantity), protectedSafetyStock: buffer,
      available: quantity > 0n, executable: false, arrivalDate: null, expectedLandedCost: null,
      reason: 'Review source and destination bins, transit location, arrival date and transport cost through the transfer door. No unreviewed timing or cost assumption competes with a priced purchase.',
      sourcePosition: position }];
  });
  const reviewed = reviewedTransfers(c, f, forecast, transferQuotes, margin.unitRevenue);
  const ranked = (objective: string) => [...purchases, ...reviewed].filter(o => o.objective === objective && o.executable && (objective !== 'cash' || amount(o.expectedLandedCost) <= budget))
    .sort((a, b) => {
      if (objective === 'cash' && a.expectedContribution !== null && b.expectedContribution !== null) {
        const score = amount(a.expectedContribution) * (amount(b.expectedLandedCost) || 1n) - amount(b.expectedContribution) * (amount(a.expectedLandedCost) || 1n);
        if (score) return score > 0n ? -1 : 1;
      }
      const shortage = decimal(a.uncoveredAtHorizon) - decimal(b.uncoveredAtHorizon);
      return shortage ? shortage < 0n ? -1 : 1 : a.leadDays - b.leadDays || (amount(a.expectedLandedCost) < amount(b.expectedLandedCost) ? -1 : amount(a.expectedLandedCost) > amount(b.expectedLandedCost) ? 1 : String('supplierId' in a ? a.supplierId : a.fromWarehouse).localeCompare(String('supplierId' in b ? b.supplierId : b.fromWarehouse)));
    });
  return { forecast, realizedMargin: margin, alternatives: purchases, transfers: transferQuotes === undefined ? transfers : reviewed,
    rankings: { cash: ranked('cash'), service: ranked('service') },
    limits: 'Single-item scenario comparison. Cash ranks expected contribution per dollar where realized pricing exists, then uncovered demand, delay and cost. Service covers the upper scenario over two review periods. Reviewed transfers compete on incremental transport cash, retained stock cost, arrival and source-safe quantity. Estimates grant no stock or spending authority; no global optimum or service probability is claimed.' };
}
