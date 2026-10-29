import type { Bindings } from '../auth.server';
import { decimal, fail, fresh, get, id, requireRole, row, text, type Actor, type Context, type Row, type State } from './model';
import { canonicalJson, sha256 } from './import-kit';
import { seal, credentials } from './channels/secrets';
import { authority, load } from './storage';
import { beginProviderAttempt } from './provider-audit';

export const webhookFields = ['status', 'lines'] as const;
const secretId = (subscriptionId: string) => `webhook:${subscriptionId}`;

function destination(value: unknown) {
  const valueText = text(value, 'HTTPS destination');
  let url: URL;
  try { url = new URL(valueText); } catch { return fail('WEBHOOK_DESTINATION', 'Use an exact public HTTPS destination without credentials, query or fragment.'); }
  const host = url.hostname.toLowerCase();
  // Literal addresses, local hostnames and redirect following cannot turn an
  // owner-approved public destination into an installation-private request.
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port && url.port !== '443' ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host))
    fail('WEBHOOK_DESTINATION', 'Use an exact public HTTPS destination without credentials, query or fragment.');
  return url.href;
}
function fields(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > webhookFields.length ||
      new Set(value).size !== value.length || value.some(field => !webhookFields.includes(field)))
    fail('WEBHOOK_SCOPE', 'Choose only order status and line quantities. Subscriber actions and other event families are unavailable.');
  return webhookFields.filter(field => (value as string[]).includes(field));
}
function eventFor(order: Row, commandId: string, at: string) {
  return { schema: 'pier-order-webhook-v1', id: sha256(`pier-order-event\0${commandId}\0${order.id}`), type: 'order.changed', occurredAt: at,
    source: { orderId: order.id, orderVersion: order.version, commandId, channelId: order.channelId ?? null, importId: order.importId ?? null },
    data: { status: order.lines.every((line: any) => decimal(line.dispatched) + decimal(line.cancelled) === decimal(line.quantity)) ? 'closed' : order.lines.some((line: any) => decimal(line.dispatched) > 0n) ? 'partly-shipped' : 'open', lines: order.lines.map((line: any) => ({ id: line.id, itemId: line.itemId, quantity: line.quantity, dispatched: line.dispatched, cancelled: line.cancelled })) } };
}
function projected(event: ReturnType<typeof eventFor>, selected: string[]) {
  return { ...event, data: Object.fromEntries(selected.map(field => [field, event.data[field as keyof typeof event.data]])) };
}
function currentSubscription(c: Context, p: any) {
  const subscription = get(c.s, 'webhookSubscriptions', p.subscriptionId);
  fresh(subscription, p.version);
  return subscription;
}
function active(subscription: Row) { return subscription.enabled && subscription.approvedBy && !subscription.restorePaused; }

