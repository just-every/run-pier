import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';

test('pack slip contains only current partial cartons and reading cannot dispatch', async t => {
  const h = await installation(); t.after(() => h.close());
  const b = await basics(h), po = await buy(h, b);
  await receive(h, b, po, '10');
  const order = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '5' }] });
  const prior = await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-prior-1', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
  const pickup = await h.command('carrier.save', { name: 'synthetic-pier-pickup-1', warehouse: 'North', dock: 'synthetic-pier-dock-1', cutoff: '23:59', timeZone: 'America/Chicago' });
  let wave = await h.command('wave.release', { carrierId: pickup.id, orderIds: [order.id] });
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: b.source.name, itemCode: b.item.barcode, quantity: '2' });
  await h.command('pick.short', { waveId: wave.id, lineId: wave.lines[0].id, reason: 'Leave the remaining two units for another walk' });
  const payload = { waveId: wave.id, orderId: order.id };
  let pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
  await h.command('pack.carton', payload);
  pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
  const path = `/api/pier/packs/${pack.id}/packing-slip`;
  for (const as of ['', 'oa_session=synthetic-pier-invalid-1']) assert.equal((await h.request(path, { as })).status, 401);
  const before = await (await h.request('/api/pier/export')).json();
  for (let read = 0; read < 2; read++) {
    const response = await h.request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    const cartons = [...html.matchAll(/<article>(.*?)<\/article>/gs)].map(match => match[1]);
    assert.equal(cartons.length, 2);
    for (const carton of cartons) {
      assert.ok(carton.includes(b.item.sku));
      assert.match(carton, /Packed: 1 each/);
      assert.ok(carton.includes(b.source.name));
    }
    for (const value of [order.reference, `Wave ${wave.number}`, 'Tote 1', pickup.dock]) assert.ok(html.includes(value));
    assert.ok(!html.includes(prior.reference));
    assert.doesNotMatch(html, /Packed: [345] each/);
  }
  const after = await (await h.request('/api/pier/export')).json();
  for (const key of ['version', 'movements', 'reservations', 'orders', 'packs', 'shipments', 'commands']) assert.deepEqual(after[key], before[key]);
  assert.equal((await h.request(`/api/pier/orders/${order.id}/packing-slip`)).status, 200);
});
