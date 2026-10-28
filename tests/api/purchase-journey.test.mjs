import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Approve exact supplier commitments, send once, match bills and reconcile returns and performance", async () => {

  // purchase-send: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy } = await import("./harness.mjs");


    await phase('BUY-006: an agent sends only the exact bounded human-approved purchase once', async t => {
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


    await phase('purchase approval routes exact landed spend and exceptions to named humans with revocable delegation', async t => {
      const h = await installation();
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
      po = await h.command('po.escalateApproval', { poId: po.id, version: po.version, reason: 'Buyer absent; explicit owner escalation' });
      await h.command('po.approve', { poId: po.id, version: po.version });
      await h.command('po.commit', { poId: po.id, version: po.version });
      // Supplier-specific exception limits cannot fall through to a larger general limit.
      await h.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, minimum: '1', minimumValue: '10', packSize: '1', price: '0.25', leadDays: 3, code: 'synthetic-pier-4' });
      policy = await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', buyerId), limit('1', ownerId, { exceptionType: 'minimum-order' })] });
      po = await draft();
      assert.equal(po.minimumOrderValueUnmet, true);
      await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'SPEND_LIMIT' });
      await h.command('role.set', { operatorId: buyerId, role: 'agent' });
      await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', buyerId)] }, { error: 'APPROVER' });
      po = await draft({}, { as: cookie });
      await h.command('po.approve', { poId: po.id, version: po.version }, { as: cookie, error: 'FORBIDDEN' });
      await h.command('purchaseApproval.save', { version: policy.version, limits: [limit('100', ownerId)] }, { as: cookie, error: 'FORBIDDEN' });
    });


    await phase('supplier price and date evidence stops pending sends until exact human review and retains partial cancellations', async t => {
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
  }

  // managed-mail: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy } = await import("./harness.mjs");


    await phase('Managed supplier mail uses the provisioned relay once after human approval', async t => {
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
  }

  // supplier-bill-documents: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


    await phase('BUY-004: retained invoice/BOL units and packs gate exact approval without rewriting receipt stock', async () => {
      const h = await installation();
      try {
        const b = await basics(h), po = await buy(h, b, '12');
        const receipt = await receive(h, b, po, '11');
        const before = await h.state();
        const documents = {
          invoice: { reference: 'M-7731', original: '  Invoice M-7731: 24 half-unit packs = 12 each at USD 0.25\n', lines: [{ poLineId: po.lines[0].id, quantity: '24', packSize: '3', unit: 'cartons' }] },
          bol: { reference: 'BOL-42', original: 'BOL-42: 22 half-unit packs = 11 each', lines: [{ poLineId: po.lines[0].id, quantity: '22', packSize: '0.5', unit: 'each' }] },
        };
        const payload = { poId: po.id, reference: 'M-7731', date: '2026-10-21', quantityTolerancePercent: '10', priceTolerancePercent: '0', documents, lines: [{ poLineId: po.lines[0].id, quantity: '12', unitPrice: '0.25' }] };
        let bill = await h.command('supplierBill.save', payload);
        assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('base unit')));
        assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('pack 3')));
        assert.ok(bill.match.differences.some(d => d.kind === 'bolDocument'));
        await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
        documents.invoice.lines[0].unit = 'each'; documents.invoice.lines[0].packSize = '0.5';
        bill = await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version });
        // A quantity tolerance cannot excuse a source transcription/conversion mismatch.
        await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
        documents.bol.original = 'Corrected BOL-42: 24 half-unit packs = 12 each'; documents.bol.lines[0].quantity = '24';
        bill = await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version });
        assert.equal(bill.documents.invoice.lines[0].baseQuantity, '12');
        assert.equal(bill.documents.invoice.original, documents.invoice.original);
        assert.equal(bill.documentHistory.length, 2);
        assert.equal(bill.documentHistory[1].documents.bol.original, 'BOL-42: 22 half-unit packs = 11 each');
        await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: 'stale' }, { error: 'SUPPLIER_BILL_STALE' });
        bill = await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
        assert.equal(bill.status, 'approved');
        assert.equal(bill.total, '3.000000000000');
        await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version }, { error: 'SUPPLIER_BILL_APPROVED' });
        const after = await h.invariant();
        assert.deepEqual(after.movements, before.movements);
        assert.deepEqual(after.receipts.find(r => r.id === receipt.id), before.receipts.find(r => r.id === receipt.id));
        const exported = await (await h.request('/api/pier/export')).json();
        assert.ok(JSON.stringify(exported).includes(documents.bol.original));
        // Exact conversion refuses sub-micro base units atomically.
        documents.invoice.lines[0].quantity = '0.000001'; documents.invoice.lines[0].packSize = '0.5';
        await h.command('supplierBill.save', { ...payload, reference: 'M-BAD' }, { error: 'SUPPLIER_DOCUMENT' });
        assert.equal((await h.state()).supplierBills.length, 1);
      } finally { await h.close(); }
    });


    await phase('BUY-004: invoice and BOL freight and tax are matched to the PO across partial receipts before approval', async () => {
      const h = await installation();
      try {
        const b = await basics(h);
        let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Freight journey', freight: '5', tax: '0.40', lines: [{ itemId: b.item.id, quantity: '24', price: '0.25' }] });
        await h.command('po.approve', { poId: po.id, version: po.version });
        po = await h.command('po.commit', { poId: po.id, version: po.version });
        await receive(h, b, po, '11');
        const line = po.lines[0].id;
        const sources = (freight, bolFreight) => ({
          invoice: { reference: 'M-9001', original: 'Invoice M-9001: 24 half-unit packs, freight and tax shown', freight, tax: '0.40', lines: [{ poLineId: line, quantity: '24', packSize: '0.5', unit: 'each' }] },
          bol: { reference: 'BOL-9001', original: 'BOL-9001: 22 half-unit packs', freight: bolFreight, lines: [{ poLineId: line, quantity: '24', packSize: '0.5', unit: 'each' }] },
        });
        const payload = (freight, bolFreight, extra = {}) => ({ poId: po.id, reference: 'M-9001', date: '2026-10-21', quantityTolerancePercent: '10', priceTolerancePercent: '0', freight, tax: '0.40', documents: sources(freight, bolFreight), lines: [{ poLineId: line, quantity: '12', unitPrice: '0.25' }], ...extra });
        await h.command('supplierBill.save', payload('5.005', '5'), { error: 'SUPPLIER_CHARGE' });
        await h.command('supplierBill.save', { ...payload('5', '5'), tax: '-1' }, { error: 'DECIMAL' });
        // The invoice charges more freight than the PO promised and the BOL states yet another amount.
        let bill = await h.command('supplierBill.save', payload('6.5', '5'));
        assert.equal(bill.total, '9.900000000000');
        assert.ok(bill.match.differences.some(d => d.kind === 'freightPurchaseOrder' && !d.withinTolerance));
        assert.ok(bill.match.differences.some(d => d.kind === 'bolDocument' && d.message.includes('freight 5')));
        await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
        // The invoice text says 6.50 but the retained record says otherwise: a transcription mismatch is never excused.
        bill = await h.command('supplierBill.save', { ...payload('5', '5'), id: bill.id, version: bill.version, documents: { ...sources('5', '5'), invoice: { ...sources('5', '5').invoice, freight: '6.5' } } });
        assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('freight 6.5')));
        bill = await h.command('supplierBill.save', { ...payload('5', '5'), id: bill.id, version: bill.version });
        assert.deepEqual(bill.match.charges.freight, { billed: '5', purchaseOrder: '5', priorApproved: '0' });
        assert.equal(bill.total, '8.400000000000');
        bill = await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
        assert.equal(bill.status, 'approved');
        // A second invoice for the same PO counts the freight already approved.
        await receive(h, b, po, '13');
        let second = await h.command('supplierBill.save', { ...payload('1', null), reference: 'M-9002', tax: '0', documents: null });
        assert.deepEqual(second.match.charges.freight, { billed: '1', purchaseOrder: '5', priorApproved: '5' });
        assert.ok(second.match.differences.some(d => d.kind === 'freightPurchaseOrder' && !d.withinTolerance));
        await h.command('supplierBill.approve', { id: second.id, version: second.version, receiptEvidence: second.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
        // The buyer's explicit tolerance decides a small overage: 1 over a 5 expectation is 20 percent.
        second = await h.command('supplierBill.save', { ...payload('1', null), reference: 'M-9002', tax: '0', documents: null, priceTolerancePercent: '25', id: second.id, version: second.version });
        assert.ok(second.match.differences.some(d => d.kind === 'freightPurchaseOrder' && d.withinTolerance));
        second = await h.command('supplierBill.approve', { id: second.id, version: second.version, receiptEvidence: second.match.receiptEvidence });
        assert.equal(second.total, '4.000000000000');
        const exported = await (await h.request('/api/pier/export')).json();
        assert.deepEqual(exported.supplierBills.map(x => [x.freight, x.tax]).sort(), [['1', '0'], ['5', '0.4']]);
        await h.invariant();
      } finally { await h.close(); }
    });
  }

  // supplier-performance: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, parse } = await import("./harness.mjs");


    await phase('BUY-004: supplier fill and on-time quantities reconcile to exported PO/receipt sources without rewriting past confirmations', async t => {
      const h = await installation();
      t.after(() => h.close());
      const read = async path => {
        const response = await h.request(path);
        assert.equal(response.status, 200, await response.clone().text());
        return response.json();
      };
      assert.equal((await h.request('/api/pier/supplier-performance', { as: '' })).status, 401);
      assert.deepEqual((await read('/api/pier/supplier-performance')).suppliers, []);
      const b = await basics(h);
      const powder = await h.command('item.save', { sku: 'POWDER', name: 'Bulk powder', unit: 'kg', packSize: '0.25' });
      const empty = await h.command('party.save', { kind: 'supplier', name: 'No deliveries yet' });
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
      const purchase = async (item, quantity, price = '0.25') => {
        let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: today, reason: 'Supplier performance journey', lines: [{ itemId: item.id, quantity, price }] });
        await h.command('po.approve', { poId: po.id, version: po.version });
        return h.command('po.commit', { poId: po.id, version: po.version });
      };
      const confirm = async (poId, date, opts) => {
        const po = (await h.state()).purchaseOrders.find(p => p.id === poId);
        return h.command('po.confirm', { poId, version: po.version, promiseDate: date, source: 'Supplier reply ' + date, body: 'Delivery date confirmed', confirm: true }, opts);
      };
      const po = await purchase(b.item, '4');
      const { exportedAt: _beforeTime, ...before } = await read('/api/pier/export');
      await confirm(po.id, '2026-02-30', { error: 'DATE' });
      const { exportedAt: _afterTime, ...after } = await read('/api/pier/export');
      assert.deepEqual(after, before, 'invalid confirmation posts neither a reply nor changed business/command evidence');
      await confirm(po.id, today);
      const payload = { poId: po.id, supplierReference: 'PARTIAL-ON-TIME', lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '1.25', cost: '0.30' }] };
      const commandId = randomUUID();
      const first = await h.command('receipt.create', payload, { commandId });
      assert.deepEqual(await h.command('receipt.create', payload, { commandId }), first);
      assert.equal(first.supplierConfirmation.promiseDate, today);
      assert.equal(first.supplierConfirmation.reply.source, 'Supplier reply ' + today);
      await confirm(po.id, yesterday);
      let tally = await h.command('receiving.start', { poId: po.id, locationId: b.source.id });
      tally = await h.command('receiving.scan', { receivingId: tally.id, code: b.item.barcode, count: 2 });
      const late = await h.command('receiving.post', { receivingId: tally.id, version: tally.version, supplierReference: 'LATE-SCANNED' });
      assert.equal(late.supplierConfirmation.promiseDate, yesterday);
      // A later promise cannot retroactively make this late receipt on-time.
      await confirm(po.id, today);
      const unconfirmed = await purchase(b.item, '3');
      await h.command('receipt.create', { poId: unconfirmed.id, supplierReference: 'NO-SUPPLIER-CONFIRMATION', lines: [{ poLineId: unconfirmed.lines[0].id, locationId: b.source.id, quantity: '1', cost: '0.20' }] });
      await confirm(unconfirmed.id, today); // Confirmation after receipt cannot fill missing historical evidence.
      // Same supplier, unlike units: never sum kg and each into a supplier quantity.
      const powderPo = await purchase(powder, '0.75', '2');
      // A draft is not committed supply and must not inflate the denominator.
      await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: today, reason: 'Uncommitted', lines: [{ itemId: b.item.id, quantity: '100', price: '1' }] });

      const reconcile = async () => {
        const source = await read('/api/pier/export');
        const version = source.version;
        const report = await read('/api/pier/supplier-performance');
        assert.equal(report.timezone, 'UTC');
        assert.deepEqual(report.suppliers.find(s => s.supplierId === empty.id).items, []);
        const supplier = report.suppliers.find(s => s.supplierId === b.supplier.id);
        assert.equal(supplier.items.length, 2);
        for (const row of supplier.items) {
          const orders = source.purchaseOrders.filter(p => p.supplierId === supplier.supplierId && p.status === 'committed');
          const lines = orders.flatMap(p => p.lines.filter(l => l.itemId === row.itemId));
          const receipts = source.receipts.filter(r => orders.some(p => p.id === r.poId) && r.status === 'posted');
          const entries = receipts.flatMap(r => r.lines.filter(l => l.itemId === row.itemId).map(l => ({ receipt: r, line: l })));
          const total = entries.reduce((sum, e) => sum + parse(e.line.quantity), 0n);
          const ordered = lines.reduce((sum, l) => sum + parse(l.quantity), 0n);
          const known = entries.filter(e => e.receipt.supplierConfirmation);
          const timed = known.reduce((sum, e) => sum + parse(e.line.quantity), 0n);
          const timely = known.filter(e => e.receipt.createdAt.slice(0, 10) <= e.receipt.supplierConfirmation.promiseDate).reduce((sum, e) => sum + parse(e.line.quantity), 0n);
          assert.equal(parse(row.orderedQuantity), ordered);
          assert.equal(parse(row.receivedQuantity), total);
          assert.equal(parse(row.onTimeQuantity), timely);
          assert.equal(parse(row.lateQuantity), timed - timely);
          assert.equal(parse(row.unknownTimingQuantity), total - timed);
          assert.equal(parse(row.outstandingQuantity), ordered > total ? ordered - total : 0n);
          assert.equal(parse(row.excessQuantity), total > ordered ? total - ordered : 0n);
          // Defects reproduce from the exported inspections of unreversed receipts only.
          const inspections = receipts.flatMap(r => r.inspections ?? []).filter(i => i.itemId === row.itemId);
          const inspected = inspections.reduce((sum, i) => sum + parse(i.inspectedQuantity), 0n), defective = inspections.reduce((sum, i) => sum + parse(i.defectiveQuantity), 0n);
          assert.equal(parse(row.inspectedQuantity), inspected);
          assert.equal(parse(row.defectiveQuantity), defective);
          assert.equal(parse(row.uninspectedQuantity), total - inspected);
          assert.equal(row.defectPercent === null ? null : parse(row.defectPercent), inspected ? defective * 100000000n / inspected : null);
          assert.equal(parse(row.fillPercent), total * 100000000n / ordered);
          assert.equal(row.onTimePercent === null ? null : parse(row.onTimePercent), timed ? timely * 100000000n / timed : null);
          for (const evidence of row.receipts) {
            const original = source.receipts.find(r => r.id === evidence.receiptId);
            const line = original.lines.find(l => l.id === evidence.receiptLineId);
            const orderLine = lines.find(l => l.id === evidence.poLineId);
            assert.equal(evidence.quantity, line.quantity);
            assert.equal(evidence.supplierReference, original.supplierReference);
            assert.deepEqual(evidence.confirmation, original.supplierConfirmation);
            assert.equal(parse(evidence.priceDifference.replace('-', '')), (parse(line.cost) - parse(orderLine.price)) * (evidence.priceDifference.startsWith('-') ? -1n : 1n));
          }
        }
        assert.equal((await h.state()).version, version, 'reading a scorecard writes no business record');
        return supplier.items.find(row => row.itemId === b.item.id);
      };
      let row = await reconcile();
      assert.deepEqual([row.orderedQuantity, row.receivedQuantity, row.fillPercent, row.onTimeQuantity, row.lateQuantity, row.unknownTimingQuantity, row.onTimePercent], ['7', '4.25', '60.714285', '1.25', '2', '1', '38.461538']);
      assert.equal(row.receipts.find(r => r.receiptId === first.id).timing, 'on-time');
      assert.equal(row.receipts.find(r => r.receiptId === late.id).timing, 'late');
      assert.match(row.receipts.find(r => r.timing === 'unknown').exclusion, /No supplier confirmation/);
      // Defects come from recorded inspections, never from returns or stock corrections.
      assert.deepEqual([row.inspectedQuantity, row.defectiveQuantity, row.uninspectedQuantity, row.defectPercent], ['0', '0', '4.25', null]);
      const lateLine = late.lines[0], firstLine = first.lines[0];
      await h.command('receipt.inspect', { receiptId: first.id, lines: [{ receiptLineId: firstLine.id, inspected: '1', defective: '0.25' }] }, { error: 'INPUT' });
      await h.command('receipt.inspect', { receiptId: first.id, lines: [{ receiptLineId: firstLine.id, inspected: '1', defective: '2', defect: 'Cracked' }] }, { error: 'INSPECTION' });
      await h.command('receipt.inspect', { receiptId: first.id, lines: [{ receiptLineId: firstLine.id, inspected: '1.5', defective: '0' }] }, { error: 'INSPECTION_LIMIT' });
      const stockBefore = (await h.state()).movements.length;
      await h.command('receipt.inspect', { receiptId: first.id, lines: [{ receiptLineId: firstLine.id, inspected: '1', defective: '0.25', defect: 'Cracked housing' }] });
      await h.command('receipt.inspect', { receiptId: late.id, lines: [{ receiptLineId: lateLine.id, inspected: '2', defective: '1', defect: 'Wrong finish' }] });
      assert.equal((await h.state()).movements.length, stockBefore, 'an inspection moves no stock');
      row = await reconcile();
      assert.deepEqual([row.inspectedQuantity, row.defectiveQuantity, row.uninspectedQuantity, row.defectPercent], ['3', '1.25', '1.25', '41.666666']);
      assert.equal(row.receipts.find(r => r.receiptId === first.id).inspections[0].defect, 'Cracked housing');
      await h.command('receipt.inspect', { receiptId: first.id, lines: [{ receiptLineId: firstLine.id, inspected: '0.5', defective: '0' }] }, { error: 'INSPECTION_LIMIT' });
      // Reversing a receipt removes its contribution but keeps its cited exclusion.
      await h.command('receipt.reverse', { receiptId: late.id, reason: 'Duplicate warehouse tally' });
      row = await reconcile();
      assert.equal(row.receivedQuantity, '2.25');
      assert.equal(row.onTimePercent, '100');
      assert.deepEqual([row.inspectedQuantity, row.defectiveQuantity, row.defectPercent], ['1', '0.25', '25']);
      assert.equal(row.receipts.find(r => r.receiptId === late.id).inspections.length, 1, 'a reversed receipt keeps its cited inspection but is excluded from the rate');
      await h.command('receipt.inspect', { receiptId: late.id, lines: [{ receiptLineId: lateLine.id, inspected: '0.5', defective: '0' }] }, { error: 'REVERSED' });
      assert.equal(row.receipts.find(r => r.receiptId === late.id).timing, 'excluded');
      assert.match(row.receipts.find(r => r.receiptId === late.id).exclusion, /reversed/);
      // Scan over-receipts remain visible rather than creating negative outstanding quantities.
      await h.command('item.save', { ...powder, version: powder.version, barcode: '10002' });
      let extra = await h.command('receiving.start', { poId: powderPo.id, locationId: b.source.id });
      extra = await h.command('receiving.scan', { receivingId: extra.id, code: '10002' });
      await h.command('receiving.post', { receivingId: extra.id, version: extra.version, supplierReference: 'EXTRA-POWDER', overReason: 'Supplier shipped a full bag' });
      await reconcile();
      const over = (await read('/api/pier/supplier-performance')).suppliers.find(s => s.supplierId === b.supplier.id).items.find(i => i.itemId === powder.id);
      assert.deepEqual([over.fillPercent, over.outstandingQuantity, over.excessQuantity, over.onTimePercent], ['133.333333', '0', '0.25', null]);
      await h.invariant();
    });
  }

  // supplier-returns: the complete public lifecycle, including refused and uncertain outcomes.
  {
    const { pantryInstallation } = await import("./pantry-installation.mjs");

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


    await phase('BUY-003: quarantine, supplier authority, once-only dispatch, credit and replacement evidence preserve receipt and outstanding PO', async t => {
      const pantry=await pantryInstallation({revision:'e987ba0a2270a81c62d399c44c6e05d3b504bb07'});t.after(()=>pantry.close());
      await pantry.command('chart.start',{});
      const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory',type:'asset',subtype:'other'}),cogs=await pantry.command('account.save',{code:'5000',name:'Cost of goods',type:'expense',subtype:'other'}),freight=await pantry.command('account.save',{code:'5100',name:'Freight and duty',type:'expense',subtype:'other'}),revenue=(await pantry.view('state')).accounts.find(a=>a.code==='4000');
      let loseCredit=false;
      const h=await installation({async outboundService(request){
        const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([key])=>!['transfer-encoding','content-length','host','connection'].includes(key))),...(request.method==='GET'?{}:{body:await request.arrayBuffer()})});
        if(loseCredit&&request.method==='POST'&&request.url.endsWith('/vendor-credits')){loseCredit=false;await response.text();throw new Error('Synthetic loss after Pantry saved supplier credit');}
        return response;
      }});t.after(()=>h.close());
      const b = await basics(h), po = await buy(h, b, '10'), receipt = await h.command('receipt.create',{poId:po.id,supplierReference:'synthetic-pier-1',landedCost:{freight:'0.80',duty:'0.08',insurance:'0.08',other:'0.08',allocation:'quantity'},lines:[{poLineId:po.lines[0].id,locationId:b.source.id,quantity:'8',cost:'0.25'}]});
      const bill=await h.command('supplierBill.save',{poId:po.id,reference:'synthetic-pier-2',date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'0',priceTolerancePercent:'0',lines:[{poLineId:po.lines[0].id,quantity:'8',unitPrice:'0.25'}]});
      await h.command('supplierBill.approve',{id:bill.id,version:bill.version,receiptEvidence:bill.match.receiptEvidence});
      const credential=await pantry.command('integration.create',{name:'Pier returns',scopes:['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','vendor-credits:read','vendor-credits:write','post']});
      await h.command('book.connect',{baseUrl:pantry.origin,integrationToken:credential.token,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,landedCostAccountId:freight.id,taxCode:'exempt'});
      const reviewEvidence=async()=>{
        const pending=(await pantry.view('documents')).documents.filter(d=>d.duplicate_of&&!d.duplicate_decision);
        for(const doc of pending)await pantry.command('document.duplicate-decide',{id:doc.id,decision:'keep',reason:'Owner reviewed the original invoice and separate receipt-state snapshot as distinct supporting evidence'});
        await h.command('book.sync',{});
      };
      assert.match((await h.state()).bookJobs.find(j=>j.kind==='bill').reason,/possible duplicate/);
      await reviewEvidence();assert.equal((await h.state()).bookJobs.find(j=>j.kind==='bill').status,'posted');
      const before = await h.state();
      const original = before.receipts.find(r => r.id === receipt.id), commitment = before.purchaseOrders.find(r => r.id === po.id);
      const payload = { receiptId: receipt.id, reason: 'Three damaged units', lines: [{ receiptLineId: receipt.lines[0].id, quantity: '3' }] };
      const cmd = randomUUID();
      let returned = await h.command('supplierReturn.create', payload, { commandId: cmd });
      assert.deepEqual(await h.command('supplierReturn.create', payload, { commandId: cmd }), returned);
      let state = await h.invariant();
      assert.equal(state.positions.find(p => p.status === 'sellable' && p.locationId === b.source.id).available, '5');
      assert.equal(state.positions.find(p => p.status === 'quarantine').quantity, '3');
      const stable = () => h.request('/api/pier/export').then(r => r.json()).then(({ exportedAt, bookJobs, bookConnections, auditEvents, providerAudits, ...s }) => s);
      const unchanged = async (type, payload, error) => { const before = await stable(); await h.command(type, payload, { error }); assert.deepEqual(await stable(), before); };
      await unchanged('supplierReturn.create', { ...payload, lines: [{ receiptLineId: receipt.lines[0].id, quantity: '6' }] }, 'SUPPLIER_RETURN_LIMIT');
      await unchanged('supplierReturn.dispatch', { returnId: returned.id, version: returned.version, dispatchReference: 'OUT' }, 'SUPPLIER_RETURN_STATE');
      returned = await h.command('supplierReturn.authorize', { returnId: returned.id, version: returned.version, authorizationReference: 'RMA-42', evidence: 'Supplier approved three units, email October 21' });
      await unchanged('supplierReturn.dispatch', { returnId: returned.id, version: 1, dispatchReference: 'OUT' }, 'STALE');
      const dispatch = { returnId: returned.id, version: returned.version, dispatchReference: 'BOL-RETURN-42' }, dispatchId = randomUUID();
      returned = await h.command('supplierReturn.dispatch', dispatch, { commandId: dispatchId });
      assert.deepEqual(await h.command('supplierReturn.dispatch', dispatch, { commandId: dispatchId }), returned);
      await unchanged('supplierReturn.dispatch', { ...dispatch, version: returned.version }, 'SUPPLIER_RETURN_STATE');
      const resolution = { returnId: returned.id, version: returned.version, reference: 'CM-42', evidence: 'Credit memo for one damaged unit', amount: '0.25', lines: [{ returnLineId: returned.lines[0].id, quantity: '1' }] };
      const creditId = randomUUID();
      returned = await h.command('supplierReturn.credit', resolution, { commandId: creditId });
      assert.deepEqual(await h.command('supplierReturn.credit', resolution, { commandId: creditId }), returned);
      assert.equal(returned.resolutions[0].posting, 'not-posted');
      await unchanged('supplierReturn.credit', { ...resolution, version: returned.version }, 'SUPPLIER_RETURN_DUPLICATE');
      await unchanged('supplierReturn.replace', { returnId: returned.id, version: returned.version, reference: 'REPLACE-42', evidence: 'Two replacements delivered', lines: [{ returnLineId: returned.lines[0].id, quantity: '3', locationId: b.destination.id }] }, 'SUPPLIER_RETURN_LIMIT');
      const replacement = { returnId: returned.id, version: returned.version, reference: 'REPLACE-42', evidence: 'Two replacements delivered', lines: [{ returnLineId: returned.lines[0].id, quantity: '2', locationId: b.destination.id }] }, replaceId = randomUUID();
      returned = await h.command('supplierReturn.replace', replacement, { commandId: replaceId });
      assert.deepEqual(await h.command('supplierReturn.replace', replacement, { commandId: replaceId }), returned);
      assert.equal(returned.status, 'reconciled');
      await unchanged('receipt.reverse', { receiptId: receipt.id, reason: 'Must not erase returns' }, 'DEPENDENCY');
      const replacedReceipt = (await h.state()).receipts.find(r => r.replacementFor === returned.id);
      await unchanged('receipt.reverse', { receiptId: replacedReceipt.id, reason: 'Must not reopen original PO' }, 'DEPENDENCY');
      state = await h.invariant();
      assert.deepEqual(state.receipts.find(r => r.id === receipt.id), original);
      assert.deepEqual(state.purchaseOrders.find(r => r.id === po.id), commitment);
      assert.equal(state.positions.find(p => p.status === 'sellable' && p.locationId === b.destination.id).quantity, '2');
      assert.equal(state.positions.find(p => p.status === 'quarantine').quantity, '0');
      assert.equal(replacedReceipt.lines[0].freight,'0.200000000000');assert.equal(replacedReceipt.lines[0].duty,'0.020000000000');assert.equal(replacedReceipt.lines[0].insurance,'0.020000000000');assert.equal(replacedReceipt.lines[0].otherLandedCost,'0.020000000000');assert.equal(replacedReceipt.lines[0].landedTotal,'0.760000000000');
      await unchanged('supplierReturn.postCredit',{returnId:returned.id,version:returned.version,reference:'CM-42',supplierBillId:'missing'},'NOT_FOUND');
      const post={returnId:returned.id,version:returned.version,reference:'CM-42',supplierBillId:bill.id},postId=randomUUID();loseCredit=true;
      await h.command('supplierReturn.postCredit',post,{commandId:postId});
      state=await h.state();assert.equal(state.bookJobs.find(j=>j.key.startsWith('supplier-credit:')).status,'uncertain');
      await h.command('supplierReturn.postCredit',post,{commandId:postId});await h.command('book.sync',{});await h.command('book.sync',{});
      await reviewEvidence();
      state=await h.state();returned=state.supplierReturns[0];assert.equal(returned.resolutions[0].posting,'posted');assert.equal(returned.resolutions[0].books.allocated,'0.25');assert.equal(returned.resolutions[0].books.unallocated,'0.00');
      const creditResponse=await fetch(pantry.origin+'/api/pantry/integration/v1/vendor-credits',{headers:{authorization:`Bearer ${credential.token}`}});assert.equal(creditResponse.status,200);
      const credits=(await creditResponse.json()).vendorCredits;assert.equal(credits.length,1);assert.equal(credits[0].amount_cents,25);assert.equal(credits[0].unallocated_cents,0);assert.equal(credits[0].allocations.length,1);
      const remoteBill=(await pantry.view('sales')).bills[0];assert.equal(remoteBill.open_cents,175);assert.equal(credits[0].allocations[0].target_id,remoteBill.id);assert.equal((await pantry.view('sales')).bills.length,1,'replacement never creates a second payable');
      assert.equal(state.bookJobs.find(j=>j.key==='inventory-reconciliation').status,'reconciled');
      assert.equal((await pantry.view('./reports/trial-balance')).rows.find(r=>r.id===inventory.id).net,266);
      const csv=await (await h.request('/api/pier/books/export.csv')).text();
      assert.ok(csv.includes('"Supplier credit total","Accounts Payable","1","0.25",""'));
      const iif=await h.request('/api/pier/books/export.iif');assert.equal(iif.status,200,await iif.clone().text());
      assert.match(await iif.text(),/GENERAL JOURNAL\t[^\n]*Accounts Payable\tMetals\t0\.25/);
      const exported = await stable();
      assert.deepEqual(exported.supplierReturns[0], returned);
      const reports = await h.request('/api/pier/reports'); assert.equal(reports.status, 200, await reports.clone().text());
      // Existing sales reservations remain untouchable by a supplier rejection.
      await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '5', locationId: b.source.id }] });
      await unchanged('supplierReturn.create', { ...payload, lines: [{ receiptLineId: receipt.lines[0].id, quantity: '1' }] }, 'DEPENDENCY');
    });
  }
});
