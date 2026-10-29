import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticatorCode } from './strong-auth-fixture.mjs';
import { installation, basics, buy, parse } from './harness.mjs';

test('BUY-006: an agent sends only the exact bounded human-approved purchase once', async t => {
  const mail = [];
  let uncertain = false;
  const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'buyer@example.test', MAIL_API_KEY: 'synthetic-pier-1' }, outboundService: async request => {
    mail.push(await request.json());
    if (uncertain) return new Response('Unavailable', { status: 503 });
    return Response.json({ id: `message-${mail.length}` });
  } });
  t.after(() => h.close());
  const b = await basics(h);
  await h.command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road, Portland OR 97210' });
  const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  const session = await (await h.request('/auth/session', { as: cookie })).json();
  await h.command('role.set', { operatorId: session.operator.id, role: 'agent' });
  const current = async id => (await h.state()).purchaseOrders.find(p => p.id === id);
  const authorize = async (po, changes = {}, opts = {}) => h.command('po.authorizeSend', { poId: po.id, version: po.version, recipient: 'supplier@example.test', maxSpend: '3', expiresAt: new Date(Date.now() + 86400000).toISOString(), maxChases: 0, confirm: true, ...changes }, opts);
  let po = await current((await buy(h, b)).id);
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { as: cookie, error: 'SEND_AUTHORITY' });
  await authorize(po, {}, { as: cookie, error: 'FORBIDDEN' });
  await authorize(po, { maxSpend: '2' }, { error: 'SPEND_LIMIT' });
  await authorize(po, { expiresAt: 'invalid' }, { error: 'POLICY' });
  po = await authorize(po);
  assert.equal(mail.length, 0, 'approval does not submit the message');
  const commandId = randomUUID(), payload = { poId: po.id, version: po.version };
  const message = await h.command('po.sendApproved', payload, { as: cookie, commandId });
  assert.equal(message.approvedBy, (await h.state()).actor.id);
  assert.equal(message.requestedBy, session.operator.id);
  assert.deepEqual(message.policyDecision.classes, ['money', 'external']);
  assert.equal(message.policyDecision.outcome, 'approved');
  assert.equal(message.policyDecision.facts.expectedLandedCost, undefined, 'an agent receives no hidden purchasing cost');
  const decision = (await h.state()).correspondence.find(row => row.id === message.id).policyDecision;
  assert.equal(decision.facts.expectedLandedCost, '2.500000000000');
  assert.equal(decision.facts.recipient, po.sendPolicy.recipient);
  assert.equal(decision.facts.terms.lines[0].quantity, '10');
  assert.equal(decision.policy.approvedBy, (await h.state()).actor.id);
  assert.equal(decision.policy.executorId, session.operator.id);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to[0], 'supplier@example.test');
  const retained = (await h.state()).salesDocuments.find(doc => doc.id === message.documentId);
  assert.equal(mail[0].attachments[0].content, retained.pdf);
  assert.match(Buffer.from(retained.pdf, 'base64').toString(), /^%PDF-/);
  assert.equal(retained.kind, 'purchase-order');
  assert.equal(retained.snapshot.id, po.id);
  assert.match(mail[0].text, /expected landed total USD 2.50/);
  await h.command('po.sendApproved', payload, { as: cookie, commandId });
  assert.equal(mail.length, 1);
  const worker = await h.mf.getWorker();
  await worker.scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(mail.length, 1, 'cron does not repeat an agent send');
  // Changes to actual demand stop an unconsumed grant atomically.
  po = await authorize(await current((await buy(h, b)).id));
  await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '1' }] });
  po = await current(po.id);
  assert.equal(po.sendPolicy.enabled, false);
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { as: cookie, error: 'SEND_AUTHORITY' });
  po = await authorize(po);
  po = await h.command('po.pauseSend', { poId: po.id, version: po.version });
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { as: cookie, error: 'SEND_AUTHORITY' });
  // A fresh grant is executed by the scheduler, without a human send command.
  po = await authorize(po);
  await worker.scheduled({ scheduledTime: new Date(Date.now() + 1000), cron: '* * * * *' });
  assert.equal(mail.length, 2);
  assert.ok(mail[1].attachments[0].content, 'scheduled sends also attach the retained PDF');
  assert.ok((await current(po.id)).sendPolicy.messageId);
  await h.command('mail.process', {});
  assert.equal(mail.length, 2);
  po = await authorize(await current((await buy(h, b)).id));
  await worker.scheduled({ scheduledTime: new Date(Date.now() + 2 * 86400000), cron: '* * * * *' });
  assert.equal(mail.length, 2, 'an expired grant cannot be scheduled');
  // Revoking the buyer also removes an agent's pending delegation.
  await h.command('role.set', { operatorId: session.operator.id, role: 'buyer' });
  po = await authorize(po, {}, { as: cookie });
  await h.command('role.set', { operatorId: session.operator.id, role: 'viewer' });
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { error: 'SEND_AUTHORITY' });
  await worker.scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(mail.length, 2);
  po = await authorize(await current(po.id));
  uncertain = true;
  const unconfirmed = await h.command('po.sendApproved', { poId: po.id, version: po.version });
  assert.equal((await h.state()).deliveries.find(d => d.correspondenceId === unconfirmed.id).phase, 'uncertain');
  const attempts = mail.length;
  await h.command('mail.process', {});
  await worker.scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(mail.length, attempts, 'an ambiguous outcome is never blindly resubmitted');

  await h.command('role.set', { operatorId: session.operator.id, role: 'agent' });
  // A governing workflow edit invalidates an exact delegated send before any mail.
  await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-2', packSize: '1', minimum: '1', price: '0.25', leadDays: 3 });
  await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: '100', reorderQuantity: '10' });
  const config = { name: 'Reviewed workflow', kind: 'draft-po', warehouses: ['North'], supplierIds: [b.supplier.id], perRunBudget: '100', dailyBudget: '100', cadenceMinutes: 15, automaticApproval: false };
  let rule = await h.command('workflow.save', config);
  const preview = await h.command('workflow.preview', { ruleId: rule.id, version: rule.version });
  rule = await h.command('workflow.enable', { ruleId: rule.id, version: rule.version, previewHash: preview.previewHash });
  let job = await h.command('workflow.enqueue', { ruleId: rule.id });
  job = await h.command('workflow.claim', { ruleId: rule.id, jobId: job.id, version: job.version });
  job = await h.command('workflow.finish', { ruleId: rule.id, jobId: job.id, version: job.version });
  po = await current(job.result.draftIds[0]);
  await h.command('po.approve', { poId: po.id, version: po.version });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  po = await authorize(po, { maxSpend: '100' });
  const mailBeforeEdit = mail.length;
  rule = await h.command('workflow.save', { ...config, id: rule.id, version: rule.version, perRunBudget: '1' });
  po = await current(po.id);
  assert.equal(po.sendPolicy.enabled, false);
  assert.equal(po.workflow.ruleVersion, rule.version - 1, 'draft provenance retains the generating revision');
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { as: cookie, error: 'SEND_AUTHORITY' });
  assert.equal(mail.length, mailBeforeEdit);
  // Current company routing is checked again when a delegated send executes.
  await h.command('role.set', { operatorId: session.operator.id, role: 'buyer' });
  const ownerId = (await h.state()).actor.id, expiresAt = new Date(Date.now() + 3600000).toISOString();
  await h.command('purchaseApproval.save', { limits: [{ supplierId: b.supplier.id, exceptionType: 'any', maxSpend: '100', approverId: ownerId,
    escalationId: ownerId, delegates: [{ actorId: session.operator.id, expiresAt }] }] });
  po = await authorize(await current((await buy(h, b)).id), { maxSpend: '100' }, { as: cookie });
  const permitted = await h.command('po.sendApproved', { poId: po.id, version: po.version });
  assert.equal(permitted.policyDecision.policy.purchaseApprovalVersion, 1);
  assert.equal(mail.length, mailBeforeEdit + 1);
  po = await authorize(await current((await buy(h, b)).id), { maxSpend: '100' }, { as: cookie });
  const beforeExpiry = await h.state();
  await h.command('po.sendApproved', { poId: po.id, version: po.version }, { headers: { 'x-pier-test-now': new Date(Date.parse(expiresAt) + 1000).toISOString() }, error: 'APPROVAL_ROUTE' });
  assert.equal(mail.length, mailBeforeEdit + 1);
  assert.deepEqual((await h.state()).correspondence, beforeExpiry.correspondence);

});

