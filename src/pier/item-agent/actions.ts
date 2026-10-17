import { catalogue } from '../catalogue';
import { fail, fresh, get, requireRole, text, type Context, type Row } from '../model';
import { purchasing } from '../purchasing';
import { purchasingWorkflow } from '../purchasing-workflow';
import { replenishment } from '../replenishment';
import { canonicalJson } from '../import-kit';
import { checkItem, sourceDigest } from './evidence';

function change(c: Context, action: any, undo: boolean): Row {
  if (action.kind === 'purchase-draft') {
    if (!undo) return purchasing(c, 'po.draft', action.after)!;
    const po = get(c.s, 'purchaseOrders', action.resultId);
    fresh(po, action.resultVersion);
    if (po.approval || po.status !== 'draft') fail('DEPENDENCY', 'This draft was approved or committed. Review it through purchasing.');
    purchasingWorkflow(c, 'po.delete', { poId: po.id, version: po.version });
    return po;
  }
  const collection = action.kind === 'supplier-price' ? 'supplierItems' : 'replenishmentPolicies';
  const target = get(c.s, collection, action.targetId);
  fresh(target, undo ? action.resultVersion : action.before.version);
  const data = undo ? action.before : { ...target, ...action.after };
  if (action.kind === 'supplier-price') return catalogue(c, 'supplierItem.save', { ...data, id: target.id, version: target.version })!;
  return replenishment(c, 'replenishment.save', { ...data, id: target.id, version: target.version, applyLearned: false })!;
}

export function reviewAction(c: Context, type: string, p: any) {
  requireRole(c, ['buyer']);
  const proposal = get(c.s, 'proposals', p.proposalId);
  if (proposal.kind !== 'item-review') fail('PROPOSAL', 'Choose an item review.');
  fresh(proposal, p.version);
  const action = proposal.actions.find((a: any) => a.id === p.actionId);
  if (!action) fail('PROPOSAL', 'Choose an exact proposed action.');
  const reason = text(p.reason, 'Review reason');
  const event: any = { actorId: c.actor.id, role: c.actor.role, commandId: c.commandId, at: c.now, reason, actionId: action.id };
  if (type === 'itemAgent.reject') {
    if (action.status !== 'prepared') fail('PROPOSAL_STATE', 'Only an unreviewed action can be rejected.');
    action.status = 'rejected'; event.outcome = 'rejected';
  } else if (type === 'itemAgent.apply') {
    if (action.status !== 'prepared') fail('PROPOSAL_STATE', 'This action was already reviewed.');
    if (sourceDigest(c, proposal.itemId) !== proposal.sourceDigest) fail('STALE', 'Item evidence changed. Run checks again before applying.');
    // A sibling change can alter a quoted price or replenishment calculation.
    // Revalidate the exact consequence even when all intervening edits are ours.
    const stillProposed = checkItem(c, proposal.itemId).actions.some(a => a.kind === action.kind && a.targetId === action.targetId && canonicalJson(a.after) === canonicalJson(action.after));
    if (!stillProposed) fail('STALE', 'This exact consequence is no longer supported by the current item checks. Run checks again.');
    const result = change(c, action, false);
    action.status = 'applied'; action.resultId = result.id; action.resultVersion = result.version;
    action.approval = { actorId: c.actor.id, role: c.actor.role, at: c.now, proposalVersion: proposal.version };
    event.outcome = 'applied'; event.before = action.before; event.after = structuredClone(result);
    proposal.sourceDigest = sourceDigest(c, proposal.itemId);
  } else {
    if (action.status !== 'applied') fail('PROPOSAL_STATE', 'Only an applied action can be undone.');
    const inputsStillCurrent = sourceDigest(c, proposal.itemId) === proposal.sourceDigest;
    const result = change(c, action, true);
    action.status = 'undone'; event.outcome = 'undone'; event.restored = structuredClone(result);
    // Keep unrelated intervening changes stale for the remaining proposals.
    // Safe undo checks its exact target version, independently of other evidence.
    if (inputsStillCurrent) proposal.sourceDigest = sourceDigest(c, proposal.itemId);
  }
  proposal.events.push(event);
  proposal.status = proposal.actions.some((a: any) => a.status === 'prepared') ? 'prepared' : 'reviewed';
  proposal.version++;
  return proposal;
}
