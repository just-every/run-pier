import { available, decimal, fail, format, get, MAX, SCALE, text, type Context } from './model';
import { ceilDivide, signedQuantity, supplyPosition } from './replenishment-position';
import { effectivePolicy } from './replenishment-scope';
import { money } from './money';
import { takeLayers, valuationLedger } from './valuation-ledger';

const positive = (n: bigint) => n > 0n ? n : 0n;

/** Reserve neither future receipts nor another warehouse's demand for a comparison. */
export function transferSurplus(c: Context, itemId: string, warehouse: string) {
  const position = supplyPosition(c, itemId, warehouse);
  const safetyStock = effectivePolicy(c, itemId, warehouse).policy?.safetyStock ?? '0';
  return { position, safetyStock, quantity: positive(signedQuantity(position.onHand) - signedQuantity(position.openDemand)
    - signedQuantity(position.outboundTransfers) - decimal(safetyStock)) };
}

export function reviewedTransfers(c: Context, f: any, forecast: any, quotes: any, unitRevenue: string | null) {
  if (quotes === undefined) return [];
  if (!Array.isArray(quotes) || quotes.length > 20) fail('TRANSFER_REVIEW', 'Review at most twenty transfer alternatives.');
  const ledger = valuationLedger(c.s, c.now);
  return quotes.flatMap((quote: any, index: number) => {
    if (!quote || typeof quote !== 'object') return fail('TRANSFER_REVIEW', 'Provide reviewed bins, arrival and transport cost.');
    const from = get(c.s, 'locations', quote.fromLocationId), to = get(c.s, 'locations', quote.toLocationId), transit = get(c.s, 'locations', quote.transitLocationId);
    if (f.scope === 'company' || from.kind !== 'bin' || to.kind !== 'bin' || from.warehouse === to.warehouse || to.warehouse !== f.warehouse
      || !f.includedWarehouses.includes(from.warehouse) || transit.kind !== 'transit') fail('TRANSFER_REVIEW', 'Choose included source and destination warehouses, real bins and a transit location.');
    const expectedDate = text(quote.expectedDate, 'Transfer arrival');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) || !Number.isFinite(Date.parse(expectedDate)) || new Date(expectedDate).toISOString().slice(0, 10) !== expectedDate
      || expectedDate < c.now.slice(0, 10)) fail('DATE', 'Review a valid arrival date today or later.');
    const transportCost = format(decimal(quote.transportCost)), reason = text(quote.reason, 'Transport estimate source');
    const leadDays = Math.max(0, Math.ceil((Date.parse(expectedDate) - Date.parse(c.now.slice(0, 10))) / 86_400_000));
    const surplus = transferSurplus(c, f.itemId, from.warehouse), bin = available(c.s, f.itemId, from.id);
    const free = bin < surplus.quantity ? bin : surplus.quantity;
    return ['cash', 'service'].map(objective => {
      const horizonDays = f.leadDays + (objective === 'cash' ? 1 : 2) * f.reviewDays;
      const demand = ceilDivide(decimal(objective === 'cash' ? forecast.expected : forecast.high) * BigInt(horizonDays), BigInt(f.windowDays));
      const need = positive(demand + decimal(f.safetyStock) - signedQuantity(f.position) - decimal(f.draftQuantity));
      const bounded = free < MAX ? free : MAX;
      const quantity = bounded < need ? bounded : need;
      const layers = takeLayers(structuredClone(ledger.positions.find(p => p.itemId === f.itemId && p.locationId === from.id && p.status === 'sellable')?.layers ?? []), quantity);
      const stockCost = !layers.length || layers.some(l => l.value === null) ? null : layers.reduce((n, l) => n + l.value!, 0n);
      const cost = quantity > 0n ? decimal(transportCost) * SCALE : 0n;
      const executable = quantity > 0n && leadDays <= horizonDays;
      return { kind: 'transfer', objective, quoteIndex: index, fromWarehouse: from.warehouse, toWarehouse: to.warehouse,
        quantity: format(quantity), horizonDays, leadDays, expectedDate, transportCost, expectedLandedCost: money(cost),
        expectedContribution: unitRevenue === null || stockCost === null ? null : money(quantity * signedQuantity(unitRevenue) - stockCost - cost),
        uncoveredAtHorizon: format(positive(need - (executable ? quantity : 0n))), protectedSafetyStock: surplus.safetyStock,
        sourcePosition: surplus.position, available: quantity > 0n, executable,
        reason: !quantity ? 'Source demand, safety stock or bin availability leaves no surplus.' : !executable ? 'Reviewed arrival is beyond this planning horizon.' : null,
        command: { type: 'transfer.send', payload: { itemId: f.itemId, fromLocationId: from.id, toLocationId: to.id, transitLocationId: transit.id,
          quantity: format(quantity), expectedDate, transportCost, reason, replenishment: true, stateVersion: c.s.version + 1 } } };
    });
  });
}
