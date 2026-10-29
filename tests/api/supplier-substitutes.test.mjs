import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation } from './harness.mjs';
import { substituteScenario } from './supplier-substitutes-fixture.mjs';

const exported = async h => { const { exportedAt, ...result } = await (await h.request('/api/pier/export')).json(); return result; };
const business = result => Object.fromEntries(['items', 'locations', 'orders', 'purchaseOrders', 'receipts', 'movements', 'reservations', 'shipments', 'transfers', 'channelHolds', 'correspondence', 'bookJobs', 'supplierBills'].map(key => [key, result[key]]));
async function persona(h) {
  const entered = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  assert.equal(entered.status, 303);
  const cookie = entered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const session = await (await h.request('/auth/session', { as: cookie })).json();
  return { cookie, id: session.operator.id };
}

test('native agents retain source-validated substitute comparisons and owners decide without business effects', async t => {
  const outbound = [];
  const h = await installation({ now: '2026-10-29T12:00:00Z', outboundService: request => { outbound.push(request.url); throw new Error('No outbound action is authorized.'); } });
  t.after(async () => { await h.close(); assert.deepEqual(outbound, []); });
  const b = await substituteScenario(h), member = await persona(h);
  await h.command('role.set', { operatorId: member.id, role: 'agent' });
  const asAgent = (type, payload, options = {}) => h.command(type, payload, { as: member.cookie, ...options });
  const mappingInput = { itemId: b.item.id, alternativeItemId: b.alternative.id, enabled: true, reason: 'Owner verifies the exact same base-unit alternative.' };
  async function refuse(type, payload, error, run = h.command) {
    const before = await exported(h);
    await run(type, payload, { error });
    assert.deepEqual(await exported(h), before, 'refusal changes neither business state nor successful command results');
  }
  await refuse('substitute.mappingSave', mappingInput, 'FORBIDDEN', asAgent);
  await refuse('substitute.mappingSave', { ...mappingInput, alternativeItemId: b.incompatible.id }, 'SUBSTITUTE_MAPPING');
  await refuse('substitute.mappingSave', { ...mappingInput, alternativeItemId: b.item.id }, 'SUBSTITUTE_MAPPING');
  const beforePreparation = await exported(h);
  const noMapping = await h.command('substitute.prepare', { poId: b.po.id, version: b.po.version });
  assert.ok(noMapping.lines.every(line => line.candidates.length === 0 && line.demand === line.uncovered));
  const mapping = await h.command('substitute.mappingSave', mappingInput);
  const preparationPayload = { poId: b.po.id, version: b.po.version }, preparationId = randomUUID();
  const acknowledgment = await asAgent('substitute.prepare', preparationPayload, { commandId: preparationId });
  assert.equal(acknowledgment.kind, 'supplier-substitutes');
  assert.equal(acknowledgment.preparation.actorId, member.id);
  assert.equal(acknowledgment.lines, undefined, 'agent acknowledgment supplies no new commercial or customer data');
  assert.equal(acknowledgment.evidence, undefined);
  const retained = await exported(h), proposal = retained.proposals.find(row => row.id === acknowledgment.id);
  assert.equal(proposal.preparation.actorId, member.id);
  assert.equal(proposal.poVersion, b.po.version);
  assert.equal(proposal.supplierReplyId, b.po.confirmation.replyId);
  const originalLines = proposal.lines.filter(line => line.itemId === b.item.id);
  assert.equal(originalLines.reduce((sum, line) => sum + Number(line.demand), 0), 12);
  assert.equal(originalLines.flatMap(line => line.candidates).reduce((sum, candidate) => sum + Number(candidate.quantity), 0), 9, '14 physical minus 3 foreign reservations minus 2 protected units = 9');
  assert.equal(originalLines.reduce((sum, line) => sum + Number(line.uncovered), 0), 3);
  assert.equal(proposal.lines.find(line => line.itemId === b.missing.id).uncovered, '2');
  const north = originalLines.flatMap(line => line.candidates.flatMap(candidate => candidate.allocations)).filter(allocation => allocation.locationId === b.source.id);
  assert.ok(north.every(allocation => allocation.onHand === '10' && allocation.reserved === '3' && allocation.protectedHold === '2' && allocation.available === '5'));
  assert.equal(north.reduce((sum, allocation) => sum + Number(allocation.quantity), 0), 5);
  assert.equal(originalLines.flatMap(line => line.candidates.flatMap(candidate => candidate.allocations)).filter(allocation => allocation.locationId === b.destination.id).reduce((sum, allocation) => sum + Number(allocation.quantity), 0), 4);
  for (const candidate of originalLines.flatMap(line => line.candidates)) {
    assert.equal(candidate.mappingId, mapping.id); assert.equal(candidate.mappingVersion, mapping.version);
    assert.equal(candidate.itemVersion, b.alternative.version); assert.equal(candidate.unit, 'each');
  }
  for (const evidence of proposal.evidence) {
    assert.equal(evidence.href, '/api/pier/export');
    const source = retained[evidence.collection].find(row => row.id === evidence.id);
    assert.ok(source, 'every source resolves in the authenticated public export');
    if (evidence.version !== undefined) assert.equal(evidence.version, source.version ?? source.sequence);
    if (evidence.entryId) assert.ok(source.supplierReplies.some(reply => reply.id === evidence.entryId));
  }
  assert.ok(proposal.evidence.some(e => e.collection === 'movements' && e.id === retained.movements.at(-1).id));
  assert.ok(proposal.evidence.some(e => e.collection === 'reservations' && e.id === retained.reservations[0].id));
  assert.ok(proposal.evidence.some(e => e.collection === 'channelHolds' && e.id === b.hold.id));
  const review = { proposalId: proposal.id, poId: b.po.id, version: proposal.version, decision: 'accepted', reason: 'Comparison reviewed only.', confirm: true };
  await refuse('substitute.review', review, 'FORBIDDEN', asAgent);
  await refuse('substitute.review', { ...review, poId: b.stock.id }, 'SUBSTITUTE_SOURCE');
  await refuse('proposal.execute', { proposalId: proposal.id, version: proposal.version }, 'PROPOSAL');
  await refuse('substitute.prepare', { poId: b.stock.id, version: (await h.state()).purchaseOrders.find(po => po.id === b.stock.id).version }, 'SUBSTITUTE_EVIDENCE');
  const decisionId = randomUUID();
  const accepted = await h.command('substitute.review', review, { commandId: decisionId });
  assert.equal(accepted.status, 'accepted'); assert.equal(accepted.decision.actorId, (await h.state()).actor.id);
  assert.deepEqual(business(await exported(h)), business(beforePreparation));
  await h.restart();
  assert.deepEqual(await h.command('substitute.review', review, { commandId: decisionId }), accepted);
  assert.deepEqual(await asAgent('substitute.prepare', preparationPayload, { commandId: preparationId }), acknowledgment);
  assert.equal((await h.state()).proposals.find(row => row.id === proposal.id).status, 'accepted');
  const decline = await h.command('substitute.prepare', preparationPayload);
  const declined = await h.command('substitute.review', { ...review, proposalId: decline.id, version: decline.version, decision: 'declined', reason: 'Leave the existing order untouched.' });
  assert.equal(declined.status, 'declined');
  assert.deepEqual(business(await exported(h)), business(beforePreparation));
  const stale = await h.command('substitute.prepare', preparationPayload);
  await h.command('channel.release', { holdId: b.hold.id, version: b.hold.version });
  await refuse('substitute.review', { ...review, proposalId: stale.id, version: stale.version }, 'STALE');
  assert.equal((await h.state()).proposals.find(row => row.id === stale.id).reviewCurrent, false);
  const afterHold = await h.command('substitute.prepare', preparationPayload);
  assert.equal(afterHold.lines.filter(line => line.itemId === b.item.id).reduce((sum, line) => sum + Number(line.uncovered), 0), 1);
  await h.command('substitute.mappingSave', { ...mappingInput, version: mapping.version, enabled: false });
  await refuse('substitute.review', { ...review, proposalId: afterHold.id, version: afterHold.version }, 'STALE');
  const currentMapping = (await h.state()).substituteMappings[0];
  await h.command('substitute.mappingSave', { ...mappingInput, version: currentMapping.version });
  const preparedByAgent = await asAgent('substitute.prepare', preparationPayload);
  await h.command('role.set', { operatorId: member.id, role: 'viewer' });
  await refuse('substitute.review', { ...review, proposalId: preparedByAgent.id, version: preparedByAgent.version }, 'STALE');
  await refuse('substitute.prepare', preparationPayload, 'FORBIDDEN', asAgent);
  const recovered = await h.request('/api/pier/commands', { method: 'POST', as: member.cookie, body: { commandId: preparationId, type: 'substitute.prepare', payload: preparationPayload } });
  assert.equal(recovered.status, 403, 'demotion prevents recovery of an earlier preparation result');
  const final = await exported(h);
  for (const command of beforePreparation.commands) assert.deepEqual(final.commands.find(row => row.id === command.id), command);
  assert.equal(final.movements.length, beforePreparation.movements.length);
  assert.deepEqual(final.orders, beforePreparation.orders);
  assert.deepEqual(final.purchaseOrders, beforePreparation.purchaseOrders);
  assert.ok(final.auditEvents.some(event => event.type === 'substitute.review' && event.documentIds.includes(accepted.id)));
});
