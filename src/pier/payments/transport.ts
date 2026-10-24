import type { Bindings } from '../../auth.server';
import { fail, fresh, requireRole, type Actor, type Context, type Row } from '../model';
import { canonicalJson, sha256 } from '../import-kit';
import { credentials } from '../channels/secrets';
import { load, saved } from '../storage';
import { find, records } from '../invoices/state';
import { CONNECTION } from './commands';
import { paymentRequest } from './audit';
import { checkoutUrl, matchingSession, paymentEvidence, stripe, StripeFailure } from './stripe';

export type Execute = (env: Bindings, actor: Actor, commandId: string, type: string, payload: any, now?: () => string, policy?: Context['backgroundPolicy']) => Promise<any>;
export type PaymentAuthority = { actor: Actor; policy?: Context['backgroundPolicy'] };
export async function paymentAuthority(env: Bindings): Promise<PaymentAuthority> {
  const state = await load(env.DB), connection = records(state, 'paymentConnections').find(r => r.id === CONNECTION && r.enabled);
  if (!connection) return fail('PAYMENT_CONNECTION', 'Invoice payments are unavailable until an owner reconnects Stripe.');
  const operator = await env.DB.prepare('SELECT version,display_name,status FROM oa_operators WHERE id=?').bind(connection.approvedBy).first<any>();
  if (!operator || operator.status !== 'active') return fail('PAYMENT_CONNECTION', 'The Stripe connection owner no longer has active authority.');
  return { actor: { id: connection.approvedBy, role: 'owner', name: operator.display_name, operatorVersion: operator.version, sessionId: 'invoice-payments' }, policy: { collection: 'paymentConnections' as any, id: CONNECTION, version: connection.version } };
}
const stepId = (name: string) => `payment-${name}-${crypto.randomUUID()}`;
export async function recordPayment(env: Bindings, authority: PaymentAuthority, execute: Execute, session: Row, change: any) {
  const outcome = await execute(env, authority.actor, stepId('record'), 'payment.record', { sessionId: session.id, version: session.version, change }, undefined, authority.policy);
  if (!outcome?.ok) fail('PAYMENT_BUSY', 'Payment state changed. Reload to reconcile the provider result.');
  Object.assign(session, outcome.result); return outcome;
}
export async function reconcileSession(env: Bindings, authority: PaymentAuthority, execute: Execute, session: Row, explicitProviderId?: string, expire = false) {
  const state = await load(env.DB), invoice = find(state, 'invoices', session.invoiceId), connection = find(state, 'paymentConnections', session.connectionId);
  if (!connection.enabled || connection.version !== session.connectionVersion) fail('PAYMENT_CONNECTION', 'Reconnect and review the original payment account before reconciling.');
  if (session.status === 'succeeded') return session;
  const providerId = session.providerSessionId ?? explicitProviderId;
  if (!providerId || typeof providerId !== 'string') fail('PAYMENT_IDENTITY', 'Find this request in Stripe using its retained idempotency key and supply its Checkout Session ID. Pier will not repeat an uncertain creation.');
  const client = stripe((await credentials(env, CONNECTION)).secretKey);
  let remote: any;
  try { remote = await paymentRequest(env, authority, session, 'read', () => client.read(providerId)); }
  catch (error) { return (await recordPayment(env, authority, execute, session, { status: 'uncertain', problem: error instanceof StripeFailure ? error.message : 'Stripe readback is unavailable. Reconcile before another checkout.' })).result; }
  matchingSession(session, invoice, connection, remote);
  if (expire && remote.status === 'open') {
    try { await paymentRequest(env, authority, session, 'expire', () => client.expire(providerId, `pier-expire-${session.id}`)); remote = await paymentRequest(env, authority, session, 'read', () => client.read(providerId)); }
    catch (error) { return (await recordPayment(env, authority, execute, session, { status: 'uncertain', problem: error instanceof StripeFailure ? error.message : 'Stripe did not confirm checkout expiration.' })).result; }
  }
  const evidence = paymentEvidence(session, invoice, connection, remote);
  const change = { ...evidence, verificationUrl:evidence.status==='verification'?evidence.verificationUrl:null, providerSessionId: remote.id, checkoutUrl: evidence.status === 'open' ? checkoutUrl(remote.url) : null, providerStatus: remote.status, expiresAt: typeof remote.expires_at === 'number' ? new Date(remote.expires_at * 1000).toISOString() : null, problem: expire && evidence.status==='verification' ? 'Complete Stripe bank verification before changing this invoice.' : expire && evidence.status === 'processing' ? 'A bank payment is processing. Wait for its succeeded or failed result before changing the invoice.' : null };
  const current = find(await load(env.DB), 'invoicePaymentSessions', session.id);
  // Concurrent readback/webhook paths converge on the append-only provider identity.
  return (await recordPayment(env, authority, execute, current, change)).result;
}
export async function checkout(env: Bindings, authority: PaymentAuthority, execute: Execute, commandId: string, p: any): Promise<Row> {
  const before = await load(env.DB);
  const prior = records(before, 'invoicePaymentSessions').find(r => r.requestKey === commandId);
  if (prior) {
    if (prior.invoiceId !== p.invoiceId) fail('IDEMPOTENCY', 'This request belongs to another invoice.');
    return prior.providerSessionId ? reconcileSession(env, authority, execute, prior) : prior;
  }
  const begin = await execute(env, authority.actor, stepId('begin'), 'payment.begin', { ...p, requestKey: commandId }, undefined, authority.policy);
  if (!begin?.ok) return fail('PAYMENT_BUSY', 'Reload the invoice before starting checkout.');
  const session = begin.result.session;
  if (!begin.result.claimed) return session.providerSessionId ? reconcileSession(env, authority, execute, session) : session;
  const state = await load(env.DB), invoice = find(state, 'invoices', session.invoiceId), connection = find(state, 'paymentConnections', session.connectionId), link = find(state, 'invoicePayLinks', session.linkId);
  let remote: any;
  try {
    const client = stripe((await credentials(env, CONNECTION)).secretKey);
    remote = await paymentRequest(env, authority, session, 'create', () => client.create(session, invoice, link.url));
    matchingSession(session, invoice, connection, remote);
    const url = checkoutUrl(remote.url);
    if (remote.status !== 'open' || !url) fail('PAYMENT_PROVIDER', 'Stripe returned no usable hosted checkout. Reconcile its existing request.');
    await recordPayment(env, authority, execute, session, { status: 'open', providerSessionId: remote.id, checkoutUrl: url, providerStatus: remote.status, expiresAt: new Date(remote.expires_at * 1000).toISOString(), problem: null });
  } catch (error) {
    await recordPayment(env, authority, execute, session, { status: error instanceof StripeFailure && !error.uncertain ? 'failed' : 'uncertain', ...(typeof remote?.id === 'string' ? { providerSessionId: remote.id } : {}), checkoutUrl: null, problem: error instanceof StripeFailure ? error.message : 'Stripe checkout was not verified. Reconcile the provider request before another payment.', requestId: error instanceof StripeFailure ? error.requestId : null });
  }
  return session;
}
/** Only this wrapper can record network results; the public endpoint denies internal commands. */
export async function performPayment(env: Bindings, actor: Actor, commandId: string, type: string, p: any, execute: Execute) {
  requireRole({ actor } as Context, []);
  const payload = { request: { type, payload: p } };
  const completed = await env.DB.prepare('SELECT result FROM pier_commands WHERE id=?').bind(commandId).first<{ result: string }>();
  if (completed) {
    const sessionId = JSON.parse(completed.result)?.result?.id;
    return saved(env.DB, commandId, sha256(canonicalJson({ type: 'payment.complete', payload: { ...payload, sessionId } })), actor);
  }
  let session: Row;
  if (type === 'payment.checkout') session = await checkout(env, { actor }, execute, commandId, p);
  else {
    session = find(await load(env.DB), 'invoicePaymentSessions', p.sessionId); fresh(session, p.version);
    if (!['payment.reconcile', 'payment.expire'].includes(type)) return fail('COMMAND', 'Unknown payment action.');
    session = await reconcileSession(env, { actor }, execute, session, p.providerSessionId, type === 'payment.expire');
  }
  // Keep request identities stable without retaining any raw provider response.
  return execute(env, actor, commandId, 'payment.complete', { ...payload, sessionId: session.id });
}
