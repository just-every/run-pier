import { decimal, fail, format, fresh, get, id, requireRole, SCALE, text, type Context, type Row, type State } from '../model';
import { amount, extended, money } from '../money';
import type { BookDocument } from './adapters/types';

type Allocation = { receiptId: string; receiptVersion: number; receiptLineId: string; quantity: string; unitPrice: string };
type BillLine = { poLineId: string; itemId: string; quantity: string; unitPrice: string };
type Add = (key: string, kind: string, source: Row, sourceKind: string, reference: string, build: () => BookDocument) => void;
const positive = (n: bigint) => n > 0n ? n : 0n;
const absolute = (n: bigint) => n < 0n ? -n : n;
const within = (difference: bigint, basis: bigint, tolerance: string) => absolute(difference) * 100n * SCALE <= basis * decimal(tolerance);
const approved = (bill: Row) => bill.status === 'approved';
const billReference = (bill: Row) => `PIER-SB-${bill.id.replaceAll('-', '').slice(0, 24)}`;
const approvedBills = (s: State, poId: string) => s.supplierBills.filter(b => b.poId === poId && approved(b)).sort((a, b) => a.approval.sequence - b.approval.sequence);
const legacyReceiptIds = (s: State) => new Set(s.bookJobs.filter(j => j.sourceKind === 'receipt' && j.kind === 'bill' && (j.attempted || j.remoteId) && j.status !== 'skipped').map(j => j.sourceId));

/** Allocations are recomputed in approval order: a later receipt first completes earlier bills. */
function receiptPool(s: State, poId: string) {
  const legacy = legacyReceiptIds(s);
  return s.receipts.filter(r => r.poId === poId && r.status === 'posted' && r.currency === 'USD' && !legacy.has(r.id)).flatMap(receipt =>
    receipt.lines.map((line: any) => ({ receipt, line, remaining: decimal(line.quantity) })));
}
function take(pool: ReturnType<typeof receiptPool>, line: any): Allocation[] {
  let remaining = decimal(line.quantity);
  const allocations: Allocation[] = [];
  for (const entry of pool.filter(r => r.line.poLineId === line.poLineId)) {
    const quantity = remaining < entry.remaining ? remaining : entry.remaining;
    if (!quantity) continue;
    allocations.push({ receiptId: entry.receipt.id, receiptVersion: entry.receipt.version, receiptLineId: entry.line.id, quantity: format(quantity), unitPrice: entry.line.cost });
    entry.remaining -= quantity; remaining -= quantity;
  }
  return allocations;
}

