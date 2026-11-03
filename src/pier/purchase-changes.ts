import { decimal, fail, format, fresh, get, requireRole, text, type Context, type Row } from './model';
import { assertPurchaseApproval } from './purchase-approval';

/** Supplier evidence is inert until a named human reviews the changed commitment. */
export function purchaseChanges(c: Context, type: string, p: any): Row | undefined {
  if (!['po.supplierChange', 'po.reviewSupplierChange'].includes(type)) return;
  requireRole(c, ['buyer']);
  const po = get(c.s, 'purchaseOrders', p.poId);
  fresh(po, p.version);
  if (po.status !== 'committed') fail('PO_STATE', 'Choose a committed purchase order.');
  if (type === 'po.supplierChange') {
    const promiseDate = p.promiseDate ?? po.promiseDate;
    if (typeof promiseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(promiseDate) || !Number.isFinite(Date.parse(promiseDate)) || new Date(promiseDate).toISOString().slice(0, 10) !== promiseDate)
      fail('DATE', 'Use a valid supplier promise date.');
    if (!Array.isArray(p.lines) || p.lines.length !== po.lines.length || new Set(p.lines.map((line: any) => line.poLineId)).size !== po.lines.length)
      fail('LINES', 'Review every purchase line exactly once.');
    const lines = po.lines.map((line: Row) => {
      const proposed = p.lines.find((candidate: any) => candidate.poLineId === line.id);
      if (!proposed) fail('LINE', 'Use the original purchase line identities.');
      const quantity = decimal(proposed.quantity);
      if (quantity < decimal(line.received)) fail('RECEIPT_LIMIT', 'A supplier change cannot cancel goods already received.');
      return { ...line, quantity: format(quantity), price: format(decimal(proposed.price)) };
    });
    const destinationWarehouse = p.destinationWarehouse ?? po.destinationWarehouse;
    if (destinationWarehouse && !c.s.locations.some(location => location.kind === 'bin' && location.warehouse === destinationWarehouse)) fail('WAREHOUSE', 'Choose a receiving warehouse.');
    const change = { source: text(p.source, 'Supplier message reference'), body: text(p.body, 'Supplier change evidence'),
      promiseDate, destinationWarehouse, lines, at: c.now, recordedBy: c.actor.id };
    po.supplierChangeEvidence ??= [];
    po.supplierChangeEvidence.push(structuredClone(change));
    po.pendingSupplierChange = change;
    po.approval = null;
    po.approvalEscalation = null;
    if (po.sendPolicy) po.sendPolicy.enabled = false;
    if (po.chasePolicy) po.chasePolicy.enabled = false;
    po.version++;
    return po;
  }
  if (p.confirm !== true) fail('APPROVAL', 'Explicitly approve the exact retained supplier change.');
  const change = po.pendingSupplierChange;
  if (!change) fail('SUPPLIER_CHANGE', 'There is no pending supplier change.');
  // Receipts can progress while review is pending. Never restore stale receipt totals.
  const lines = change.lines.map((line: Row) => {
    const current = po.lines.find((candidate: Row) => candidate.id === line.id);
    if (decimal(line.quantity) < decimal(current.received)) fail('RECEIPT_LIMIT', 'Goods received since intake exceed the proposed quantity. Review new supplier evidence.');
    return { ...line, received: current.received };
  });
  const minimum = decimal(po.minimumOrderValue ?? '0');
  const revised = { ...po, pendingSupplierChange: null, promiseDate: change.promiseDate, destinationWarehouse: change.destinationWarehouse, lines,
    minimumOrderValueUnmet: lines.reduce((sum: bigint, line: Row) => sum + decimal(line.quantity) * decimal(line.price), 0n) < minimum * 1000000n };
  assertPurchaseApproval(c, revised, c.actor.id);
  po.supplierChanges ??= [];
  po.supplierChanges.push({ ...change, previous: { promiseDate: po.promiseDate, destinationWarehouse: po.destinationWarehouse, lines: structuredClone(po.lines) }, approvedBy: c.actor.id, approvedAt: c.now });
  Object.assign(po, revised, { pendingSupplierChange: null, confirmation: null, version: po.version + 1,
    status: lines.every((line: Row) => decimal(line.quantity) === 0n) ? 'cancelled' : 'committed',
    approval: { actorId: c.actor.id, version: po.version + 1, at: c.now } });
  return po;
}
