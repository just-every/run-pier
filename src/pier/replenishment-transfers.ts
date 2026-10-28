import { available, decimal, fail, format, get, SCALE, text, type Context } from './model';
import { money } from './money';
import { ceilDivide, signedQuantity, supplyPosition } from './replenishment-position';
import { effectivePolicy } from './replenishment-scope';
import { sellThrough } from './replenishment-demand';
import { adjustedForecast } from './replenishment-forecast';

const positive = (n: bigint) => n > 0n ? n : 0n;
const DAY = 86_400_000;

/** Protect the source's open commitments, safety and upper-scenario future demand. */
export function transferSurplus(c: Context, itemId: string, warehouse: string, horizonDays: number, fallbackWindow: number) {
  const position = supplyPosition(c, itemId, warehouse), policy = effectivePolicy(c, itemId, warehouse).policy;
  const windowDays = policy?.windowDays ?? fallbackWindow;
  const observedSold = sellThrough(c, itemId, warehouse, windowDays).find(w => w.days === windowDays)!.sold;
  const forecast = adjustedForecast(c, { itemId, warehouse, windowDays, observedSold, policy });
  const futureDemand = ceilDivide(decimal(forecast.high) * BigInt(horizonDays), BigInt(windowDays));
  const safetyStock = policy?.safetyStock ?? '0';
  const quantity = positive(signedQuantity(position.onHand) - signedQuantity(position.openDemand) - signedQuantity(position.outboundTransfers) - decimal(safetyStock) - futureDemand);
  return { quantity, position, safetyStock, futureDemand: format(futureDemand), forecast };
}

type TransferQuote = { fromLocationId: string; toLocationId: string; transitLocationId: string; expectedDate: string; transportCost: string; reason: string };
export function transferQuotes(value: any): TransferQuote[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) fail('TRANSFER_QUOTE', 'Provide at most thirty reviewed transport quotes.');
  return value.map((q: any) => {
    if (!q || typeof q !== 'object') fail('TRANSFER_QUOTE', 'Provide the reviewed bins, arrival and cost.');
    const expectedDate = text(q.expectedDate, 'Transfer arrival date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) || !Number.isFinite(Date.parse(expectedDate)) || new Date(expectedDate).toISOString().slice(0, 10) !== expectedDate) fail('DATE', 'Use a valid UTC calendar arrival date.');
    return { fromLocationId: text(q.fromLocationId), toLocationId: text(q.toLocationId), transitLocationId: text(q.transitLocationId),
      expectedDate, transportCost: format(decimal(q.transportCost)), reason: text(q.reason, 'Transport quote source') };
  });
}

export function transferAlternatives(c: Context, f: any, forecast: any, quotes: ReturnType<typeof transferQuotes>, cashCeiling: string) {
  if (f.scope === 'company') return [];
  const horizonDays = f.leadDays + 2 * f.reviewDays;
  const demand = ceilDivide(decimal(forecast.high) * BigInt(horizonDays), BigInt(f.windowDays));
  const need = positive(demand + decimal(f.safetyStock) - signedQuantity(f.position) - decimal(f.draftQuantity));
  return f.includedWarehouses.filter((w: string) => w !== f.warehouse).flatMap((warehouse: string) => {
    const surplus = transferSurplus(c, f.itemId, warehouse, horizonDays, f.windowDays);
    const reviewed = quotes.filter(q => get(c.s, 'locations', q.fromLocationId).warehouse === warehouse);
    return (reviewed.length ? reviewed : [null]).map(q => {
      let quantity = surplus.quantity < need ? surplus.quantity : need;
      let reason: string | null = null;
      let leadDays: number | null = null;
      if (!q) reason = 'Review source and destination bins, transit location, arrival date and transport cost.';
      else {
        const from = get(c.s, 'locations', q.fromLocationId), to = get(c.s, 'locations', q.toLocationId), transit = get(c.s, 'locations', q.transitLocationId);
        if (from.kind !== 'bin' || to.kind !== 'bin' || to.warehouse !== f.warehouse || transit.kind !== 'transit') fail('TRANSFER_QUOTE', 'Quote a source bin, a bin in the receiving warehouse and a real transit location.');
        const binQuantity = available(c.s, f.itemId, from.id);
        quantity = quantity < binQuantity ? quantity : positive(binQuantity);
        leadDays = Math.max(0, Math.ceil((Date.parse(q.expectedDate + 'T00:00:00Z') - Date.parse(c.now)) / DAY));
        if (q.expectedDate < c.now.slice(0, 10)) reason = 'The quoted arrival date has passed.';
        else if (leadDays > horizonDays) reason = 'The quoted arrival is beyond the service planning horizon.';
      }
      if (!quantity) reason = 'No source surplus remains after commitments, safety stock and future demand.';
      const cost = q ? decimal(q.transportCost) * SCALE : null;
      const payload = q ? { itemId: f.itemId, fromLocationId: q.fromLocationId, toLocationId: q.toLocationId, transitLocationId: q.transitLocationId,
        quantity: format(quantity), expectedDate: q.expectedDate, transportCost: q.transportCost, reason: q.reason,
        planningReview: { stateVersion: c.s.version + 1, horizonDays, windowDays: f.windowDays } } : null;
      return { kind: 'transfer', fromWarehouse: warehouse, toWarehouse: f.warehouse, quantity: format(quantity),
        protectedSafetyStock: surplus.safetyStock, protectedFutureDemand: surplus.futureDemand, sourcePosition: surplus.position,
        available: quantity > 0n, executable: q !== null && quantity > 0n && reason === null,
        arrivalDate: q?.expectedDate ?? null, leadDays, expectedLandedCost: cost === null ? null : money(cost),
        withinCashCeiling: cost !== null && cost <= decimal(cashCeiling) * SCALE,
        uncoveredAtHorizon: format(positive(need - quantity)), reason,
        command: payload ? { type: 'transfer.send', payload } : null };
    });
  });
}

/** Called inside the ordinary transfer admission after current role checks. */
export function admitPlannedTransfer(c: Context, p: any) {
  if (!p.planningReview) return;
  const review = p.planningReview;
  if (review.stateVersion !== c.s.version) fail('STALE', 'Stock, demand or planning settings changed. Compare transfer options again.');
  for (const value of [review.horizonDays, review.windowDays]) if (!Number.isSafeInteger(value) || value < 1 || value > 10950) fail('TRANSFER_QUOTE', 'Review the transfer planning horizon.');
  const quote = transferQuotes([p])[0];
  if (quote.expectedDate < c.now.slice(0, 10)) fail('TRANSFER_QUOTE', 'The reviewed arrival date has passed.');
  const source = get(c.s, 'locations', p.fromLocationId);
  const surplus = transferSurplus(c, p.itemId, source.warehouse, review.horizonDays, review.windowDays);
  if (decimal(p.quantity, true) > surplus.quantity) fail('AVAILABLE', 'Transfer would consume protected source commitments, safety stock or future demand.');
}
