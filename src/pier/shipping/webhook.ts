import type { Bindings } from '../../auth.server';
import { activeAutomationActors, load } from '../storage';
import { credentials } from '../channels/secrets';
import { execute } from '../api';
import { SETTINGS, unavailable } from './commands';
import { easyPost } from './easypost';
import { providerOperation } from '../provider-audit';
import { trackingChange } from './transport';

export async function shippingWebhook(request: Request, env: Bindings): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/pier/shipping/webhook') return null;
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405 });
  if (unavailable(env)) return new Response(unavailable(env), { status: 503 });
  const state = await load(env.DB), settings = state.shippingSettings.find(s => s.id === SETTINGS);
  if (!settings?.enabled || !settings.webhookConfigured) return new Response('Configure the EasyPost webhook signing secret in Shipping.', { status: 409 });
  const secret = await credentials(env, SETTINGS), raw = await request.text();
  if (raw.length > 1024 * 1024) return new Response('Event is too large.', { status: 413 });
  const v2 = request.headers.get('x-hmac-signature-v2'), timestamp = request.headers.get('x-timestamp'), path = request.headers.get('x-path');
  let signature = v2 ?? request.headers.get('x-hmac-signature') ?? '', input = raw;
  if (v2) {
    const parsed = /^\d+$/.test(timestamp ?? '') ? Number(timestamp) * 1000 : Date.parse(timestamp ?? '');
    const age = Date.now() - parsed;
    if (!Number.isFinite(age) || age > 60000 || age < -30000 || path !== new URL(request.url).pathname) return new Response('Invalid webhook signature.', { status: 401 });
    input = `${timestamp}${request.method.toUpperCase()}${path}${raw}`;
  }
  signature = signature.replace(/^hmac-sha256-hex=/, '');
  if (!/^[a-f0-9]{64}$/i.test(signature)) return new Response('Invalid webhook signature.', { status: 401 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, b => parseInt(b, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(input))) return new Response('Invalid webhook signature.', { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response('Invalid event JSON.', { status: 400 }); }
  const job = state.shippingJobs.find(j => j.trackerId === event.result?.id);
  if (!job || !['tracker.created','tracker.updated'].includes(event.description)) return Response.json({ accepted: true });
  if (event.mode !== settings.mode || (await activeAutomationActors(env.DB))[settings.approvedBy] !== 'owner') return new Response('Connection authority changed.', { status: 409 });
  if (job.eventIds?.includes(event.id)) return Response.json({ accepted: true });
  // Signed notifications trigger canonical reads; an event body never supplies order state.
  const operator = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(settings.approvedBy).first<any>();
  const actor = { id: settings.approvedBy, role: 'owner', name: operator.display_name, operatorVersion: operator.version, sessionId: 'shipping-webhook' };
  const policy = { collection: 'shippingSettings' as const, id: SETTINGS, version: settings.version };
  const tracker = await providerOperation(env.DB, { actor, policy, commandId: `shipping-event-${event.id}`, connectorId: SETTINGS, operation: 'shipping.trackerNotification', direction: 'inbound', state, sources: [{ collection: 'shippingJobs', row: job }, { collection: 'shippingSettings', row: settings }], documentIds: [job.id, job.orderId, job.packId], itemIds: state.orders.find(order => order.id === job.orderId)?.lines.map((line: any) => line.itemId) ?? [], externalIds: [job.trackerId], requestId: event.id }, () => easyPost(secret.apiKey, job.mode).tracker(job.trackerId), value => ({ externalIds: [value.id] }));
  await execute(env, actor, `shipping-event-${crypto.randomUUID()}`, 'shipping.record', { jobId: job.id, version: job.version, change: trackingChange(job, tracker, event.id) }, undefined, { collection: 'shippingSettings', id: SETTINGS, version: settings.version });
  return Response.json({ accepted: true });
}
