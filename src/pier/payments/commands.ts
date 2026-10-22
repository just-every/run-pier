import type { Bindings } from '../../auth.server';
import { fail, fresh, id, requireRole, text, type Context, type Row } from '../model';
import { amount, CENT, money } from '../money';
import { credentials, seal } from '../channels/secrets';
import { append, expireLinks, find, nativeBalance, records } from '../invoices/state';
import { payLinkFor } from './tokens';
export const CONNECTION = 'payment:stripe';

export async function paymentCommands(c: Context, type: string, p: any, env: Bindings): Promise<Row | undefined> {
  requireRole(c, []);
  if (type === 'payment.configure') {
    if (p.consent !== true) fail('PAYMENT_CONSENT', 'Explicit owner consent is required to connect Stripe invoice payments.');
    if (!['test', 'live'].includes(p.mode)) fail('PAYMENT_MODE', 'Choose Stripe test or live mode.');
    const old = records(c.s, 'paymentConnections').find(r => r.id === CONNECTION);
    if (old) fresh(old, p.version);
    if (old && records(c.s, 'invoicePaymentSessions').some(r => !['expired', 'succeeded', 'failed', 'cancelled'].includes(r.status))) fail('PAYMENT_ACTIVE', 'Reconcile or expire active Stripe sessions before changing the connection.');
    const stored = await env.DB.prepare('SELECT channel_id FROM pier_channel_secrets WHERE channel_id=?').bind(CONNECTION).first();
    const before = stored ? await credentials(env, CONNECTION) : {};
    const secretKey = p.secretKey ? text(p.secretKey) : before.secretKey;
    const webhookSecret = p.webhookSecret ? text(p.webhookSecret) : before.webhookSecret;
    if (!secretKey || !webhookSecret || old && old.mode !== p.mode && !p.secretKey) fail('PAYMENT_CREDENTIALS', 'Supply the Stripe secret key and webhook signing secret for the selected account and mode.');
    c.channelSecrets = [...(c.channelSecrets ?? []), { channelId: CONNECTION, secret: await seal(env, CONNECTION, { secretKey, webhookSecret }) }];
    const data = { provider: 'stripe', mode: p.mode, enabled: true, approvedBy: c.actor.id, consentAt: c.now, methods: ['card', 'us_bank_account'], webhookConfigured: true, ledgerStatus: 'pending-external-reconciliation' };
    return old ? Object.assign(old, data, { version: old.version + 1 }) : append(c, 'paymentConnections', { id: CONNECTION, ...data });
  }
  const connection = records(c.s, 'paymentConnections').find(r => r.id === CONNECTION) ?? fail('PAYMENT_CONNECTION', 'An owner must connect Stripe invoice payments first.');
  if (!connection.enabled) fail('PAYMENT_CONNECTION', 'An owner must connect Stripe invoice payments first.');
  if (type === 'payment.disconnect') {
    if (records(c.s, 'invoicePaymentSessions').some(r => !['expired', 'succeeded', 'failed', 'cancelled'].includes(r.status))) fail('PAYMENT_ACTIVE', 'Reconcile or expire active Stripe sessions before disconnecting.');
    fresh(connection, p.version); connection.enabled = false; connection.version++; return connection;
  }
  if (type === 'invoice.payLink') {
    const invoice = find(c.s, 'invoices', p.invoiceId); fresh(invoice, p.version);
    return payLinkFor(c, invoice, env);
  }
  if (type === 'payment.begin') {
    const invoice = find(c.s, 'invoices', p.invoiceId); fresh(invoice, p.version);
    if (invoice.status !== 'authorized' || amount(nativeBalance(c.s, invoice.id)) <= 0n) fail('PAYMENT_BALANCE', 'This invoice no longer accepts payment.');
    if (p.linkId && !records(c.s, 'invoicePayLinks').some(r => r.id === p.linkId && r.invoiceId === invoice.id && r.status === 'active')) fail('PAYMENT_LINK', 'This invoice link has expired.');
    const active = records(c.s, 'invoicePaymentSessions').find(r => r.invoiceId === invoice.id && !['expired', 'succeeded', 'failed', 'cancelled'].includes(r.status));
    if (active) return { id: active.id, version: active.version, session: active, claimed: false };
    const balance = amount(nativeBalance(c.s, invoice.id));
    const value = p.amount === undefined ? balance : /^\d{1,10}\.\d{2}$/.test(p.amount) ? amount(p.amount) : fail('PAYMENT_AMOUNT', 'Enter a positive payment amount with two decimal places.');
    if (value <= 0n || value > balance || value % CENT || value / CENT > 99999999n) fail('PAYMENT_AMOUNT', 'Payment must be whole cents within the invoice balance and Stripe transaction limit.');
    const sessionId = id(), link = records(c.s, 'invoicePayLinks').find(r => r.invoiceId === invoice.id && r.status === 'active') ?? fail('PAYMENT_LINK', 'Create the invoice payment link before checkout.');
    const session = append(c, 'invoicePaymentSessions', { id: sessionId, invoiceId: invoice.id, invoiceVersion: invoice.version, linkId: p.linkId ?? link.id, connectionId: connection.id, connectionVersion: connection.version, requestKey: p.requestKey, status: 'creating', amount: money(value), amountCents: String(value / CENT), currency: invoice.currency, idempotencyKey: `pier-checkout-${sessionId}`, providerSessionId: null, providerPaymentId: null, checkoutUrl: null, attemptedAt: c.now, problem: null });
    return { id: session.id, version: session.version, session, claimed: true };
  }
  if (type === 'payment.complete') return find(c.s, 'invoicePaymentSessions', p.sessionId);
  if (type === 'payment.record') {
    const session = find(c.s, 'invoicePaymentSessions', p.sessionId); fresh(session, p.version);
    if (session.status === 'succeeded') return session;
    const change = p.change;
    if (!['uncertain', 'open', 'processing', 'verification', 'succeeded', 'failed', 'expired'].includes(change.status)) fail('PAYMENT_STATE', 'Invalid provider payment state.');
    if (change.status === 'succeeded') {
      const invoice = find(c.s, 'invoices', session.invoiceId);
      if (invoice.status !== 'authorized' || amount(nativeBalance(c.s, invoice.id)) < amount(session.amount)) fail('PAYMENT_REVIEW', 'The paid amount exceeds the remaining authorized invoice balance. Review in Stripe.');
      const existing = records(c.s, 'invoicePayments').find(r => r.providerPaymentId === change.providerPaymentId);
      if (existing && existing.sessionId !== session.id) fail('PAYMENT_DUPLICATE', 'This Stripe payment is already applied to another invoice request.');
      if (!existing) append(c, 'invoicePayments', { invoiceId: invoice.id, customerId: invoice.customerId, sessionId: session.id, provider: 'stripe', providerPaymentId: text(change.providerPaymentId), providerSessionId: session.providerSessionId ?? change.providerSessionId, paymentMethod: change.paymentMethod, status: 'succeeded', amount: session.amount, currency: session.currency, paidAt: c.now, ledger: { status: 'pending-external-reconciliation' } });
      invoice.version++;
      if (amount(nativeBalance(c.s, invoice.id)) <= 0n) expireLinks(c, invoice.id, 'paid');
    }
    for (const key of ['status', 'providerSessionId', 'providerPaymentId', 'checkoutUrl', 'providerStatus', 'expiresAt', 'problem', 'requestId', 'paymentMethod', 'verificationUrl']) if (Object.hasOwn(change, key)) session[key] = change[key];
    session.checkedAt = c.now; session.version++; return session;
  }
  return fail('COMMAND', 'Unknown payment command.');
}
