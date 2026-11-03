import type { Bindings } from '../../auth.server';
import { Problem } from '../model';
import { amount } from '../money';
import { load } from '../storage';
import { nativeBalance, records } from '../invoices/state';
import { resolvePayToken } from './tokens';
import { checkout, paymentAuthority, reconcileSession, type Execute } from './transport';
import { stripeWebhook } from './webhook';

const escaped = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
function html(title: string, content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>${escaped(title)}</title><style>body{font:18px system-ui;margin:10vh auto;padding:24px;max-width:520px;color:#162c2b;background:#fafbf8}h1{font-size:30px}button{font:inherit;padding:14px 20px;background:#195f51;color:white;border:0;border-radius:8px;cursor:pointer}p{line-height:1.5}</style><main>${content}</main></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; frame-ancestors 'none'" } });
}
export async function paymentResponse(request: Request, env: Bindings, execute: Execute): Promise<Response | null> {
  const url = new URL(request.url), match = /^\/api\/pier\/pay\/invoices\/([^/]+)$/.exec(url.pathname);
  if (!match && url.pathname !== '/api/pier/payments/stripe/webhook') return null;
  try {
    if (!match) return await stripeWebhook(request, env, execute);
    if (!['GET', 'POST'].includes(request.method)) return new Response('Use GET or POST.', { status: 405 });
    let state = await load(env.DB), found = await resolvePayToken(state, match[1], env);
    if (!found) return html('Invoice link unavailable', '<h1>Invoice link unavailable</h1><p>Ask the sender for a current invoice payment link.</p>', 404);
    const { link, invoice } = found;
    let session = records(state, 'invoicePaymentSessions').find(r => r.invoiceId === invoice.id && !['expired', 'failed', 'cancelled', 'succeeded'].includes(r.status));
    if (session?.providerSessionId && session.status !== 'succeeded') {
      session = await reconcileSession(env, await paymentAuthority(env), execute, session);
      state = await load(env.DB); found = await resolvePayToken(state, match[1], env);
    }
    const current = found!.invoice, currentLink = found!.link, balance = nativeBalance(state, invoice.id);
    const payable = current.status === 'authorized' && currentLink.status === 'active' && amount(balance) > 0n;
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== new URL(env.AUTH_ORIGIN).origin) return new Response('Use the invoice payment page.', { status: 403 });
      if (!payable) return html('Invoice link expired', `<h1>${escaped(current.reference)}</h1><p>This invoice link no longer accepts payment.</p>`, 409);
      session = await checkout(env, await paymentAuthority(env), execute, `invoice-public-${crypto.randomUUID()}`, { invoiceId: current.id, version: current.version, linkId: currentLink.id });
      if (session.status === 'open' && session.checkoutUrl) return new Response(null, { status: 303, headers: { location: session.checkoutUrl, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    }
    const paid = current.status === 'authorized' && amount(balance) === 0n;
    const waiting = session && ['creating', 'uncertain', 'processing', 'verification'].includes(session.status);
    const message = paid ? 'Paid. No further payment is due.' : !payable ? 'This invoice payment link has expired. Contact the sender for an updated invoice.' : waiting ? session!.status==='verification' ? 'Verify your bank account with Stripe before this payment can finish. No payment has been applied.' : session!.status === 'processing' ? 'Your bank payment is processing. It will apply only after Stripe confirms success.' : 'The payment request needs reconciliation. Contact the sender before starting another payment.' : 'Pay securely by card or US bank account through Stripe.';
    return html(`Invoice ${current.reference}`, `<h1>Invoice ${escaped(current.reference)}</h1><p>Total: ${escaped(current.currency)} ${escaped(current.total.slice(0, -10))}<br>Open balance: ${escaped(current.currency)} ${escaped(balance.slice(0, -10))}</p><p>${escaped(message)}</p>${session?.status==='verification'&&session.verificationUrl?`<p><a href="${escaped(session.verificationUrl)}" rel="noreferrer">Verify bank account with Stripe</a></p>`:''}${payable && !waiting ? `<form method="post" action="${escaped(url.pathname)}"><button type="submit">Continue to secure payment</button></form>` : ''}`);
  } catch (error) {
    if (error instanceof Problem) return html('Invoice payment unavailable', `<h1>Invoice payment unavailable</h1><p>${escaped(error.message)}</p>`, error.status);
    return html('Invoice payment unavailable', '<h1>Invoice payment unavailable</h1><p>Contact the sender to reconcile this payment. No additional request was submitted.</p>', 503);
  }
}
