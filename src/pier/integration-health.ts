import type { Bindings } from '../auth.server';
import { auditRows } from './audit';
import { activeAutomationActors } from './storage';
import { credentials } from './channels/secrets';
import { correspondenceDeliveries } from './correspondence-delivery';
import { businessMail } from './correspondence-delivery-provider';
import { bridgeUrl } from './edi/adapter';
import { publishedWarehouses } from './routing';
import { channelState } from './channels/availability';
import type { Row, State } from './model';

/** An allowlisted projection: never return credentials, request bodies or checkout URLs. */
export async function integrationHealth(env: Bindings, state: State) {
  const actors = await activeAutomationActors(env.DB);
  const audit = await auditRows(env.DB);
  const listings: Row[] = channelState(state).channelListings;
  const make = async (id: string, name: string, scope: string, connection: Row | undefined, effects: any[], manage: string, secretId = id, completedAt: string | null = null, configured?: boolean) => {
    const events = audit.filter(event => event.connectorId === id || id === 'payment:stripe' && event.connectorId === 'stripe' || event.connectorId === 'openai' && (id === 'pier-item-ai' && event.type.startsWith('itemAgent.') || id === 'pier-document-ai' && event.type.startsWith('document.')));
    const outcomes = new Map(events.filter(event => event.phase === 'outcome').map(event => [event.attemptId, ['itemAgent.failed','document.failed'].includes(event.type) ? 'uncertain' : event.outcome]));
    const accepted = events.filter(event => event.phase === 'outcome' && event.outcome === 'accepted').map(event => event.at).sort().at(-1) ?? null;
    const secret = configured === undefined && connection?.enabled ? await credentials(env, secretId).catch(() => ({} as Record<string, string>)) : {};
    const credentialPresent = configured ?? (secretId === 'books:pantry' ? Boolean(secret.integrationToken)
      : id === 'payment:stripe' ? Boolean(secret.secretKey && secret.webhookSecret)
      : id === 'shipping:easypost' ? Boolean(secret.apiKey) : Object.values(secret).some(value => Boolean(value)));
    const active = Boolean(connection?.enabled && actors[connection.approvedBy] === 'owner' && credentialPresent);
    return { id, name, scope, enabled: Boolean(connection?.enabled), connectionVersion: connection?.version ?? null, status: !connection ? 'not connected' : !connection.enabled ? 'paused' : !active ? 'reconnect required' : connection.problem ? 'needs attention' : 'active',
      lastSuccessfulRequest: accepted, lastSuccessfulSync: connection ? connection.lastSuccessfulSync ?? connection.lastReceivedAt ?? completedAt ?? (!connection.problem ? connection.lastSync ?? null : null) : null, cursor: connection ? `revision ${connection.version}` : null,
      cursorMeaning: 'Retained connection revision; provider polling uses canonical reads, not an incremental cursor.',
      lagSeconds: effects.some(effect => effect.state !== 'resolved') ? Math.max(0, ...effects.filter(effect => effect.state !== 'resolved').map(effect => effect.lagSeconds ?? 0)) : 0,
      pending: effects.filter(effect => effect.state === 'pending').length, failed: effects.filter(effect => effect.state === 'failed').length,
      uncertain: effects.filter(effect => effect.state === 'uncertain').length, effects: effects.map(effect => {
        const carrier = state.shippingJobs.find(row => row.id === effect.id);
        const payment = state.invoicePaymentSessions.find(row => row.id === effect.id);
        const recovery = !active ? null : state.channels.some(row => row.id === id) ? { type: 'channel.sync', payload: {} }
          : id === 'shipping:easypost' && carrier?.providerShipmentId ? { type: 'shipping.reconcile', payload: { jobId: carrier.id, version: carrier.version } }
          : id === 'payment:stripe' && payment?.providerSessionId ? { type: 'payment.reconcile', payload: { sessionId: payment.id, version: payment.version } }
          : connection?.provider === 'pantry' ? { type: 'book.sync', payload: {} } : null;
        return { ...effect, recovery, inspect: ['#activity', encodeURIComponent(effect.id)].join('/') };
      }), manage,
      attempts: events.filter(event => event.phase === 'attempt').map(event => ({ id: event.attemptId, at: event.at, operation: event.type, commandId: event.commandId,
        outcome: outcomes.get(event.attemptId) ?? 'uncertain',
        documentIds: event.documentIds, externalIds: event.externalIds })),
    };
  };
  const effect = (row: Row, state: string, mapping: string[], at?: string) => ({ id: row.id, version: row.version, state, mapping: mapping.filter(Boolean),
    lagSeconds: state !== 'resolved' && at ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 1000)) : 0 });
  const rows = await Promise.all(state.channels.map(channel => make(channel.id, channel.name, `${channel.provider}: listings, orders and net availability in ${[...new Set([undefined, ...listings.filter(row => row.channelId === channel.id).flatMap(row => [row.locationId, ...(row.publicationLocations ?? []).map((t: any) => t.locationId)])].flatMap(location => publishedWarehouses(state, channel, location)))].join(', ') || 'no eligible warehouse'}`, channel,
    [...listings.filter(row => row.channelId === channel.id).flatMap(row => row.multiLocation && row.publicationLocations?.length ? row.publicationLocations.map((target: any) => effect({ ...row, id: target.publication?.id ?? `${row.id}:${target.locationId}` }, target.publication?.status === 'accepted' ? 'resolved' : target.publication ? 'uncertain' : 'pending', [row.externalId, row.itemId, target.locationId, ...target.warehouses], target.publication?.attemptedAt ?? row.pendingSince)) : [effect(row, row.problem ? (audit.some(event => event.connectorId === channel.id && event.type === 'provider.channel.stock' && event.outcome === 'uncertain' && event.documentIds.includes(row.id)) ? 'uncertain' : 'failed') : row.lag || !row.itemId ? 'pending' : 'resolved', [row.externalId, row.itemId], row.pendingSince ?? row.createdAt)]),
      ...state.channelOrders.filter(row => row.channelId === channel.id).map(row => effect(row, row.problem ? 'failed' : row.orderId ? 'resolved' : 'pending', [row.externalId, row.orderId], row.createdAt))], '#channels')));
  rows.push(await make('payment:stripe', 'Stripe invoice payments', 'Owner-approved invoice checkout and canonical payment reconciliation', state.paymentConnections[0],
    state.invoicePaymentSessions.map(row => effect(row, ['creating','uncertain'].includes(row.status) ? 'uncertain' : row.status === 'failed' ? 'failed' : ['succeeded','expired','cancelled'].includes(row.status) ? 'resolved' : 'pending', [row.invoiceId, row.providerSessionId, row.providerPaymentId], row.attemptedAt)), '#sales', 'payment:stripe', state.invoicePayments.map(row => row.paidAt).filter(Boolean).sort().at(-1) ?? null));
  rows.push(await make('shipping:easypost', 'EasyPost shipping', 'Approved packed cartons, labels and tracking', state.shippingSettings[0],
    state.shippingJobs.map(row => effect(row, ['buying','uncertain'].includes(row.status) ? 'uncertain' : ['failed','verification_failed'].includes(row.status) ? 'failed' : ['labelled','delivered'].includes(row.status) ? 'resolved' : 'pending', [row.orderId, row.packId, row.providerShipmentId], row.createdAt)), ['#floor', 'shipping'].join('/'), 'shipping:easypost', state.shippingJobs.flatMap(row => [row.labelBoughtAt, row.lastTrackingAt]).filter(Boolean).sort().at(-1) ?? null));
  const books = state.bookConnections[0];
  rows.push(await make(books?.id ?? 'books:pantry', 'Pantry books', 'Owner-selected accounting mappings and source-document reconciliation', books,
    state.bookJobs.map(row => effect(row, row.status === 'uncertain' ? 'uncertain' : ['review','failed'].includes(row.status) ? 'failed' : ['posted','reconciled','skipped'].includes(row.status) ? 'resolved' : 'pending', [row.sourceId, row.remoteId], row.createdAt)), '#books', 'books:pantry'));
  const configuredBy = (connection: Row | undefined) => connection ? { ...connection, approvedBy: connection.approvedBy ?? connection.consent?.actorId ?? connection.configuredBy ?? connection.updatedBy } : undefined;
  for (const partner of state.ediPartners) {
    const documents = state.ediDocuments.filter(row => row.partnerId === partner.id);
    rows.push(await make(partner.id, `EDI ${partner.name}`, `X12 documents through the configured HTTP bridge; onward transport ${partner.transport}`, configuredBy(partner),
      [...state.ediOrders.filter(row => row.partnerId === partner.id).map(row => effect(row, row.status === 'blocked' ? 'failed' : row.orderId ? 'resolved' : 'pending', [row.orderId], row.createdAt)), ...documents.map(row => effect(row, row.status === 'uncertain' ? 'uncertain' : ['unavailable','failed','rejected'].includes(row.status) ? 'failed' : row.direction === 'inbound' || row.status === 'sent' ? 'resolved' : 'pending', [row.ediOrderId, row.orderId, row.providerId], row.createdAt))], '#edi', partner.id, documents.map(row => row.sentAt).filter(Boolean).sort().at(-1) ?? null, Boolean(bridgeUrl(env))));
  }
  const itemAi = state.aiSettings.find(row => row.id === 'pier-item-ai');
  const itemRequests = state.proposals.filter(row => row.kind === 'item-review' && row.ai);
  rows.push(await make('pier-item-ai', 'Item AI', 'Explicitly approved item evidence to the configured OpenAI model; no automatic retry', configuredBy(itemAi),
    itemRequests.map(row => effect(row, ['requesting','failed'].includes(row.ai.status) ? 'uncertain' : 'resolved', [row.itemId, row.ai.responseId], row.ai.requestedAt)), '#ai', 'pier-item-ai', itemRequests.filter(row => row.ai.status === 'completed').map(row => row.ai.completedAt).sort().at(-1) ?? null));
  const documentAi = state.documentSettings.find(row => row.id === 'pier-document-ai');
  rows.push(await make('pier-document-ai', 'Document extraction', 'Separately approved full originals to OpenAI; consent is required for each extraction', configuredBy(documentAi),
    state.documentExtractions.map(row => effect(row, ['requesting','failed'].includes(row.status) ? 'uncertain' : 'resolved', [row.documentId, row.responseId], row.requestedAt)), '#imports', 'pier-document-ai', state.documentExtractions.filter(row => row.status === 'completed').map(row => row.completedAt).sort().at(-1) ?? null));
  const inbox = state.documentSettings.find(row => row.id === 'pier-document-inbound');
  rows.push(await make('pier-document-inbound', 'Signed document intake', 'Verified inbound mail into the owner-only retained inbox; no automatic association or extraction', configuredBy(inbox),
    state.documentInbox.map(row => effect(row, 'resolved', [row.id, row.sha256], row.createdAt)), '#imports', 'pier-document-inbound', state.documentInbox.map(row => row.createdAt).sort().at(-1) ?? null));
  const deliveries = await correspondenceDeliveries(env.DB), sender = Boolean(businessMail(env));
  const mail = await make('mail', 'Business mail', 'Provider acceptance of individually approved messages; acceptance does not prove inbox delivery', sender ? { id:'mail',version:0,enabled:true,approvedBy:Object.keys(actors).find(id => actors[id] === 'owner') } : undefined,
    deliveries.map(delivery => effect({id:delivery.correspondenceId,version:0}, ['sending','uncertain'].includes(delivery.phase) ? 'uncertain' : delivery.phase === 'sent' ? 'resolved' : 'failed', [delivery.correspondenceId], delivery.at)), '#activity', 'mail', deliveries.filter(delivery => delivery.phase === 'sent').map(delivery => delivery.at).sort().at(-1) ?? null, sender);
  mail.cursor = null; mail.cursorMeaning = 'Individual retained delivery identities track progress; mail has no shared incremental checkpoint.';
  rows.push(mail);
  const consumers = (await env.DB.prepare('SELECT id,actor_id,grant_version,scope,acknowledged,pending,last_ack_at FROM pier_stock_consumers ORDER BY id').all<any>()).results;
  if (!consumers.length) rows.push({id:'stock-source',name:'Stock change source',scope:'Authenticated physical events under each consumer actor’s current grants',enabled:true,connectionVersion:null,status:'no registered consumers',lastSuccessfulRequest:null,lastSuccessfulSync:null,cursor:null,cursorMeaning:'Each consumer establishes an acknowledged stock checkpoint; fetching never advances it.',lagSeconds:0,pending:0,failed:0,uncertain:0,effects:[],manage:'#activity',attempts:[]});
  for (const consumer of consumers) {
    const pending = consumer.pending ? JSON.parse(consumer.pending) : null;
    const role = state.roles.find(row => row.id === consumer.actor_id);
    const current = Boolean(actors[consumer.actor_id] && (role?.version ?? 0) === consumer.grant_version && (role?.role === 'owner' || !role?.permissions?.expiresAt || Date.parse(role.permissions.expiresAt) > Date.now()));
    const oldest = await env.DB.prepare("SELECT MIN(at) AS at,COUNT(*) AS n FROM pier_stock_events WHERE sequence>? AND (?='*' OR location_id IN (SELECT value FROM json_each(?)))").bind(consumer.acknowledged, consumer.scope, consumer.scope === '*' ? '[]' : consumer.scope).first<any>();
    rows.push({ id: consumer.id, name: `Stock consumer ${JSON.parse(consumer.id)[1]}`, scope: consumer.scope === '*' ? 'All physical locations under current actor authority' : JSON.parse(consumer.scope).map((id: string) => { const location = state.locations.find(row => row.id === id); return location ? `${location.warehouse}: ${location.name}` : id; }).join(', '),
      enabled: current, connectionVersion: null, status: current ? 'active' : 'authority changed', lastSuccessfulRequest: null, lastSuccessfulSync: consumer.last_ack_at, cursor: String(consumer.acknowledged), cursorMeaning: 'Acknowledged stock sequence; fetching does not advance it.',
      lagSeconds: oldest?.at ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest.at)) / 1000)) : 0, pending: oldest?.n ?? 0, failed: current ? 0 : 1, uncertain: 0,
      effects: pending ? [{ id: 'outstanding-page', version: pending.end, state: 'pending', mapping: pending.response.events.map((event: any) => event.eventId), lagSeconds: pending.response.lagSeconds }] : [],
      manage: '#activity', attempts: [],
    });
  }
  return { observedAt: new Date().toISOString(), connectors: rows };
}
