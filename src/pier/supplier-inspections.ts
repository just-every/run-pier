import { decimal, fail, get, id, requireRole, text, type Context, type Row } from './model';

/** Append-only supplier-defect findings on posted receipt lines; they move no stock and change no cost. */
export function supplierInspections(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'receipt.inspect') return;
  requireRole(c, ['warehouse', 'buyer']);
  const receipt = get(c.s, 'receipts', p.receiptId);
  if (receipt.status !== 'posted') fail('REVERSED', 'Only a posted receipt can be inspected.');
  if (!Array.isArray(p.lines) || !p.lines.length) fail('LINES', 'Add the inspected receipt lines.');
  const seen = new Set<string>();
  const entries = p.lines.map((entry: any) => {
    const line = receipt.lines.find((l: any) => l.id === entry.receiptLineId);
    if (!line || seen.has(line.id)) fail('LINE', 'Inspect each line of this receipt once per command.');
    seen.add(line.id);
    const inspected = decimal(entry.inspected, true), defective = decimal(entry.defective);
    if (defective > inspected) fail('INSPECTION', 'Defective quantity cannot exceed the inspected quantity.');
    const prior = (receipt.inspections ?? []).filter((i: any) => i.receiptLineId === line.id).reduce((sum: bigint, i: any) => sum + decimal(i.inspectedQuantity), 0n);
    if (prior + inspected > decimal(line.quantity)) fail('INSPECTION_LIMIT', 'Inspected quantity cannot exceed the quantity received on this line.');
    return { id: id(), receiptLineId: line.id, itemId: line.itemId, inspectedQuantity: entry.inspected, defectiveQuantity: entry.defective, defect: defective ? text(entry.defect, 'Defect description') : null, actorId: c.actor.id, at: c.now };
  });
  receipt.inspections = [...(receipt.inspections ?? []), ...entries];
  return receipt;
}
