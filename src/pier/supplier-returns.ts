import { balance, decimal, fail, format, fresh, get, id, move, nextReference, requireRole, row, text, type Context, type Row } from './model';
import { landReceipt } from './landed-cost';
import { amount, money, share, toCents } from './money';
import { supplierReturnCosts } from './supplier-return-cost';

/** Physical supplier returns never reverse or reopen the original receipt/PO. */
export function supplierReturns(c: Context, type: string, p: any): Row | undefined {
  if (!['supplierReturn.create', 'supplierReturn.authorize', 'supplierReturn.dispatch', 'supplierReturn.credit', 'supplierReturn.replace'].includes(type)) return;
  requireRole(c, ['warehouse', 'buyer']);
  if (type === 'supplierReturn.create') {
    const receipt = get(c.s, 'receipts', p.receiptId);
    if (receipt.status !== 'posted') fail('REVERSED', 'Return goods against a posted receipt.');
    if (!Array.isArray(p.lines) || !p.lines.length) fail('LINES', 'Choose received goods to reject.');
    const seen = new Set<string>();
    const lines = p.lines.map((x: any) => {
      const source = receipt.lines.find((l: any) => l.id === x.receiptLineId);
      if (!source || seen.has(source.id)) fail('LINE', 'Choose each receipt line once.');
      seen.add(source.id);
      const q = decimal(x.quantity, true);
      const prior = c.s.supplierReturns.filter(r => r.receiptId === receipt.id).flatMap(r => r.lines).filter(l => l.receiptLineId === source.id).reduce((n: bigint, l: any) => n + decimal(l.quantity), 0n);
      if (prior + q > decimal(source.quantity)) fail('SUPPLIER_RETURN_LIMIT', 'Return exceeds received, unreturned quantity.');
      return { id: id(), receiptLineId: source.id, poLineId: source.poLineId, itemId: source.itemId, locationId: source.locationId, quantity: format(q), cost: source.cost, credited: '0', replaced: '0' };
    });
    const document = row(c, 'supplierReturns', { reference: nextReference(c.s.supplierReturns, 'SR'), receiptId: receipt.id, poId: receipt.poId, supplierId: get(c.s, 'purchaseOrders', receipt.poId).supplierId, reason: text(p.reason, 'Rejection reason'), status: 'quarantined', lines, resolutions: [] });
    for (const l of lines) {
      const base = { itemId: l.itemId, locationId: l.locationId, documentId: document.id, reason: 'Supplier return quarantine' };
      move(c, { ...base, status: 'sellable', quantity: (-decimal(l.quantity)).toString() });
      move(c, { ...base, status: 'quarantine', quantity: decimal(l.quantity).toString() });
    }
    return document;
  }
  const document = get(c.s, 'supplierReturns', p.returnId);
  fresh(document, p.version);
  if (type === 'supplierReturn.authorize') {
    if (document.status !== 'quarantined') fail('SUPPLIER_RETURN_STATE', 'Only a quarantined return awaits authorization.');
    const reference = text(p.authorizationReference, 'Supplier authorization reference');
    if (c.s.supplierReturns.some(r => r.id !== document.id && r.supplierId === document.supplierId && r.authorization?.reference === reference)) fail('SUPPLIER_RETURN_DUPLICATE', 'This supplier authorization is already assigned to a return.');
    document.authorization = { reference, evidence: text(p.evidence, 'Supplier authorization evidence'), actorId: c.actor.id, at: c.now };
    document.status = 'authorized';
  } else if (type === 'supplierReturn.dispatch') {
    if (document.status !== 'authorized') fail('SUPPLIER_RETURN_STATE', 'Dispatch requires supplier authorization and an undispatched return.');
    const reference = text(p.dispatchReference, 'Return dispatch reference');
    for (const l of document.lines) {
      // Other return documents retain their quarantined allocations even after a count correction.
      const protectedQuantity = c.s.supplierReturns.filter(r => r.id !== document.id && ['quarantined', 'authorized'].includes(r.status)).flatMap(r => r.lines).filter(x => x.itemId === l.itemId && x.locationId === l.locationId).reduce((n: bigint, x: any) => n + decimal(x.quantity), 0n);
      if (balance(c.s, l.itemId, l.locationId, 'quarantine') - protectedQuantity < decimal(l.quantity)) fail('DEPENDENCY', 'Returned quarantine stock changed. Reconcile the physical bin before dispatch.');
      move(c, { itemId: l.itemId, locationId: l.locationId, status: 'quarantine', quantity: (-decimal(l.quantity)).toString(), documentId: document.id, reason: 'Supplier return dispatch ' + reference });
    }
    document.dispatch = { reference, actorId: c.actor.id, at: c.now };
    document.status = 'dispatched';
    const costs = supplierReturnCosts(c.s, document, c.now);
    for (const line of document.lines) {
      const cost = costs.get(line.id)!;
      line.dispatchCostTotal = cost.total;
      line.dispatchCostLayers = cost.layers;
    }
  } else {
    if (document.status !== 'dispatched') fail('SUPPLIER_RETURN_STATE', 'Only dispatched, unresolved returns can be reconciled.');
    if (!Array.isArray(p.lines) || !p.lines.length) fail('LINES', 'Choose quantities to reconcile.');
    const reference = text(p.reference, 'Supplier credit or replacement reference');
    if (c.s.supplierReturns.some(r => r.supplierId === document.supplierId && r.resolutions.some((x: any) => x.kind === type && x.reference === reference))) fail('SUPPLIER_RETURN_DUPLICATE', 'This supplier resolution reference is already recorded.');
    const costs = supplierReturnCosts(c.s, document, c.now);
    const seen = new Set<string>();
    const entries = p.lines.map((x: any) => {
      const l = document.lines.find((l: any) => l.id === x.returnLineId);
      if (!l || seen.has(l.id)) fail('LINE', 'Choose each line of this return once.');
      seen.add(l.id);
      const q = decimal(x.quantity, true);
      if (q + decimal(l.credited) + decimal(l.replaced) > decimal(l.quantity)) fail('SUPPLIER_RETURN_LIMIT', 'Credit and replacement exceed the dispatched quantity.');
      const cost = costs.get(l.id)!.total, resolved = decimal(l.credited) + decimal(l.replaced);
      // Cumulative whole-cent shares leave the remainder on the final resolution.
      const costTotal = cost === null ? null : money(share(amount(cost), resolved + q, decimal(l.quantity)) - share(amount(cost), resolved, decimal(l.quantity)));
      return { returnLineId: l.id, quantity: format(q), locationId: x.locationId, costTotal };
    });
    const resolution: any = { kind: type, reference, evidence: text(p.evidence, 'Supplier resolution evidence'), lines: entries, actorId: c.actor.id, at: c.now };
    if (type === 'supplierReturn.credit') {
      const amount = decimal(p.amount, true);
      if (amount % 10000n) fail('SUPPLIER_CREDIT', 'Record a USD credit in whole cents.');
      resolution.amount = format(amount);
      resolution.currency = 'USD';
      // Retained supplier evidence, not a claim that a connected ledger was posted.
      resolution.posting = 'not-posted';
    } else {
      const receipt = row(c, 'receipts', { poId: document.poId, supplierReference: reference, replacementFor: document.id, originalReceiptId: document.receiptId, status: 'posted', lines: [] });
      for (const x of entries) {
        const l = document.lines.find((l: any) => l.id === x.returnLineId);
        if (get(c.s, 'locations', x.locationId).kind !== 'bin') fail('BIN', 'Receive replacements into a bin.');
        const movement = move(c, { itemId: l.itemId, locationId: x.locationId, status: 'sellable', quantity: decimal(x.quantity).toString(), documentId: receipt.id, reason: 'Supplier replacement ' + reference });
        receipt.lines.push({ id: id(), poLineId: l.poLineId, itemId: l.itemId, locationId: x.locationId, quantity: x.quantity, cost: l.cost, movementId: movement.id, replacementCostTotal: x.costTotal, returnedLineId: l.id });
      }
      landReceipt(receipt);
      // A replacement restores the issued inventory value. It is not a second
      // purchase, and the supplier unit price alone omits freight and duty.
      for (const line of receipt.lines) {
        line.landedTotal = line.replacementCostTotal;
        line.landedUnitCost = line.replacementCostTotal === null ? null : money(toCents(amount(line.replacementCostTotal) * 1000000n / decimal(line.quantity)));
      }
      receipt.valuationBasis = 'supplier-return-dispatch';
      receipt.landedCost.total = receipt.lines.some((line: any) => line.replacementCostTotal === null) ? null : money(receipt.lines.reduce((n: bigint, line: any) => n + amount(line.replacementCostTotal), 0n));
      resolution.receiptId = receipt.id;
    }
    for (const x of entries) {
      const l = document.lines.find((l: any) => l.id === x.returnLineId), key = type === 'supplierReturn.credit' ? 'credited' : 'replaced';
      l[key] = format(decimal(l[key]) + decimal(x.quantity));
    }
    document.resolutions.push(resolution);
    if (document.lines.every((l: any) => decimal(l.credited) + decimal(l.replaced) === decimal(l.quantity))) document.status = 'reconciled';
  }
  document.version++;
  return document;
}
