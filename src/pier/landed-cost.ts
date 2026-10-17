import { decimal, fail, format, type Row } from './model';
import { allocate, amount, CENT, extended, money, toCents } from './money';

export function landReceipt(receipt: Row, input: any = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('LANDED_COST', 'Enter freight, duty and an allocation basis.');
  const freight = decimal(input.freight ?? '0'), duty = decimal(input.duty ?? '0');
  if (freight % 10000n || duty % 10000n) fail('LANDED_COST', 'Enter freight and duty in dollars and cents, for example 40.00.');
  const allocation = input.allocation ?? 'value';
  if (!['value', 'quantity'].includes(allocation)) fail('LANDED_COST', 'Allocate landed cost by value or quantity.');
  const weights = receipt.lines.map((line: any) => allocation === 'quantity' ? decimal(line.quantity) : extended(line.quantity, line.cost));
  if (freight + duty > 0n && weights.every((weight: bigint) => weight === 0n)) fail('LANDED_COST', 'Zero-value goods need quantity allocation.');
  // Whole cents in, whole cents out: each line's share is a whole cent and the
  // shares sum exactly to the entered freight and duty (largest remainder).
  const freights = allocate(freight * 1000000n, weights), duties = allocate(duty * 1000000n, weights);
  let total = 0n;
  receipt.lines.forEach((line: any, index: number) => {
    const base = extended(line.quantity, line.cost);
    const landed = base + freights[index] + duties[index];
    line.freight = money(freights[index]);
    line.duty = money(duties[index]);
    line.landedTotal = money(landed);
    line.landedUnitCost = money(toCents(landed * 1000000n / decimal(line.quantity)));
    total += landed;
  });
  receipt.currency = 'USD';
  receipt.landedCost = { freight: format(freight), duty: format(duty), allocation, total: money(total) };
  return receipt;
}

/** Idempotent repair for receipts landed before shares were whole cents: re-split
 * the recorded freight and duty in whole cents. A receipt already in whole cents
 * is left exactly as it is. Returns the receipts it changed. */
export function repairLandedCents(receipts: Row[]): Row[] {
  const changed: Row[] = [];
  for (const receipt of receipts) {
    if (!receipt.landedCost || receipt.currency !== 'USD') continue;
    if (receipt.lines.every((line: any) => [line.freight, line.duty].every(part => part === undefined || amount(part) % CENT === 0n))) continue;
    const { freight, duty, allocation } = receipt.landedCost;
    const cents = (value: string) => money(toCents(amount(value))).replace(/0{10}$/, '');
    landReceipt(receipt, { freight: cents(freight), duty: cents(duty), allocation });
    receipt.version = (receipt.version ?? 0) + 1;
    changed.push(receipt);
  }
  return changed;
}
