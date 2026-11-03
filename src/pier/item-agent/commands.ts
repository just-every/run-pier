import type { Bindings } from '../../auth.server';
import { seal } from '../channels/secrets';
import { fail, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { checkItem, sourceDigest } from './evidence';
import { reviewAction } from './actions';
import { bulk } from './bulk';

export const AI_SECRET_ID = 'pier-item-ai';
export async function itemAgent(c: Context, type: string, p: any, env: Bindings): Promise<Row | undefined> {
  if (type === 'ai.save' || type === 'ai.remove') {
    requireRole(c, []);
    const old = c.s.aiSettings.find(r => r.id === AI_SECRET_ID);
    if (old) fresh(old, p.version);
    else if (p.version !== 0) fail('STALE', 'Reload AI setup before saving.');
    if (type === 'ai.remove') {
      if (!old) return fail('AI_SETUP', 'No AI connection is configured.');
      Object.assign(old, { enabled: false, configured: false, updatedBy: c.actor.id, updatedAt: c.now, version: old.version + 1 });
      c.channelSecrets = [{ channelId: AI_SECRET_ID, secret: await seal(env, AI_SECRET_ID, {}) }];
      return old;
    }
    const model = text(p.model, 'Exact OpenAI model ID');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) fail('AI_MODEL', 'Use the exact OpenAI model ID from your account.');
    if (p.consent !== true) fail('AI_CONSENT', 'Approve sending item evidence to OpenAI before enabling AI.');
    if (p.apiKey !== undefined && p.apiKey !== '') {
      if (typeof p.apiKey !== 'string' || p.apiKey.length > 500 || /\s/.test(p.apiKey) || p.apiKey.length < 12) fail('AI_KEY', 'Enter your OpenAI API key without spaces.');
      c.channelSecrets = [{ channelId: AI_SECRET_ID, secret: await seal(env, AI_SECRET_ID, { apiKey: p.apiKey }) }];
    } else if (!old?.configured) fail('AI_KEY', 'Enter your OpenAI API key.');
    const data = { provider: 'openai', model, enabled: true, configured: true, updatedBy: c.actor.id, updatedAt: c.now, consent: { actorId: c.actor.id, at: c.now, scope: 'Item checks, proposed changes and source record IDs only; no customer contact details.' } };
    if (old) return Object.assign(old, data, { version: old.version + 1 });
    return row(c, 'aiSettings', { id: AI_SECRET_ID, ...data });
  }
  if (!type.startsWith('itemAgent.')) return;
  const bulkResult = bulk(c, type, p);
  if (bulkResult !== undefined) return bulkResult;
  if (['itemAgent.apply', 'itemAgent.reject', 'itemAgent.undo'].includes(type)) return reviewAction(c, type, p);
  requireRole(c, ['buyer', 'operator', 'warehouse', 'agent']);
  if (type === 'itemAgent.check') {
    const checked = checkItem(c, text(p.itemId, 'Item'));
    return row(c, 'proposals', { kind: 'item-review', itemId: p.itemId, status: 'prepared',
      preparation: { actorId: c.actor.id, role: c.actor.role, at: c.now, commandId: c.commandId },
      sourceDigest: sourceDigest(c, p.itemId), snapshotVersion: c.s.version,
      checks: checked.checks, actions: checked.actions,
      inputVersions: Object.fromEntries(Object.entries(checked.sources).map(([kind, records]) => [kind, Array.isArray(records) ? records.map((r: any) => ({ id: r.id, version: r.version ?? r.sequence ?? null })) : { id: records.id, version: records.version }])),
      assumptions: 'Native evidence only. Sell-through may understate demand during stockouts. Supplier receipt costs are not quotes. No physical count, supplier commitment or accounting settlement is inferred.',
      events: [{ outcome: 'checked', actorId: c.actor.id, commandId: c.commandId, at: c.now }],
    });
  }
  // The API rejects these internal types. They run only through explainItem.
  const proposal = get(c.s, 'proposals', p.proposalId);
  if (proposal.kind !== 'item-review') fail('PROPOSAL', 'Choose an item review.');
  if (type === 'itemAgent.begin') {
    fresh(proposal, p.version);
    const setup = c.s.aiSettings.find(r => r.id === AI_SECRET_ID);
    if (!setup?.enabled || !setup.configured) return fail('AI_SETUP', 'Configure AI in AI setup. Deterministic item checks remain available.');
    if (sourceDigest(c, proposal.itemId) !== proposal.sourceDigest) fail('STALE', 'Item evidence changed. Run checks again before requesting an explanation.');
    if (proposal.ai) fail('AI_ALREADY_REQUESTED', 'An explanation was already requested for this review. Run fresh checks for a new request.');
    proposal.ai = { status: 'requesting', model: setup.model, setupVersion: setup.version, operationId: p.operationId, requestDigest: p.requestDigest, claimId: p.claimId, requestedBy: c.actor.id, requestedAt: c.now };
  } else if (['itemAgent.complete', 'itemAgent.failed'].includes(type)) {
    if (proposal.ai?.status !== 'requesting' || proposal.ai.operationId !== p.operationId) fail('AI_STATE', 'This provider request is no longer current.');
    if (type === 'itemAgent.complete') {
      if (typeof p.explanation !== 'string' || !p.explanation.trim() || p.explanation.length > 12000) fail('AI_OUTPUT', 'The provider did not return a usable explanation.');
      Object.assign(proposal.ai, { status: 'completed', explanation: p.explanation, responseId: text(p.responseId), completedAt: c.now });
    } else Object.assign(proposal.ai, { status: 'failed', problem: text(p.problem), completedAt: c.now });
  } else fail('COMMAND', 'Unknown item agent command.');
  proposal.events.push({ outcome: proposal.ai.status, actorId: c.actor.id, at: c.now, commandId: c.commandId });
  proposal.version++;
  return proposal;
}
