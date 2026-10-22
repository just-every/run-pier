import { decimal, fail, fresh, get, id, nextReference, requireRole, SCALE, text, type Context, type Row } from '../model';
import { amount, CENT, money, toCents } from '../money';
import { append, expireLinks, find, records, requireNoCollection } from './state';

function creditDraft(c: Context, p: any) {
  const invoice = find(c.s, 'invoices', p.invoiceId);
  if (invoice.status !== 'authorized') fail('INVOICE_STATE', 'Credits require a named authorized invoice.');
  if (!['return', 'price', 'freight'].includes(p.kind)) fail('INVOICE_CREDIT', 'Choose return, price adjustment or freight refund.');
  const returned = p.kind === 'return' ? get(c.s, 'returns', p.returnId) : null;
  if (returned && !c.s.shipments.some(s => s.id === returned.shipmentId && s.orderId === invoice.orderId && (!invoice.shipmentId || invoice.shipmentId === s.id))) fail('INVOICE_CREDIT', 'The return must belong to this invoice shipment or prepay order.');
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 1000) fail('INVOICE_CREDIT', 'Select the original invoice lines to credit.');
  const used = new Set<string>();
  const lines = p.lines.map((line: any) => {
    const source = [...invoice.lines, ...invoice.charges].find(r => r.id === (line.invoiceLineId ?? line.chargeId));
    if (!source || used.has(source.id)) return fail('INVOICE_CREDIT', 'Select each original invoice line once.');
    used.add(source.id);
    if (p.kind === 'freight' && source.kind !== 'freight') fail('INVOICE_CREDIT', 'Freight refunds must name an original freight charge.');
    if (p.kind === 'return' && (!source.itemId || source.itemId !== returned!.itemId || (source.shipmentLineId && source.shipmentLineId !== returned!.shipmentLineId))) fail('INVOICE_CREDIT', 'Return credits must name the dispatched item and line.');
    const previous = records(c.s, 'invoiceCredits').filter(r => r.invoiceId === invoice.id && r.status === 'authorized').flatMap(r => r.lines).filter((r: any) => r.invoiceLineId === source.id);
    let value: bigint, quantity: string | null = null;
    if (p.kind === 'return') {
      const q = decimal(line.quantity, true), priorQ = previous.reduce((n: bigint, r: any) => n + decimal(r.quantity ?? '0'), 0n);
      const returnedCredits = records(c.s, 'invoiceCredits').filter(r => r.returnId === returned!.id && r.status === 'authorized').flatMap(r => r.lines).reduce((n: bigint, r: any) => n + decimal(r.quantity ?? '0'), 0n);
      if (q + priorQ > decimal(source.quantity) || q + returnedCredits > decimal(returned!.quantity)) fail('INVOICE_CREDIT', 'The credit exceeds invoiced or returned quantities.');
      quantity = line.quantity;
      value = toCents(amount(source.amount) * (priorQ + q) / decimal(source.quantity)) - toCents(amount(source.amount) * priorQ / decimal(source.quantity));
    } else value = decimal(line.amount, true) * SCALE;
    const priorAmount = previous.reduce((n: bigint, r: any) => n + amount(r.amount), 0n), original = amount(source.amount);
    if (value % CENT || value <= 0n || priorAmount + value > original) fail('INVOICE_CREDIT', 'Credit amounts must be positive whole cents within the original charge.');
    const originalTax = amount(invoice.tax.lines?.find((r: any) => r.lineId === source.id)?.amount ?? '0');
    const priorTax = previous.reduce((n: bigint, r: any) => n + amount(r.tax), 0n);
    const tax = priorAmount + value === original ? originalTax - priorTax : toCents(originalTax * (priorAmount + value) / original) - priorTax;
    return { id: id(), invoiceLineId: source.id, itemId: source.itemId ?? null, description: source.description, quantity, amount: money(value), tax: money(tax) };
  });
  const subtotal = lines.reduce((n: bigint, l: any) => n + amount(l.amount), 0n), tax = lines.reduce((n: bigint, l: any) => n + amount(l.tax), 0n);
  const already = records(c.s, 'invoiceCredits').filter(r => r.invoiceId === invoice.id && r.status === 'authorized').reduce((n, r) => n + amount(r.total), 0n);
  if (already + subtotal + tax > amount(invoice.total)) fail('INVOICE_CREDIT', 'Credits cannot exceed the original invoice total.');
  return append(c, 'invoiceCredits', { reference: nextReference(records(c.s, 'invoiceCredits'), 'CR'), invoiceId: invoice.id, orderId: invoice.orderId, customerId: invoice.customerId, invoiceVersion: invoice.version, kind: p.kind, returnId: returned?.id ?? null, reason: text(p.reason), date: c.now.slice(0, 10), currency: invoice.currency, usdRate: invoice.usdRate, usdTotal: money(toCents((subtotal + tax) * decimal(invoice.usdRate) / SCALE)), lines, subtotal: money(subtotal), tax: { source: invoice.tax.source, amount: money(tax), originalInvoiceTax: structuredClone(invoice.tax), providerAdjustment: 'pending-external-adjustment' }, total: money(subtotal + tax), status: 'draft', disposition: 'customer-credit', ledger: { status: 'pending-external-posting' }, review: null });
}
export function creditCommands(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('invoice.credit.')) return;
  requireRole(c, []);
  if (type === 'invoice.credit.draft') return creditDraft(c, p);
  const credit = find(c.s, 'invoiceCredits', p.creditId); fresh(credit, p.version);
  const invoice = find(c.s, 'invoices', credit.invoiceId);
  if (type === 'invoice.credit.review') {
    if (credit.status !== 'draft') fail('INVOICE_STATE', 'Only a draft credit may be reviewed.');
    if (invoice.version !== credit.invoiceVersion || invoice.status !== 'authorized') fail('STALE', 'The invoice changed; prepare a fresh credit.');
    credit.review = { actorId: c.actor.id, version: credit.version + 1, at: c.now }; credit.status = 'reviewed';
  } else if (type === 'invoice.credit.authorize') {
    if (credit.status !== 'reviewed' || credit.review?.version !== credit.version) fail('INVOICE_REVIEW', 'Review this exact credit version first.');
    if (invoice.version !== credit.invoiceVersion || invoice.status !== 'authorized') fail('STALE', 'The invoice changed; prepare a fresh credit.');
    if (c.automationActors?.[credit.review.actorId] !== 'owner') fail('APPROVER_REVOKED', 'The reviewing owner no longer holds approval authority.');
    c.approver = { id: credit.review.actorId, role: 'owner' };
    requireNoCollection(c.s, invoice.id);
    // Rebuild eligibility against concurrent credits without changing the retained draft.
    const check = creditDraft({ ...c, s: structuredClone(c.s) }, { invoiceId: invoice.id, kind: credit.kind, returnId: credit.returnId, reason: credit.reason, lines: credit.lines.map((l: any) => ({ invoiceLineId: l.invoiceLineId, quantity: l.quantity, amount: l.amount.split('.')[0] + '.' + l.amount.split('.')[1].slice(0, 2) })) });
    if (check.total !== credit.total) fail('STALE', 'Other credits changed the remaining invoice amount. Prepare a fresh credit.');
    credit.status = 'authorized'; credit.authorizedAt = c.now; credit.authorizedBy = c.actor.id;
    credit.original = structuredClone({ ...credit, version: credit.version + 1 });
    expireLinks(c, invoice.id, 'credited'); invoice.version++;
  } else return fail('COMMAND', 'Unknown credit command.');
  credit.version++; return credit;
}
