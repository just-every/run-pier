import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics, buy, receive, parse } from './harness.mjs';

// Only the paid/network edge is fake. Every business action uses authenticated
// HTTP through the real Worker, D1 admission and configured provider adapter.
test('sell-through drafts an approved supplier PO and re-promises backorders by email', async t => {
  const mail = [];
  const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'purchasing@example.test', MAIL_API_KEY: 'synthetic-test-provider-key' }, outboundService: async request => {
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-test-provider-key');
    mail.push({ message: await request.json(), id: request.headers.get('idempotency-key') });
    return Response.json({ id: `provider-${mail.length}` });
  } });
  t.after(() => h.close());
  const b = await basics(h), today = new Date().toISOString().slice(0,10);
  await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'BRASS-CASE', packSize: '6', price: '2', minimum: '12', leadDays: 6 });
  const opening = await buy(h, b, '60');
  await receive(h, b, opening, '60');
  const sold = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '30', price: '5' }] });
  await h.command('dispatch.create', { orderId: sold.id, shipmentReference: 'Actual sell-through', lines: [{ orderLineId: sold.lines[0].id, quantity: '30' }] });
  let s = await h.state(), f = s.forecasts.find(f => f.itemId === b.item.id && f.warehouse === 'North');
  assert.equal(f.observedSold, '30'); assert.equal(f.soldPerDay, '1');
  assert.equal(f.configured, false); assert.equal(f.windows.find(w => w.days === 90).sold, '30');
  const policy = await h.command('replenishment.save', { itemId: b.item.id, warehouse: 'North', version: 0, supplierId: b.supplier.id, method: 'fixed', safetyStock: '4', leadDays: 6, windowDays: 30, reviewDays: 10, applyLearned: true, stateVersion: s.version, autoDraft: true, freight: '6', duty: '2' });
  assert.equal(policy.reorderPoint, '10'); assert.equal(policy.reorderQuantity, '10');
  assert.equal((await h.state()).purchaseOrders.filter(p => p.status === 'draft').length, 0);
  const demand = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', promiseDate: today, lines: [{ itemId: b.item.id, quantity: '40', price: '5' }] });
  s = await h.state();
  let po = s.purchaseOrders.find(p => p.status === 'draft');
  assert.ok(po, 'crossing the applied point automatically drafts a PO');
  assert.equal(po.lines[0].quantity, '30'); assert.equal(po.expectedLandedCost.total, '68.000000000000');
  assert.equal(s.positions.find(p => p.itemId === b.item.id && p.locationId === b.source.id).quantity, '30');
  assert.equal(s.orders.find(o => o.id === demand.id).lines[0].backorder, '10');
  assert.equal(s.orders.find(o => o.id === demand.id).backorderPlan.late, true, 'supply after the promise is the exception');
  await h.command('replenishment.plan', {});
  assert.equal((await h.state()).purchaseOrders.filter(p => p.status === 'draft').length, 1, 'rerunning does not duplicate covered demand');
  await h.command('po.send', { poId: po.id, version: po.version, recipient: 'supplier@example.test', confirm: true }, { error: 'PO_STATE' });
  await h.command('po.approve', { poId: po.id, version: po.version });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  const sendId = randomUUID(), payload = { poId: po.id, version: po.version, recipient: 'supplier@example.test', chaseEveryDays: 1, maxChases: 1, confirm: true };
  const sent = await h.command('po.send', payload, { commandId: sendId });
  assert.equal(mail.length, 1); assert.match(mail[0].message.text, /expected landed total USD 68/);
  assert.equal(mail[0].message.to[0], 'supplier@example.test');
  assert.deepEqual(await h.command('po.send', payload, { commandId: sendId }), sent);
  assert.equal(mail.length, 1);
  // Exercise the scheduler transport at the chase's actual due time.
  const chase = (await h.state()).correspondence.find(m => m.kind === 'supplier-chase');
  const scheduled = await (await h.mf.getWorker()).scheduled({ scheduledTime: new Date(Date.parse(chase.dueAt) + 1000), cron: '*/15 * * * *' });
  assert.equal(scheduled.outcome, 'ok');
  assert.equal(mail.length, 2); assert.match(mail[1].message.subject, /Confirmation requested/);
  let order = (await h.state()).orders.find(o => o.id === demand.id);
  await h.command('order.promisePolicy', { orderId: order.id, version: order.version, recipient: 'customer@example.test', enabled: true, confirm: true });
  assert.equal(mail.length, 3); assert.match(mail[2].message.text, /estimate/);
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10);
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  await h.command('po.confirm', { poId: po.id, version: po.version, promiseDate: date, source: 'Supplier email 14', body: 'Confirmed full delivery on this date.', confirm: true });
  assert.equal(mail.length, 4); assert.match(mail[3].message.text, new RegExp(date));
  order = (await h.state()).orders.find(o => o.id === demand.id);
  // Re-promised to the confirmed supply date, the order is no longer late.
  assert.equal(order.backorderPlan.late, false);
  assert.equal(order.promiseDate, date); assert.equal(order.backorderPlan.estimated, false);
  assert.equal(order.backorderPlan.lines[0].sources[0].quantity, '10');
  const later = new Date(Date.now() + 20 * 86400000).toISOString().slice(0,10);
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  await h.command('po.confirm', { poId: po.id, version: po.version, promiseDate: later, source: 'Supplier email 15', body: 'The truck is delayed.', confirm: true });
  s = await h.invariant();
  assert.equal(mail.length, 5); assert.equal(s.orders.find(o => o.id === demand.id).promiseDate, later);
  assert.equal(s.purchaseOrders.find(p => p.id === po.id).supplierReplies.length, 2);
  assert.equal(s.deliveries.filter(d => d.phase === 'sent').length, 5);
  await h.command('mail.process', {}); assert.equal(mail.length, 5);
  // Insufficient confirmed supply cannot be promised twice to competing orders.
  const competing = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '25', price: '5' }] });
  s = await h.state();
  const dates = s.orders.find(o => o.id === competing.id).backorderPlan.lines[0];
  assert.equal(dates.sources[0].quantity, '20'); assert.equal(dates.uncovered, '5'); assert.equal(dates.estimated, true);
  assert.ok(parse((await h.invariant()).positions[0].quantity) >= 0n);
});
