import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { installation } from './harness.mjs';
import { shippingEdge } from './shipping-edge.mjs';

import { destination, packedOrder } from './shipping-fixtures.mjs';
test('packed order → verified rates → label → emailed tracking → delivered shipment', async t => {
  const edge = shippingEdge(), h = await installation({ outboundService: edge.outbound, bindings: { MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'synthetic-mail-key', MAIL_FROM: 'shipping@example.test' } });
  t.after(() => h.close());
  await h.command('shipping.save', { apiKey: 'EZTK_synthetic', webhookSecret: 'synthetic-webhook-secret', mode: 'test', fromAddress: { ...destination, name: 'Pier warehouse' } });
  const { order, pack, payload } = await packedOrder(h);
  let job = await h.command('shipping.prepare', { packId: pack.id, carton: 1, address: destination, email: 'buyer@example.test' });
  const act = async (type, extra = {}, opts) => { job = await h.command(type, { jobId: job.id, version: job.version, ...extra }, opts); return job; };
  await act('shipping.buy', { rateId: 'invented' }, { error: 'SHIPPING_STATE' });
  job = (await h.state()).shippingJobs[0];
  edge.undeliverable(true); await act('shipping.verify');
  assert.equal(job.verified, false);
  await act('shipping.rates', {}, { error: 'ADDRESS' }); job = (await h.state()).shippingJobs[0];
  edge.undeliverable(false); await act('shipping.verify');
  assert.equal(job.suggestedAddress.zip, '94104-1210');
  await act('shipping.address', { choice: 'original' });
  assert.equal((await h.state()).orders.find(o => o.id === order.id).shippingAddress.choice, 'original');
  // Both choices are public actions; rate the accepted provider suggestion.
  await act('shipping.verify'); await act('shipping.address', { choice: 'suggested' }); await act('shipping.rates');
  assert.deepEqual(new Set(job.rates.map(r => r.carrier)), new Set(['UPS','FedEx','USPS']));
  assert.equal(job.rates.find(r => r.cheapest).carrier, 'USPS');
  assert.equal(job.rates.find(r => r.fastest).carrier, 'FedEx');
  edge.loseBuy();
  const buyPayload = { jobId: job.id, version: job.version, rateId: 'rate_usps' };
  job = await h.command('shipping.buy', buyPayload, { commandId: 'buy-label-once' });
  const replay = await h.command('shipping.buy', buyPayload, { commandId: 'buy-label-once' });
  assert.deepEqual(replay, job, 'same purchase command recovers the recorded response');
  assert.equal(job.status, 'uncertain');
  await act('shipping.reconcile');
  assert.equal(job.status, 'labelled'); assert.equal(job.mail.status, 'sent');
  assert.equal(edge.emails.length, 1);
  assert.ok(edge.emails[0].content.some(c => c.value.includes(job.trackingCode)));
  await act('shipping.email'); assert.equal(edge.emails.length, 1);
  assert.equal((await h.state()).reservations.length, 1, 'buying a label does not dispatch stock');
  for (const format of ['pdf','zpl']) {
    const res = await h.request(`/api/pier/shipping/labels/${job.id}.${format}`);
    assert.equal(res.status, 200, await res.clone().text());
    const label = await res.text();
    if (format === 'pdf') { assert.match(res.headers.get('content-type'), /application\/pdf/); assert.ok(label.startsWith('%PDF-')); }
    else { assert.ok(label.startsWith('^XA')); assert.ok(label.includes(job.trackingCode)); }
  }
  const dispatched = await h.command('pack.dispatch', { ...payload, shipmentReference: job.trackingCode });
  const shipment = (await h.state()).shipments.find(s => s.id === dispatched.shipmentId);
  assert.equal(shipment.tracking[0].trackingCode, job.trackingCode);
  edge.delivered();
  const event = JSON.stringify({ id: 'evt_synthetic_delivered', description: 'tracker.updated', mode: 'test', result: { id: 'trk_synthetic' } });
  const timestamp = String(Math.floor(Date.now() / 1000)), path = '/api/pier/shipping/webhook';
  const signature = createHmac('sha256', 'synthetic-webhook-secret').update(`${timestamp}POST${path}${event}`).digest('hex');
  const notify = sig => fetch(h.origin + path, { method: 'POST', headers: { 'x-timestamp': timestamp, 'x-path': path, 'x-hmac-signature-v2': `hmac-sha256-hex=${sig}` }, body: event });
  assert.equal((await notify('0'.repeat(64))).status, 401);
  const response = await notify(signature); assert.equal(response.status, 200, await response.text());
  assert.equal((await notify(signature)).status, 200);
  const state = await h.invariant();
  assert.equal(state.shipments[0].deliveryStatus, 'delivered'); assert.ok(state.shipments[0].closedAt);
  assert.equal(state.orders.find(o => o.id === order.id).deliveryStatus, 'delivered');
  assert.equal(state.shippingJobs[0].events.length, 3);
  assert.equal(edge.calls.filter(c => c.path.endsWith('/buy')).length, 1);
  assert.equal(JSON.stringify(state).includes('EZTK_synthetic'), false);
  const managedEdge = shippingEdge(), managed = await installation({ outboundService: managedEdge.outbound, bindings: { RER_OWNER_CLAIM_ISSUER: 'https://managed.example.test' } });
  t.after(() => managed.close());
  await managed.command('shipping.save', { apiKey: 'EZTK_synthetic', mode: 'test', fromAddress: destination });
  const managedPack = await packedOrder(managed);
  const managedJob = await managed.command('shipping.prepare', { packId: managedPack.pack.id, carton: 1, address: destination, email: 'buyer@example.test' });
  await managed.command('shipping.verify', { jobId: managedJob.id, version: managedJob.version }, { error: 'SHIPPING_UNAVAILABLE' });
  assert.equal(managedEdge.calls.length, 0, 'Managed never attempts provider egress');
  assert.ok((await managed.state()).shippingUnavailable);

});
