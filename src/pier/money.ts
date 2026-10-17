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

// Cumulative allocation gives every last fractional dollar to a named line.
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  let cumulative = 0n, assigned = 0n;
  return weights.map(weight => {
    cumulative += weight;
    const next = sum ? total * cumulative / sum : 0n;
    const share = next - assigned;
    assigned = next;
    return share;
  });
}