export function supplierBillMatch(s: State, bill: Row) {
  const po = get(s, 'purchaseOrders', bill.poId);
  const pool = receiptPool(s, bill.poId);
  const earlier: Row[] = [];
  let own: Allocation[][] | undefined;
  for (const other of approvedBills(s, bill.poId)) {
    const allocations = other.lines.map((line: any) => take(pool, line));
    if (other.id === bill.id) { own = allocations; break; }
    earlier.push(other);
  }
  const lines = (bill.lines as BillLine[]).map((line, index) => {
    const committed = po.lines.find((l: any) => l.id === line.poLineId);
    if (!committed) fail('SUPPLIER_BILL_LINE', 'The invoice line no longer belongs to its committed PO.');
    const allocations = own?.[index] ?? take(pool, line);
    const billed = decimal(line.quantity), ordered = decimal(committed.quantity);
    const legacy = legacyReceiptIds(s);
    const legacyBilled = s.receipts.filter(r => r.poId === po.id && legacy.has(r.id)).flatMap(r => r.lines).filter((l: any) => l.poLineId === line.poLineId).reduce((sum: bigint, l: any) => sum + decimal(l.quantity), 0n);
    const prior = legacyBilled + earlier.reduce((sum, b) => sum + b.lines.filter((l: any) => l.poLineId === line.poLineId).reduce((n: bigint, l: any) => n + decimal(l.quantity), 0n), 0n);
    const received = s.receipts.filter(r => r.poId === po.id && r.status === 'posted').flatMap(r => r.lines).filter((l: any) => l.poLineId === line.poLineId).reduce((sum: bigint, l: any) => sum + decimal(l.quantity), 0n);
    const allocated = allocations.reduce((sum, a) => sum + decimal(a.quantity), 0n);
    const shortfall = billed - allocated, excess = positive(prior + billed - ordered);
    const priceDifference = decimal(line.unitPrice) - decimal(committed.price);
    const quantityWithinTolerance = within(shortfall, billed, bill.quantityTolerancePercent) && within(excess, ordered, bill.quantityTolerancePercent) && allocated > 0n;
    const receiptPrices = allocations.map(a => ({ ...a, difference: format(decimal(line.unitPrice) - decimal(a.unitPrice)), withinTolerance: within(decimal(line.unitPrice) - decimal(a.unitPrice), decimal(a.unitPrice), bill.priceTolerancePercent) }));
    const priceWithinTolerance = within(priceDifference, decimal(committed.price), bill.priceTolerancePercent) && receiptPrices.every(a => a.withinTolerance);
    const differences = [
      ...(shortfall ? [{ kind: 'receiptShortfall', message: `${format(shortfall)} billed units have no unused posted receipt.`, withinTolerance: quantityWithinTolerance }] : []),
      ...(excess ? [{ kind: 'purchaseOrderExcess', message: `Cumulative approved invoices exceed the PO by ${format(excess)} units.`, withinTolerance: within(excess, ordered, bill.quantityTolerancePercent) }] : []),
      ...(priceDifference ? [{ kind: 'purchasePrice', message: `Invoice unit price differs from the PO by ${format(priceDifference)} USD.`, withinTolerance: within(priceDifference, decimal(committed.price), bill.priceTolerancePercent) }] : []),
      ...receiptPrices.filter(a => a.difference !== '0').map(a => ({ kind: 'receiptPrice', message: `Invoice unit price differs from receipt ${a.receiptId} by ${a.difference} USD.`, withinTolerance: a.withinTolerance })),
    ];
    return { poLineId: line.poLineId, itemId: committed.itemId, orderedQuantity: committed.quantity, receivedQuantity: format(received), previouslyBilledQuantity: format(prior), billedQuantity: line.quantity, matchedReceiptQuantity: format(allocated), quantityDifference: format(shortfall), purchaseOrderExcess: format(excess), poUnitPrice: committed.price, unitPrice: line.unitPrice, priceDifference: format(priceDifference), receiptPrices, receiptAllocations: allocations, quantityWithinTolerance, priceWithinTolerance, differences };
  });
  const receiptEvidence = JSON.stringify({ poId: po.id, poVersion: po.version, receipts: s.receipts.filter(r => r.poId === po.id).map(r => ({ id: r.id, version: r.version, status: r.status })), legacyReceipts: [...legacyReceiptIds(s)].sort(), priorBills: earlier.map(b => ({ id: b.id, version: b.version })), lines: lines.map(l => ({ poLineId: l.poLineId, previouslyBilledQuantity: l.previouslyBilledQuantity, receiptAllocations: l.receiptAllocations })) });
  return { withinTolerance: po.status === 'committed' && lines.every(l => l.quantityWithinTolerance && l.priceWithinTolerance), received: lines.every(l => l.quantityDifference === '0'), receiptEvidence, lines, differences: lines.flatMap(l => l.differences.map(d => ({ ...d, poLineId: l.poLineId, itemId: l.itemId }))) };
}

/** Read-only state projection; payment always comes from ledger readback. */
export function supplierBillViews(s: State) {
  return s.supplierBills.map(bill => {
    const match = supplierBillMatch(s, bill);
    const job = s.bookJobs.find(j => j.sourceKind === 'supplierBill' && j.sourceId === bill.id && j.kind === 'bill');
    const paid = job?.paid != null && job?.open != null && amount(job.open) === 0n && ['posted', 'reconciled'].includes(job.status);
    const readyToPay = approved(bill) && match.received && match.withinTolerance && !paid;
    return { ...bill, poId: bill.poId, status: paid ? 'paid' : bill.status, match, received: match.received, readyToPay, currentReceiptEvidence: match.receiptEvidence, books: job ? { billId: job.remoteId, paid: job.paid, open: job.open, status: job.status, received: job.received, readyToPay: job.readyToPay, checkedAt: job.checkedAt } : bill.books };
  });
}

export function supplierReceiptState(s: State, bill: Row) {
  const view = supplierBillViews(s).find(b => b.id === bill.id)!;
  // Goods readiness is independent of the last payment readback. Pantry gates
  // ready-to-pay against its current open balance, including payment reversals.
  return { received: view.received, readyToPay: approved(bill) && view.received && view.match.withinTolerance, evidence: view.currentReceiptEvidence };
}

