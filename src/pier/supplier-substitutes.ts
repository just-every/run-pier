import { backorderDates } from './backorders';
import { canonicalJson, sha256 } from './import-kit';
import { route } from './routing';
import { kitDefinition } from './kits';
import { policyFor } from './trace-core';
import { collections, available, balance, decimal, fail, format, fresh, get, held, min, reserved, row, text, type Context, type Row, type State } from './model';

type NativeActor = { id: string; version: number; status: string };
export async function substituteActors(db: D1Database): Promise<NativeActor[]> {
  return (await db.prepare('SELECT id,version,status FROM oa_operators ORDER BY id').all<NativeActor>()).results;
}
function authority(c: Context, actorId: string, roles: string[]) {
  const native = c.substituteActors?.find(actor => actor.id === actorId);
  const role = c.automationActors?.[actorId];
  if (!native || native.status !== 'active' || !role || !roles.includes(role))
    return fail('SUBSTITUTE_AUTHORITY', 'Source authority changed. An owner must record current mappings and prepare again.');
  const proof = { actorId, operatorVersion: native.version, role, permissionVersion: c.s.roles.find(role => role.id === actorId)?.version ?? 0 };
  c.substituteAuthorities ??= [];
  if (!c.substituteAuthorities.some(actor => actor.actorId === actorId)) c.substituteAuthorities.push(proof);
  return proof;
}
function compatible(s: State, originalId: string, alternativeId: string) {
  const original = get(s, 'items', originalId), alternative = get(s, 'items', alternativeId);
  if (original.id === alternative.id || original.archived || alternative.archived || original.unit !== alternative.unit ||
      [original, alternative].some(item => policyFor(s, item.id) || kitDefinition(s, item.id)))
    fail('SUBSTITUTE_MAPPING', 'Choose two active untracked, non-kit SKUs with the exact same base unit.');
  return { original, alternative };
}
const source = (collection: string, record: any, extra: object = {}) => {
  const digest = sha256(canonicalJson(record));
  return { collection, id: record.id, version: record.version ?? record.sequence, digest,
    href: '/api/pier/export?' + new URLSearchParams({ source: collection, id: record.id, digest }), ...extra };
};
export function substituteSource(s: State, query: URLSearchParams) {
  const collection = query.get('source') ?? '';
  if (![...collections, 'movements', 'reservations'].includes(collection)) fail('NOT_FOUND', 'Choose an exported business source.');
  const record = (s as any)[collection].find((record: any) => record.id === query.get('id'));
  if (!record) fail('NOT_FOUND', 'The exported source no longer exists.');
  const evidence = source(collection, record);
  if (evidence.digest !== query.get('digest')) fail('STALE_SOURCE', 'The source changed since preparation. Review the retained comparison and prepare again.');
  return { format: 'pier-source-v1', ...evidence, record };
}

/** The digest is conservative: a new input requires a fresh comparison, never a
 * guessed continuation. Proposals themselves are inert and are not inputs. */
