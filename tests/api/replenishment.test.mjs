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
  await h.command('po.send', payload, { error: 'BUSINESS_PROFILE' });
  await h.command('business.save', { name: 'Harbor Goods', address: '1 Dock St, Portland, OR 97209', shipTo: { North: '40 Pier Rd, Portland, OR 97210' } });
  const sent = await h.command('po.send', payload, { commandId: sendId });
  assert.equal(mail.length, 1); assert.match(mail[0].message.text, /expected landed total USD 68/);
  assert.match(mail[0].message.text, /from Harbor Goods\nSupplier: .*\nShip to: Harbor Goods, North\n40 Pier Rd, Portland, OR 97210/);
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
  assert.equal(mail.length, 4); assert.match(mail[3].message.text, /10.*expected/);
  order = (await h.state()).orders.find(o => o.id === demand.id);
  // Re-promised to the confirmed supply date, the order is no longer late.
  assert.equal(order.backorderPlan.late, false);
  assert.equal(order.promiseDate, today); assert.equal(order.lines[0].backorderPromiseDate, date); assert.equal(order.lines[0].backorderPromisedQuantity, '10'); assert.equal(order.backorderPlan.estimated, false);
  assert.equal(order.backorderPlan.lines[0].sources[0].quantity, '10');
  const later = new Date(Date.now() + 20 * 86400000).toISOString().slice(0,10);
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  await h.command('po.confirm', { poId: po.id, version: po.version, promiseDate: later, source: 'Supplier email 15', body: 'The truck is delayed.', confirm: true });
  s = await h.invariant();
  assert.equal(mail.length, 5); assert.equal(s.orders.find(o => o.id === demand.id).promiseDate, today); assert.equal(s.orders.find(o => o.id === demand.id).lines[0].backorderPromiseDate, later);
  assert.equal(s.purchaseOrders.find(p => p.id === po.id).supplierReplies.length, 2);
  assert.equal(s.deliveries.filter(d => d.phase === 'sent').length, 5);
  await h.command('mail.process', {}); assert.equal(mail.length, 5);
  // Each policies round demand upward to actual units, including a non-integral daily rate.
  const learnedState = await h.state(), currentPolicy = learnedState.replenishmentPolicies.find(p => p.id === policy.id);
  const reviewed = { itemId: b.item.id, warehouse: 'North', version: currentPolicy.version, supplierId: b.supplier.id, method: 'fixed', safetyStock: '4', leadDays: 7, windowDays: 90, reviewDays: 10, applyLearned: true, stateVersion: learnedState.version, autoDraft: false };
  const rounded = await h.command('replenishment.save', reviewed);
  assert.equal(rounded.reorderPoint, '7'); assert.equal(rounded.reorderQuantity, '4'); assert.equal(rounded.maximum, '11');
  await h.command('replenishment.save', { ...reviewed, version: rounded.version, applyLearned: false, reorderPoint: '7.2', reorderQuantity: '4', maximum: '11' }, { error: 'REPLENISHMENT_UNIT' });
  // Insufficient confirmed supply cannot be promised twice to competing orders.
  const competing = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '25', price: '5' }] });
  s = await h.state();
  const dates = s.orders.find(o => o.id === competing.id).backorderPlan.lines[0];
  assert.equal(dates.sources[0].quantity, '20'); assert.equal(dates.uncovered, '5'); assert.equal(dates.estimated, true);
  // A line without any supplier date cannot borrow a neighbour's date, and it
  // does not prevent explicit approval of another line's supported promise.
  const undatedItem = await h.command('item.save', { sku: 'UNDATED', name: 'Item awaiting supplier terms', unit: 'each', packSize: '1' });
  const mixed = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', promiseDate: today, lines: [{ itemId: b.item.id, quantity: '1', price: '5' }, { itemId: undatedItem.id, quantity: '1', price: '5' }] });
  const mixedView = (await h.state()).orders.find(o => o.id === mixed.id);
  assert.equal(mixedView.backorderPlan.expectedDate, null);
  const datedLine = mixedView.backorderPlan.lines.find(l => l.itemId === b.item.id);
  const undatedLine = mixedView.backorderPlan.lines.find(l => l.itemId === undatedItem.id);
  assert.ok(datedLine.expectedDate); assert.equal(undatedLine.expectedDate, null);
  await h.command('order.repromise', { orderId: mixed.id, version: mixedView.version, fingerprint: mixedView.backorderPlan.fingerprint, orderLineIds: [datedLine.orderLineId], recipient: 'customer@example.test', confirm: true });
  const promised = (await h.state()).orders.find(o => o.id === mixed.id);
  assert.equal(promised.promiseDate, today);
  assert.equal(promised.lines.find(l => l.id === datedLine.orderLineId).backorderPromiseDate, datedLine.expectedDate);
  assert.equal(promised.lines.find(l => l.id === undatedLine.orderLineId).backorderPromiseDate, undefined);
  assert.deepEqual(promised.promiseHistory.at(-1).lines.map(l => l.orderLineId), [datedLine.orderLineId]);
  assert.ok(parse((await h.invariant()).positions[0].quantity) >= 0n);
});


