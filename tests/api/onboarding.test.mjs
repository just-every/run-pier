import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation } from './harness.mjs';
import { nativeCapture } from './onboarding-fixture.mjs';

test('owner onboarding follows real native cutovers without writes, egress or stale authority', async t => {
  const outbound = [];
  const h = await installation({ outboundService: request => { outbound.push(new URL(request.url).origin); throw new Error('Onboarding must not contact a provider.'); } });
  t.after(async () => { assert.deepEqual(outbound, []); await h.close(); });
  const exported = async () => {
    const response = await h.request('/api/pier/export'); assert.equal(response.status, 200);
    const { exportedAt, ...records } = await response.json(); return records;
  };
  const inspect = async () => {
    const before = await exported(), state = await h.state();
    const response = await h.request('/api/pier/onboarding');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const diagnostic = await response.json();
    const again = await h.request('/api/pier/onboarding', { headers: { 'if-none-match': '*' } });
    assert.equal(again.status, 200); assert.equal(again.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await again.json(), diagnostic);
    assert.equal(diagnostic.version, state.version);
    for (const [kind, count] of Object.entries(diagnostic.business.counts)) assert.equal(count, before[kind].length);
    assert.deepEqual(diagnostic.batches.map(batch => batch.id).sort(), before.imports.filter(batch => !batch.provider).map(batch => batch.id).sort());
    for (const batch of diagnostic.batches) {
      const record = before.imports.find(row => row.id === batch.id);
      assert.equal(batch.stage, record.status); assert.equal(batch.version, record.version);
      assert.equal(batch.sourceVersion, record.sourceVersion); assert.equal(batch.mappingRevision, record.mappingRevision);
      assert.equal(batch.reviews.length, record.review.length);
      assert.deepEqual(batch.problems.map(problem => problem.code), record.errors.map(error => error.code));
      for (const problem of batch.problems) assert.equal(problem.href, `#imports/${batch.id}`);
    }
    assert.deepEqual(await exported(), before, 'diagnostic reads cannot change records, commands, imports or audit');
    assert.deepEqual(outbound, []);
    return diagnostic;
  };
  let diagnostic = await inspect();
  assert.equal(diagnostic.empty, true); assert.equal(diagnostic.business.counts.movements, 0);
  assert.equal(diagnostic.business.profile.configured, false);
  assert.equal(diagnostic.nextAction.href, '#purchasing');
  assert.ok(diagnostic.connections.some(connection => connection.id === 'channels' && connection.status === 'not connected'));
  assert.ok(diagnostic.connections.every(connection => connection.lastSuccessfulRequest === null));
  await h.command('business.save', { name: 'Synthetic Pier Wholesale', address: '71 Synthetic Pier Road' });
  diagnostic = await inspect();
  assert.equal(diagnostic.empty, false); assert.equal(diagnostic.business.profile.configured, true);
  assert.equal(diagnostic.business.profile.version, 1); assert.equal(diagnostic.nextAction.href, '#imports');

  const memberEntry = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  const cookie = memberEntry.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const member = await (await h.request('/auth/session', { as: cookie })).json();
  const denied = async as => {
    const before = await exported(), response = await h.request('/api/pier/onboarding', { as });
    assert.ok([401, 403].includes(response.status)); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text(); assert.ok(!body.includes('synthetic-pier-onboarding')); assert.ok(!body.includes('Onboarding bolts'));
    assert.deepEqual(await exported(), before);
  };
  await denied(''); await denied(cookie);
  await h.command('role.set', { operatorId: member.operator.id, role: 'owner' });
  assert.equal((await h.request('/api/pier/onboarding', { as: cookie })).status, 200);
  await h.command('role.set', { operatorId: member.operator.id, role: 'viewer' });
  await denied(cookie);
  const preview = await (await h.request('/api/pier/privacy?kind=operator&subjectId=' + member.operator.id)).json();
  assert.equal(preview.allowed, true);
  await h.command('privacy.eraseSubject', { kind: 'operator', subjectId: member.operator.id, planHash: preview.planHash, confirm: true });
  await denied(cookie);

  const invalid = await h.command('import.stage', nativeCapture('2', 'AUD'));
  diagnostic = await inspect();
  assert.equal(diagnostic.batches[0].status, 'invalid'); assert.equal(diagnostic.nextAction.batchId, invalid.id);
  assert.ok(diagnostic.batches[0].problems.some(problem => problem.code === 'CONVERSION_RATE' && problem.sourceId === 'opening' && problem.artifact === 'positions.csv' && problem.row === 2));
  assert.equal(diagnostic.business.counts.items, 0); assert.equal(diagnostic.business.counts.movements, 0);
  let staged = await h.command('import.stage', nativeCapture());
  diagnostic = await inspect(); assert.equal(diagnostic.batches[0].status, 'staged');
  await h.command('item.save', { sku: 'synthetic-pier-711', name: 'Later definition', unit: 'each', packSize: '1' });
  diagnostic = await inspect(); assert.equal(diagnostic.batches[0].status, 'stale');
  await h.command('import.review', { batchId: staged.id, version: staged.version, stage: 'mapped', reason: 'Must refuse old frontier' }, { error: 'STALE_IMPORT' });
  staged = await h.command('import.stage', nativeCapture());
  const review = async batch => {
    const beforeReview = await exported();
    for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) {
      batch = await h.command('import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Owner independently checked native source and totals' });
      diagnostic = await inspect();
      const shown = diagnostic.batches.find(row => row.id === batch.id);
      assert.equal(shown.status, 'reviewed'); assert.equal(shown.stage, stage);
      assert.deepEqual((await exported()).movements, beforeReview.movements, 'reviewing never posts stock');
    }
    return batch;
  };
  staged = await review(staged);
  const commandId = randomUUID(), payload = { batchId: staged.id, version: staged.version };
  const committed = await h.command('import.commit', payload, { commandId });
  const posted = await exported();
  assert.equal(posted.movements.length, 1); assert.equal(posted.movements[0].quantity, '2000000');
  assert.equal(posted.movements[0].importId, committed.id);
  assert.equal(posted.items.find(item => item.sku === 'synthetic-pier-710').name, 'Onboarding bolts');
  assert.deepEqual(await h.command('import.commit', payload, { commandId }), committed);
  assert.deepEqual(await exported(), posted, 'recovered cutover posts only once');
  diagnostic = await inspect(); assert.equal(diagnostic.batches[0].status, 'committed');
  assert.equal(diagnostic.batches[0].committedVersion, posted.imports.find(batch => batch.id === committed.id).committedVersion);

  let revision = await h.command('import.stage', { ...nativeCapture('3'), sourceVersion: 'owner-export-2' });
  diagnostic = await inspect();
  assert.equal(diagnostic.batches[0].status, 'invalid');
  assert.ok(diagnostic.batches[0].problems.some(problem => problem.code === 'REVISION_REVIEW' && problem.sourceId === 'opening' && problem.artifact === 'positions.csv'));
  revision = await h.command('import.revise', { batchId: revision.id, version: revision.version, decisions: [{ kind: 'positions', key: 'opening', action: 'replace' }], reason: 'Owner approved corrected opening quantity' });
  diagnostic = await inspect(); assert.equal(diagnostic.batches[0].status, 'staged');
  revision = await review(revision);
  await h.command('import.commit', { batchId: revision.id, version: revision.version });
  const corrected = await h.invariant();
  assert.equal(corrected.positions[0].quantity, '3');
  assert.equal(corrected.movements.reduce((sum, movement) => sum + BigInt(movement.quantity), 0n), 3000000n);
  diagnostic = await inspect(); assert.equal(diagnostic.batches[0].status, 'committed');
  assert.ok(diagnostic.batches.find(batch => batch.id === invalid.id).problems.length, 'earlier invalid captures stay visible');

  await h.command('shipping.save', { apiKey: 'synthetic-pier-712', mode: 'test', fromAddress: { name: 'Synthetic Pier', street1: '71 Pier Road', city: 'San Francisco', state: 'CA', zip: '94107', country: 'US', phone: '4155550100' } });
  diagnostic = await inspect();
  const shipping = diagnostic.connections.find(connection => connection.id === 'shipping:easypost');
  assert.equal(shipping.status, 'active'); assert.equal(shipping.lastSuccessfulRequest, null);
  assert.ok(!JSON.stringify(diagnostic).includes('synthetic-pier-712'), 'connection credentials never enter the projection');
  await h.restart(); assert.deepEqual(await inspect(), diagnostic);

  await denied(cookie); await h.restart(); await denied(cookie);
  await inspect();
});
