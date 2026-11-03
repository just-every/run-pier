import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {installation} from './harness.mjs';

test('dependency discovery retains installation identity across a native restart', async t => {
  const h = await installation({bindings: {INSTALLATION_KEY: randomBytes(32).toString('hex')}});
  t.after(() => h.close());
  const first = await h.request('/.well-known/rer-dependencies');
  assert.equal(first.status, 200);
  const before = await first.json();
  assert.equal(before.origin, h.origin);
  assert.ok(before.sector_id);
  await h.restartWithFreshSigningKey();
  const after = await h.request('/.well-known/rer-dependencies');
  assert.equal(after.status, 200);
  assert.equal((await after.json()).sector_id, before.sector_id);
});