export async function webhooks(c: Context, type: string, p: any, env: Bindings) {
  if (!type.startsWith('webhook.') || type === 'webhook.process') return;
  requireRole(c, []);
  if (type === 'webhook.save') {
    if (p.events !== undefined && canonicalJson(p.events) !== canonicalJson(['order.changed']) ||
        Object.keys(p).some(key => !['subscriptionId','version','name','destination','fields','events','secret'].includes(key)))
      fail('WEBHOOK_SCOPE', 'This connection permits order events only, with no subscriber actions or service credentials.');
    const selected = fields(p.fields), target = destination(p.destination);
    const subscription = p.subscriptionId ? currentSubscription(c, p) : row(c, 'webhookSubscriptions', {});
    const secret = text(p.secret, 'Signing secret');
    if (secret.length < 32 || secret.length > 256 || !/^[\x21-\x7e]+$/.test(secret)) fail('WEBHOOK_SECRET', 'Use a private signing secret of 32 to 256 printable characters.');
    const fingerprint = sha256(secret);
    Object.assign(subscription, { name: text(p.name, 'Subscription name'), destination: target, fields: selected, events: ['order.changed'],
      scopeVersion: (subscription.scopeVersion ?? 0) + 1, secretVersion: (subscription.secretVersion ?? 0) + 1,
      secretFingerprint: fingerprint, enabled: false, approvedBy: null, preview: null, restorePaused: false });
    subscription.version++;
    c.channelSecrets = [{ channelId: secretId(subscription.id), secret: await seal(env, secretId(subscription.id), { signingSecret: secret }) }];
    return subscription;
  }
  if (type === 'webhook.recover') {
    const delivery = get(c.s, 'webhookDeliveries', p.deliveryId); fresh(delivery, p.version);
    if (!['sending','uncertain','failed','blocked'].includes(delivery.status)) fail('WEBHOOK_RECOVERY', 'Only an unresolved delivery can be reviewed.');
    if (p.confirm !== true || !['receiver-confirmed-accepted','receiver-confirmed-not-accepted'].includes(p.resolution))
      fail('WEBHOOK_RECOVERY', 'Check this event identity at the receiver, record its outcome and explicitly confirm recovery.');
    const reason = text(p.reason, 'Receiver reconciliation evidence');
    const subscription = get(c.s, 'webhookSubscriptions', delivery.subscriptionId);
    if (!active(subscription) || subscription.scopeVersion !== delivery.scopeVersion || subscription.approvedBy !== c.actor.id)
      fail('WEBHOOK_REVOKED', 'The exact subscription must still be approved by you. Revoked scope cannot be recovered.');
    delivery.reviews = [...(delivery.reviews ?? []), { actorId: c.actor.id, at: c.now, reason, resolution: p.resolution, previousStatus: delivery.status }];
    delivery.status = p.resolution === 'receiver-confirmed-accepted' ? 'reviewed-accepted' : 'queued';
    delivery.problem = null; delivery.version++;
    return delivery;
  }
  if (!['webhook.preview','webhook.approve','webhook.rotate','webhook.revoke'].includes(type)) fail('WEBHOOK_SCOPE', 'This connection has no subscriber action door.');
  const subscription = currentSubscription(c, p);
  if (subscription.restorePaused && type !== 'webhook.revoke') fail('WEBHOOK_RESTORE', 'Save fresh scope and a fresh secret after restore before approving delivery.');
  if (type === 'webhook.preview') {
    const order = get(c.s, 'orders', p.orderId);
    if (order.documentType === 'quote' && !order.acceptedAt) fail('WEBHOOK_ORDER', 'Choose an accepted sales order.');
    subscription.preview = { destination: subscription.destination, fields: subscription.fields, scopeVersion: subscription.scopeVersion,
      payload: projected(eventFor(order, c.commandId, c.now), subscription.fields), orderId: order.id, orderVersion: order.version };
    subscription.preview.digest = sha256(canonicalJson(subscription.preview));
    subscription.version++;
    return subscription;
  }
  if (type === 'webhook.approve') {
    if (p.confirm !== true || !subscription.preview || p.previewDigest !== subscription.preview.digest ||
        p.destination !== subscription.destination || canonicalJson(p.fields) !== canonicalJson(subscription.fields))
      fail('WEBHOOK_APPROVAL', 'Review the exact destination, fields and payload, then explicitly approve them.');
    const order = get(c.s, 'orders', subscription.preview.orderId);
    fresh(order, subscription.preview.orderVersion);
    subscription.enabled = true; subscription.approvedBy = c.actor.id; subscription.approvedAt = c.now; subscription.restorePaused = false;
  }
  if (type === 'webhook.rotate') {
    if (!active(subscription) || subscription.approvedBy !== c.actor.id || p.confirm !== true) fail('WEBHOOK_APPROVAL', 'Only the current approving owner can explicitly rotate this active signing secret.');
    const secret = text(p.secret, 'New signing secret');
    if (secret.length < 32 || secret.length > 256 || !/^[\x21-\x7e]+$/.test(secret) || sha256(secret) === subscription.secretFingerprint)
      fail('WEBHOOK_SECRET', 'Use a different private signing secret of 32 to 256 printable characters.');
    c.channelSecrets = [{ channelId: secretId(subscription.id), secret: await seal(env, secretId(subscription.id), { signingSecret: secret }) }];
    subscription.secretVersion++; subscription.secretFingerprint = sha256(secret); subscription.rotatedAt = c.now;
  }
  if (type === 'webhook.revoke') {
    subscription.enabled = false; subscription.approvedBy = null; subscription.revokedAt = c.now; subscription.scopeVersion++;
    c.privacyStatements = [...(c.privacyStatements ?? []), env.DB.prepare('DELETE FROM pier_channel_secrets WHERE channel_id=?').bind(secretId(subscription.id))];
    for (const delivery of c.s.webhookDeliveries.filter(delivery => delivery.subscriptionId === subscription.id && delivery.status === 'queued')) {
      delivery.status = 'revoked'; delivery.problem = 'Subscription revoked before transmission.'; delivery.version++;
    }
  }
  subscription.version++;
  return subscription;
}

