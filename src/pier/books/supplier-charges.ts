import { decimal, fail, format, SCALE, type Row } from '../model';

export const CHARGES = ['freight', 'tax'] as const;
const CENTS = SCALE / 100n;
const absolute = (n: bigint) => n < 0n ? -n : n;

/** Supplier charges are non-negative whole dollars and cents; credits are not charges. */
export function charge(value: unknown, what: string): string {
  const n = decimal(value ?? '0');
  if (n % CENTS) fail('SUPPLIER_CHARGE', `Enter ${what} in dollars and cents, for example 40.00.`);
  return format(n);
}

/** Cumulative approved invoice freight and tax may not exceed what the PO expected, beyond the buyer's price tolerance. */
export function chargeMatch(bill: Row, po: Row, earlier: Row[]) {
  const charges: Record<string, { billed: string; purchaseOrder: string; priorApproved: string }> = {};
  const differences: { kind: string; message: string; withinTolerance: boolean }[] = [];
  for (const kind of CHARGES) {
    const expected = decimal(po[kind] ?? '0'), billed = decimal(bill[kind] ?? '0');
    const prior = earlier.reduce((sum, other) => sum + decimal(other[kind] ?? '0'), 0n);
    const excess = prior + billed - expected;
    charges[kind] = { billed: format(billed), purchaseOrder: format(expected), priorApproved: format(prior) };
    if (excess > 0n) differences.push({ kind: `${kind}PurchaseOrder`, message: `Cumulative approved invoice ${kind} exceeds the PO's ${format(expected)} USD by ${format(excess)} USD.`, withinTolerance: absolute(excess) * 100n * SCALE <= expected * decimal(bill.priceTolerancePercent) });
  }
  return { charges, differences };
}

/** USD at the money scale (twelve places) for posting and totals. */
export const chargeMoney = (value: string) => decimal(value ?? '0') * 1000000n;
