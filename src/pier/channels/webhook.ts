import type { Bindings } from '../../auth.server';
import { load } from '../storage';
import { credentials } from './secrets';
import { syncChannels } from './sync';

/** Woo sends signed order notices; canonical REST reconciliation owns business effects. */
export async function channelWebhook(request: Request, env: Bindings): Promise<Response | null> {
  const match = /^\/api\/pier\/channels\/([^/]+)\/webhook$/.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const channel = (await load(env.DB)).channels.find(c => c.id === match[1] && c.enabled && c.provider === 'woocommerce');
  if (!channel) return new Response('Connection is not active.', { status: 404 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 2 * 1024 * 1024) return new Response('Webhook is too large.', { status: 413 });
  const secret = (await credentials(env, channel.id)).webhookSecret;
  if (!secret) return new Response('Configure a webhook signing secret.', { status: 409 });
  let valid = false;
  try {
    const signature = Uint8Array.from(atob(request.headers.get('x-wc-webhook-signature') ?? ''), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('HMAC', key, signature, raw);
  } catch { /* Invalid signature receives the same public response. */ }
  if (!valid) return new Response('Invalid webhook signature.', { status: 401 });
  const outcome = await syncChannels(env);
  return Response.json({ accepted: true, ...outcome }, { status: 'busy' in outcome ? 202 : 200 });
}
