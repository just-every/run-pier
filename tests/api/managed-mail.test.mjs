import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { managedMailInstallation, managedPurchase, supplierRecipient, relayMessageId, expectedManagedText } from './managed-mail-fixture.mjs';

test('Managed supplier mail retains exact text, refuses PDF sends and never retries uncertain claims after restart', async t => {
  const h = await managedMailInstallation(), calls = h.calls;
  t.after(() => h.close());
  let po = await managedPurchase(h);
  const commandId = randomUUID();
  const payload = {poId: po.id, version: po.version, recipient: supplierRecipient, maxChases: 0, confirm: true};
  const beforeApproval = await h.state();
  await h.command('po.send', { ...payload, confirm: false }, { error: 'APPROVAL' });
  assert.equal(calls.length, 0);
  assert.deepEqual((await h.state()).correspondence, beforeApproval.correspondence);
  const sent = await h.command('po.send', payload, {commandId});
  assert.deepEqual(await h.command('po.send', payload, {commandId}), sent);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { to: supplierRecipient, subject: `Synthetic Pier warehouse purchase order ${po.reference}`, text: expectedManagedText(po.reference) });
  assert.equal(sent.body, expectedManagedText(po.reference));
  assert.equal(sent.documentAttachment, 'unavailable');
  assert.equal(Object.hasOwn(calls[0], 'attachments'), false);
  assert.equal(Object.hasOwn(calls[0], 'from'), false);
  assert.equal(Object.hasOwn(calls[0], 'installationId'), false);
  const state = await h.state();
  assert.equal(state.deliveries.find(d => d.correspondenceId === sent.id)?.phase, 'sent');
  assert.equal(state.deliveries.find(d => d.correspondenceId === sent.id)?.providerMessageId, relayMessageId);

  // The retained PDF remains available, but its send door cannot silently fall
  // back to a text send or create a successful business result.
  const document = await h.command('print.generate', { kind: 'purchase-order', sourceId: po.id });
  assert.match(Buffer.from(document.pdf, 'base64').toString(), /^%PDF-/);
  const download = await h.request(`/api/pier/sales-documents/${document.id}.pdf`);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.from(document.pdf, 'base64'));
  const effects = async () => {
    const response = await h.request('/api/pier/export');
    assert.equal(response.status, 200);
    const s = await response.json();
    return { purchaseOrders: s.purchaseOrders, correspondence: s.correspondence, salesDocuments: s.salesDocuments,
      commands: s.commands, movements: s.movements, reservations: s.reservations, deliveries: (await h.state()).deliveries };
  };
  const beforePDF = await effects(), refusedId = randomUUID();
  await h.command('print.send', { documentId: document.id, version: document.version, recipient: supplierRecipient }, { commandId: refusedId, error: 'DOCUMENT_MAIL' });
  assert.deepEqual(await effects(), beforePDF);
  assert.equal(calls.length, 1);
  assert.equal((await h.state()).commands.some(command => command.id === refusedId), false);

  po = await managedPurchase(h);
  h.ambiguous();
  const uncertainPayload = { ...payload, poId: po.id, version: po.version, maxChases: 1, chaseEveryDays: 1 };
  const uncertainId = randomUUID();
  const uncertain = await h.command('po.send', uncertainPayload, { commandId: uncertainId });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { to: supplierRecipient, subject: `Synthetic Pier warehouse purchase order ${po.reference}`, text: expectedManagedText(po.reference) });
  const retained = await h.state(), claim = retained.deliveries.find(d => d.correspondenceId === uncertain.id);
  assert.equal(claim.phase, 'uncertain');
  assert.equal(claim.providerMessageId, null);
  assert.match(claim.error, /Review before approving another send/);
  const chase = retained.correspondence.find(m => m.purchaseMessageId === uncertain.id);
  assert.ok(chase, 'a real bounded chase is waiting for initial acceptance');
  for (const restart of [false, true]) {
    if (restart) await h.restart();
    assert.deepEqual(await h.command('po.send', uncertainPayload, { commandId: uncertainId }), uncertain);
    await h.command('po.send', uncertainPayload, { error: 'ALREADY_SENT' });
    await h.command('mail.process', {});
    await h.command('mail.process', {});
    await (await h.mf.getWorker()).scheduled({ scheduledTime: new Date(Date.parse(chase.dueAt) + 86400000), cron: '* * * * *' });
    const current = await h.state();
    assert.deepEqual(current.deliveries.filter(d => d.correspondenceId === uncertain.id), [claim]);
    assert.equal(current.deliveries.some(d => d.correspondenceId === chase.id), false);
    assert.deepEqual(current.correspondence.filter(m => m.recordId === po.id), retained.correspondence.filter(m => m.recordId === po.id));
    assert.equal(calls.length, 2, 'neither the uncertain purchase nor its chase is blindly submitted');
  }
  await h.invariant();
});
