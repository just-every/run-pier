import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installation } from './harness.mjs';
import { openJourney } from './open-fixtures.mjs';

test('OPEN-001: MIT source and account-free operation with three warehouses and 25 staff without author licensing', async t => {
  const license = await readFile('LICENSE', 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.equal(JSON.parse(await readFile('package.json', 'utf8')).license, 'MIT');
  const messages = [];
  const h = await installation({ production: true, bindings: { AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'test-only-mail-key' }, outboundService: async request => {
    assert.equal(new URL(request.url).hostname, 'api.resend.com');
    messages.push(await request.json()); return Response.json({ id: `mail-${messages.length}` });
  } }); t.after(() => h.close());
  await openJourney(h);
  for (const message of messages) {
    const link = new URL(String(message.text).match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0]);
    const accepted = await h.request('/auth/confirm', { method: 'POST', as: '', body: { token: link.searchParams.get('token') } });
    assert.equal(accepted.status, 303);
    const cookie = accepted.headers.getSetCookie().map(row => row.split(';')[0]).join('; ');
    const session = await h.request('/auth/session', { as: cookie });
    assert.equal(session.status, 200); assert.equal((await session.json()).operator.status, 'active');
  }
  const state = await h.state();
  assert.equal(new Set(state.locations.map(row => row.warehouse)).size, 3);
  assert.equal(state.operators.filter(row => row.email.startsWith('staff') && row.status === 'active').length, 25);
  for (const staff of state.operators.filter(row => row.email.startsWith('staff'))) await h.command('role.set', { operatorId: staff.id, role: 'warehouse' });
  await h.command('item.save', { sku: 'OPEN-BOX', name: 'Open source case', unit: 'each', packSize: '12' });
  assert.equal((await h.state()).roles.filter(row => row.role === 'warehouse').length, 25);
  assert.equal((await h.request('/api/pier/export')).status, 200);
  assert.equal((await h.request('/api/pier/native-export')).status, 200);
});
