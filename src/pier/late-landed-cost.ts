import { fail, fresh, get, id, requireRole, text, type Context, type Row } from './model';
import { amount, money } from './money';
import { landReceipt } from './landed-cost';
import { valuationLedger } from './valuation-ledger';
import { planBooks } from './books/planning';

const inventory = (ledger: ReturnType<typeof valuationLedger>) => ledger.positions.flatMap(p => p.layers).reduce((n, l) => n + (l.value ?? 0n), 0n);

/** Supplemental cost evidence never replaces the original receipt or its movements. */
export function lateLandedCost(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'receipt.landed') return;
  requireRole(c, []);
  const receipt = get(c.s, 'receipts', p.receiptId);
  fresh(receipt, p.version);
  if (receipt.status !== 'posted' || receipt.replacementFor) fail('RECEIPT_STATE', 'Use an original posted receipt for a late landed-cost bill.');
  const connection = c.s.bookConnections.find(b => b.enabled);
  if (!connection) fail('BOOK_CONNECTION', 'Connect Pantry before approving a late landed-cost bill.');
  const supplier = get(c.s, 'parties', p.supplierId || get(c.s, 'purchaseOrders', receipt.poId).supplierId);
  if (supplier.kind !== 'supplier') fail('SUPPLIER', 'Choose the supplier that issued the late bill.');
  const reference = text(p.reference, 'Late supplier bill reference');
  if (c.s.receipts.some(r => r.lateBills?.some((b: Row) => b.supplierId === supplier.id && b.reference.toLowerCase() === reference.toLowerCase()))) fail('DUPLICATE', 'This late bill reference is already retained.');
  const reason = text(p.reason, 'Late bill approval reason');
  const before = valuationLedger(c.s, c.now);
  if (before.incomplete.size) fail('COST_UNVALUED', 'Resolve unvalued stock before approving a late cost adjustment.');
  const allocated = landReceipt(structuredClone(receipt), p.landedCost);
  const shares = allocated.lines.map((line: Row) => ({ receiptLineId: line.id, amount: money(amount(line.freight) + amount(line.duty) + amount(line.insurance) + amount(line.otherLandedCost)) }));
  const total = shares.reduce((n: bigint, line: Row) => n + amount(line.amount), 0n);
  if (total <= 0n) fail('LANDED_COST', 'Enter a positive late freight or duty amount.');
  // Pending original documents retain their baseline too: a later plan must not
  // silently absorb this separate bill and also post its adjustment a second time.
  planBooks(c);
  if (c.s.bookJobs.some(j => j.kind === 'journal' && !j.document)) fail('COST_REVIEW', 'Resolve the original cost posting reviews before approving a supplemental bill.');
  for (const job of c.s.bookJobs.filter(j => j.kind === 'journal')) job.costBasisPinned = true;
  const bill = { id: id(), version: 1, reference, reason, supplierId: supplier.id, createdAt: c.now, approvedBy: c.actor.id, total: money(total), landedCost: { ...allocated.landedCost, total: money(total) }, shares } as Row;
  receipt.lateBills ??= [];
  receipt.lateBills.push(bill);
  receipt.version++;
  const after = valuationLedger(c.s, c.now);
  const inventoryDelta = inventory(after) - inventory(before);
  const cogsDelta = after.totals.cogs - before.totals.cogs - after.totals.returns + before.totals.returns;
  const expenseDelta = before.totals.adjustments - after.totals.adjustments;
  if (inventoryDelta + cogsDelta + expenseDelta !== total) fail('COST_REVIEW', 'The late bill does not reconcile to inventory, cost of goods and removed stock. Review its dependencies.');
  bill.impacts = { inventory: money(inventoryDelta), cogs: money(cogsDelta), expense: money(expenseDelta) };
  const expenseImpacts: { accountId: string; amount: string }[] = [];
  const value = (layers: any[]): bigint => layers.reduce<bigint>((n: bigint, layer: any) => n + (layer.value ?? 0n), 0n);
  for (const [documentId, layers] of after.adjustmentLayers) {
    const delta = value(layers) - value(before.adjustmentLayers.get(documentId) ?? []);
    if (!delta) continue;
    const returned = c.s.returns.find(r => r.id === documentId);
    const supplierReturn = c.s.supplierReturns.find(r => r.id === documentId);
    const accountId = returned?.writeOffAccountId ?? (supplierReturn ? connection!.cogsAccountId : null);
    if (!accountId) fail('COST_REVIEW', 'This late bill affects a prior stock adjustment without a mapped expense account. Review its reason mapping first.');
    expenseImpacts.push({ accountId, amount: money(delta) });
  }
  if (expenseImpacts.reduce((n, impact) => n + amount(impact.amount), 0n) !== expenseDelta) fail('COST_REVIEW', 'Removed-stock costs do not reconcile to the mapped expenses.');
  bill.expenseImpacts = expenseImpacts;
  return bill;
}
