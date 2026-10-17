import type { Bindings } from '../../auth.server';
import { execute } from '../api';
import { load, activeAutomationActors } from '../storage';
import { type Row, type Actor } from '../model';
import { credentials } from './secrets';
import { adapter } from './adapters';
import { channelAvailability } from './availability';

/** One installation-wide lease prevents slow stock requests overtaking newer ones. */
export async function syncChannels(env: Bindings) {
  const token = crypto.randomUUID(), now = Date.now();
  const lease = await env.DB.prepare('INSERT INTO pier_channel_locks(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?').bind(token, now + 120000, now).run();
  if (!lease.meta.changes) return { busy: true };
  const summary: { channelId: string; imported?: number; published?: number; problem?: string }[] = [];
  try {
    const initial = await load(env.DB), actors = await activeAutomationActors(env.DB);
    const live = initial.channels.filter(ch => ch.enabled && actors[ch.approvedBy] === 'owner');
    const sessions = new Map<string, { actor: Actor; policy: { collection: 'channels'; id: string; version: number } }>();
    for (const ch of live) {
      const operator = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(ch.approvedBy).first<any>();
      if (operator) sessions.set(ch.id, { actor: { id: ch.approvedBy, name: operator.display_name, role: 'owner', operatorVersion: operator.version, sessionId: 'channel-policy' }, policy: { collection: 'channels', id: ch.id, version: ch.version } });
    }
    const record = async (ch: Row, type: string, payload: object) => {
      const auth = sessions.get(ch.id)!;
      return execute(env, auth.actor, `channel-${crypto.randomUUID()}`, type, { channelId: ch.id, ...payload }, undefined, auth.policy);
    };
    // Ingest every source before publishing: a Woo order immediately reduces Stall too.
    const connections = new Map<string, ReturnType<typeof adapter>>();
    for (const ch of live) {
      if (!sessions.has(ch.id) || Date.now() - now > 45000) continue;
      const result = { channelId: ch.id, imported: 0, published: 0, problem: undefined as string | undefined }; summary.push(result);
      try {
        const remote = adapter({ provider: ch.provider, baseUrl: ch.baseUrl, credentials: await credentials(env, ch.id) });
        const [listings, orders] = await Promise.all([remote.listings(), remote.orders()]);
        await record(ch, 'channel.ingest', { listings, orders });
        connections.set(ch.id, remote); result.imported = orders.length;
      } catch {
        result.problem = 'Channel read failed. Check credentials, store address and API access, then sync again.';
        await record(ch, 'channel.failed', { problem: result.problem });
      }
    }
    for (const ch of live) {
      const remote = connections.get(ch.id); if (!remote) continue;
      const result = summary.find(r => r.channelId === ch.id)!;
      const listings = (await load(env.DB)).channelListings.filter(l => l.channelId === ch.id && l.itemId && !l.orderOnly);
      for (const listing of listings) {
        // Stop before the lease expires; the following minute resumes pending listings.
        if (Date.now() - now > 45000) break;
        const state = await load(env.DB), current = state.channels.find(c => c.id === ch.id);
        if (!current?.enabled || current.version !== ch.version) break;
        const quantity = channelAvailability(state, ch, listing.itemId);
        if (listing.publishedQuantity === quantity && !listing.problem) continue;
        const start = Date.now();
        try {
          await remote.stock({ ...listing, externalId: listing.externalId, sku: listing.sku, title: listing.title }, quantity);
          await record(ch, 'channel.published', { listingId: listing.id, quantity, acceptanceMs: Date.now() - start });
          result.published!++;
        } catch {
          await record(ch, 'channel.failed', { listingId: listing.id, problem: 'Stock update was not confirmed by the channel API. Check access and sync again.' });
          result.problem = 'One or more stock updates need attention.';
        }
      }
    }
    return { channels: summary };
  } finally { await env.DB.prepare('DELETE FROM pier_channel_locks WHERE id=1 AND token=?').bind(token).run(); }
}
