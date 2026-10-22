import { fail, type State, type Row, type Context, row } from '../model';
import { amount, money } from '../money';

export type InvoiceCollection = 'invoices' | 'invoiceCredits' | 'paymentConnections' | 'invoicePayLinks' | 'invoicePaymentSessions' | 'invoicePayments';
export const records = (s: State, kind: InvoiceCollection): Row[] => (s as State & Record<InvoiceCollection, Row[]>)[kind] ?? [];
export function find(s: State, kind: InvoiceCollection, id: string): Row {
  return records(s, kind).find(r => r.id === id) ?? fail('NOT_FOUND', 'Invoice or payment record not found.');
}
export const append = (c: Context, kind: InvoiceCollection, data: Record<string, any>): Row => row(c, kind as any, data);

/** Includes customer credit after an already-paid invoice is credited. */
export function nativeBalance(s: State, invoiceId: string): string {
  const invoice = find(s, 'invoices', invoiceId);
  if (!['authorized', 'voided'].includes(invoice.status)) return money(0n);
  const invoiced = invoice.status === 'voided' ? 0n : amount(invoice.total);
  const credits = records(s, 'invoiceCredits').filter(r => r.invoiceId === invoiceId && r.status === 'authorized').reduce((n, r) => n + amount(r.total), 0n);
  const payments = records(s, 'invoicePayments').filter(r => r.invoiceId === invoiceId && r.status === 'succeeded').reduce((n, r) => n + amount(r.amount), 0n);
  return money(invoiced - credits - payments);
}
export function customerBalance(s: State, customerId: string) {
  const byCurrency: Record<string, bigint> = {};
  for (const invoice of records(s, 'invoices').filter(r => r.customerId === customerId)) byCurrency[invoice.currency] = (byCurrency[invoice.currency] ?? 0n) + amount(nativeBalance(s, invoice.id));
  return Object.fromEntries(Object.entries(byCurrency).map(([currency, value]) => [currency, money(value)]));
}
export function requireNoCollection(s: State, invoiceId: string) {
  if (records(s, 'invoicePaymentSessions').some(r => r.invoiceId === invoiceId && !['expired', 'succeeded', 'failed', 'cancelled'].includes(r.status)))
    fail('PAYMENT_ACTIVE', 'Expire the Stripe checkout and reconcile its payment before changing this invoice balance.');
}
export function expireLinks(c: Context, invoiceId: string, reason: string) {
  for (const link of records(c.s, 'invoicePayLinks').filter(r => r.invoiceId === invoiceId && r.status === 'active')) Object.assign(link, { status: reason, expiredAt: c.now, version: link.version + 1 });
}
export function existingPayUrl(s: State, invoiceId: string): string | null {
  return records(s, 'invoicePayLinks').find(r => r.invoiceId === invoiceId && r.status === 'active')?.url ?? null;
}