/** Called inside ordinary atomic admission, before its record diff is built. */
export function captureOrderWebhooks(c: Context, before: State) {
  const subscriptions = c.s.webhookSubscriptions.filter(active);
  if (!subscriptions.length) return;
  const old = new Map(before.orders.map(order => [order.id, canonicalJson(order)]));
  for (const order of c.s.orders) {
    if (order.documentType === 'quote' && !order.acceptedAt || old.get(order.id) === canonicalJson(order)) continue;
    const event = eventFor(order, c.commandId, c.now);
    c.s.webhookEvents.push({ ...event, version: 1 });
    for (const subscription of subscriptions) c.s.webhookDeliveries.push({ id: sha256(`${event.id}\0${subscription.id}\0${subscription.scopeVersion}`), version: 1,
      subscriptionId: subscription.id, scopeVersion: subscription.scopeVersion, destination: subscription.destination,
      eventId: event.id, orderId: order.id, orderVersion: order.version, createdAt: c.now, status: 'queued', attempts: [], reviews: [],
      body: canonicalJson(projected(event, subscription.fields)), fields: subscription.fields });
  }
}

function ownerGate(subscription: Row) {
  return { sql: `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id
    WHERE o.id=? AND o.status='active' AND CASE WHEN r.data IS NOT NULL THEN json_extract(r.data,'$.role') ELSE o.role END='owner')
    AND EXISTS(SELECT 1 FROM pier_records WHERE kind='webhookSubscriptions' AND id=? AND data=?)`,
    params: [subscription.approvedBy, subscription.id, JSON.stringify(subscription)] };
}
async function replaceDelivery(env: Bindings, previous: Row, next: Row, gate?: { sql: string; params: any[] }) {
  const updated = { ...next, version: previous.version + 1 };
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE pier_records SET data=?,version=? WHERE kind='webhookDeliveries' AND id=? AND data=?${gate ? ` AND (${gate.sql})` : ''}`)
      .bind(JSON.stringify(updated), updated.version, previous.id, JSON.stringify(previous), ...gate?.params ?? []),
    env.DB.prepare('UPDATE pier_meta SET version=version+1 WHERE id=1 AND changes()=1'),
  ]);
  return result[0].meta.changes ? updated : null;
}
export async function deliverOrderWebhooks(env: Bindings, actor?: Actor) {
  if (actor) {
    if (actor.role !== 'owner') fail('FORBIDDEN', 'Only an owner can process order webhooks.');
    const gate = authority(actor);
    if (!(await env.DB.prepare(`SELECT (${gate.sql}) AS ok`).bind(...gate.params).first<any>())?.ok) fail('AUTH', 'Current owner session required.');
  }
  const pending = (await load(env.DB)).webhookDeliveries.filter(delivery => delivery.status === 'queued').slice(0, 20);
  for (const selected of pending) {
    const state = await load(env.DB), delivery = state.webhookDeliveries.find(row => row.id === selected.id)!;
    if (delivery.status !== 'queued') continue;
    const subscription = state.webhookSubscriptions.find(row => row.id === delivery.subscriptionId);
    let key: string;
    try {
      if (!subscription || !active(subscription) || subscription.scopeVersion !== delivery.scopeVersion ||
          subscription.destination !== delivery.destination || canonicalJson(subscription.fields) !== canonicalJson(delivery.fields)) throw new Error();
      destination(subscription.destination);
      key = (await credentials(env, secretId(subscription.id))).signingSecret;
      if (sha256(key) !== subscription.secretFingerprint) throw new Error();
    } catch {
      await replaceDelivery(env, delivery, { ...delivery, status: 'blocked', problem: 'Current destination, subscription scope or signing credential is unavailable. Review without resending.' }); continue;
    }
    const gate = ownerGate(subscription!);
    // A native session is required for manual processing; scheduled delivery
    // uses the exact retained subscription and its current active owner.
    if (actor) { const session = authority(actor); gate.sql += ` AND (${session.sql})`; gate.params.push(...session.params); }
    const attemptId = id(), at = new Date().toISOString();
    const attempt = { id: attemptId, at, secretVersion: subscription!.secretVersion, status: 'sending', httpStatus: null as number | null };
    const claimed = await replaceDelivery(env, delivery, { ...delivery, status: 'sending', problem: 'Delivery may have reached the receiver. Reconcile its event identity before recovery.', attempts: [...delivery.attempts, attempt] }, gate);
    if (!claimed) {
      await replaceDelivery(env, delivery, { ...delivery, status: 'blocked', problem: 'Current owner or session authority was revoked before transmission.' });
      continue;
    }
    let finish: Awaited<ReturnType<typeof beginProviderAttempt>>;
    try {
      finish = await beginProviderAttempt(env.DB, { actor: { id: subscription!.approvedBy, name: 'Approved webhook owner', role: 'owner', sessionId: '', operatorVersion: 0 },
        commandId: attemptId, connectorId: subscription!.id, operation: 'orderWebhook', direction: 'outbound', state,
        sources: [{ collection: 'webhookSubscriptions', row: subscription! }, { collection: 'webhookDeliveries', row: claimed }],
        documentIds: [delivery.orderId], requestId: delivery.eventId, providerAttemptId: attemptId,
        approval: { actorId: subscription!.approvedBy, documentId: subscription!.id, version: subscription!.version, policyVersion: subscription!.scopeVersion } }, gate);
    } catch {
      await replaceDelivery(env, claimed, { ...claimed, status: 'blocked', problem: 'Current owner or exact subscription authority changed before transmission.' }); continue;
    }
    let status = 'uncertain', httpStatus: number | null = null;
    try {
      const signingKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(`${at}.${delivery.body}`)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const response = await fetch(subscription!.destination, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', 'x-pier-event-id': delivery.eventId, 'x-pier-attempt-id': attemptId,
          'x-pier-key-version': String(subscription!.secretVersion), 'x-pier-timestamp': at, 'x-pier-signature': `v1=${signature}` }, body: delivery.body });
      httpStatus = response.status; status = response.ok ? 'delivered' : response.status >= 500 ? 'uncertain' : 'failed';
      await response.body?.cancel();
    } catch { /* A lost response is not evidence that the receiver did nothing. */ }
    await finish({ outcome: status === 'delivered' ? 'accepted' : status === 'failed' ? 'refused' : 'uncertain' });
    const current = (await load(env.DB)).webhookDeliveries.find(row => row.id === delivery.id)!;
    // Explicit owner recovery while an attempt is unresolved cannot be
    // overwritten by a late response from that old attempt.
    if (current.status === 'sending' && current.attempts.at(-1)?.id === attemptId)
      await replaceDelivery(env, current, { ...current, status, problem: status === 'delivered' ? null : status === 'failed' ? `Receiver returned HTTP ${httpStatus}. Check the event at the receiver before reviewed recovery.` : 'Response lost or unavailable. Reconcile the event at the receiver before reviewed recovery.',
        attempts: current.attempts.map((entry: any) => entry.id === attemptId ? { ...entry, status, httpStatus, completedAt: new Date().toISOString() } : entry) });
  }
  return { deliveries: (await load(env.DB)).webhookDeliveries.map(({ id, status }) => ({ id, status })) };
}
