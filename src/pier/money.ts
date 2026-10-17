import { decimal } from './model';

// Quantities and unit prices use six places; extended amounts retain twelve.
export const MONEY_SCALE = 1000000000000n;
export function money(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const n = value < 0n ? -value : value;
  return `${sign}${n / MONEY_SCALE}.${String(n % MONEY_SCALE).padStart(12, '0')}`;
}
/** A decimal string as a reader sees it, "USD 3,689.00"; a sub-cent price keeps its exact places. */
export function usdText(value: string): string {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const exact = fraction.replace(/0+$/, '');
  return `USD ${negative ? '-' : ''}${BigInt(whole).toLocaleString('en-US')}.${exact.length <= 2 ? exact.padEnd(2, '0') : exact}`;
}
export function amount(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(12, '0'))) * (negative ? -1n : 1n);
}
export const extended = (quantity: string, price: string) => decimal(quantity) * decimal(price);

export const CENT = 10000000000n;
const wholeCents = (value: bigint) => value % CENT === 0n;
/** Round a twelve-place amount to the nearest cent, halves away from zero. */
export function toCents(value: bigint): bigint {
  const sign = value < 0n ? -1n : 1n, n = value * sign;
  return sign * ((n + CENT / 2n) / CENT) * CENT;
}
/** The part/whole share of a value. Whole-cent values stay whole cents; a
 * cumulative caller (share of a running total minus the prior share) gives the
 * last part the remainder, so parts always sum exactly to the value. */
export function share(value: bigint, part: bigint, whole: bigint): bigint {
  if (part === whole) return value;
  return wholeCents(value) ? toCents(value * part / whole) : value * part / whole;
}
/** Split a total by weights with the largest-remainder method. A whole-cent
 * total splits into whole cents; every part sums exactly to the total. */
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (!sum) return weights.map(() => 0n);
  const sign = total < 0n ? -1n : 1n, unit = wholeCents(total) ? CENT : 1n, units = total * sign / unit;
  const parts = weights.map(weight => units * weight / sum);
  let left = units - parts.reduce((a, b) => a + b, 0n);
  const order = weights.map((weight, index) => ({ index, remainder: units * weight % sum })).sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of order) { if (left <= 0n) break; parts[index] += 1n; left -= 1n; }
  return parts.map(part => part * unit * sign);
}
