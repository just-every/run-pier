import { fail, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { amount } from '../money';
import type { Bindings } from '../../auth.server';
import { draftInvoice, invoicePolicy, noLegacyInvoice } from './draft';
import { creditCommands } from './credits';
import { expireLinks, find, records, requireNoCollection } from './state';
import { paymentCommands } from '../payments/commands';
export { nativeBalance, customerBalance, existingPayUrl } from './state';
export { invoicePolicy } from './draft';

function currentSource(c: Context, invoice: Row) {
  const order = get(c.s, 'orders', invoice.orderId), source = invoice.shipmentId ? get(c.s, 'shipments', invoice.shipmentId) : order;
  if (source.version !== invoice.sourceVersion || order.version !== invoice.sourceOrderVersion) fail('INVOICE_SOURCE_CHANGED', 'The source changed after this draft. Cancel it and prepare a new invoice.');
  noLegacyInvoice(c, order, invoice.shipmentId ?? undefined);
  if (invoice.tax.table && get(c.s, 'salesPolicies', invoice.tax.table.id).version !== invoice.tax.table.version) fail('INVOICE_TAX_CHANGED', 'The owner tax estimate changed. Prepare a new invoice.');
  const certificate = invoice.tax.certificate;
  if (certificate && (certificate.expires < c.now.slice(0, 10) || !get(c.s, 'parties', invoice.customerId).resaleCertificates?.some((r: any) => JSON.stringify(r) === JSON.stringify(certificate)))) fail('INVOICE_TAX_CHANGED', 'The retained exemption changed or expired. Review the tax again.');
}
export async function invoices(c: Context, type: string, p: any, env?: Bindings): Promise<Row | undefined> {
  if (type.startsWith('payment.') || type === 'invoice.payLink') return paymentCommands(c, type, p, env!);
  if (!type.startsWith('invoice.')) return;
  requireRole(c, []);
  if (type.startsWith('invoice.credit.')) return creditCommands(c, type, p);
  if (type === 'invoice.policy') {
    if (!['shipment', 'prepay'].includes(p.mode)) fail('INVOICE_POLICY', 'Choose once per shipment or prepay on acceptance.');
    const order = p.orderId ? get(c.s, 'orders', p.orderId) : null;
    const customerId = order?.customerId ?? p.customerId;
    if (get(c.s, 'parties', customerId).kind !== 'customer') fail('CUSTOMER', 'Choose a customer.');
    const old = c.s.salesPolicies.find(r => r.kind === 'invoicing' && (order ? r.orderId === order.id : r.customerId === customerId && !r.orderId));
    if (old) fresh(old, p.version);
    if (records(c.s, 'invoices').some(r => r.status !== 'voided' && r.status !== 'cancelled' && (order ? r.orderId === order.id : r.customerId === customerId))) fail('INVOICE_POLICY', 'Existing invoices retain their policy. Choose policy before invoicing this customer or order.');
    const value = { kind: 'invoicing', orderId: order?.id ?? null, customerId, mode: p.mode, terms: p.terms ?? get(c.s, 'parties', customerId).paymentTerms ?? { kind: 'dueReceipt' }, approvedBy: c.actor.id, reason: text(p.reason) };
    return old ? Object.assign(old, value, { version: old.version + 1 }) : row(c, 'salesPolicies', value);
  }
  if (type === 'invoice.draft') return draftInvoice(c, p);
  const invoice = find(c.s, 'invoices', p.invoiceId); fresh(invoice, p.version);
  if (type === 'invoice.review') {
    if (invoice.status !== 'draft') fail('INVOICE_STATE', 'Only a draft invoice can be reviewed.');
    currentSource(c, invoice);
    invoice.status = 'reviewed'; invoice.review = { actorId: c.actor.id, version: invoice.version + 1, at: c.now };
  } else if (type === 'invoice.authorize') {
    if (invoice.status !== 'reviewed' || invoice.review?.version !== invoice.version) fail('INVOICE_REVIEW', 'Review this exact invoice version first.');
    currentSource(c, invoice);
    if (c.automationActors?.[invoice.review.actorId] !== 'owner') fail('APPROVER_REVOKED', 'The reviewing owner no longer holds approval authority.');
    c.approver = { id: invoice.review.actorId, role: 'owner' };
    invoice.status = 'authorized'; invoice.authorizedAt = c.now; invoice.authorizedBy = c.actor.id;
    invoice.original = structuredClone({ ...invoice, version: invoice.version + 1 });
  } else if (type === 'invoice.cancel') {
    if (!['draft', 'reviewed'].includes(invoice.status)) fail('INVOICE_IMMUTABLE', 'Authorized invoices are corrected by a linked credit or unpaid void.');
    invoice.status = 'cancelled'; invoice.cancelReason = text(p.reason);
  } else if (type === 'invoice.void') {
    if (invoice.status !== 'authorized') fail('INVOICE_STATE', 'Only an authorized unpaid invoice may be voided.');
    if (records(c.s, 'invoicePayments').some(r => r.invoiceId === invoice.id && amount(r.amount) > 0n) || records(c.s, 'invoiceCredits').some(r => r.invoiceId === invoice.id && r.status === 'authorized')) fail('INVOICE_PAID', 'An invoice with payments or credits must be corrected with a linked credit note.');
    requireNoCollection(c.s, invoice.id);
    invoice.status = 'voided'; invoice.voidReason = text(p.reason); invoice.voidedAt = c.now; invoice.voidedBy = c.actor.id;
    invoice.ledger = { ...invoice.ledger, status: 'void-pending-external-reversal' }; invoice.tax = { ...invoice.tax, reversal: 'pending-external-reversal' };
    expireLinks(c, invoice.id, 'voided');
  } else fail('INVOICE_IMMUTABLE', 'Authorized originals cannot be edited. Use a linked credit note or unpaid void.');
  invoice.version++; return invoice;
}
