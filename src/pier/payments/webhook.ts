import type { Bindings } from '../../auth.server';
import { credentials } from '../channels/secrets';
import { load } from '../storage';
import { records } from '../invoices/state';
import { CONNECTION } from './commands';
import { paymentAuthority, reconcileSession, type Execute } from './transport';

export async function stripeWebhook(request: Request, env: Bindings, execute: Execute): Promise<Response> {
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const state = await load(env.DB), connection = records(state, 'paymentConnections').find(r => r.id === CONNECTION && r.enabled);
  if (!connection?.webhookConfigured) return new Response('Stripe invoice payments are not connected.', { status: 409 });
  if (Number(request.headers.get('content-length') ?? '0') > 1024 * 1024) return new Response('Event is too large.', { status: 413 });
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return new Response('Event is too large.', { status: 413 });
  const fields = (request.headers.get('stripe-signature') ?? '').split(',').map(v => v.split('='));
  const times = fields.filter(([k]) => k === 't'), timestamp = times[0]?.[1];
  const signatures = fields.filter(([k]) => k === 'v1').map(([, v]) => v).filter(v => /^[a-f0-9]{64}$/i.test(v));
  if (times.length !== 1 || !/^\d+$/.test(timestamp ?? '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures.length) return new Response('Invalid webhook signature.', { status: 401 });
  const secret = await credentials(env, CONNECTION);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let valid = false;
  for (const signature of signatures) if (await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!, v => parseInt(v, 16)), new TextEncoder().encode(`${timestamp}.${raw}`))) valid = true;
  if (!valid) return new Response('Invalid webhook signature.', { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response('Invalid event JSON.', { status: 400 }); }
  if (!event.id || event.livemode !== (connection.mode === 'live')) return new Response('Invalid event identity or mode.', { status: 400 });
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing'].includes(event.type)) return Response.json({ accepted: true });
  const object = event.data?.object;
  const session = records(state, 'invoicePaymentSessions').find(r => r.providerSessionId === object?.id || r.providerPaymentId === object?.id || r.id === object?.metadata?.pier_session_id);
  if (!session || session.status === 'succeeded') return Response.json({ accepted: true });
  // A signed event only identifies a retained request. Canonical provider readback
  // verifies its amount, currency, metadata and succeeded state before application.
  const providerId = session.providerSessionId ?? (object?.object === 'checkout.session' ? object.id : undefined);
  if (!providerId) return new Response('Reconcile the checkout session identity before this payment event.', { status: 409 });
  await reconcileSession(env, await paymentAuthority(env), execute, session, providerId);
  return Response.json({ accepted: true });
}
