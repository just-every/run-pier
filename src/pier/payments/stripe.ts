import { fail, type Row } from '../model';

export class StripeFailure extends Error {
  constructor(public uncertain: boolean, public requestId: string | null) { super(uncertain ? 'Stripe did not confirm the request. Reconcile the existing provider request before continuing.' : 'Stripe declined this request. Review the connection and payment method in Stripe.'); }
}
export function stripe(secretKey: string) {
  const request = async (method: 'GET' | 'POST', path: string, fields?: URLSearchParams, key?: string): Promise<any> => {
    let response: Response;
    try {
      // Workerd supports manual/follow only. Rejecting non-2xx below also refuses
      // redirects without forwarding the account credential to another host.
      response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { 'Stripe-Version': '2026-09-30.endive', authorization: `Bearer ${secretKey}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(fields ? { body: fields.toString() } : {}), signal: AbortSignal.timeout(25000), redirect: 'manual' });
    } catch { throw new StripeFailure(true, null); }
    if (!response.ok) throw new StripeFailure(response.status >= 500 || response.status === 409 || response.status === 429, response.headers.get('request-id'));
    try { return await response.json(); } catch { throw new StripeFailure(true, response.headers.get('request-id')); }
  };
  return {
    create(session: Row, invoice: Row, returnUrl: string) {
      const fields = new URLSearchParams({ mode: 'payment', 'adaptive_pricing[enabled]': 'false', success_url: returnUrl, cancel_url: returnUrl, client_reference_id: invoice.id, 'line_items[0][price_data][currency]': session.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': session.amountCents, 'line_items[0][price_data][product_data][name]': `Invoice ${invoice.reference}`, 'line_items[0][quantity]': '1', 'allowed_payment_method_types[0]': 'card', expires_at: String(Math.floor(Date.now() / 1000) + 1860) });
      if (session.currency === 'USD') fields.set('allowed_payment_method_types[1]', 'us_bank_account');
      for (const [key, value] of Object.entries({ pier_invoice_id: invoice.id, pier_session_id: session.id, pier_connection_id: session.connectionId })) {
        fields.set(`metadata[${key}]`, String(value)); fields.set(`payment_intent_data[metadata][${key}]`, String(value));
      }
      return request('POST', 'checkout/sessions', fields, session.idempotencyKey);
    },
    read(id: string) { return request('GET', `checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge`); },
    expire(id: string, key: string) { return request('POST', `checkout/sessions/${encodeURIComponent(id)}/expire`, new URLSearchParams(), key); },
    list() { return request('GET', 'checkout/sessions?limit=100'); },
  };
}
export function checkoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function matchingSession(session: Row, invoice: Row, connection: Row, remote: any) {
  if (!remote || typeof remote.id !== 'string' || remote.object !== 'checkout.session' || remote.mode !== 'payment' || remote.client_reference_id !== invoice.id || remote.metadata?.pier_invoice_id !== invoice.id || remote.metadata?.pier_session_id !== session.id || remote.metadata?.pier_connection_id !== connection.id || remote.livemode !== (connection.mode === 'live') || remote.currency !== session.currency.toLowerCase() || String(remote.amount_total) !== session.amountCents || (session.providerSessionId && session.providerSessionId !== remote.id))
    fail('PAYMENT_MISMATCH', 'Stripe checkout identity, invoice, currency or amount does not match the retained request.');
}
export function paymentEvidence(session: Row, invoice: Row, connection: Row, remote: any) {
  matchingSession(session, invoice, connection, remote);
  const intent = remote.payment_intent;
  if (intent && typeof intent === 'object') {
    if (intent.object !== 'payment_intent' || intent.metadata?.pier_invoice_id !== invoice.id || intent.metadata?.pier_session_id !== session.id || intent.metadata?.pier_connection_id !== connection.id || intent.currency !== session.currency.toLowerCase() || String(intent.amount) !== session.amountCents || intent.livemode !== (connection.mode === 'live')) fail('PAYMENT_MISMATCH', 'The Stripe payment intent does not match this invoice request.');
    if (remote.status === 'expired') return { status: 'expired' };
    if (intent.status === 'succeeded' && remote.status === 'complete' && remote.payment_status === 'paid') {
      if (String(intent.amount_received) !== session.amountCents || typeof intent.id !== 'string') fail('PAYMENT_MISMATCH', 'Stripe has not received exactly the requested invoice amount.');
      const method = intent.latest_charge?.payment_method_details?.type;
      return { status: 'succeeded', providerPaymentId: intent.id, paymentMethod: ['card', 'us_bank_account'].includes(method) ? method : 'provider-confirmed', amount: session.amount, currency: session.currency };
    }
    if (intent.status === 'requires_action') {
      const value=intent.next_action?.verify_with_microdeposits?.hosted_verification_url;
      let verificationUrl:string|null=null;
      try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='payments.stripe.com'&&!url.username&&!url.password)verificationUrl=url.href;}catch{}
      return {status:'verification',verificationUrl};
    }
    if (intent.status === 'processing') return { status: 'processing' };
    if (intent.status === 'canceled' || remote.status === 'complete' && intent.status === 'requires_payment_method') return { status: 'failed' };
  }
  if (remote.status === 'expired') return { status: 'expired' };
  return { status: remote.status === 'complete' ? 'processing' : 'open' };
}
