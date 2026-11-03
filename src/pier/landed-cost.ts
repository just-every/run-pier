import { decimal, fail, format, type Row } from './model';
import { allocate, amount, CENT, extended, money, toCents } from './money';

export function landReceipt(receipt: Row, input: any = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('LANDED_COST', 'Enter freight, duty and an allocation basis.');
  const freight = decimal(input.freight ?? '0'), duty = decimal(input.duty ?? '0'), insurance = decimal(input.insurance ?? '0'), other = decimal(input.other ?? '0');
  if (freight % 10000n || duty % 10000n || insurance % 10000n || other % 10000n) fail('LANDED_COST', 'Enter all landed charges in dollars and cents, for example 40.00.');
  const allocation = input.allocation ?? 'value';
  if (!['value', 'quantity', 'weight'].includes(allocation)) fail('LANDED_COST', 'Allocate landed cost by value, quantity or weight.');
  const weights = receipt.lines.map((line: any) => allocation === 'weight' ? decimal(line.quantity) * decimal(line.weight ?? '0') : allocation === 'quantity' ? decimal(line.quantity) : extended(line.quantity, line.cost));
  if (allocation === 'weight' && receipt.lines.some((line: any) => !line.weight || decimal(line.weight) <= 0n)) fail('LANDED_COST', 'Every received line needs a positive reviewed weight in pounds for weight allocation.');
  if (freight + duty + insurance + other > 0n && weights.every((weight: bigint) => weight === 0n)) fail('LANDED_COST', 'Zero-value goods need quantity allocation.');
  // Whole cents in, whole cents out: each line's share is a whole cent and the
  // shares sum exactly to the entered freight and duty (largest remainder).
  const freights = allocate(freight * 1000000n, weights), duties = allocate(duty * 1000000n, weights), insurances = allocate(insurance * 1000000n, weights), others = allocate(other * 1000000n, weights);
  let total = 0n;
  receipt.lines.forEach((line: any, index: number) => {
    const base = extended(line.quantity, line.cost);
    const landed = base + freights[index] + duties[index] + insurances[index] + others[index];
    line.freight = money(freights[index]);
    line.insurance = money(insurances[index]);
    line.otherLandedCost = money(others[index]);
    line.duty = money(duties[index]);
    line.landedTotal = money(landed);
    line.landedUnitCost = money(toCents(landed * 1000000n / decimal(line.quantity)));
    total += landed;
  });
  receipt.currency = 'USD';
  receipt.landedCost = { freight: format(freight), duty: format(duty), insurance: format(insurance), other: format(other), allocation, total: money(total) };
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
