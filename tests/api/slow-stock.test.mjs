import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';

test('AUTO-001: slow-stock checks warn once before dead stock and retain sale or buyer closure', async t => {
  const mail = [];
  const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'buyer@example.test', MAIL_API_KEY: 'synthetic-mail-key' }, outboundService: async request => {
    mail.push(await request.json()); return Response.json({ id: `mail-${mail.length}` });
  } });
  t.after(() => h.close());
  const b = await basics(h);
  await h.command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road, Portland OR 97210' });
  await receive(h, b, await buy(h, b, '10'), '10');
  await receive(h, { ...b, source: b.destination }, await buy(h, b, '5'), '5');
  const report = await (await h.request('/api/pier/reports')).json();
  assert.equal(report.deadStock.rows.length, 0, 'newly received inventory must age before it is dead stock');
  const policyData = { warningDays: 90, deadDays: 180, quietStart: 0, quietEnd: 0, recipient: 'buyer@example.test', enabled: true, confirm: true };
  let policy = await h.command('slowStock.save', { ...policyData, version: 0 });
  await h.command('slowStock.check', {});
  assert.equal((await h.state()).slowStockExceptions.length, 0);
  const worker = await h.mf.getWorker(), time = new Date(Date.now() + 91 * 86400000);
  const tick = scheduledTime => worker.scheduled({ scheduledTime, cron: '* * * * *' });
  assert.equal((await tick(time)).outcome, 'ok');
  let s = await h.state();
  assert.equal(s.slowStockExceptions.length, 2);
  assert.equal(mail.length, 2);
  for (const warning of s.slowStockExceptions) {
    const movements = s.movements.filter(m => m.itemId === warning.itemId && m.locationId === warning.locationId);
    const expectedValue = movements.reduce((n, m) => n + BigInt(m.quantity), 0n) * 250000000000n / 1000000n;
    assert.equal(warning.value, `${expectedValue / 1000000000000n}.${String(expectedValue % 1000000000000n).padStart(12, '0')}`);
    assert.ok(warning.daysLeft > 0 && warning.daysLeft < policyData.deadDays);
    assert.equal(warning.lastMovement, movements.at(-1).createdAt);
    assert.ok(warning.messageId);
  }
  await tick(time);
  assert.equal((await h.state()).slowStockExceptions.length, 2);
  assert.equal(mail.length, 2, 'a recurring check cannot spam the same episode');
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '1' }] });
  const shipment = await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'Sale closes slow-stock review', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
  s = await h.state();
  const sold = s.slowStockExceptions.find(e => e.locationId === b.source.id);
  assert.equal(sold.status, 'closed');
  assert.ok(s.movements.some(m => m.id === sold.closureMovementId && m.documentId === shipment.id));
  const remaining = s.slowStockExceptions.find(e => e.locationId === b.destination.id);
  await h.command('slowStock.decide', { exceptionId: remaining.id, version: remaining.version, reason: 'Keep these spares for the contracted service customer; review next quarter.' });
  // A buyer decision suppresses the same inactivity episode across later checks.
  await tick(time);
  s = await h.state();
  assert.equal(s.slowStockExceptions.filter(e => e.locationId === b.destination.id).length, 1);
  assert.equal(s.slowStockExceptions.find(e => e.id === remaining.id).status, 'closed');
  // Quiet hours delay an early buyer warning; pausing the policy revokes it.
  policy = s.slowStockPolicies[0];
  const hour = new Date().getUTCHours();
  policy = await h.command('slowStock.save', { ...policyData, version: policy.version, quietStart: hour, quietEnd: (hour + 2) % 24 });
  const freshItem = await h.command('item.save', { sku: 'CASE-NEW', name: 'Replacement assortment', unit: 'each', packSize: '1' });
  const freshBinStock = { ...b, item: freshItem };
  await receive(h, freshBinStock, await buy(h, freshBinStock, '4'), '4');
  const before = mail.length;
  const flagged = await h.command('slowStock.flag', { itemId: freshItem.id, locationId: b.source.id, reason: 'This assortment is being replaced; review the remaining stock early.' });
  assert.equal(mail.length, before);
  const pending = (await h.state()).correspondence.find(m => m.id === flagged.messageId);
  assert.ok(pending.dueAt > new Date().toISOString());
  await h.command('slowStock.save', { ...policyData, version: policy.version, enabled: false });
  await tick(new Date(Date.parse(pending.dueAt) + 1000));
  assert.equal(mail.length, before);
  assert.equal((await h.state()).deliveries.find(d => d.correspondenceId === pending.id).phase, 'revoked');
});
