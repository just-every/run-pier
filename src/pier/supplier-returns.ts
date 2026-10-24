import { balance, decimal, fail, format, fresh, get, id, move, nextReference, requireRole, row, text, type Context, type Row } from './model';
import { amount, extended, money, share, toCents } from './money';
import { landReceipt } from './landed-cost';

/** Physical supplier returns never reverse or reopen the original receipt/PO. */
export function supplierReturns(c: Context, type: string, p: any): Row | undefined {
  if (!['supplierReturn.create', 'supplierReturn.authorize', 'supplierReturn.dispatch', 'supplierReturn.credit', 'supplierReturn.replace', 'supplierReturn.postCredit'].includes(type)) return;
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
  if (type === 'supplierReturn.postCredit') {
    requireRole(c, []);
    if (!c.s.bookConnections.some(connection => connection.enabled && connection.provider === 'pantry')) fail('BOOK_CONNECTION', 'Connect Pantry before posting a supplier credit.');
    const resolution = document.resolutions.find((r: Row) => r.kind === 'supplierReturn.credit' && r.reference === p.reference);
    if (!resolution || resolution.postingAuthorizedAt) fail('SUPPLIER_CREDIT', 'Choose an unposted retained supplier credit.');
    const bill = get(c.s, 'supplierBills', p.supplierBillId);
    if (bill.status !== 'approved' || bill.supplierId !== document.supplierId || bill.poId !== document.poId) fail('SUPPLIER_CREDIT', 'Choose an approved matched payable for this supplier and purchase order.');
    for (const entry of resolution.lines) {
      const line = document.lines.find((l: Row) => l.id === entry.returnLineId);
      const matched = bill.approval.match.lines.flatMap((l: Row) => l.receiptAllocations).filter((a: Row) => a.receiptId === document.receiptId && a.receiptLineId === line.receiptLineId).reduce((n: bigint, a: Row) => n + decimal(a.quantity), 0n);
      const prior = c.s.supplierReturns.flatMap(r => r.resolutions.filter((x: Row) => x.supplierBillId === bill.id).flatMap((x: Row) => x.lines.map((e: Row) => ({ ...e, receiptLineId: r.lines.find((l: Row) => l.id === e.returnLineId).receiptLineId })))).filter(e => e.receiptLineId === line.receiptLineId).reduce((n: bigint, e: Row) => n + decimal(e.quantity), 0n);
      if (prior + decimal(entry.quantity) > matched) fail('SUPPLIER_CREDIT', 'The credit quantity exceeds this payable’s matched original receipt quantity.');
    }
    Object.assign(resolution, { id: resolution.id ?? id(), supplierBillId: bill.id, supplierName: bill.approval.supplier.name, postingAuthorizedAt: c.now, postingAuthorizedBy: c.actor.id, posting: 'pending' });
    document.version++;
    return document;
  }
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
  } else {
    if (document.status !== 'dispatched') fail('SUPPLIER_RETURN_STATE', 'Only dispatched, unresolved returns can be reconciled.');
    if (!Array.isArray(p.lines) || !p.lines.length) fail('LINES', 'Choose quantities to reconcile.');
    const reference = text(p.reference, 'Supplier credit or replacement reference');
    if (c.s.supplierReturns.some(r => r.supplierId === document.supplierId && r.resolutions.some((x: any) => x.kind === type && x.reference === reference))) fail('SUPPLIER_RETURN_DUPLICATE', 'This supplier resolution reference is already recorded.');
    const seen = new Set<string>();
    const entries = p.lines.map((x: any) => {
      const l = document.lines.find((l: any) => l.id === x.returnLineId);
      if (!l || seen.has(l.id)) fail('LINE', 'Choose each line of this return once.');
      seen.add(l.id);
      const q = decimal(x.quantity, true);
      if (q + decimal(l.credited) + decimal(l.replaced) > decimal(l.quantity)) fail('SUPPLIER_RETURN_LIMIT', 'Credit and replacement exceed the dispatched quantity.');
      return { returnLineId: l.id, quantity: format(q), locationId: x.locationId };
    });
    const resolution: any = { id: id(), kind: type, reference, evidence: text(p.evidence, 'Supplier resolution evidence'), lines: entries, actorId: c.actor.id, at: c.now };
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
        receipt.lines.push({ id: id(), poLineId: l.poLineId, itemId: l.itemId, locationId: x.locationId, quantity: x.quantity, cost: l.cost, movementId: movement.id });
      }
      landReceipt(receipt);
      // Replacements carry the retained original landed shares; they create no payable.
      const original = get(c.s, 'receipts', document.receiptId);
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index], returned = document.lines.find((l: Row) => l.id === entry.returnLineId);
        const source = original.lines.find((l: Row) => l.id === returned.receiptLineId), line = receipt.lines[index];
        const prior = c.s.supplierReturns.filter(r => r.receiptId === original.id).flatMap(r => r.lines).filter(l => l.receiptLineId === source.id).reduce((n: bigint, l: Row) => n + decimal(l.replaced), 0n);
        for (const field of ['freight', 'duty']) line[field] = money(share(amount(source[field] ?? '0'), prior + decimal(entry.quantity), decimal(source.quantity)) - share(amount(source[field] ?? '0'), prior, decimal(source.quantity)));
        line.landedTotal = money(extended(line.quantity, line.cost) + amount(line.freight) + amount(line.duty));
        line.landedUnitCost = money(toCents(amount(line.landedTotal) * 1000000n / decimal(line.quantity)));
      }
      receipt.landedCost = { ...receipt.landedCost, freight: money(receipt.lines.reduce((n: bigint, l: Row) => n + amount(l.freight), 0n)), duty: money(receipt.lines.reduce((n: bigint, l: Row) => n + amount(l.duty), 0n)), total: money(receipt.lines.reduce((n: bigint, l: Row) => n + amount(l.landedTotal), 0n)) };

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
