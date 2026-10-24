import { collections, fail, fresh, get, requireRole, row, text, type Context } from '../model';
import { canonicalJson, sha256 } from '../import-kit';
import { purchasing } from '../purchasing';
import { expectedLandedCost, purchasingWorkflow } from '../purchasing-workflow';
import { bulkImpact } from './bulk-impact';

// Any intervening business change requires a new preview. Reviews themselves
// are excluded so independently prepared plans cannot make each other stale.
export function bulkInputDigest(c: Context) {
  return sha256(canonicalJson({ records: Object.fromEntries(collections.filter(k => k !== 'proposals').map(k => [k, c.s[k]])), movements: c.s.movements, reservations: c.s.reservations }));
}
function ordinary(c: Context, entry: any) {
  if (entry.type === 'po.revise') return purchasing(c, entry.type, entry.payload)!;
  if (entry.type === 'order.repromise') return purchasingWorkflow(c, entry.type, entry.payload)!;
  return fail('BULK_COMMAND', 'Choose a purchase revision or a reviewed customer promise.');
}
function preview(c: Context, entries: any) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 50) fail('BULK_ROWS', 'Choose one to 50 changes.');
  const simulation = { ...c, s: structuredClone(c.s) };
  const targets = new Set<string>();
  return entries.map((entry: any) => {
    if (!entry || !['po.revise', 'order.repromise'].includes(entry.type) || !entry.payload || typeof entry.payload !== 'object') fail('BULK_COMMAND', 'Choose a purchase revision or a reviewed customer promise.');
    const collection = entry.type === 'po.revise' ? 'purchaseOrders' : 'orders';
    const targetId = entry.payload.poId ?? entry.payload.orderId;
    if (targets.has(targetId)) fail('BULK_ROWS', 'Each record can appear only once in a plan.');
    targets.add(targetId);
    const before = structuredClone(get(simulation.s, collection, targetId));
    // This is the ordinary domain command, on an isolated copy: validation and
    // role admission cannot be bypassed by the planning door.
    ordinary(simulation, entry);
    const after = structuredClone(get(simulation.s, collection, targetId));
    return { id: crypto.randomUUID(), type: entry.type, payload: structuredClone(entry.payload), targetId, before, after,
      impact: bulkImpact(c, simulation, entry, before, after),
      status: 'prepared' };
  });
}
export function bulk(c: Context, type: string, p: any) {
  if (!['itemAgent.bulkPreview', 'itemAgent.bulkEdit', 'itemAgent.bulkApply'].includes(type)) return;
  if (type === 'itemAgent.bulkPreview') {
    requireRole(c, ['buyer', 'operator', 'agent']);
    const rows = preview(c, p.rows);
    return row(c, 'proposals', { kind: 'bulk-review', status: 'prepared', rows, sourceDigest: bulkInputDigest(c),
      preparation: { actorId: c.actor.id, at: c.now, commandId: c.commandId }, events: [] });
  }
  const plan = get(c.s, 'proposals', p.proposalId);
  if (plan.kind !== 'bulk-review') fail('PROPOSAL', 'Choose a bulk review.');
  fresh(plan, p.version);
  if (bulkInputDigest(c) !== plan.sourceDigest) fail('STALE', 'Business inputs changed. Prepare a fresh bulk preview.');
  if (type === 'itemAgent.bulkEdit') {
    requireRole(c, ['buyer', 'operator', 'agent']);
    if (plan.rows.some((entry: any) => entry.status !== 'prepared')) fail('PROPOSAL_STATE', 'Prepare a new plan after applying a row.');
    plan.rows = preview(c, p.rows);
    plan.events.push({ outcome: 'edited', actorId: c.actor.id, commandId: c.commandId, at: c.now });
  } else {
    const entry = plan.rows.find((entry: any) => entry.id === p.rowId);
    if (!entry || entry.status !== 'prepared') fail('PROPOSAL_STATE', 'Choose an unapplied row.');
    requireRole(c, entry.type === 'po.revise' ? ['buyer'] : ['buyer', 'operator']);
    const reason = text(p.reason, 'Approval reason');
    const result = ordinary(c, entry);
    entry.status = 'applied';
    entry.approval = { actorId: c.actor.id, role: c.actor.role, at: c.now, version: plan.version, reason };
    entry.resultId = result.id;
    entry.commandId = c.commandId;
    plan.events.push({ outcome: 'applied', ordinaryType: entry.type, targetId: entry.targetId, resultId: result.id, actorId: c.actor.id, commandId: c.commandId, at: c.now });
    plan.sourceDigest = bulkInputDigest(c);
    plan.status = plan.rows.every((entry: any) => entry.status === 'applied') ? 'reviewed' : 'prepared';
  }
  plan.version++;
  return plan;
}
