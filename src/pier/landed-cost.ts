import { decimal, fail, format, type Row } from './model';
import { allocate, extended, money } from './money';

export function landReceipt(receipt: Row, input: any = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('LANDED_COST', 'Enter freight, duty and an allocation basis.');
  const freight = decimal(input.freight ?? '0'), duty = decimal(input.duty ?? '0');
  const allocation = input.allocation ?? 'value';
  if (!['value', 'quantity'].includes(allocation)) fail('LANDED_COST', 'Allocate landed cost by value or quantity.');
  const weights = receipt.lines.map((line: any) => allocation === 'quantity' ? decimal(line.quantity) : extended(line.quantity, line.cost));
  if (freight + duty > 0n && weights.every((weight: bigint) => weight === 0n)) fail('LANDED_COST', 'Zero-value goods need quantity allocation.');
  const freights = allocate(freight * 1000000n, weights), duties = allocate(duty * 1000000n, weights);
  let total = 0n;
  receipt.lines.forEach((line: any, index: number) => {
    const base = extended(line.quantity, line.cost);
    const landed = base + freights[index] + duties[index];
    line.freight = money(freights[index]);
    line.duty = money(duties[index]);
    line.landedTotal = money(landed);
    line.landedUnitCost = format(landed / decimal(line.quantity));
    total += landed;
  });
  receipt.currency = 'USD';
  receipt.landedCost = { freight: format(freight), duty: format(duty), allocation, total: money(total) };
  return receipt;
}