test('purchase approval routes exact landed spend and exceptions to named humans with revocable delegation', async t => {
  const mail = [], recipient = ['supplier', 'example.test'].join('@');
  const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: ['buyer', 'example.test'].join('@'), MAIL_API_KEY: 'synthetic-pier-1' }, outboundService: async request => {
    mail.push(await request.json()); return Response.json({ id: `synthetic-pier-${mail.length}` });
  } });
  t.after(() => h.close());
  const b = await basics(h), ownerId = (await h.state()).actor.id;
  const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  const buyerId = (await (await h.request('/auth/session', { as: cookie })).json()).operator.id;
  await h.command('role.set', { operatorId: buyerId, role: 'buyer' });
  const limit = (maxSpend, approverId, extra = {}) => ({ maxSpend, approverId, escalationId: ownerId, supplierId: b.supplier.id, exceptionType: 'any', ...extra });
  let limits = [limit('2', ownerId), limit('5', buyerId)];
  let policy = await h.command('purchaseApproval.save', { limits });
  const draft = async (extra = {}, opts = {}) => h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'synthetic-pier-3', lines: [{ itemId: b.item.id, quantity: '10', price: '0.25' }], ...extra }, opts);
  let po = await draft();
  po = await h.command('po.routeApproval', { poId: po.id, version: po.version });
  assert.equal(po.approvalRoute.approverId, buyerId);
  assert.equal(po.approvalRoute.total, '2.500000000000');
  await h.command('po.approve', { poId: po.id, version: po.version }, { error: 'APPROVAL_ROUTE' });
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  assert.equal(po.status, 'committed');
  await h.command('po.authorizeSend', { poId: po.id, version: po.version }, { error: 'APPROVAL_ROUTE' });
  po = await draft({ tax: '3' });
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'SPEND_LIMIT' });
  po = await draft({ freight: '3' });
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'SPEND_LIMIT' });
  await h.command('po.commit', { poId: po.id, version: po.version }, { error: 'SPEND_LIMIT' });
  // Independent six-place inputs produce an exact twelve-place spend.
  const charges = { freight: '0.234567', duty: '0.345678', tax: '0.456789' };
  const lines = [{ itemId: b.item.id, quantity: '1.25', price: '1.234568' }];
  const expected = parse('1.25') * parse('1.234568') +
    (parse(charges.freight) + parse(charges.duty) + parse(charges.tax)) * 1000000n;
  assert.equal(expected, 2580244000000n);
  const exactSpend = `${expected / 1000000000000n}.${String(expected % 1000000000000n).padStart(12, '0')}`;
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [
    limit('2', ownerId), limit('2.580244', buyerId), limit('5', ownerId, { supplierId: null }),
  ] });
  po = await draft({ ...charges, lines });
  po = await h.command('po.routeApproval', { poId: po.id, version: po.version });
  assert.equal(po.approvalRoute.total, exactSpend);
  assert.equal(po.approvalRoute.maxSpend, '2.580244');
  assert.equal(po.approvalRoute.approverId, buyerId);
  const businessExport = async () => {
    const response = await h.request('/api/pier/export'); assert.equal(response.status, 200);
    const { exportedAt, ...business } = await response.json(); return business;
  };
  const unchanged = async (type, payload, options) => {
    const before = await businessExport(), requests = mail.length;
    await h.command(type, payload, options);
    assert.deepEqual(await businessExport(), before, type + ' refusal changes no business record or successful result');
    assert.equal(mail.length, requests, 'refusal makes no network request');
  };
  await unchanged('po.approve', { poId: po.id, version: po.version }, { error: 'APPROVAL_ROUTE' });
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  assert.equal(po.status, 'committed', 'equality at the ceiling admits the exact purchase');
  po = await draft({ ...charges, tax: '0.456790', lines });
  await unchanged('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'SPEND_LIMIT' });

  // An expired delegation never authorizes review; a current one does.
  limits = [limit('5', buyerId, { delegates: [{ actorId: ownerId, expiresAt: '2000-01-01T00:00:00Z' }] })];
  await h.command('purchaseApproval.save', { version: policy.version, limits }, { error: 'APPROVAL_POLICY' });
  limits[0].delegates[0].expiresAt = '2099-01-01T00:00:00Z';
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits });
  po = await draft();
  await h.command('po.approve', { poId: po.id, version: po.version });
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('5', buyerId)] });
  po = (await h.state()).purchaseOrders.find(r => r.id === po.id);
  assert.equal(po.approval, null);
  await h.command('po.commit', { poId: po.id, version: po.version }, { error: 'APPROVAL_ROUTE' });
  const escalationCommand = randomUUID(), escalationReason = 'Buyer absent; explicit owner escalation';
  await unchanged('po.escalateApproval', { poId: po.id, version: po.version, reason: escalationReason }, { as: cookie, error: 'FORBIDDEN' });
  po = await h.command('po.escalateApproval', { poId: po.id, version: po.version, reason: escalationReason }, { commandId: escalationCommand });
  const checkEscalation = async () => {
    const response = await h.request('/api/pier/audit?documentId=' + po.id); assert.equal(response.status, 200);
    const activity = (await response.json()).find(event => event.commandId === escalationCommand);
    assert.equal(activity.actorId, ownerId);
    assert.equal(activity.reason, escalationReason);
    const retained = activity.changes.find(change => change.id === po.id).after.approvalEscalation;
    assert.deepEqual(retained, { policyVersion: policy.version, approverId: ownerId, reason: escalationReason, at: po.approvalEscalation.at, by: ownerId });
    assert.deepEqual((await businessExport()).auditEvents.find(event => event.commandId === escalationCommand), activity);
    return activity;
  };
  const escalation = await checkEscalation();
  await h.restart();
  assert.deepEqual(await checkEscalation(), escalation);
  await h.command('po.approve', { poId: po.id, version: po.version });
  await h.command('po.commit', { poId: po.id, version: po.version });
  // Delegation never elevates an agent, viewer, restricted buyer or inactive person.
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const delegated = () => [limit('5', ownerId, { delegates: [{ actorId: buyerId, expiresAt }] })];
  const saveDelegation = () => h.command('purchaseApproval.save', { version: policy.version, limits: delegated() });
  for (const role of ['agent', 'viewer']) {
    await h.command('role.set', { operatorId: buyerId, role });
    await unchanged('purchaseApproval.save', { version: policy.version, limits: delegated() }, { error: 'APPROVER' });
  }
  for (const restriction of [{ visibility: { costs: false } }, { permissions: { warehouses: ['North'], locationIds: [b.source.id] } }]) {
    await h.command('role.set', { operatorId: buyerId, role: 'buyer', ...restriction });
    await unchanged('purchaseApproval.save', { version: policy.version, limits: delegated() }, { error: 'APPROVER' });
    await h.command('role.set', { operatorId: buyerId, role: 'buyer' });
    policy = await saveDelegation();
    po = await draft();
    await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie });
    await h.command('role.set', { operatorId: buyerId, role: 'buyer', ...restriction });
    await unchanged('po.commit', { poId: po.id, version: po.version }, { error: 'APPROVER_REVOKED' });
  }
  await h.command('role.set', { operatorId: buyerId, role: 'buyer' });
  policy = await saveDelegation();
  po = await draft();
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie });
  await unchanged('po.commit', { poId: po.id, version: po.version }, {
    headers: { 'x-pier-test-now': new Date(Date.parse(expiresAt) + 1).toISOString() }, error: 'APPROVAL_ROUTE',
  });
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('5', ownerId)] });
  po = (await h.state()).purchaseOrders.find(row => row.id === po.id);
  await unchanged('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'APPROVAL_ROUTE' });
  policy = await saveDelegation();
  po = await draft();
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie });
  const factorTime = Date.now(), factorClock = { 'x-pier-test-now': new Date(factorTime).toISOString() };
  const enrollment = await (await h.request('/auth/strong-auth/enroll', { method: 'POST', body: {}, headers: factorClock })).json();
  const verified = await h.request('/auth/strong-auth/verify', { method: 'POST', body: { code: authenticatorCode(enrollment.secret, factorTime) }, headers: factorClock });
  assert.equal(verified.status, 200);
  const status = await h.request('/auth/operator/status', { method: 'POST', body: { operatorId: buyerId, status: 'inactive' } });
  assert.equal(status.status, 200);
  await unchanged('po.commit', { poId: po.id, version: po.version }, { error: 'APPROVER_REVOKED' });
  await unchanged('purchaseApproval.save', { version: policy.version, limits: delegated() }, { error: 'APPROVER' });
  assert.equal((await h.request('/api/pier/state', { as: cookie })).status, 401);
  const reactivated = await h.request('/auth/operator/status', { method: 'POST', body: { operatorId: buyerId, status: 'active' } });
  assert.equal(reactivated.status, 200);
  const reentry = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  const renewedCookie = reentry.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');

  // A valid unconsumed send works before the edit, then its replacement is stopped.
  await h.command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road' });
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('5', ownerId)] });
  const current = async id => (await h.state()).purchaseOrders.find(row => row.id === id);
  const authorize = async () => {
    let purchase = await current((await buy(h, b)).id);
    return h.command('po.authorizeSend', { poId: purchase.id, version: purchase.version, recipient, maxSpend: '5', expiresAt, maxChases: 0, confirm: true });
  };
  let permitted = await authorize();
  await h.command('po.sendApproved', { poId: permitted.id, version: permitted.version });
  assert.equal(mail.length, 1, 'the otherwise identical exact-version grant really sends');
  po = await authorize();
  assert.equal(po.sendPolicy.enabled, true);
  assert.equal(po.sendPolicy.messageId, undefined);
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('5', ownerId)] });
  po = await current(po.id);
  assert.equal(po.approval, null);
  assert.equal(po.sendPolicy.enabled, false);
  await unchanged('po.sendApproved', { poId: po.id, version: po.version }, { error: 'SEND_AUTHORITY' });
  const beforeScheduled = await businessExport();
  await (await h.mf.getWorker()).scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(mail.length, 1);
  assert.deepEqual(await businessExport(), beforeScheduled, 'scheduled admission adds no business effect after policy edit');
  await h.restart();
  await (await h.mf.getWorker()).scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(mail.length, 1);
  assert.deepEqual(await businessExport(), beforeScheduled, 'restart cannot revive the stopped authority');

  // Supplier-specific exception limits cannot fall through to a larger general limit.
  await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, minimum: '1', minimumValue: '10', packSize: '1', price: '0.25', leadDays: 3, code: 'synthetic-pier-4' });
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', buyerId), limit('1', ownerId, { exceptionType: 'minimum-order' })] });
  po = await draft();
  assert.equal(po.minimumOrderValueUnmet, true);
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: renewedCookie, error: 'SPEND_LIMIT' });
  await h.command('role.set', { operatorId: buyerId, role: 'agent' });
  await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', buyerId)] }, { error: 'APPROVER' });
  po = await draft({}, { as: renewedCookie });
  await h.command('po.approve', { poId: po.id, version: po.version }, { as: renewedCookie, error: 'FORBIDDEN' });
  await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', ownerId)] }, { as: renewedCookie, error: 'FORBIDDEN' });
});