test('bounded workflow dry-runs, vendor and spend limits, worker loss and pause preserve human approval', async t => {
  const h = await installation(); t.after(() => h.close()); const b = await basics(h);
  await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-1', packSize: '1', minimum: '1', price: '2', leadDays: 3 });
  await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: '2', reorderQuantity: '2', autoDraft: false });
  const config = { name: 'Bounded drafts', kind: 'draft-po', warehouses: ['North'], supplierIds: [b.supplier.id], perRunBudget: '10', dailyBudget: '10', cadenceMinutes: 15, automaticApproval: false };
  let rule = await h.command('workflow.save', config);
  const before = await h.state(); const preview = await h.command('workflow.preview', { ruleId: rule.id, version: rule.version });
  assert.equal(preview.expectedSpend, '8.000000000000'); assert.deepEqual((await h.state()).purchaseOrders, before.purchaseOrders); assert.deepEqual((await h.state()).movements, before.movements);
  await h.command('workflow.save', { ...config, automaticApproval: true }, { error: 'WORKFLOW_POLICY' });
  rule = await h.command('workflow.enable', { ruleId: rule.id, version: rule.version, previewHash: preview.previewHash });
  let job = await h.command('workflow.enqueue', { ruleId: rule.id });
  job = await h.command('workflow.claim', { ruleId: rule.id, jobId: job.id, version: job.version });
  const start = Date.parse(job.startedAt);
  await h.command('workflow.recover', {}, { headers: { 'x-pier-test-now': new Date(start + 120001).toISOString() } });
  let state = await h.state(); assert.equal(state.workflowJobs.find(j => j.id === job.id).status, 'uncertain'); assert.deepEqual(state.purchaseOrders, before.purchaseOrders);
  await h.command('workflow.claim', { ruleId: rule.id, jobId: job.id, version: state.workflowJobs.find(j => j.id === job.id).version }, { error: 'WORKFLOW_JOB' });
  // A separate rule proves successful once-only work and a disabled queued job.
  let active = await h.command('workflow.save', { ...config, name: 'Second explicit policy' });
  const enable = async r => { const preview = await h.command('workflow.preview', { ruleId: r.id, version: r.version }); return h.command('workflow.enable', { ruleId: r.id, version: r.version, previewHash: preview.previewHash }); };
  active = await enable(active); job = await h.command('workflow.enqueue', { ruleId: active.id }); job = await h.command('workflow.claim', { ruleId: active.id, jobId: job.id, version: job.version });
  const finishId = randomUUID(), finishPayload = { ruleId: active.id, jobId: job.id, version: job.version };
  const finished = await h.command('workflow.finish', finishPayload, { commandId: finishId });
  assert.equal(finished.status, 'resolved'); assert.equal(finished.result.draftIds.length, 1);
  assert.deepEqual(await h.command('workflow.finish', finishPayload, { commandId: finishId }), finished);
  state = await h.state(); assert.equal(state.purchaseOrders.length, 1); assert.equal(state.purchaseOrders[0].status, 'draft'); assert.equal(state.purchaseOrders[0].approval, null); assert.deepEqual(state.movements, before.movements);
  // An uncertain job continues to reserve its budget, even after worker loss.
  await h.command('po.delete', { poId: state.purchaseOrders[0].id, version: state.purchaseOrders[0].version });
  const later = new Date(start + 15 * 60000).toISOString();
  let next = await h.command('workflow.enqueue', { ruleId: rule.id }, { headers: { 'x-pier-test-now': later } });
  next = await h.command('workflow.claim', { ruleId: rule.id, jobId: next.id, version: next.version }, { headers: { 'x-pier-test-now': later } });
  assert.equal(next.status, 'failed'); assert.match(next.problem, /daily budget/);
  let limited = await h.command('workflow.save', { ...config, name: 'Vendor limit', supplierIds: [] });
  const blockedPreview = await h.command('workflow.preview', { ruleId: limited.id, version: limited.version });
  assert.match(blockedPreview.problems.join(' '), /vendor/);
  await h.command('workflow.enable', { ruleId: limited.id, version: limited.version, previewHash: blockedPreview.previewHash }, { error: 'WORKFLOW_REVIEW' });
  limited = await h.command('workflow.save', { ...config, name: 'Spend limit', perRunBudget: '1' });
  const spendPreview = await h.command('workflow.preview', { ruleId: limited.id, version: limited.version }); assert.match(spendPreview.problems.join(' '), /per-run budget/);
  active = await h.command('workflow.pause', { ruleId: active.id, version: active.version });
  await h.command('workflow.enqueue', { ruleId: active.id }, { error: 'WORKFLOW_PAUSED' });
  active = await h.command('workflow.kill', { ruleId: active.id, version: active.version });
  await h.command('workflow.save', { ...config, id: active.id, version: active.version }, { error: 'WORKFLOW_KILLED' });
});
