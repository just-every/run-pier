import type { Bindings } from '../../auth.server';
import { execute } from '../api';
import { load, activeAutomationActors, policyAuthority } from '../storage';
import { type Row, type Actor } from '../model';
import { credentials } from './secrets';
import { adapter } from './adapters';
import { channelAvailability } from './availability';
import { publicationTargets } from './publications';
import { providerOperation, type ProviderAudit } from '../provider-audit';

/** One installation-wide lease prevents slow stock requests overtaking newer ones. */
export async function syncChannels(env: Bindings) {
  const token = crypto.randomUUID(), now = Date.now();
  const lease = await env.DB.prepare('INSERT INTO pier_channel_locks(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?').bind(token, now + 60000, now).run();
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
    const audit = (ch: Row, state: typeof initial, operation: string, direction: ProviderAudit['direction'], listing?: Row): ProviderAudit => {
      const auth = sessions.get(ch.id)!;
      const affected = listing ? [listing] : state.channelListings.filter(row => row.channelId === ch.id);
      return { ...auth, commandId: `channel-${crypto.randomUUID()}`, connectorId: ch.id, operation, direction, state,
        sources: [{ collection: 'channels', row: ch }, ...(listing ? [{ collection: 'channelListings' as const, row: listing }] : [])],
        itemIds: affected.map(row => row.itemId).filter(Boolean), documentIds: affected.map(row => row.id), externalIds: affected.map(row => row.externalId) };
    };
    // Ingest every source before publishing: a Woo order immediately reduces Stall too.
    const connections = new Map<string, ReturnType<typeof adapter>>();
    for (const ch of live) {
      if (!sessions.has(ch.id) || Date.now() - now > 20000) continue;
      const result = { channelId: ch.id, imported: 0, published: 0, problem: undefined as string | undefined }; summary.push(result);
      try {
        const remote = adapter({ provider: ch.provider, baseUrl: ch.baseUrl, credentials: await credentials(env, ch.id) });
        const [listings, orders] = await Promise.all([
          providerOperation(env.DB, audit(ch, initial, 'channel.listings', 'inbound'), () => remote.listings(), rows => ({ externalIds: rows.map(row => row.externalId) })),
          providerOperation(env.DB, audit(ch, initial, 'channel.orders', 'inbound'), () => remote.orders(), rows => ({ externalIds: rows.map(row => row.externalId) })),
        ]);
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
        // Stop inside waitUntil's limit (about 30 s after the response) and before the
        // lease expires; the following minute resumes pending listings.
        if (Date.now() - now > 20000) break;
        const state = await load(env.DB), current = state.channels.find(c => c.id === ch.id);
        if (!current?.enabled || current.version !== ch.version) break;
        const currentListing = state.channelListings.find(row => row.id === listing.id);
        if (!currentListing) continue;
        if (ch.provider === 'shopify') {
          const targets = publicationTargets(state, current, currentListing);
          if (!targets.length) {
            await record(ch, 'channel.failed', { listingId: listing.id, problem: 'No unambiguous channel location mapping. Review the routing rule; no fallback stock was published.' });
            continue;
          }
          for (const target of targets) {
            const latest = [...(currentListing.publications ?? [])].reverse().find((p: any) => p.locationId === target.locationId);
            if (latest?.key === target.key && latest.status === 'accepted') continue;
            let publicationId: string | undefined;
            try {
              const prepared = await record(ch, 'channel.publicationPrepare', { listingId: listing.id, locationId: target.locationId });
              publicationId = prepared.result.id;
              const snapshot = await load(env.DB), source = snapshot.channelListings.find(l => l.id === listing.id)!;
              const publication = source.publications.find((p: any) => p.id === publicationId);
              if (!publicationTargets(snapshot, current, source).some(t => t.key === publication.key)) continue;
              const start = Date.now(), auth = sessions.get(ch.id)!, gate = policyAuthority({ actor: auth.actor, backgroundPolicy: auth.policy });
              // Check current authority, mappings and stock again after provider readback,
              // immediately before the consequential write. Uncertainty keeps its identity.
              const beforeWrite = async () => {
                const admitted = await env.DB.prepare(`SELECT 1 AS admitted FROM pier_meta WHERE id=1 AND version=? AND (${gate.sql})`)
                  .bind(snapshot.version, ...gate.params).first();
                if (!admitted) throw new Error('Publication authority or stock frontier changed');
              };
              await providerOperation(env.DB, audit(current, snapshot, 'channel.stock', 'outbound', source), () =>
                remote.stock({ ...source, locationId: publication.locationId, externalId: source.externalId, sku: source.sku, title: source.title }, publication.quantity,
                  { idempotencyKey: publication.id, beforeWrite }));
              await record(ch, 'channel.published', { listingId: listing.id, publicationId, quantity: publication.quantity, acceptanceMs: Date.now() - start });
              result.published!++;
            } catch {
              result.problem = 'One or more location stock updates need attention.';
              // Revocation may also refuse completion. The already retained uncertain
              // intent stays inspectable and cannot bypass current authority on retry.
              try { await record(ch, 'channel.failed', { listingId: listing.id, publicationId, problem: 'Location stock update was not confirmed. Sync to reconcile; changed mappings invalidate earlier work.' }); } catch { /* retained intent remains uncertain */ }
            }
          }
          continue;
        }
        const quantity = channelAvailability(state, ch, currentListing.itemId,currentListing);
        if (currentListing.publishedQuantity === quantity && !currentListing.problem) continue;
        const start = Date.now();
        try {
          await providerOperation(env.DB, audit(current, state, 'channel.stock', 'outbound', currentListing),
            () => remote.stock({ ...currentListing, externalId: currentListing.externalId, sku: currentListing.sku, title: currentListing.title }, quantity));
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