export function supplierBills(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('supplierBill.')) return;
  requireRole(c, type === 'supplierBill.save' ? ['buyer', 'agent'] : ['buyer']);
  if (type === 'supplierBill.save') {
    const old = p.id ? get(c.s, 'supplierBills', p.id) : null;
    if (old) { fresh(old, p.version); if (approved(old)) fail('SUPPLIER_BILL_APPROVED', 'An approved invoice is immutable. Resolve a credit or correction with your accountant.'); }
    const po = get(c.s, 'purchaseOrders', p.poId);
    if (po.status !== 'committed') fail('PO_STATE', 'Supplier invoices require a committed purchase order.');
    if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > po.lines.length) fail('LINES', 'Add each invoiced PO line once.');
    const seen = new Set<string>();
    const lines = p.lines.map((l: any) => {
      const committed = po.lines.find((x: any) => x.id === l.poLineId);
      if (!committed || seen.has(committed.id)) fail('SUPPLIER_BILL_LINE', 'Add each invoiced PO line once from this purchase order.');
      seen.add(committed.id);
      return { poLineId: committed.id, itemId: committed.itemId, quantity: format(decimal(l.quantity, true)), unitPrice: format(decimal(l.unitPrice)) };
    });
    const reference = text(p.reference, 'Supplier invoice reference'), date = text(p.date, 'Supplier invoice date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('DATE', 'Use a valid invoice date.');
    if (c.s.supplierBills.some(b => b.id !== old?.id && b.supplierId === po.supplierId && b.reference.toLowerCase() === reference.toLowerCase())) fail('SUPPLIER_BILL_DUPLICATE', 'This supplier invoice reference is already recorded.');
    const quantityTolerancePercent = format(decimal(p.quantityTolerancePercent)), priceTolerancePercent = format(decimal(p.priceTolerancePercent));
    if (decimal(quantityTolerancePercent) > 100n * SCALE || decimal(priceTolerancePercent) > 100n * SCALE) fail('SUPPLIER_BILL_TOLERANCE', 'Enter explicit tolerances from 0 to 100 percent.');
    const fields = { poId: po.id, supplierId: po.supplierId, reference, date, currency: 'USD', lines, quantityTolerancePercent, priceTolerancePercent, total: money(lines.reduce((n: bigint, l: any) => n + extended(l.quantity, l.unitPrice), 0n)), status: 'review', approval: null, holdReason: null, updatedAt: c.now };
    if (old) Object.assign(old, fields, { version: old.version + 1 });
    else c.s.supplierBills.push({ ...fields, id: id(), version: 1, createdAt: c.now, createdBy: c.actor.id });
    const bill = old ?? c.s.supplierBills.at(-1)!;
    return supplierBillViews(c.s).find(b => b.id === bill.id)!;
  }
  const bill = get(c.s, 'supplierBills', p.id); fresh(bill, p.version);
  if (approved(bill)) fail('SUPPLIER_BILL_APPROVED', 'An approved invoice is immutable. Resolve a credit or correction with your accountant.');
  if (type === 'supplierBill.hold') {
    bill.status = 'held'; bill.holdReason = text(p.reason, 'Hold reason'); bill.heldBy = c.actor.id; bill.heldAt = c.now; bill.version++;
  } else if (type === 'supplierBill.approve') {
    const match = supplierBillMatch(c.s, bill);
    if (p.receiptEvidence !== match.receiptEvidence) fail('SUPPLIER_BILL_STALE', 'Receipts or other approved invoices changed. Reload and review the current match.');
    if (!match.withinTolerance) fail('SUPPLIER_BILL_MATCH', 'Resolve the named quantity and price differences or revise explicit tolerances before approval.', match);
    if (amount(bill.total) === 0n) fail('SUPPLIER_BILL_ZERO', 'A zero-value invoice needs an accountant decision before posting.');
    const po = get(c.s, 'purchaseOrders', bill.poId);
    const sequence = c.s.supplierBills.filter(approved).reduce((n, b) => Math.max(n, b.approval.sequence), 0) + 1;
    bill.approval = { actorId: c.actor.id, at: c.now, version: bill.version, sequence, match: structuredClone(match), purchaseOrder: structuredClone(po), supplier: structuredClone(get(c.s, 'parties', bill.supplierId)), items: bill.lines.map((l: any) => structuredClone(get(c.s, 'items', l.itemId))) };
    bill.status = 'approved'; bill.holdReason = null; bill.version++;
  } else fail('COMMAND', 'Unknown supplier invoice command.');
  return supplierBillViews(c.s).find(b => b.id === bill.id)!;
}

/** Financial content uses immutable approval evidence, never today's receipt/party state. */
export function planSupplierBills(c: Context, connection: Row, add: Add, dollars: (value: string) => string) {
  for (const bill of c.s.supplierBills.filter(approved)) {
    add(`supplierBill:${bill.id}`, 'bill', bill, 'supplierBill', billReference(bill), () => {
      if (!bill.approval) throw new Error('Review the supplier invoice approval evidence.');
      const lines = bill.lines.map((line: any) => ({ itemId: line.itemId, description: `${bill.approval.items.find((i: Row) => i.id === line.itemId).sku} · invoice ${bill.reference} · ${line.quantity} at ${line.unitPrice} USD`, quantity: line.quantity, amount: dollars(money(extended(line.quantity, line.unitPrice))), account: connection.inventoryAccountId }));
      return { key: `supplierBill:${bill.id}`, kind: 'bill', date: bill.date, reference: billReference(bill), party: { id: bill.supplierId, name: bill.approval.supplier.name, kind: 'supplier' }, lines, total: dollars(bill.total), attachment: { name: `${billReference(bill)}-approved-invoice.txt`, content: JSON.stringify({ invoiceReference: bill.reference, invoiceDate: bill.date, currency: bill.currency, lines: bill.lines, total: bill.total, quantityTolerancePercent: bill.quantityTolerancePercent, priceTolerancePercent: bill.priceTolerancePercent, approval: bill.approval }, null, 2) } };
    });
  }
}
