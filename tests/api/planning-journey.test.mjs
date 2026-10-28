import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Observe demand, compare bounded replenishment, release backorders and close supplier work", async () => {

  // replenishment: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy, receive, parse } = await import("./harness.mjs");


    // Only the paid network edge is fake. Every business action uses authenticated
    // HTTP through the real Worker, D1 admission and configured provider adapter.
    await phase('sell-through drafts an approved supplier PO and re-promises backorders by email', async t => {
      const mail = [];
      const h = await installation({ bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'purchasing@example.test', MAIL_API_KEY: 'synthetic-pier-1' }, outboundService: async request => {
        assert.equal(request.url, 'https://api.resend.com/emails');
        assert.equal(request.headers.get('authorization'), 'Bearer synthetic-pier-1');
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
      assert.equal(dates.safetyStockWithheld, '4'); assert.equal(dates.sources[0].quantity, '16'); assert.equal(dates.uncovered, '9'); assert.equal(dates.estimated, true);
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



    await phase('bounded workflow dry-runs, vendor and spend limits, worker loss and pause preserve human approval', async t => {
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
      await h.command('workflow.finish', { ...finishPayload, version: finished.version }, { error: 'WORKFLOW_JOB' });
      await h.command('workflow.unsupported', { ...finishPayload, version: finished.version }, { error: 'WORKFLOW_JOB' });
      state = await h.state();
      assert.equal(state.workflowJobs.find(j => j.id === finished.id).status, 'resolved', 'a fresh duplicate cannot erase resolved spend');
      assert.equal(state.workflowJobs.find(j => j.id === finished.id).ruleSnapshot.perRunBudget, '10.000000000000');
      assert.deepEqual(state.purchaseOrders[0].workflow, { ruleId: active.id, ruleVersion: active.version, jobId: finished.id, draftOnly: true });
      assert.equal(state.purchaseOrders.length, 1); assert.equal(state.purchaseOrders[0].status, 'draft'); assert.equal(state.purchaseOrders[0].approval, null); assert.deepEqual(state.movements, before.movements);
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
      let edited = await h.command('workflow.save', { ...config, name: 'Edit invalidates work' });
      edited = await enable(edited);
      const queued = await h.command('workflow.enqueue', { ruleId: edited.id });
      edited = await h.command('workflow.save', { ...config, id: edited.id, version: edited.version, dailyBudget: '1' });
      state = await h.state();
      assert.equal(edited.enabled, false);
      assert.equal(state.workflowJobs.find(j => j.id === queued.id).status, 'failed');
      assert.ok(state.workflowJobs.find(j => j.id === queued.id).escalatedAt);
      assert.equal(state.workflowJobs.find(j => j.id === queued.id).ruleSnapshot.dailyBudget, '10.000000000000');
      await h.command('workflow.claim', { ruleId: edited.id, jobId: queued.id, version: state.workflowJobs.find(j => j.id === queued.id).version }, { error: 'WORKFLOW_JOB' });
      active = await h.command('workflow.pause', { ruleId: active.id, version: active.version });
      await h.command('workflow.enqueue', { ruleId: active.id }, { error: 'WORKFLOW_PAUSED' });
      active = await h.command('workflow.kill', { ruleId: active.id, version: active.version });
      await h.command('workflow.save', { ...config, id: active.id, version: active.version }, { error: 'WORKFLOW_KILLED' });
    });



    await phase('native channel demand and shipments reconcile once across dispatch, cancellation and planning windows', async t => {
      const h = await installation({ outboundService: async request => {
        const url = new URL(request.url);
        assert.equal(url.hostname, 'demand.example.test');
        if (request.method === 'PUT') return Response.json({ id: 1, ...await request.json() });
        if (url.pathname.endsWith('/products')) return Response.json([{ id: 1, name: 'Brass bolt', type: 'simple', sku: 'BOLT' }]);
        assert.ok(url.pathname.endsWith('/orders'));
        return Response.json([{ id: 1, number: 'synthetic-pier-1', status: 'processing', currency: 'USD', billing: { first_name: 'Buyer', last_name: '' }, refunds: [], line_items: [{ id: 1, sku: 'BOLT', quantity: 10, price: 2 }] }]);
      } }); t.after(() => h.close());
      const b = await basics(h);
      await receive(h, b, await buy(h, b, '60'), '60');
      const manual = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '5', price: '2' }] });
      await h.command('dispatch.create', { orderId: manual.id, shipmentReference: 'synthetic-pier-2', lines: [{ orderLineId: manual.lines[0].id, quantity: '5' }] });
      await h.command('channel.save', { name: 'Native demand', provider: 'woocommerce', baseUrl: 'https://demand.example.test', warehouse: 'North', credentials: { consumerKey: 'synthetic-pier-3', consumerSecret: 'synthetic-pier-4' } });
      let state = await h.state();
      const source = state.channelOrders[0], order = state.orders.find(o => o.id === source.orderId);
      assert.ok(order, JSON.stringify(state.channels));
      const forecast = s => s.forecasts.find(f => f.itemId === b.item.id && f.warehouse === 'North');
      const evidence = s => forecast(s).windows.find(w => w.days === 30);
      assert.equal(forecast(state).observedSold, '15');
      assert.equal(evidence(state).nativeShippedQuantity, '5'); assert.equal(evidence(state).channelOrderedQuantity, '10');
      assert.deepEqual(evidence(state).channelOrderIds, [source.id]);
      assert.equal(state.forecasts.find(f => f.itemId === b.item.id && f.warehouse === 'South').observedSold, '0');
      await h.command('channel.sync', {});
      await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-5', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] });
      state = await h.invariant(); assert.equal(forecast(state).observedSold, '15', 'channel dispatch never adds the same demand twice');
      await h.command('order.cancel', { orderId: order.id, reason: 'Cancel the six unshipped units' });
      state = await h.state(); assert.equal(forecast(state).observedSold, '9'); assert.equal(evidence(state).channelOrderedQuantity, '4');
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-6', packSize: '1', price: '2', minimum: '1', leadDays: 10 });
      state = await h.state();
      const policy = await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', windowDays: 30, leadDays: 10, reviewDays: 10, applyLearned: true, stateVersion: state.version });
      assert.equal(policy.reorderPoint, '3'); assert.deepEqual(policy.learnedApplication.channelOrderIds, [source.id]);
      state = await h.state();
      assert.equal(forecast(state).windows.find(w => w.days === 90).soldPerDay, '0.1');
      await h.command('replenishment.configure', { version: 0, mode: 'company', warehouses: ['North', 'South'], destinationWarehouse: 'North' });
      state = await h.state(); assert.equal(forecast(state).observedSold, '9'); assert.deepEqual(evidence(state).channelOrderIds, [source.id]);
    });



    await phase('cash and service horizon comparisons net supply and drafts with exact supplier rounding', async t => {
      const h = await installation(); t.after(() => h.close()); const b = await basics(h);
      await receive(h, b, await buy(h, b, '30'), '30');
      const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '30' }] });
      await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-1', lines: [{ orderLineId: order.lines[0].id, quantity: '30' }] });
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-2', packSize: '6', minimum: '12', price: '2', leadDays: 6 });
      await h.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '4', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '10', reorderQuantity: '10', freight: '6', duty: '2' });
      const before = await h.state();
      const request = { itemId: b.item.id, warehouse: 'North', cashCeiling: '44' };
      const comparison = await h.command('replenishment.compare', request);
      const options = Object.fromEntries(comparison.options.map(o => [o.name, o]));
      assert.equal(options.minimum.quantity, '12'); assert.equal(options.minimum.expectedLandedCost, '32.000000000000');
      assert.equal(options.recommended.quantity, '24'); assert.equal(options.recommended.expectedLandedCost, '56.000000000000');
      assert.equal(options.stretch.quantity, '30'); assert.equal(options.stretch.expectedLandedCost, '68.000000000000');
      assert.equal(options['cash-constrained'].quantity, '18'); assert.equal(options['cash-constrained'].expectedLandedCost, '44.000000000000');
      assert.equal(options['cash-constrained'].uncoveredAtHorizon, '2'); assert.equal(options.recommended.withinCashCeiling, false);
      let state = await h.state(); assert.deepEqual(state.purchaseOrders, before.purchaseOrders); assert.deepEqual(state.movements, before.movements);
      const unaffordable = await h.command('replenishment.compare', { ...request, cashCeiling: '31' });
      assert.equal(unaffordable.options[3].executable, false); assert.equal(unaffordable.options[3].quantity, '0');
      state = await h.state();
      const refreshed = await h.command('replenishment.compare', request);
      const selected = { stateVersion: refreshed.stateVersion, lines: [{ itemId: b.item.id, warehouse: 'North', quantity: options['cash-constrained'].quantity }] };
      const drafted = await h.command('replenishment.plan', selected);
      const po = drafted.drafts[0]; assert.equal(po.lines[0].quantity, '18'); assert.equal(po.replenishment.expectedLandedCost, '44.000000000000');
      await h.command('replenishment.plan', selected, { error: 'STALE' });
      const rerun = await h.command('replenishment.compare', request);
      assert.equal(rerun.options[3].quantity, '0', 'remaining six units cannot meet the supplier minimum alongside an existing draft');
      assert.match(rerun.options[3].reason, /Existing drafts/);
      await h.command('po.approve', { poId: po.id, version: po.version });
      const committed = await h.command('po.commit', { poId: po.id, version: po.version });
      await h.command('receipt.create', { poId: committed.id, supplierReference: 'synthetic-pier-3', lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '18', cost: '2' }] });
      const received = await h.command('replenishment.compare', request);
      assert.equal(received.options[0].quantity, '0'); assert.equal(received.options[1].quantity, '12'); assert.equal(received.options[1].executable, false, 'comparison does not bypass the buyer-applied reorder point');
      assert.equal((await h.invariant()).positions.find(p => p.itemId === b.item.id && p.locationId === b.source.id).quantity, '18');

    });


    await phase('owner priority ranks dated supply and reviewed receipt releases preserve allocations and reject changed evidence', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h);
      const customers = [b.customer];
      for (let i = 1; i < 3; i++) customers.push(await h.command('party.save', { kind: 'customer', name: `synthetic-pier-priority-${i}` }));
      for (let i = 0; i < 3; i++) customers[i] = await h.command('backorder.customerPriority', { customerId: customers[i].id, version: customers[i].version, priority: i * 10, reason: 'Owner reviewed priority' });
      const orders = [];
      for (const customer of customers) orders.push(await h.command('order.create', { customerId: customer.id, promiseDate: '2026-11-01', warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '2' }] }));
      let priority = await h.command('backorder.priority', { version: 0, priority: ['customerPriority', 'promiseDate', 'orderDate'], reason: 'Customer priority first' });
      let po = await buy(h, b, '4');
      const receipt = await receive(h, b, po, '4');
      let release = await h.command('backorder.prepare', { receiptId: receipt.id, warehouse: 'North', reason: 'Review received supply' });
      assert.deepEqual(release.orders.map(o => o.orderId), [orders[2].id, orders[1].id]);
      assert.deepEqual(release.orders.map(o => o.added), ['2', '2']);
      assert.equal((await h.state()).reservations.length, 0, 'preparing allocates no stock');
      priority = await h.command('backorder.priority', { version: priority.version, priority: ['promiseDate', 'orderDate', 'customerPriority'], reason: 'Changed owner priority' });
      await h.command('backorder.release', { releaseId: release.id, version: release.version }, { error: 'STALE' });
      await h.command('backorder.priority', { version: priority.version, priority: ['customerPriority', 'promiseDate', 'orderDate'], reason: 'Restore priority for this receipt' });
      release = await h.command('backorder.prepare', { receiptId: receipt.id, warehouse: 'North', reason: 'Fresh allocation review' });
      const commandId = crypto.randomUUID(), payload = { releaseId: release.id, version: release.version };
      const applied = await h.command('backorder.release', payload, { commandId });
      assert.equal(applied.status, 'released');
      assert.deepEqual(await h.command('backorder.release', payload, { commandId }), applied);
      const state = await h.state();
      assert.equal(state.orders.find(o => o.id === orders[0].id).lines[0].reserved, '0');
      assert.equal(state.orders.find(o => o.id === orders[2].id).lines[0].reserved, '2');
      const empty = await h.command('backorder.prepare', { receiptId: receipt.id, warehouse: 'North', reason: 'Already fully reserved' });
      assert.deepEqual(empty.orders, []);
      await h.command('backorder.release', { releaseId: empty.id, version: empty.version }, { error: 'BACKORDER_EMPTY' });
      await h.command('supplierItem.save', {supplierId:b.supplier.id,itemId:b.item.id,code:'synthetic-pier-safety',packSize:'1',minimum:'1',price:'2',leadDays:21});
      await h.command('replenishment.save', {itemId:b.item.id,warehouse:'North',version:0,supplierId:b.supplier.id,method:'fixed',safetyStock:'2',reorderPoint:'0',reorderQuantity:'1',autoDraft:false});
      const buffered = await h.command('order.create', {customerId:b.customer.id,warehouse:'North',promiseDate:'2026-11-01',lines:[{itemId:b.item.id,quantity:'4'}]});
      let futurePo = await h.command('po.draft', {supplierId:b.supplier.id,destinationWarehouse:'North',promiseDate:'2026-11-01',reason:'Warehouse safety buffer',lines:[{itemId:b.item.id,quantity:'5',price:'2'}]});
      await h.command('po.approve',{poId:futurePo.id,version:futurePo.version}); futurePo = await h.command('po.commit',{poId:futurePo.id,version:futurePo.version});
      let bufferedState = await h.state();
      const bufferPlan = bufferedState.orders.find(order => order.id === buffered.id).backorderPlan.lines[0];
      assert.equal(bufferPlan.safetyStock,'2'); assert.equal(bufferPlan.safetyStockWithheld,'2');
      assert.equal(bufferPlan.sources.find(source=>source.poId===futurePo.id).quantity,'1','the buffer is held once before older competing demand');
      assert.equal(bufferPlan.uncovered,'3');
      assert.deepEqual(bufferedState.reservations,state.reservations,'ATP does not move physical allocations');

      await h.invariant();
    });


    await phase('captured channel demand retains stockout exposure, reviewed seasonal bounds and a held-out backtest', async t => {
      const now = '2026-10-31T00:00:00.000Z';
      const h = await installation({ now, outboundService: async request => {
        const url = new URL(request.url);
        assert.equal(url.hostname, 'forecast.example.test');
        if (request.method === 'PUT') return Response.json({ id: 1, ...await request.json() });
        return Response.json(url.pathname.endsWith('/products') ? [{ id: 1, name: 'Brass bolt', type: 'simple', sku: 'BOLT' }]
          : [{ id: 1, number: 'synthetic-pier-forecast-1', status: 'processing', currency: 'USD', billing: { first_name: 'Buyer', last_name: '' }, refunds: [], line_items: [{ id: 1, sku: 'BOLT', quantity: 30, price: 8 }] }]);
      } }); t.after(() => h.close());
      const b = await basics(h);
      const at = date => ({ headers: { 'x-pier-test-now': date } });
      const oldPo = await buy(h, b, '30');
      await h.command('receipt.create', { poId: oldPo.id, supplierReference: 'synthetic-pier-forecast-2', lines: [{ poLineId: oldPo.lines[0].id, locationId: b.source.id, quantity: '30', cost: '2' }] }, at('2026-10-01T00:00:00.000Z'));
      await h.command('channel.save', { name: 'Forecast source', provider: 'woocommerce', baseUrl: 'https://forecast.example.test', warehouse: 'North', credentials: { consumerKey: 'synthetic-pier-forecast-3', consumerSecret: 'synthetic-pier-forecast-4' } }, at('2026-10-06T00:00:00.000Z'));
      const captured = await h.state(), source = captured.channelOrders[0], order = captured.orders.find(o => o.id === source.orderId);
      assert.ok(order);
      await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-forecast-5', lines: [{ orderLineId: order.lines[0].id, quantity: '30' }] }, at('2026-10-11T00:00:00.000Z'));
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-forecast-6', packSize: '6', minimum: '12', price: '2', leadDays: 6 });
      const config = { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '20', reorderQuantity: '30', freight: '0', duty: '0' };
      const factors = { seasonality: { low: '1', expected: '1.5', high: '2', source: 'Buyer seasonal plan, synthetic-pier-forecast-7' }, promotion: { low: '1', expected: '2', high: '3', source: 'Approved promotion, synthetic-pier-forecast-8' } };
      const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
      const viewer = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      await h.command('replenishment.save', { ...config, forecastAssumptions: factors }, { as: viewer, error: 'FORBIDDEN' });
      await h.command('replenishment.compare', { itemId: b.item.id, warehouse: 'North', cashCeiling: '120' }, { as: viewer, error: 'FORBIDDEN' });
      const invalid = { ...factors, seasonality: { ...factors.seasonality, low: '2' } };
      await h.command('replenishment.save', { ...config, forecastAssumptions: invalid }, { error: 'FORECAST_ASSUMPTIONS' });
      const policy = await h.command('replenishment.save', { ...config, forecastAssumptions: factors });
      const request = { itemId: b.item.id, warehouse: 'North', cashCeiling: '120' };
      const before = await h.state();
      const comparison = await h.command('replenishment.compare', request), forecast = comparison.optimization.forecast;
      assert.equal(forecast.observed, '30'); assert.equal(forecast.correctedWindowDemand, '90');
      assert.equal(forecast.availability.availableMs, 10 * 86400000); assert.equal(forecast.availability.stockoutMs, 20 * 86400000);
      assert.deepEqual([forecast.low, forecast.expected, forecast.high], ['30', '270', '540']);
      assert.deepEqual([forecast.backtest.trainingActual, forecast.backtest.predicted, forecast.backtest.actual, forecast.backtest.absoluteError], ['30', '30', '0', '30']);
      assert.deepEqual(comparison.optimization.realizedMargin.shipmentIds, [(await h.state()).shipments[0].id]);
      assert.deepEqual([comparison.optimization.realizedMargin.revenue, comparison.optimization.realizedMargin.cost, comparison.optimization.realizedMargin.margin], ['240.000000000000', '60.000000000000', '180.000000000000']);
      const ranked = comparison.optimization.rankings;
      assert.equal(ranked.cash.length, 1); assert.equal(ranked.service.length, 1);
      assert.equal(ranked.cash[0].quantity, '60'); assert.equal(ranked.cash[0].expectedLandedCost, '120.000000000000');
      assert.equal(ranked.service[0].quantity, '468');
      const after = await h.state(); assert.deepEqual(after.movements, before.movements); assert.deepEqual(after.purchaseOrders, before.purchaseOrders);
      const unaffordable = await h.command('replenishment.compare', { ...request, cashCeiling: '1' });
      assert.deepEqual(unaffordable.optimization.rankings.cash, []);
      const currentChoice = (await h.command('replenishment.compare', request)).optimization.rankings.cash[0];
      const selected = await h.command(currentChoice.command.type, currentChoice.command.payload);
      let forecastPo = selected.drafts[0];
      await h.command('po.approve', { poId: forecastPo.id, version: forecastPo.version });
      forecastPo = await h.command('po.commit', { poId: forecastPo.id, version: forecastPo.version });
      const received = await h.command('receipt.create', { poId: forecastPo.id, supplierReference: 'synthetic-pier-prospective-1',
        lines: [{ poLineId: forecastPo.lines[0].id, locationId: b.source.id, quantity: '15', cost: '2' }] }, at('2026-11-02T00:00:00.000Z'));
      const laterOrder = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '15', price: '8' }] }, at('2026-11-02T00:00:00.000Z'));
      const laterShipment = await h.command('dispatch.create', { orderId: laterOrder.id, shipmentReference: 'synthetic-pier-prospective-2',
        lines: [{ orderLineId: laterOrder.lines[0].id, quantity: '15' }] }, at('2026-11-02T00:00:00.000Z'));
      const prospective = (await h.command('replenishment.review', { poId: forecastPo.id }, at('2026-11-02T00:00:00.000Z'))).followThrough;
      assert.equal(prospective.lines[0].forecast.expected, '270', 'later actuals cannot rewrite the retained seasonal and promotion scenario');
      assert.deepEqual([prospective.lines[0].predictedLow, prospective.lines[0].predicted, prospective.lines[0].predictedHigh], ['2', '18', '36']);
      assert.equal(prospective.lines[0].actual, '15'); assert.equal(prospective.lines[0].absoluteError, '3');
      assert.equal(prospective.lines[0].difference, '-3'); assert.equal(prospective.lines[0].withinScenario, true);
      assert.deepEqual(prospective.lines[0].shipmentIds, [laterShipment.id]); assert.deepEqual(prospective.receiptIds, [received.id]);
      assert.equal(prospective.remaining, '45'); assert.equal(prospective.status, 'open');
      assert.deepEqual([prospective.expectedLandedCost, prospective.actualLandedCost, prospective.landedCostDifference], ['120.000000000000', '30.000000000000', '-90.000000000000']);
      await h.command('replenishment.save', { ...config, id: policy.id, version: policy.version, forecastAssumptions: null });
      assert.equal((await h.command('replenishment.compare', request)).optimization.forecast.expected, '90');
      const fresh = await h.command('item.save', { sku: 'synthetic-pier-forecast-9', name: 'Unobserved item', unit: 'each', packSize: '1' });
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: fresh.id, code: 'synthetic-pier-forecast-10', packSize: '1', minimum: '1', price: '2', leadDays: 6 });
      await h.command('replenishment.save', { ...config, itemId: fresh.id });
      const missing = (await h.command('replenishment.compare', { ...request, itemId: fresh.id })).optimization;
      assert.equal(missing.forecast.correctedWindowDemand, null); assert.equal(missing.forecast.correctionStatus, 'insufficient exposure history');
      assert.equal(missing.realizedMargin.unitRevenue, null);
      const member = (await (await h.request('/auth/session', { as: viewer })).json()).operator;
      await h.command('role.set', { operatorId: member.id, role: 'buyer' });
      const restricted = (await h.command('replenishment.compare', request, { as: viewer })).optimization;
      assert.equal(restricted.realizedMargin.revenue, null); assert.equal(restricted.realizedMargin.margin, null);
      assert.deepEqual(restricted.realizedMargin.shipmentIds, []);
      assert.ok(restricted.alternatives.length > 0); assert.ok(restricted.alternatives.every(option => option.expectedContribution === null));
      await h.command('role.set', { operatorId: member.id, role: 'buyer', visibility: { costs: false } });
      await h.command('replenishment.compare', request, { as: viewer, error: 'VISIBILITY' });
      await h.command('replenishment.review', { poId: oldPo.id }, { as: viewer, error: 'VISIBILITY' });
      await h.invariant();
    });


    await phase('supplier delays and realized contribution rank bounded purchases while transfer comparisons protect source demand', async t => {
      const h = await installation({ now: '2026-10-31T00:00:00.000Z' }); t.after(() => h.close()); const b = await basics(h);
      const at = date => ({ headers: { 'x-pier-test-now': date } });
      const alternate = await h.command('party.save', { kind: 'supplier', name: 'synthetic-pier-alternate-1' });
      const receiveAt = async (supplier, location, quantity, due, arrived) => {
        let po = await h.command('po.draft', { supplierId: supplier.id, destinationWarehouse: location.warehouse, promiseDate: due, reason: 'Retained supplier evidence', lines: [{ itemId: b.item.id, quantity, price: '2' }] });
        await h.command('po.approve', { poId: po.id, version: po.version }); po = await h.command('po.commit', { poId: po.id, version: po.version });
        await h.command('receipt.create', { poId: po.id, supplierReference: `synthetic-pier-${supplier.id}-${location.id}`, lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity, cost: '2' }] }, at(arrived));
        return po;
      };
      const late = await receiveAt(b.supplier, b.source, '30', '2026-10-01', '2026-10-06T00:00:00.000Z');
      await receiveAt(alternate, b.destination, '40', '2026-10-01', '2026-10-01T00:00:00.000Z');
      const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '30', price: '8' }] });
      await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-ranking-1', lines: [{ orderLineId: order.lines[0].id, quantity: '30' }] });
      for (const [supplier, price] of [[b.supplier, '2'], [alternate, '3']]) await h.command('supplierItem.save', { supplierId: supplier.id, itemId: b.item.id, code: `synthetic-pier-${supplier.id}`, packSize: '1', minimum: '1', price, leadDays: 6 });
      const config = { version: 0, itemId: b.item.id, supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', leadDays: 6, windowDays: 30, reviewDays: 10, reorderPoint: '20', reorderQuantity: '30' };
      await h.command('replenishment.save', { ...config, warehouse: 'North' });
      await h.command('replenishment.save', { ...config, warehouse: 'South', safetyStock: '5' });
      const result = (await h.command('replenishment.compare', { itemId: b.item.id, warehouse: 'North', cashCeiling: '60' })).optimization;
      assert.deepEqual(result.rankings.cash.map(o => o.supplierId), [b.supplier.id, alternate.id]);
      assert.deepEqual(result.rankings.service.map(o => o.supplierId), [alternate.id, b.supplier.id]);
      assert.equal(result.rankings.cash[0].reliability.delayDays, 5); assert.equal(result.rankings.cash[0].leadDays, 11);
      assert.equal(result.rankings.cash[0].reliability.samples[0].poId, late.id);
      assert.equal(result.transfers.length, 1); assert.equal(result.transfers[0].quantity, '26'); assert.equal(result.transfers[0].available, true); assert.equal(result.transfers[0].executable, false); assert.equal(result.transfers[0].protectedSafetyStock, '5');
      const quotes = [{ fromLocationId: b.destination.id, toLocationId: b.source.id, transitLocationId: b.transit.id,
        expectedDate: '2026-11-02', transportCost: '10', reason: 'Reviewed internal carrier estimate' }];
      const request = { itemId: b.item.id, warehouse: 'North', cashCeiling: '60', transferQuotes: quotes };
      const compared = (await h.command('replenishment.compare', request)).optimization;
      assert.deepEqual(compared.rankings.cash.map(o => o.kind), ['transfer', 'purchase', 'purchase']);
      assert.equal(compared.rankings.cash[0].quantity, '16');
      assert.equal(compared.rankings.cash[0].expectedLandedCost, '10.000000000000');
      assert.equal(compared.rankings.cash[0].expectedContribution, '86.000000000000');
      assert.equal(compared.rankings.service[0].kind, 'transfer');
      assert.equal(compared.rankings.service[0].quantity, '26');
      assert.equal(compared.rankings.service[0].expectedDate, '2026-11-02');
      assert.equal((await h.command('replenishment.compare', { ...request, cashCeiling: '9' })).optimization.rankings.cash.length, 2,
        'a transport quote over budget cannot compete in the cash ranking');
      const lateTransfer = (await h.command('replenishment.compare', { ...request, transferQuotes: [{ ...quotes[0], expectedDate: '2027-01-01' }] })).optimization;
      assert.equal(lateTransfer.transfers[0].executable, false); assert.ok(lateTransfer.rankings.cash.every(o => o.kind === 'purchase'));
      await h.command('replenishment.compare', { ...request, transferQuotes: [{ ...quotes[0], transportCost: '-1' }] }, { error: 'DECIMAL' });
      const freshTransfer = (await h.command('replenishment.compare', request)).optimization.rankings.cash[0];
      const demand = await h.command('order.create', { customerId: b.customer.id, warehouse: 'South', lines: [{ itemId: b.item.id, quantity: '38', price: '8' }] });
      assert.equal(demand.lines[0].reserved, '38');
      const blocked = (await h.command('replenishment.compare', { itemId: b.item.id, warehouse: 'North', cashCeiling: '60' })).optimization;
      assert.equal(blocked.transfers[0].quantity, '0'); assert.equal(blocked.transfers[0].available, false); assert.equal(blocked.transfers[0].executable, false);
      const before = await h.state();
      await h.command(freshTransfer.command.type, freshTransfer.command.payload, { error: 'STALE' });
      assert.deepEqual((await h.state()).movements, before.movements);
      const protectedResponse = await h.command('replenishment.compare', request), protectedTransfer = protectedResponse.optimization;
      assert.ok(protectedTransfer.transfers.every(o => o.quantity === '0' && !o.executable));
      await h.command('transfer.send', { ...freshTransfer.command.payload, stateVersion: protectedResponse.stateVersion, quantity: '1' }, { error: 'TRANSFER_REVIEW' });
      assert.deepEqual((await h.state()).movements, before.movements);
      await h.command('order.cancel', { orderId: demand.id, version: demand.version, reason: 'Buyer cancelled source demand' });
      const entered = await h.request('/auth/dev/enter?as=member', { headers: { 'x-rer-dev-key': h.devKey } });
      const cookie = entered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const member = (await (await h.request('/auth/session', { as: cookie })).json()).operator.id;
      await h.command('role.set', { operatorId: member, role: 'warehouse' });
      let selected = (await h.command('replenishment.compare', request)).optimization.rankings.cash[0];
      await h.command('role.set', { operatorId: member, role: 'viewer' });
      const beforeRevoked = await h.state();
      await h.command(selected.command.type, { ...selected.command.payload, stateVersion: beforeRevoked.version }, { as: cookie, error: 'FORBIDDEN' });
      assert.deepEqual((await h.state()).movements, beforeRevoked.movements, 'revocation cannot dispatch the reviewed transfer');
      selected = (await h.command('replenishment.compare', request)).optimization.rankings.cash[0];
      const commandId = randomUUID();
      const sent = await h.command(selected.command.type, selected.command.payload, { commandId });
      assert.equal(sent.quantity, '16'); assert.equal(sent.transportCost, '10'); assert.equal(sent.expectedDate, '2026-11-02');
      assert.deepEqual(await h.command(selected.command.type, selected.command.payload, { commandId }), sent);
      await h.command('transfer.receive', { transferId: sent.id, version: sent.version, quantity: '16' });
      const final = await h.invariant();
      assert.equal(final.positions.find(p => p.itemId === b.item.id && p.locationId === b.source.id && p.status === 'sellable').quantity, '16');
      assert.equal(final.positions.find(p => p.itemId === b.item.id && p.locationId === b.destination.id && p.status === 'sellable').quantity, '24');
      const shipment = final.shipments.find(sh => sh.orderId === order.id);
      let returned = await h.command('return.create', { shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, locationId: b.source.id, quantity: '6', reason: 'Customer returned six units' });
      let net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.deepEqual([net.revenue, net.cost, net.margin, net.returnedQuantity], ['192.000000000000', '60.000000000000', '132.000000000000', '6']);
      assert.deepEqual(net.returnIds, [returned.id]);
      await h.command('return.approve', { returnId: returned.id, version: returned.version });
      returned = (await h.state()).returns.find(r => r.id === returned.id);
      await h.command('return.restock', { returnId: returned.id, version: returned.version });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.deepEqual([net.revenue, net.cost, net.margin, net.recoveredCost], ['192.000000000000', '48.000000000000', '144.000000000000', '12.000000000000']);
      await h.command('sales.taxTable', { state: 'CA', rate: '0', reason: 'Owner-reviewed synthetic jurisdiction' });
      let invoice = await h.command('invoice.draft', { orderId: order.id, shipmentId: shipment.id, unitPrices: [{ orderLineId: order.lines[0].id, price: '6' }],
        priceReason: 'Exact customer price correction', charges: [{ kind: 'discount', amount: '30', taxable: false }] });
      assert.equal((await h.command('replenishment.compare', request)).optimization.realizedMargin.revenue, '192.000000000000', 'an unapproved invoice does not replace actual order pricing');
      invoice = await h.command('invoice.review', { invoiceId: invoice.id, version: invoice.version });
      invoice = await h.command('invoice.authorize', { invoiceId: invoice.id, version: invoice.version });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.deepEqual([net.revenue, net.cost, net.margin], ['120.000000000000', '48.000000000000', '72.000000000000']);
      assert.deepEqual(net.invoiceIds, [invoice.id]);
      let credit = await h.command('invoice.credit.draft', { invoiceId: invoice.id, kind: 'price', reason: 'Customer price concession', lines: [{ invoiceLineId: invoice.lines[0].id, amount: '12' }] });
      assert.equal((await h.command('replenishment.compare', request)).optimization.realizedMargin.revenue, '120.000000000000', 'an unapproved credit cannot change realized contribution');
      credit = await h.command('invoice.credit.review', { creditId: credit.id, version: credit.version });
      credit = await h.command('invoice.credit.authorize', { creditId: credit.id, version: credit.version });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.deepEqual([net.revenue, net.margin], ['108.000000000000', '60.000000000000']);
      let returnCredit = await h.command('invoice.credit.draft', { invoiceId: invoice.id, kind: 'return', returnId: returned.id, reason: 'Settle returned goods', lines: [{ invoiceLineId: invoice.lines[0].id, quantity: '6' }] });
      returnCredit = await h.command('invoice.credit.review', { creditId: returnCredit.id, version: returnCredit.version });
      await h.command('invoice.credit.authorize', { creditId: returnCredit.id, version: returnCredit.version });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.deepEqual([net.revenue, net.margin, net.returnValue, net.creditAdjustments], ['102.000000000000', '54.000000000000', '36.000000000000', '48.000000000000'], 'settled credit replaces the return reserve, never subtracting both');
      assert.equal(net.creditIds.length, 2);
      const prepay = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '10', price: '8' }] });
      await h.command('invoice.policy', { orderId: prepay.id, mode: 'prepay', terms: { kind: 'dueReceipt' }, reason: 'Reviewed prepay customer order' });
      let prepaid = await h.command('invoice.draft', { orderId: prepay.id });
      prepaid = await h.command('invoice.review', { invoiceId: prepaid.id, version: prepaid.version });
      prepaid = await h.command('invoice.authorize', { invoiceId: prepaid.id, version: prepaid.version });
      const firstSplit = await h.command('dispatch.create', { orderId: prepay.id, shipmentReference: 'synthetic-pier-prepay-1', lines: [{ orderLineId: prepay.lines[0].id, quantity: '5' }] });
      await h.command('dispatch.create', { orderId: prepay.id, shipmentReference: 'synthetic-pier-prepay-2', lines: [{ orderLineId: prepay.lines[0].id, quantity: '5' }] });
      const splitReturn = await h.command('return.create', { shipmentId: firstSplit.id, shipmentLineId: firstSplit.lines[0].id, locationId: b.source.id, quantity: '2', reason: 'Return from first prepay shipment only' });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.equal(net.revenue, '166.000000000000');
      let splitCredit = await h.command('invoice.credit.draft', { invoiceId: prepaid.id, kind: 'return', returnId: splitReturn.id, reason: 'Settle first prepay shipment return', lines: [{ invoiceLineId: prepaid.lines[0].id, quantity: '2' }] });
      splitCredit = await h.command('invoice.credit.review', { creditId: splitCredit.id, version: splitCredit.version });
      await h.command('invoice.credit.authorize', { creditId: splitCredit.id, version: splitCredit.version });
      net = (await h.command('replenishment.compare', request)).optimization.realizedMargin;
      assert.equal(net.revenue, '166.000000000000', 'a prepay return credit belongs to its physical shipment and replaces the whole reserve once');
      assert.equal(net.cost, '68.000000000000'); assert.equal(net.margin, '98.000000000000');
      const lossOrder = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '2', price: '1' }] });
      const lossShipment = await h.command('dispatch.create', { orderId: lossOrder.id, shipmentReference: 'synthetic-pier-net-loss', lines: [{ orderLineId: lossOrder.lines[0].id, quantity: '2' }] });
      let lossInvoice = await h.command('invoice.draft', { orderId: lossOrder.id, shipmentId: lossShipment.id, charges: [{ kind: 'discount', amount: '200', taxable: false }, { kind: 'freight', amount: '300', taxable: false }] });
      lossInvoice = await h.command('invoice.review', { invoiceId: lossInvoice.id, version: lossInvoice.version });
      await h.command('invoice.authorize', { invoiceId: lossInvoice.id, version: lossInvoice.version });
      const lossComparison = (await h.command('replenishment.compare', request)).optimization;
      assert.equal(lossComparison.realizedMargin.revenue, '-32.000000000000', 'item losses cannot be floored to zero or hidden by separately charged freight');
      assert.equal(lossComparison.realizedMargin.margin, '-104.000000000000');
      assert.equal(lossComparison.realizedMargin.unitRevenue, '-0.761904');
      assert.ok(lossComparison.rankings.cash.every(option => option.expectedContribution.startsWith('-')));
      await h.invariant();
    });
  }

  // reorder-list: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation } = await import("./harness.mjs");


    await phase('BUY-005: exported A–E stock reproduces reorder batches, coverage, alternate supplier, defaults and shared company/location low stock', async t => {
     const h = await installation(); t.after(() => h.close());
     const command = h.command;
     const supplier = async name => command('party.save', { name, kind: 'supplier' });
     const s1 = await supplier('S1'), s2 = await supplier('S2'), s3 = await supplier('S3');
     const customer = await command('party.save', { name: 'Wholesale buyer', kind: 'customer' });
     const bin = async (name, warehouse, kind = 'bin') => command('location.save', { name, warehouse, kind });
     const east = await bin('East rack', 'East'), west = await bin('West rack', 'West'), transit = await bin('Transfer van', 'Road', 'transit');
     const items = {};
     for (const sku of ['A', 'B', 'C', 'D', 'E']) items[sku] = await command('item.save', { sku, name: `SKU ${sku}`, unit: 'each', packSize: '1' });
     const purchase = async (item, quantity, destination, received = quantity) => {
      let po = await command('po.draft', { supplierId: s1.id, destinationWarehouse: destination.warehouse, promiseDate: '2026-11-01', reason: 'Independent fixture supply', lines: [{ itemId: item.id, quantity, price: '1' }] });
      await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version });
      if (received !== '0') await command('receipt.create', { poId: po.id, supplierReference: `${item.sku}-${destination.warehouse}`, lines: [{ poLineId: po.lines[0].id, locationId: destination.id, quantity: received, cost: '1' }] });
      return po;
     };
     await purchase(items.A, '8', east); await purchase(items.A, '6', east, '0');
     let legacy = await command('po.draft', { supplierId: s1.id, promiseDate: '2026-11-01', reason: 'Legacy supply with no destination', lines: [{ itemId: items.A.id, quantity: '1000', price: '1' }] });
     await command('po.approve', { poId: legacy.id, version: legacy.version }); await command('po.commit', { poId: legacy.id, version: legacy.version });
     const bp = await purchase(items.B, '30', west, '25');
     await command('order.create', { customerId: customer.id, warehouse: 'West', lines: [{ itemId: items.B.id, quantity: '32', price: '2' }] });
     // Later receipt leaves the existing 25 allocated and 7 unfilled, without silently reallocating.
     await command('receipt.create', { poId: bp.id, supplierReference: 'B later five', lines: [{ poLineId: bp.lines[0].id, locationId: west.id, quantity: '5', cost: '1' }] });
     await purchase(items.C, '4', east); await purchase(items.D, '8', east); await purchase(items.D, '6', west);
     await command('transfer.send', { itemId: items.D.id, quantity: '8', fromLocationId: east.id, toLocationId: west.id, transitLocationId: transit.id, reason: 'Eight inbound to West' });
     await purchase(items.E, '2', east); await purchase(items.E, '40', west);
     const terms = async (sku, supplier, pack, minimum, extra = {}) => command('supplierItem.save', { itemId: items[sku].id, supplierId: supplier.id, code: `${sku}-${supplier.name}`, packSize: pack, minimum, price: '1', leadDays: 7, ...extra });
     await terms('A', s1, '12', '24', { minimumValue: '1000' }); await terms('B', s2, '6', '0'); await terms('B', s3, '10', '0', { leadDays: 2 });
     await terms('C', s1, '1', '10', { reorderQuantity: '3' }); await terms('D', s1, '1', '0'); await terms('E', s1, '1', '0');
     const policy = async (sku, warehouse, supplier, point, quantity, extra = {}) => command('replenishment.save', { itemId: items[sku].id, warehouse, version: 0, supplierId: supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: point, reorderQuantity: quantity, ...extra });
     await policy('A', 'East', s1, '20', '40'); await policy('B', 'West', s2, '10', '20', { method: 'upTo', maximum: '60' });
     await policy('C', 'East', s1, '5', '8'); await policy('D', 'West', s1, '10', '10'); await policy('E', 'East', s1, '5', '10');
     const read = async path => { const response = await h.request(path); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
     const low = s => s.forecasts.filter(f => f.configured && f.low);
     // Independent integer-unit calculator reads source exports, never product projections or implementation helpers.
     function calculate(source, itemId, warehouse, supplierId) {
       const locs = new Set(source.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse).map(l => l.id));
       const onHand = source.movements.filter(m => m.itemId === itemId && m.status === 'sellable' && locs.has(m.locationId)).reduce((n, m) => n + Number(m.quantity) / 1e6, 0);
       const reserved = source.reservations.filter(r => r.itemId === itemId && locs.has(r.locationId)).reduce((n, r) => n + Number(r.quantity) / 1e6, 0);
       let backorders = 0;
       for (const o of source.orders.filter(o => o.warehouse === warehouse)) for (const l of o.lines.filter(l => l.itemId === itemId)) backorders += Math.max(0, Number(l.quantity) - Number(l.dispatched) - Number(l.cancelled) - source.reservations.filter(r => r.orderLineId === l.id).reduce((n, r) => n + Number(r.quantity) / 1e6, 0));
       const poQuantity = status => source.purchaseOrders.filter(p => p.destinationWarehouse === warehouse && p.status === status).flatMap(p => p.lines).filter(l => l.itemId === itemId).reduce((n, l) => n + Math.max(0, Number(l.quantity) - Number(l.received)), 0);
       const inbound = source.transfers.filter(x => x.itemId === itemId && x.status === 'transit' && locs.has(x.toLocationId)).reduce((n, x) => n + Number(x.quantity) - Number(x.received ?? 0), 0);
       const p = source.replenishmentPolicies.find(p => p.itemId === itemId && p.warehouse === warehouse), term = source.supplierItems.find(t => t.itemId === itemId && t.supplierId === supplierId);
       const position = onHand - reserved - backorders + poQuantity('committed') + inbound;
       const unrounded = Math.max(0, (p.method === 'upTo' ? Number(p.maximum) : Number(p.reorderPoint) + Number(term.reorderQuantity ?? p.reorderQuantity)) - position);
       const rounded = Math.ceil(Math.max(unrounded, Number(term.minimum)) / Number(term.packSize)) * Number(term.packSize);
       return { position, onHand, reserved, backorders, inbound, need: unrounded, rounded, remaining: Math.max(0, rounded - poQuantity('draft')) };
     }
     const concordance = async () => {
       const state = await h.state(), expected = low(state).map(f => `${f.itemId}:${f.scope}:${f.warehouse}`).sort();
       const report = await read('/api/pier/reports');
       assert.deepEqual(report.lowStock.map(f => `${f.itemId}:${f.scope}:${f.warehouse}`).sort(), expected);
       assert.deepEqual(state.replenishmentExceptions.filter(e => e.status === 'open').map(e => `${e.itemId}:${e.scope}:${e.warehouse}`).sort(), expected);
       return state;
     };
     let state = await concordance(), source = await read('/api/pier/export');
     assert.deepEqual(low(state).map(f => [source.items.find(i => i.id === f.itemId).sku, f.suggestedQuantity]).sort(), [['A', '48'], ['B', '66'], ['C', '10'], ['E', '13']]);
     for (const f of low(state)) {
       const expected = calculate(source, f.itemId, f.warehouse, f.supplierId);
       assert.equal(Number(f.position), expected.position); assert.equal(Number(f.onHand), expected.onHand); assert.equal(Number(f.reserved), expected.reserved); assert.equal(Number(f.backorders), expected.backorders);
       assert.equal(Number(f.inboundTransfers), expected.inbound); assert.equal(Number(f.unroundedNeed), expected.need); assert.equal(Number(f.roundedQuantity), expected.rounded); assert.equal(Number(f.suggestedQuantity), expected.remaining);
     }
     const aPolicy = state.replenishmentPolicies.find(p => p.itemId === items.A.id);
     const threshold = await command('replenishment.save', { ...aPolicy, reorderPoint: '14', reorderQuantity: '0' });
     const atPoint = (await h.state()).forecasts.find(f => f.itemId === items.A.id && f.warehouse === 'East');
     assert.equal(atPoint.unroundedNeed, '0'); assert.equal(atPoint.roundedQuantity, '24', 'at the inclusive point, supplier MOQ raises even a zero unrounded need');
     await command('replenishment.save', { ...aPolicy, version: threshold.version });
     const movements = source.movements;
     const batch = await command('replenishment.plan', {});
     assert.equal(batch.drafts.length, 2);
     const eastDraft = batch.drafts.find(p => p.destinationWarehouse === 'East'), westDraft = batch.drafts.find(p => p.destinationWarehouse === 'West');
     assert.equal(eastDraft.supplierId, s1.id); assert.equal(eastDraft.minimumOrderValueUnmet, true);
     let revised = await command('po.revise', { poId: eastDraft.id, version: eastDraft.version, supplierId: s1.id, destinationWarehouse: 'East', promiseDate: eastDraft.promiseDate, reason: 'Reviewed price revision', lines: eastDraft.lines.map(l => ({ ...l, price: l.itemId === items.A.id ? '100' : l.price })) });
     assert.equal(revised.minimumOrderValueUnmet, false, 'the actual revised draft value is checked again');
     revised = await command('po.revise', { poId: eastDraft.id, version: revised.version, supplierId: s1.id, destinationWarehouse: 'East', promiseDate: eastDraft.promiseDate, reason: 'Restore supplier price', lines: eastDraft.lines });
     assert.equal(revised.minimumOrderValueUnmet, true);
     assert.deepEqual(eastDraft.lines.map(l => [items.A.id === l.itemId ? 'A' : items.C.id === l.itemId ? 'C' : 'E', l.quantity]).sort(), [['A', '48'], ['C', '10'], ['E', '13']]);
     assert.equal(westDraft.supplierId, s2.id); assert.equal(westDraft.lines[0].quantity, '66');
     state = await concordance(); assert.equal(low(state).length, 4); assert.ok(low(state).every(f => f.suggestedQuantity === '0' && f.draftIds.length === 1));
     assert.deepEqual((await command('replenishment.plan', {})).draftIds, []);
     await command('po.delete', { poId: westDraft.id, version: westDraft.version });
     state = await concordance(); assert.equal(low(state).find(f => f.itemId === items.B.id).suggestedQuantity, '66');
     const alternate = await read(`/api/pier/replenishment?${new URLSearchParams({ itemId: items.B.id, warehouse: 'West', supplierId: s3.id })}`);
     assert.equal(alternate.find(f => f.itemId === items.B.id && f.warehouse === 'West').suggestedQuantity, '70');
     const altBatch = await command('replenishment.plan', { stateVersion: state.version, lines: [{ itemId: items.B.id, warehouse: 'West', supplierId: s3.id, quantity: '80' }] });
     assert.equal(altBatch.drafts.length, 1); assert.equal(altBatch.drafts[0].supplierId, s3.id); assert.equal(altBatch.drafts[0].lines[0].quantity, '80');
     await command('po.delete', { poId: altBatch.drafts[0].id, version: 1 });
     const restored = (await command('replenishment.plan', { lines: [{ itemId: items.B.id, warehouse: 'West' }] })).drafts[0];
     await command('po.approve', { poId: restored.id, version: restored.version }); await command('po.commit', { poId: restored.id, version: restored.version });
     state = await concordance(); assert.ok(!low(state).some(f => f.itemId === items.B.id));
     await command('replenishment.check', {}); await command('replenishment.check', {}); assert.equal((await h.state()).replenishmentExceptions.length, state.replenishmentExceptions.length);
     let settings = await command('replenishment.configure', { version: 0, mode: 'company', warehouses: ['East', 'West'], destinationWarehouse: 'East' });
     state = await concordance(); assert.equal(low(state).find(f => f.itemId === items.A.id).position, '14', 'unassigned legacy supply is outside included warehouse positions'); assert.ok(!low(state).some(f => f.itemId === items.E.id)); assert.ok(low(state).every(f => f.warehouse === 'East' && f.scope === 'company'));
     assert.deepEqual((await read('/api/pier/export')).movements, movements, 'drafts, settings, checks and reports never move physical stock');
     // A SKU default fills missing local settings; an explicit location retains precedence.
     await policy('E', 'East', s1, '4', '9', { scope: 'sku', companyReorderPoint: '60' });
     state = await concordance(); assert.equal(low(state).find(f => f.itemId === items.E.id).applied.reorderPoint, '60');
     settings = await command('replenishment.configure', { version: settings.version, mode: 'location', warehouses: ['East', 'West'], destinationWarehouse: 'East' });
     state = await concordance(); const eWest = state.forecasts.find(f => f.itemId === items.E.id && f.warehouse === 'West'); assert.equal(eWest.applied.reorderPoint, '4'); assert.equal(eWest.applied.reorderQuantity, '9'); assert.equal(eWest.supplierId, s1.id);
     const eEast = state.forecasts.find(f => f.itemId === items.E.id && f.warehouse === 'East'); assert.equal(eEast.applied.reorderPoint, '5'); assert.equal(eEast.applied.reorderQuantity, '10');
     await command('replenishment.plan', { stateVersion: state.version - 1, lines: [{ itemId: items.E.id, warehouse: 'East' }] }, { error: 'STALE' });
     await command('replenishment.configure', { version: settings.version, mode: 'company', warehouses: ['East'], destinationWarehouse: 'West' }, { error: 'WAREHOUSE' });
     await command('location.save', { ...west, warehouse: 'Renamed West' });
     state = await h.state(); assert.match(state.replenishmentProblem, /Planning warehouses changed/);
     await command('replenishment.plan', {}, { error: 'WAREHOUSE' });
     await h.invariant();
    });
  }

  // slow-stock: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


    await phase('AUTO-001: slow-stock checks warn once before dead stock and retain sale or buyer closure', async t => {
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
  }
});
