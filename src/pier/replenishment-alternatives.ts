import { decimal, fail, format, MAX, SCALE } from './model';
import { money } from './money';
import { ceilDivide, roundPack, signedQuantity } from './replenishment-position';

/** Comparisons prepare evidence only. The buyer still chooses an exact draft. */
export function compareReplenishment(f: any, cashCeiling: string) {
  if (!f.terms || !f.configured) fail('REPLENISHMENT_SELECTION', 'Save buyer parameters and supplier terms before comparing purchases.');
  const budget = decimal(cashCeiling) * SCALE;
  const pack = decimal(f.packSize, true), minimum = decimal(f.minimum);
  const price = decimal(f.unitPrice), charges = (decimal(f.freight) + decimal(f.duty)) * SCALE;
  const rate = decimal(f.observedSold), window = BigInt(f.windowDays);
  const position = signedQuantity(f.position), drafts = decimal(f.draftQuantity);
  const safety = decimal(f.safetyStock);
  const positive = (n: bigint) => n > 0n ? n : 0n;
  const option = (name: string, horizon: number, cap?: bigint) => {
    const demand = ceilDivide(rate * BigInt(horizon), window);
    const need = positive(demand + safety - position);
    const rounded = need > 0n ? roundPack(need > minimum ? need : minimum, pack) : 0n;
    let quantity = positive(rounded - drafts);
    let reason: string | null = null;
    if (quantity > 0n && (quantity < minimum || quantity % pack !== 0n)) {
      reason = 'Existing drafts leave a remainder outside supplier packs or minimum; review those drafts together.';
      quantity = 0n;
    }
    if (cap !== undefined && quantity > 0n) {
      const affordable = cap < charges ? 0n : price === 0n ? quantity : (cap - charges) / price;
      const bounded = (affordable / pack) * pack;
      quantity = quantity < bounded ? quantity : bounded;
      if (quantity < minimum) quantity = 0n;
      if (quantity === 0n) reason = 'The cash ceiling cannot fund a supplier-compliant purchase including freight and duty.';
    }
    if (quantity > MAX) reason = 'This alternative exceeds one purchase line; split it into reviewed purchases.';
    if (!f.low) reason = 'The applied reorder point does not currently permit a draft. Review buyer parameters first.';
    const cost = quantity > 0n ? quantity * price + charges : 0n;
    return { name, horizonDays: horizon, leadDays: f.leadDays, quantity: format(quantity),
      unroundedNeed: format(need), draftCoverage: format(drafts), expectedLandedCost: money(cost),
      withinCashCeiling: cost <= budget, uncoveredAtHorizon: format(positive(demand + safety - position - drafts - quantity)),
      executable: quantity > 0n && reason === null, reason };
  };
  return { currency: 'USD', cashCeiling: format(decimal(cashCeiling)),
    basis: 'Observed native demand at the selected window rate, current net position, buyer safety stock and supplier lead time. Minimum covers lead time; recommended adds one review period; stretch adds two. Cash-constrained caps recommended quantity after freight, duty, MOQ and case packs. These are estimates, not a service probability or a stockout-corrected forecast.',
    options: [option('minimum', f.leadDays), option('recommended', f.leadDays + f.reviewDays),
      option('stretch', f.leadDays + 2 * f.reviewDays), option('cash-constrained', f.leadDays + f.reviewDays, budget)] };
}