test('supplier price and date evidence stops pending sends until exact human review and retains partial cancellations', async t => {
  const mail = [];
  const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'buyer@example.test', MAIL_API_KEY: 'synthetic-pier-1' }, outboundService: async request => {
    mail.push(await request.json()); return Response.json({ id: `synthetic-pier-${mail.length}` });
  } });
  t.after(() => h.close());
  const b = await basics(h);
  await h.command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road' });
  let po = await buy(h, b);
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  const send = po => h.command('po.send', { poId: po.id, version: po.version, recipient: 'supplier@example.test', maxChases: 0, confirm: true });
  const printed = await h.command('print.generate', { kind: 'purchase-order', sourceId: po.id });
  const first = await h.command('print.send', { documentId: printed.id, version: printed.version, recipient: 'supplier@example.test' });
  assert.equal(first.documentId, printed.id);
  assert.equal(mail[0].attachments[0].content, printed.pdf);
  await h.command('po.send', { poId: po.id, version: po.version, recipient: 'supplier@example.test', maxChases: 0, confirm: true }, { error: 'ALREADY_SENT' });
  assert.ok(first.documentId);
  assert.equal(mail.length, 1);
  const ownerId = (await h.state()).actor.id;
  let policy = await h.command('purchaseApproval.save', { limits: [{ supplierId: null, exceptionType: 'any', maxSpend: '3', approverId: ownerId, escalationId: ownerId }] });
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  const payload = { poId: po.id, version: po.version, source: 'synthetic-pier-5', body: 'Supplier raises price and delays delivery', promiseDate: '2026-11-20', destinationWarehouse: b.destination.warehouse, lines: po.lines.map(line => ({ poLineId: line.id, quantity: line.quantity, price: '0.50' })) };
  po = await h.command('po.supplierChange', payload);
  assert.equal(po.approval, null);
  assert.equal(po.lines[0].price, '0.25', 'supplier evidence cannot silently change the commitment');
  await h.command('po.send', { poId: po.id, version: po.version, recipient: 'supplier@example.test', maxChases: 0, confirm: true }, { error: 'SUPPLIER_CHANGE' });
  await h.command('po.reviewSupplierChange', { poId: po.id, version: po.version }, { error: 'APPROVAL' });
  await h.command('po.reviewSupplierChange', { poId: po.id, version: po.version, confirm: true }, { error: 'SPEND_LIMIT' });
  policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [{ supplierId: null, exceptionType: 'any', maxSpend: '10', approverId: ownerId, escalationId: ownerId }] });
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  po = await h.command('po.reviewSupplierChange', { poId: po.id, version: po.version, confirm: true });
  assert.equal(po.lines[0].price, '0.5');
  assert.equal(po.promiseDate, '2026-11-20');
  assert.equal(po.destinationWarehouse, b.destination.warehouse);
  assert.equal(po.supplierChanges[0].source, 'synthetic-pier-5');
  assert.equal(po.supplierChanges[0].previous.lines[0].price, '0.25');
  const second = await send(po);
  assert.notEqual(second.documentId, first.documentId);
  assert.equal(mail.length, 2);
  await h.command('po.send', { poId: po.id, version: po.version, recipient: 'supplier@example.test', maxChases: 0, confirm: true }, { error: 'ALREADY_SENT' });
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-6', lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '3', cost: '0.5' }] });
  po = (await h.state()).purchaseOrders.find(p => p.id === po.id);
  const partial = { poId: po.id, version: po.version, source: 'synthetic-pier-7', body: 'Supplier cancels remaining supply', lines: [{ poLineId: po.lines[0].id, quantity: '3', price: '0.5' }] };
  await h.command('po.supplierChange', { ...partial, lines: [{ ...partial.lines[0], quantity: '2' }] }, { error: 'RECEIPT_LIMIT' });
  po = await h.command('po.supplierChange', partial);
  po = await h.command('po.reviewSupplierChange', { poId: po.id, version: po.version, confirm: true });
  assert.equal(po.lines[0].received, '3');
  assert.equal(po.lines[0].quantity, '3');
  assert.equal((await h.state()).receipts.filter(r => r.poId === po.id).length, 1);
  let cancelled = await buy(h, b);
  cancelled = (await h.state()).purchaseOrders.find(row => row.id === cancelled.id);
  cancelled = await h.command('po.supplierChange', { poId: cancelled.id, version: cancelled.version, source: 'synthetic-pier-8', body: 'Supplier cancels the entire unreceived purchase', lines: cancelled.lines.map(line => ({ poLineId: line.id, quantity: '0', price: line.price })) });
  cancelled = await h.command('po.reviewSupplierChange', { poId: cancelled.id, version: cancelled.version, confirm: true });
  assert.equal(cancelled.status, 'cancelled');
  await h.command('po.send', { poId: cancelled.id, version: cancelled.version, recipient: 'supplier@example.test', maxChases: 0, confirm: true }, { error: 'PO_STATE' });
  await h.invariant();
});
