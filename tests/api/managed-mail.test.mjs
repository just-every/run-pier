import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installation, basics, buy} from './harness.mjs';

test('Managed supplier mail uses the provisioned relay once after human approval', async t => {
  const calls = [];
  const h = await installation({
    bindings: {RER_MANAGEMENT_ORIGIN: 'https://managed.example.test', MAIL_PROVIDER: 'rer', MAIL_FROM: 'purchasing@example.test', MAIL_RELAY_URL: 'https://relay.example.test/send', MAIL_API_KEY: 'synthetic-pier-1'},
    outboundService: async request => {
      assert.equal(request.url, 'https://relay.example.test/send');
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-pier-1');
      calls.push(await request.json());
      return Response.json({messageId: 'synthetic-pier-2'}, {status: 202});
    },
  });
  t.after(() => h.close());
  const b = await basics(h);
  await buy(h, b, '12');
  const po = (await h.state()).purchaseOrders[0];
  await h.command('business.save', {name: 'Synthetic Pier warehouse', address: '1 Dock St', shipTo: {North: '2 Dock St'}});
  const commandId = randomUUID();
  const payload = {poId: po.id, version: po.version, recipient: 'supplier@example.test', confirm: true};
  const sent = await h.command('po.send', payload, {commandId});
  assert.deepEqual(await h.command('po.send', payload, {commandId}), sent);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, 'supplier@example.test');
  assert.match(calls[0].text, /12/);
  assert.equal(sent.documentAttachment, 'unavailable');
  assert.match(calls[0].text, /retained purchase document has not been delivered/);
  assert.equal(Object.hasOwn(calls[0], 'from'), false);
  assert.equal(Object.hasOwn(calls[0], 'installationId'), false);
  const state = await h.state();
  assert.equal(state.deliveries.find(d => d.correspondenceId === sent.id)?.phase, 'sent');
});
