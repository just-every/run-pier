import type { Bindings } from '../../auth.server';
import { fail, id, type Context, type Row, type State } from '../model';
import { amount } from '../money';
import { append, existingPayUrl, find, nativeBalance, records } from '../invoices/state';

async function signature(env: Bindings, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pier-invoice-pay\0${value}`)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function payLinkFor(c: Context, invoice: Row, env: Bindings) {
  if (invoice.status !== 'authorized' || amount(nativeBalance(c.s, invoice.id)) <= 0n) fail('PAYMENT_BALANCE', 'Only an authorized invoice with an open balance can have a payment link.');
  const existing = existingPayUrl(c.s, invoice.id);
  if (existing) return records(c.s, 'invoicePayLinks').find(r => r.url === existing)!;
  const linkId = id(), token = `${linkId}.${await signature(env, linkId)}`;
  return append(c, 'invoicePayLinks', { id: linkId, invoiceId: invoice.id, invoiceVersion: invoice.version, status: 'active', url: `${new URL(env.AUTH_ORIGIN).origin}/api/pier/pay/invoices/${token}`, approvedBy: c.actor.id });
}
export async function resolvePayToken(s: State, token: string, env: Bindings) {
  const [linkId, supplied, extra] = token.split('.');
  if (extra || !/^[a-f0-9-]{36}$/.test(linkId ?? '') || !/^[a-f0-9]{64}$/.test(supplied ?? '')) return null;
  const expected = await signature(env, linkId);
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (different) return null;
  const link = records(s, 'invoicePayLinks').find(r => r.id === linkId);
  return link ? { link, invoice: find(s, 'invoices', link.invoiceId) } : null;
}