function frontier(c: Context) {
  return sha256(canonicalJson({ items: c.s.items, locations: c.s.locations, mappings: c.s.substituteMappings,
    purchaseOrders: c.s.purchaseOrders, orders: c.s.orders, movements: c.s.movements, reservations: c.s.reservations,
    holds: c.s.channelHolds, routingRules: c.s.routingRules, policies: c.s.replenishmentPolicies,
    priorities: c.s.backorderPolicies, parties: c.s.parties, transfers: c.s.transfers,
    kits: c.s.kitDefinitions, roles: c.s.roles, actors: c.substituteActors, authority: c.automationActors }));
}
export function supplierSubstitutes(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('substitute.')) return;
  if (type === 'substitute.mappingSave') {
    if (c.actor.role !== 'owner') fail('FORBIDDEN', 'Only a current owner can record exact substitute mappings.');
    const { original, alternative } = compatible(c.s, p.itemId, p.alternativeItemId);
    const previous = c.s.substituteMappings.find(mapping => mapping.itemId === original.id && mapping.alternativeItemId === alternative.id);
    if (previous) fresh(previous, p.version);
    else if (p.version !== undefined && p.version !== 0) fail('STALE', 'Reload the current mapping.');
    const values = { itemId: original.id, alternativeItemId: alternative.id, unit: original.unit,
      enabled: p.enabled === true, reason: text(p.reason, 'Owner equivalence reason'), recordedAt: c.now,
      authority: authority(c, c.actor.id, ['owner']) };
    if (!previous) return row(c, 'substituteMappings', { ...values, history: [] });
    previous.history.push({ ...structuredClone(previous), history: undefined });
    Object.assign(previous, values, { version: previous.version + 1 });
    return previous;
  }
  if (type === 'substitute.prepare') {
    if (!['owner', 'agent'].includes(c.actor.role) || c.actor.permissions) fail('FORBIDDEN', 'Use current owner or unrestricted native preparation authority.');
    const preparationAuthority = authority(c, c.actor.id, ['owner', 'agent']);
    const po = get(c.s, 'purchaseOrders', p.poId); fresh(po, p.version);
    if (po.status !== 'committed' || po.dropshipId || po.pendingSupplierChange || po.approval?.version !== po.version || !po.confirmation)
      fail('SUBSTITUTE_EVIDENCE', 'Choose an approved committed PO with a manually recorded supplier confirmation and no pending change.');
    authority(c, po.approval.actorId, ['owner', 'buyer']);
    const reply = po.supplierReplies?.find((reply: any) => reply.id === po.confirmation.replyId);
    if (!reply) fail('SUBSTITUTE_EVIDENCE', 'The confirmation needs its retained supplier reply.');
    const pool = new Map<string, bigint>();
    const evidence: any[] = [source('purchaseOrders', po), source('purchaseOrders', po, { field: 'supplierReplies', entryId: reply.id }),
      source('purchaseOrders', po, { field: 'confirmation', entryId: reply.id })];
    const lines: any[] = [];
    const demandContext = { ...c, s: { ...c.s, orders: c.s.orders.filter(order => order.documentType !== 'quote' || order.acceptedAt) } };
    for (const dated of backorderDates(demandContext)) {
      const order = get(c.s, 'orders', dated.orderId);
      if (order.status === 'cancelled' || order.fulfilment === 'dropship') continue;
      for (const datedLine of dated.lines) {
        const line = order.lines.find((line: any) => line.id === datedLine.orderLineId);
        const promiseDate = line.backorderPromiseDate ?? order.promiseDate;
        const delayed = datedLine.sources.filter((source: any) => source.poId === po.id && source.confirmed);
        if (!promiseDate || po.confirmation.promiseDate <= promiseDate || !delayed.length) continue;
        const demand = delayed.reduce((sum: bigint, source: any) => sum + decimal(source.quantity), 0n);
        let uncovered = demand;
        const candidates: any[] = [], unavailable: any[] = [];
        // Use the current routing rule, rather than expanding the order's grant.
        const warehouses: string[] = route(c.s, order.routing?.source ?? 'manual', order.shipTo, order.channelLocation, order.warehouse).eligible;
        evidence.push(source('orders', order, { orderLineId: line.id }), source('items', get(c.s, 'items', line.itemId)));
        evidence.push(...po.lines.filter((purchaseLine: any) => purchaseLine.itemId === line.itemId).map((purchaseLine: any) => source('purchaseOrders', po, { poLineId: purchaseLine.id })));
        const mappings = c.s.substituteMappings.filter(mapping => mapping.itemId === line.itemId && mapping.enabled)
          .sort((a, b) => get(c.s, 'items', a.alternativeItemId).sku.localeCompare(get(c.s, 'items', b.alternativeItemId).sku) || a.id.localeCompare(b.id));
        for (const mapping of mappings) {
          evidence.push(source('substituteMappings', mapping));
          try { compatible(c.s, line.itemId, mapping.alternativeItemId); }
          catch { unavailable.push({ mappingId: mapping.id, reason: 'Mapping is no longer compatible.' }); continue; }
          authority(c, mapping.authority.actorId, ['owner']);
          const alternative = get(c.s, 'items', mapping.alternativeItemId);
          const bins = c.s.locations.filter(location => location.kind === 'bin' && !location.archived && warehouses.includes(location.warehouse));
          const allocations = bins.map(location => {
            const key = JSON.stringify([alternative.id, location.id]);
            const current = available(c.s, alternative.id, location.id);
            const free = pool.get(key) ?? (current > 0n ? current : 0n);
            const proposed = min(uncovered, free);
            uncovered -= proposed; pool.set(key, free - proposed);
            evidence.push(source('locations', location));
            return { locationId: location.id, locationVersion: location.version, warehouse: location.warehouse,
              onHand: format(balance(c.s, alternative.id, location.id)), reserved: format(reserved(c.s, alternative.id, location.id)),
              protectedHold: format(held(c.s, alternative.id, location.id)), available: format(current),
              remainingBefore: format(free), quantity: format(proposed) };
          });
          const quantity = allocations.reduce((sum, allocation) => sum + decimal(allocation.quantity), 0n);
          candidates.push({ mappingId: mapping.id, mappingVersion: mapping.version, itemId: alternative.id, itemVersion: alternative.version,
            sku: alternative.sku, unit: alternative.unit, quantity: format(quantity), allocations });
          evidence.push(source('items', alternative));
        }
        lines.push({ orderId: order.id, orderVersion: order.version, orderLineId: line.id, itemId: line.itemId,
          promiseDate, supplierDate: po.confirmation.promiseDate, demand: format(demand), warehouses,
          candidates, uncovered: format(uncovered), unavailable,
          explanation: !mappings.length ? 'No active exact owner mapping.' : !warehouses.length ? 'No eligible warehouse.' : 'Availability excludes all reservations and protected holds; no inbound or transit stock is assumed.' });
      }
    }
    if (!lines.length) fail('SUBSTITUTE_DEMAND', 'No delayed confirmed supply from this PO is linked to an affected customer shortage.');
    for (const collection of ['movements', 'reservations', 'channelHolds', 'routingRules', 'backorderPolicies', 'parties', 'transfers', 'replenishmentPolicies', 'purchaseOrders'] as const)
      evidence.push(...c.s[collection].map(record => source(collection, record)));
    return row(c, 'proposals', { kind: 'supplier-substitutes', status: 'prepared', poId: po.id, poVersion: po.version,
      preparation: { actorId: c.actor.id, at: c.now }, preparationAuthority, inputDigest: frontier(c),
      movementVersion: c.s.movements.at(-1)?.sequence ?? 0, supplierReplyId: reply.id, evidence, lines,
      assumptions: 'Owner-recorded exact equivalence only. Review records a recommendation; it changes no order, reservation, purchase, promise or message.' });
  }
  if (type !== 'substitute.review') fail('COMMAND', 'Unknown substitute comparison command.');
  if (c.actor.role !== 'owner') fail('FORBIDDEN', 'Only a current owner can review a substitute recommendation.');
  const proposal = get(c.s, 'proposals', p.proposalId); fresh(proposal, p.version);
  if (proposal.kind !== 'supplier-substitutes' || proposal.poId !== p.poId) fail('SUBSTITUTE_SOURCE', 'Review this comparison with its exact purchase source.');
  if (proposal.status !== 'prepared') fail('PROPOSAL_STATE', 'This recommendation already has a retained decision.');
  if (proposal.inputDigest !== frontier(c)) fail('STALE', 'Comparison inputs or authority changed. Prepare again using current evidence.');
  authority(c, proposal.preparation.actorId, ['owner', 'agent']);
  authority(c, c.actor.id, ['owner']);
  for (const proof of c.s.substituteMappings.filter(mapping => mapping.enabled).map(mapping => mapping.authority)) authority(c, proof.actorId, ['owner']);
  authority(c, get(c.s, 'purchaseOrders', proposal.poId).approval.actorId, ['owner', 'buyer']);
  if (!['accepted', 'declined'].includes(p.decision) || p.confirm !== true) fail('APPROVAL', 'Explicitly accept or decline this exact recommendation.');
  proposal.decision = { outcome: p.decision, reason: text(p.reason, 'Review reason'), actorId: c.actor.id, at: c.now, inputDigest: proposal.inputDigest, version: proposal.version };
  proposal.status = p.decision; proposal.version++;
  return proposal;
}

export function supplierSubstituteView(c: Context, proposal: Row) {
  if (proposal.kind !== 'supplier-substitutes') return proposal;
  return { ...proposal, reviewCurrent: proposal.inputDigest === frontier(c) };
}
