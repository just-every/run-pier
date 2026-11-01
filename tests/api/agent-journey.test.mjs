import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Explain live records and review exact human-authorized bulk commands", async () => {

  // item-agent: the complete public lifecycle, including refused and uncertain outcomes.
  {
    const keysForQuestion = value => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keysForQuestion(child)]) : [];

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy, receive, parse } = await import("./harness.mjs");

    const exportedBusiness = async h => { const { exportedAt, ...snapshot } = await (await h.request('/api/pier/export')).json(); return snapshot; };


    await phase('item checks prepare current evidence and humans apply, reject and safely undo exact changes without AI', async t => {
      let requests = 0;
      const h = await installation({ outboundService: () => { requests++; throw new Error('No provider is configured'); } });
      t.after(() => h.close());
      const b = await basics(h);
      const terms = await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'BRASS', packSize: '6', price: '2', minimum: '12', leadDays: 6 });
      const po = await buy(h, b, '60');
      const receipt = await receive(h, b, po, '60');
      const sold = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '30', price: '5' }] });
      await h.command('dispatch.create', { orderId: sold.id, shipmentReference: 'Observed shipment', lines: [{ orderLineId: sold.lines[0].id, quantity: '30' }] });
      const policy = await h.command('replenishment.save', { itemId: b.item.id, warehouse: 'North', version: 0, supplierId: b.supplier.id, method: 'fixed', safetyStock: '4', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '50', reorderQuantity: '10', autoDraft: false });
      await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '40', price: '5' }] });
      const before = await h.state(), checkId = randomUUID();
      let review = await h.command('itemAgent.check', { itemId: b.item.id }, { commandId: checkId });
      assert.deepEqual(await h.command('itemAgent.check', { itemId: b.item.id }, { commandId: checkId }), review);
      let state = await h.state();
      assert.deepEqual(state.movements, before.movements);
      assert.deepEqual(state.purchaseOrders, before.purchaseOrders);
      assert.deepEqual(state.supplierItems, before.supplierItems);
      const stock = review.checks.find(c => c.kind === 'stock');
      const openDemand = before.orders.flatMap(o => o.lines).reduce((sum, l) => sum + parse(l.quantity) - parse(l.dispatched) - parse(l.cancelled), 0n);
      assert.equal(parse(stock.values.openDemand), openDemand);
      assert.ok(review.checks.find(c => c.kind === 'cost').evidence.includes(receipt.id));
      const termsHistory = await (await h.request('/api/pier/audit?documentId=' + terms.id)).json();
      const savedTerms = termsHistory.find(event => event.type === 'supplierItem.save').changes.find(change => change.kind === 'supplierItems').after;
      assert.equal(savedTerms.supplierId, b.supplier.id);
      assert.equal(savedTerms.minimum, '12');
      assert.equal(savedTerms.leadDays, 6);

      assert.ok(review.inputVersions.shipments.length);
      await h.command('itemAgent.explain', { proposalId: review.id, version: review.version }, { error: 'AI_SETUP' });
      assert.equal(requests, 0);
      const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
      assert.equal(entered.status, 303);
      const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      const session = await (await h.request('/auth/session', { as: cookie })).json();
      await h.command('role.set', { operatorId: session.operator.id, role: 'agent' });
      const agentReview = await h.command('itemAgent.check', { itemId: b.item.id }, { as: cookie });
      await h.command('itemAgent.apply', { proposalId: agentReview.id, version: agentReview.version, actionId: agentReview.actions[0].id, reason: 'Cannot self approve' }, { as: cookie, error: 'FORBIDDEN' });
      await h.command('ai.save', { version: 0, model: 'account-model', apiKey: 'synthetic-pier-201', consent: true }, { as: cookie, error: 'FORBIDDEN' });
      const price = review.actions.find(a => a.kind === 'supplier-price');
      const applyId = randomUUID(), applyPayload = { proposalId: review.id, version: review.version, actionId: price.id, reason: 'Buyer verified this receipt cost' };
      review = await h.command('itemAgent.apply', applyPayload, { commandId: applyId });
      assert.deepEqual(await h.command('itemAgent.apply', applyPayload, { commandId: applyId }), review);
      assert.equal((await h.state()).supplierItems.find(t => t.id === terms.id).price, receipt.lines[0].cost);
      review = await h.command('itemAgent.undo', { proposalId: review.id, version: review.version, actionId: price.id, reason: 'Restore original terms pending a supplier quote' });
      assert.equal((await h.state()).supplierItems.find(t => t.id === terms.id).price, terms.price);
      const point = review.actions.find(a => a.kind === 'reorder-point');
      const rejectPayload = { proposalId: review.id, version: review.version, actionId: point.id, reason: 'Keep seasonal buyer policy' };
      review = await h.command('itemAgent.reject', rejectPayload);
      assert.equal((await h.state()).replenishmentPolicies.find(p => p.id === policy.id).reorderPoint, policy.reorderPoint);
      const draft = review.actions.find(a => a.kind === 'purchase-draft');
      review = await h.command('itemAgent.apply', { proposalId: review.id, version: review.version, actionId: draft.id, reason: 'Prepare replenishment for separate purchase approval' });
      state = await h.state();
      const applied = review.actions.find(a => a.id === draft.id), prepared = state.purchaseOrders.find(p => p.id === applied.resultId);
      assert.equal(prepared.status, 'draft'); assert.equal(prepared.approval, null);
      assert.deepEqual(state.movements, before.movements);
      review = await h.command('itemAgent.undo', { proposalId: review.id, version: review.version, actionId: draft.id, reason: 'Do not order this batch' });
      assert.ok(!(await h.state()).purchaseOrders.some(p => p.id === applied.resultId));
      // A new demand invalidates the exact review, without partially changing terms.
      const stale = await h.command('itemAgent.check', { itemId: b.item.id });
      await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '1' }] });
      const changed = await h.state();
      await h.command('itemAgent.apply', { proposalId: stale.id, version: stale.version, actionId: stale.actions[0].id, reason: 'Stale inputs must refuse' }, { error: 'STALE' });
      assert.deepEqual((await h.state()).supplierItems, changed.supplierItems);
      const freshReview = await h.command('itemAgent.check', { itemId: b.item.id });
      const pointAction = freshReview.actions.find(a => a.kind === 'reorder-point');
      let pointApplied = await h.command('itemAgent.apply', { proposalId: freshReview.id, version: freshReview.version, actionId: pointAction.id, reason: 'Use observed lead time demand' });
      const soldQuantity = before.shipments.flatMap(s => s.lines).reduce((n, l) => n + parse(l.quantity), 0n);
      const learnedPoint = (soldQuantity * BigInt(policy.leadDays) + BigInt(policy.windowDays) - 1n) / BigInt(policy.windowDays) + parse(policy.safetyStock);
      assert.equal(parse((await h.state()).replenishmentPolicies.find(p => p.id === policy.id).reorderPoint), learnedPoint);
      pointApplied = await h.command('itemAgent.undo', { proposalId: pointApplied.id, version: pointApplied.version, actionId: pointAction.id, reason: 'Restore buyer parameters' });
      assert.equal((await h.state()).replenishmentPolicies.find(p => p.id === policy.id).reorderPoint, policy.reorderPoint);
      const exported = await (await h.request('/api/pier/export')).json();
      assert.ok(exported.proposals.find(p => p.id === review.id).events.some(e => e.outcome === 'undone'));
      assert.ok(exported.commands.some(c => c.id === applyId));
      assert.equal(requests, 0);
      await h.invariant();
    });


    await phase('standalone AI setup encrypts keys and explanations use one declared provider request without automatic retries', async t => {
      const calls = []; let providerFailure = false;
      const h = await installation({ outboundService: async request => {
        assert.equal(request.url, 'https://api.openai.com/v1/responses');
        assert.equal(request.headers.get('authorization'), 'Bearer synthetic-pier-201');
        const body = await request.json(); calls.push(body);
        assert.equal(body.store, false);
        assert.equal(body.model, 'account-model');
        assert.ok(!JSON.parse(body.input).sources);
        if (providerFailure) return Response.json({ error: { message: 'Do not retain raw upstream error synthetic-pier-201' } }, { status: 429 });
        return Response.json({ id: 'resp_test', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'No posted receipts or shipment history support a cost or reorder change.' }] }] });
      } });
      t.after(() => h.close());
      assert.equal((await h.state()).items.length, 0);
      let settings = await h.command('ai.save', { version: 0, model: 'account-model', apiKey: 'synthetic-pier-201', consent: true });
      assert.equal(calls.length, 0, 'Saving settings does not call a paid provider');
      const cipher = await h.db.prepare('SELECT secret FROM pier_channel_secrets WHERE channel_id=?').bind('pier-item-ai').first();
      assert.ok(cipher.secret); assert.ok(!cipher.secret.includes('synthetic-pier-201'));
      const b = await basics(h), check = await h.command('itemAgent.check', { itemId: b.item.id });
      const commandId = randomUUID(), payload = { proposalId: check.id, version: check.version };
      const explained = await h.command('itemAgent.explain', payload, { commandId });
      assert.equal(explained.ai.status, 'completed'); assert.equal(calls.length, 1);
      await h.command('itemAgent.explain', payload, { commandId }); assert.equal(calls.length, 1);
      await h.command('itemAgent.complete', { proposalId: check.id, version: explained.version, operationId: commandId, responseId: 'invented', explanation: 'invented' }, { error: 'AI_INTERNAL' });
      const concurrent = await h.command('itemAgent.check', { itemId: b.item.id }), concurrentId = randomUUID();
      const simultaneous = await Promise.all([0, 1].map(async () => {
        const response = await h.request('/api/pier/commands', { method: 'POST', body: { commandId: concurrentId, type: 'itemAgent.explain', payload: { proposalId: concurrent.id, version: concurrent.version } } });
        return response.json();
      }));
      assert.ok(simultaneous.some(r => r.ok));
      assert.ok(simultaneous.every(r => r.ok || r.error.code === 'AI_UNCONFIRMED'));
      assert.equal(calls.length, 2, 'Concurrent requests share one durable paid request claim');
      providerFailure = true;
      const fresh = await h.command('itemAgent.check', { itemId: b.item.id });
      const failedId = randomUUID(), failedPayload = { proposalId: fresh.id, version: fresh.version };
      const failed = await h.command('itemAgent.explain', failedPayload, { commandId: failedId });
      assert.equal(failed.ai.status, 'failed'); assert.equal(calls.length, 3);
      const health = await (await h.request('/api/pier/integrations')).json();
      const itemHealth = health.connectors.find(row => row.id === 'pier-item-ai');
      assert.equal(itemHealth.uncertain, 1);
      assert.equal(itemHealth.failed, 0);
      assert.ok(itemHealth.lastSuccessfulSync);
      assert.ok(itemHealth.effects.some(row => row.id === fresh.id && row.state === 'uncertain' && row.mapping.includes(b.item.id)));
      assert.ok(!JSON.stringify(health).includes('synthetic-pier-201'));
      assert.ok(!JSON.stringify(health).includes(explained.ai.explanation));
      await h.command('itemAgent.explain', failedPayload, { commandId: failedId }); assert.equal(calls.length, 3);
      const exported = await (await h.request('/api/pier/export')).text();
      assert.ok(!exported.includes('synthetic-pier-201'));
      assert.ok(!exported.includes('Do not retain raw upstream error'));
      settings = await h.command('ai.remove', { version: settings.version });
      assert.equal(settings.configured, false);
      assert.equal((await (await h.request('/api/pier/integrations')).json()).connectors.find(row => row.id === 'pier-item-ai').status, 'paused');
      const without = await h.command('itemAgent.check', { itemId: b.item.id });
      await h.command('itemAgent.explain', { proposalId: without.id, version: without.version }, { error: 'AI_SETUP' });
      assert.equal(calls.length, 3);
      const outcomes = await (await h.request('/api/pier/audit?documentId=' + fresh.id)).json();
      const failure = outcomes.find(event => event.type === 'itemAgent.failed');
      assert.equal(failure.outcome, 'failed');
      assert.equal(failure.changes.find(change => change.kind === 'proposals').after.ai.status, 'failed');
      assert.equal(failure.changes.find(change => change.kind === 'proposals').after.ai.operationId, failedId);
      assert.ok(!JSON.stringify(outcomes).includes('synthetic-pier-201'));
      assert.ok(!JSON.stringify(outcomes).includes('Do not retain raw upstream error'));
      await h.restartWithFreshSigningKey();
      assert.deepEqual(await (await h.request('/api/pier/audit?documentId=' + fresh.id)).json(), outcomes);
    });


    await phase('bulk purchase reviews preview exact rows, edit, apply once with human authority and refuse changed inputs', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h);
      const draft = () => h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Reviewed demand', lines: [{ itemId: b.item.id, quantity: '12', price: '2' }] });
      const first = await draft(), second = await draft(), third = await draft();
      const rows = [first, second, third].map(po => ({ type: 'po.revise', payload: { ...po, poId: po.id, promiseDate: '2026-11-03', reason: 'Review revised delivery' } }));
      const before = await h.state();
      let plan = await h.command('itemAgent.bulkPreview', { rows });
      await h.command('proposal.approve', { proposalId: plan.id, version: plan.version }, { error: 'PROPOSAL' });
      assert.deepEqual((await h.state()).purchaseOrders, before.purchaseOrders);
      assert.equal(plan.rows[0].impact.cash.before.total, '24.000000000000');
      assert.equal(plan.rows[0].after.promiseDate, '2026-11-03');
      assert.deepEqual(plan.rows[0].before, first);
      plan = await h.command('itemAgent.bulkEdit', { proposalId: plan.id, version: plan.version, rows: rows.map(entry => ({ ...entry, payload: { ...entry.payload, promiseDate: '2026-11-04' } })) });
      const entered = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
      const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      const session = await (await h.request('/auth/session', { as: cookie })).json();
      await h.command('role.set', { operatorId: session.operator.id, role: 'agent' });
      // Role changes also invalidate the review; prepare again against that frontier.
      plan = await h.command('itemAgent.bulkPreview', { rows }, { as: cookie });
      await h.command('itemAgent.bulkApply', { proposalId: plan.id, version: plan.version, rowId: plan.rows[0].id, reason: 'Cannot self approve' }, { as: cookie, error: 'FORBIDDEN' });
      const applyId = randomUUID(), payload = { proposalId: plan.id, version: plan.version, rowId: plan.rows[0].id, reason: 'Human accepts exact date and unchanged cash' };
      plan = await h.command('itemAgent.bulkApply', payload, { commandId: applyId });
      assert.deepEqual(await h.command('itemAgent.bulkApply', payload, { commandId: applyId }), plan);
      assert.equal((await h.state()).purchaseOrders.find(po => po.id === first.id).promiseDate, '2026-11-03');
      assert.equal((await h.state()).purchaseOrders.find(po => po.id === first.id).approval, null);
      plan = await h.command('itemAgent.bulkApply', { proposalId: plan.id, version: plan.version, rowId: plan.rows[1].id, reason: 'Review second independently authorized row' });
      assert.equal((await h.state()).purchaseOrders.find(po => po.id === second.id).promiseDate, '2026-11-03');
      await h.command('item.save', { ...b.item, name: 'Changed evidence' });
      const changed = await h.state();
      await h.command('itemAgent.bulkApply', { proposalId: plan.id, version: plan.version, rowId: plan.rows[2].id, reason: 'Must refuse changed evidence' }, { error: 'STALE' });
      assert.deepEqual((await h.state()).purchaseOrders, changed.purchaseOrders);
      await h.restartWithFreshSigningKey();
      const events = await (await h.request('/api/pier/audit?documentId=' + first.id)).json();
      const applied = events.find(event => event.commandId === applyId);
      assert.ok(applied);
      assert.equal(applied.ordinaryCommand.type, 'po.revise');
      assert.equal(applied.authority.role, 'owner');
      assert.deepEqual(await (await h.request('/api/pier/audit?commandId=' + applyId)).json(), [applied]);
      const change = applied.changes.find(change => change.kind === 'purchaseOrders');
      assert.equal(change.before.promiseDate, '2026-11-01');
      assert.equal(change.after.promiseDate, '2026-11-03');
      assert.equal(change.after.lines[0].price, '2');
      const exported = await (await h.request('/api/pier/export')).json();
      assert.deepEqual(exported.auditEvents.find(event => event.commandId === applyId), applied);
      assert.deepEqual((await h.state()).movements, before.movements);
      await h.command('business.save', { name: 'Synthetic Pier', address: 'Synthetic dock' });
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-202', packSize: '1', minimum: '1', price: '2', leadDays: 6 });
      const demand = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '2', price: '4' }] });
      const current = (await h.state()).orders.find(order => order.id === demand.id);
      const promise = { type: 'order.repromise', payload: { orderId: current.id, version: current.version, fingerprint: current.backorderPlan.fingerprint, recipient: 'customer@example.test', confirm: false } };
      const pending = (await h.state()).correspondence;
      await h.command('itemAgent.bulkPreview', { rows: [promise] }, { error: 'APPROVAL' });
      promise.payload.confirm = true;
      const reviewed = await h.command('itemAgent.bulkPreview', { rows: [promise] });
      assert.deepEqual((await h.state()).correspondence, pending, 'Preview queues no customer communication');
      assert.equal(reviewed.rows[0].impact.promise.lines[0].quantity, '2');
      const promised = await h.command('itemAgent.bulkApply', { proposalId: reviewed.id, version: reviewed.version, rowId: reviewed.rows[0].id, reason: 'Human approves exact customer promise' });
      const afterPromise = await h.state();
      assert.equal(afterPromise.orders.find(order => order.id === demand.id).lines[0].backorderPromiseDate, current.backorderPlan.lines[0].expectedDate);
      assert.ok(afterPromise.correspondence.some(message => message.id === promised.rows[0].resultId && message.recipient === 'customer@example.test'));
      await h.command('role.set', { operatorId: session.operator.id, role: 'operator' });
      const operatorEntry = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect:'manual', headers:{'x-rer-dev-key':h.devKey} });
      assert.equal(operatorEntry.status,303);
      const operatorCookie = operatorEntry.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const currentState = await h.state(), pendingPurchase = currentState.purchaseOrders.find(po => po.id === third.id), pendingOrder = currentState.orders.find(order => order.id === demand.id);
      let mixed = await h.command('itemAgent.bulkPreview', { rows: [
        { type:'po.revise', payload:{ ...pendingPurchase, poId:pendingPurchase.id, promiseDate:'2026-11-06', reason:'Review remaining purchase independently' } },
        { type:'order.repromise', payload:{ orderId:pendingOrder.id, version:pendingOrder.version, fingerprint:pendingOrder.backorderPlan.fingerprint, recipient:'reviewed@example.test', confirm:true } },
      ] });
      await h.command('itemAgent.bulkApply', { proposalId:mixed.id, version:mixed.version, rowId:mixed.rows[0].id, reason:'Operator lacks purchase revision authority' }, { as:operatorCookie, error:'FORBIDDEN' });
      assert.deepEqual((await h.state()).purchaseOrders, currentState.purchaseOrders);
      mixed = await h.command('itemAgent.bulkApply', { proposalId:mixed.id, version:mixed.version, rowId:mixed.rows[1].id, reason:'Operator approves only the exact customer promise' }, { as:operatorCookie });
      assert.equal(mixed.rows[1].approval.role, 'operator');
      mixed = await h.command('itemAgent.bulkApply', { proposalId:mixed.id, version:mixed.version, rowId:mixed.rows[0].id, reason:'Owner approves the remaining purchase row' });
      assert.equal(mixed.rows[0].approval.role, 'owner');

    });


    await phase('live stock questions cite current granted bins without costs, customers or outside stock', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h), po = await buy(h, b, '10'); await receive(h, b, po, '10');
      const entered = await fetch(h.origin + '/auth/dev/enter?as=member', { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
      const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      const session = await (await h.request('/auth/session', { as: cookie })).json();
      await h.command('role.set', { operatorId: session.operator.id, role: 'warehouse', permissions: { warehouses: ['North'], locationIds: [b.source.id] } });
      let routing = await h.command('routing.save', { source: 'manual', mode: 'fixed', shortage: 'hold', eligible: ['North'], zones: [] });
      routing = await h.command('routing.preview', { ruleId: routing.id, version: routing.version });
      await h.command('routing.activate', { ruleId: routing.id, version: routing.version });
      const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '12', price: '5' }] });
      const shortageResponse = await h.request('/api/pier/questions?kind=shortage&orderId=' + order.id, { as: cookie });
      assert.equal(shortageResponse.status, 200);
      const shortage = await shortageResponse.json();
      assert.equal(shortage.lines[0].reserved, '10');
      assert.equal(shortage.lines[0].backorder, '2');
      assert.deepEqual(shortage.lines[0].stock.map(position => position.locationId), [b.source.id]);
      assert.ok(!JSON.stringify(shortage).includes(b.customer.id));
      assert.ok(!JSON.stringify(shortage).includes(b.supplier.id));
      assert.ok(!JSON.stringify(shortage).includes(b.destination.id));
      for (const kind of ['margin', 'supplier', 'allocation']) assert.equal((await h.request('/api/pier/questions?kind=' + kind, { as: cookie })).status, 403);
      const extraBin = await h.command('location.save', { name: 'Other North bin', warehouse: 'North', kind: 'bin' });
      assert.equal((await h.request('/api/pier/questions?kind=shortage&orderId=' + order.id, { as: cookie })).status, 403);
      await h.command('role.set', { operatorId: session.operator.id, role: 'warehouse', permissions: { warehouses: ['North'], locationIds: [b.source.id, extraBin.id] } });
      assert.deepEqual((await (await h.request('/api/pier/questions?kind=orders', { as: cookie })).json()).orders.map(row => row.id), [order.id]);
      const question = await (await h.request('/api/pier/questions?kind=stock&itemId=' + b.item.id, { as: cookie })).json();
      assert.equal(question.answer.available, '0');
      assert.deepEqual(question.evidence.map(row => row.locationId), [b.source.id]);
      const shortageKeys = keysForQuestion(shortage);
      assert.ok(!shortageKeys.some(key => /price|cost|supplier|customer/i.test(key)));
      assert.equal(question.stateVersion, (await h.state()).version);
      const serialized = JSON.stringify(question);
      for (const forbidden of [b.customer.id, b.supplier.id, b.destination.id]) assert.ok(!serialized.includes(forbidden), forbidden);
      const keys = value => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
      assert.ok(!keys(question).some(key => /price|cost|supplierSnapshot/i.test(key)));
      assert.equal((await h.request('/api/pier/questions?kind=late', { as: cookie })).status, 403);
      await h.command('role.set', { operatorId: session.operator.id, role: 'warehouse', permissions: { warehouses: [], locationIds: [] } });
      const revoked = await (await h.request('/api/pier/questions?kind=stock&itemId=' + b.item.id, { as: cookie })).json();
      assert.deepEqual(revoked.evidence, []); assert.equal(revoked.answer.available, '0');
    });


    await phase('late purchase answers cite outstanding quantities and stop reporting a completed receipt', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h);
      let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2000-01-01', reason: 'Synthetic overdue purchase', lines: [{ itemId: b.item.id, quantity: '5', price: '2' }] });
      await h.command('po.approve', { poId: po.id, version: po.version });
      po = await h.command('po.commit', { poId: po.id, version: po.version });
      await receive(h, b, po, '2');
      const late = await (await h.request('/api/pier/questions?kind=late')).json();
      assert.deepEqual(late.evidence.map(row => ({ id: row.id, lines: row.lines })), [{ id: po.id, lines: [{ itemId: b.item.id, remaining: '3' }] }]);
      assert.ok(late.evidence[0].version > po.version);
      await receive(h, b, po, '3');
      assert.deepEqual((await (await h.request('/api/pier/questions?kind=late')).json()).evidence, []);
    });


    await phase('supplier and date comparisons validate current terms without changing purchases or customer promises', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h);
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-311', packSize: '1', minimum: '1', price: '2', leadDays: 3 });
      const alternate = await h.command('party.save', { kind: 'supplier', name: 'Alternate synthetic supplier' });
      const terms = await h.command('supplierItem.save', { supplierId: alternate.id, itemId: b.item.id, code: 'synthetic-pier-312', packSize: '1', minimum: '1', price: '3', leadDays: 8 });
      await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', promiseDate: '2026-11-01', lines: [{ itemId: b.item.id, quantity: '2', price: '5' }] });
      const po = await h.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: 'North', promiseDate: '2026-11-01', reason: 'Compare a real alternative', lines: [{ itemId: b.item.id, quantity: '12', price: '2' }] });
      const before = await exportedBusiness(h);
      const response = await h.request('/api/pier/questions?' + new URLSearchParams({ kind: 'supplier', poId: po.id, supplierId: alternate.id, promiseDate: '2026-11-05' }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.before.cash.total, '24.000000000000');
      assert.equal(result.after.cash.total, '36.000000000000');
      assert.equal(result.cashDelta, '12.000000000000');
      assert.equal(result.after.lines[0].termsId, terms.id);
      assert.equal(result.after.promiseDate, '2026-11-05');
      assert.equal(result.affectedPromises.length, 1);
      assert.equal(result.stateVersion, before.version);
      assert.deepEqual(await exportedBusiness(h), before);
      assert.equal((await h.request('/api/pier/questions?' + new URLSearchParams({ kind: 'supplier', poId: po.id, promiseDate: '2026-02-30' }))).status, 409);
      const plan = await h.command('itemAgent.bulkPreview', { rows: [{ ...result.ordinaryCommand, payload: { ...result.ordinaryCommand.payload, reason: 'Human compares supplier price and cash' } }] });
      assert.equal(plan.rows[0].impact.cash.delta, '12.000000000000');
      assert.equal(plan.rows[0].impact.affectedPromises[0].lines[0].quantity, '2');
      assert.equal(plan.rows[0].impact.service.backorders[0].itemId, b.item.id);
      assert.deepEqual((await h.state()).correspondence, []);
    });


    await phase('allocation comparisons cite both orders and refuse excess while leaving live hard reservations unchanged', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h), po = await buy(h, b, '4'); await receive(h, b, po, '4');
      const donor = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '4', price: '4' }] });
      const recipient = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '3', price: '4' }] });
      const before = await exportedBusiness(h);
      const params = new URLSearchParams({ kind: 'allocation', fromOrderId: donor.id, toOrderId: recipient.id, itemId: b.item.id, quantity: '2' });
      const response = await h.request('/api/pier/questions?' + params);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.before[0].lines[0].reserved, '4');
      assert.equal(result.before[1].lines[0].backorder, '3');
      assert.equal(result.after[0].lines[0].backorder, '2');
      assert.equal(result.after[1].lines[0].reserved, '2');
      assert.deepEqual(result.sources.orders.map(row => row.id), [donor.id, recipient.id]);
      assert.deepEqual(await exportedBusiness(h), before);
      params.set('quantity', '5');
      const refused = await h.request('/api/pier/questions?' + params);
      assert.equal(refused.status, 409);
      assert.deepEqual(await exportedBusiness(h), before);
    });


    await phase('live margin answers retain observed losses and expose missing cost as unknown', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h), po = await buy(h, b, '4'); await h.command('receipt.create', { poId: po.id, supplierReference: 'Observed costly delivery', lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '4', cost: '2' }] });
      const loss = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '4', price: '1' }] });
      const unknown = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '3', price: '5' }] });
      const before = await exportedBusiness(h), result = await (await h.request('/api/pier/questions?kind=margin')).json();
      const costed = result.orders.find(row => row.orderId === loss.id), uncosted = result.orders.find(row => row.orderId === unknown.id);
      assert.equal(costed.revenue, '4.000000000000');
      assert.ok(Number(costed.margin) < 0);
      assert.equal(costed.lines[0].costedQuantity, '4');
      assert.equal(uncosted.cost, null); assert.equal(uncosted.margin, null);
      assert.equal(uncosted.lines[0].uncostedQuantity, '3');
      assert.deepEqual(await exportedBusiness(h), before);
    });
  }
});
