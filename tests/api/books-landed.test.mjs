import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics } from './harness.mjs';
import { pantryInstallation } from './pantry-installation.mjs';

const cents = value => { const [whole, fraction = ''] = value.split('.'); assert.match(fraction, /^\d{2}0*$/, `${value} is whole cents`); return Number(whole) * 100 + Number(fraction.slice(0, 2)); };

// Read both installations independently: a refused approval must not leave a
// supplemental bill, a guessed account, a changed baseline or a stock effect.
async function costEffects(pier, pantry) {
  const state = await pier.invariant();
  const exportResponse = await pier.request('/api/pier/export');
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  const reportResponse = await pier.request('/api/pier/reports');
  assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json();
  return {
    version: state.version, receipts: state.receipts, supplierBills: state.supplierBills,
    positions: state.positions, movements: state.movements, reservations: state.reservations,
    counts: state.counts, connections: state.bookConnections, jobs: state.bookJobs, commands: exported.commands,
    valuation: report.valuation, margin: report.margin,
    bills: (await pantry.view('sales')).bills,
    journals: (await pantry.view('journal')).entries,
  };
}

test('landed receipts and late weight-allocated bills reconcile Pantry after partial shipment, return and response loss', async () => {
  const pantry = await pantryInstallation();
  let pier, dropCreditRequest = false, loseLateResponse = false;
  try {
    await pantry.command('chart.start', {});
    const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
    const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
    const freightIn = await pantry.command('account.save', { code: '5200', name: 'Freight and duty in', type: 'expense', subtype: 'other' });
    const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' });
    const purchaseTax = await pantry.command('account.save', { code: '5300', name: 'Purchase tax', type: 'expense', subtype: 'other' });
    const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
    pier = await installation({ async outboundService(request) {
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const isCredit = request.method === 'POST' && request.url.endsWith('/integration/v1/invoices') && JSON.parse(new TextDecoder().decode(body)).kind === 'credit';
      // The credit request is lost before Pantry sees it: Pier cannot know whether it arrived.
      if (dropCreditRequest && isCredit) { dropCreditRequest = false; throw new Error('Synthetic connection loss before Pantry received the credit'); }
      const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
      if (loseLateResponse && request.method === 'POST' && request.url.endsWith('/integration/v1/journals') && JSON.parse(new TextDecoder().decode(body)).memo.startsWith('PIER-LATECOST')) { loseLateResponse = false; throw new Error('Synthetic response loss after the late-cost journal was saved'); }
      return response;
    } });
    const b = await basics(pier);
    await pier.command('item.save', { ...b.item, weight: '1' });
    const bowl = await pier.command('item.save', { sku: 'BOWL', name: 'Serving bowl', unit: 'each', packSize: '1', weight: '2' });
    const lines = [{ itemId: b.item.id, quantity: '7', price: '3.17' }, { itemId: bowl.id, quantity: '13', price: '1.09' }];
    const po = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Landed stock', freight: '40', tax: '2.50', lines });
    await pier.command('po.approve', { poId: po.id, version: po.version });
    await pier.command('po.commit', { poId: po.id, version: po.version });
    await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight', landedCost: { freight: '40.005', duty: '0', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: lines.find(x => x.itemId === l.itemId).price })) }, { error: 'LANDED_COST' });
    const receipt = await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight and duty', currency: 'AUD', usdRate: '0.5', landedCost: { freight: '40', duty: '10', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: l.itemId === b.item.id ? '6.34' : '2.18' })) });
    assert.equal(receipt.lines.reduce((n, l) => n + cents(l.freight), 0), 4000);
    assert.equal(receipt.lines.reduce((n, l) => n + cents(l.duty), 0), 1000);
    for (const line of receipt.lines) { cents(line.landedTotal); cents(line.landedUnitCost); }
    assert.equal(cents(receipt.landedCost.total), 2219 + 1417 + 5000);

    assert.equal(receipt.sourceCurrency, 'AUD');
    assert.equal(receipt.usdRate, '0.5');
    assert.deepEqual(receipt.lines.map(l => l.cost), ['3.17', '1.09']);
    const order = await pier.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '3', price: '9' }, { itemId: bowl.id, quantity: '5', price: '4' }] });
    const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'LANDED-1', lines: order.lines.map(l => ({ orderLineId: l.id, quantity: l.quantity })) });
    const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
    await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, writeOffAccountId: damage.id, writeOffReasonCode: 'crushed', writeOffApprovalLimit: '0', taxCode: 'exempt' });
    const unbuilt = (await pier.state()).bookJobs.find(j => j.key === `landed:${receipt.id}`);
    assert.equal(unbuilt.status, 'review');
    assert.equal(unbuilt.document, null);
    assert.match(unbuilt.reason, /Choose the Freight and duty account in Books settings/);
    assert.match(unbuilt.fix, /Reconnect Pantry/);
    const beforeUnbuilt = await costEffects(pier, pantry);
    const refusedBaseline = await pier.command('receipt.landed', { receiptId: receipt.id, version: receipt.version, reference: 'synthetic-pier-222', reason: 'Reviewed supplemental freight', landedCost: { freight: '33', allocation: 'weight' } }, { error: 'COST_REVIEW' });
    assert.match(refusedBaseline.error.message, /original cost posting reviews/);
    assert.deepEqual(await costEffects(pier, pantry), beforeUnbuilt, 'unbuilt baseline refusal preserves stock, cost layers, successful commands and both ledgers');
    await pier.command('book.connect', { baseUrl: pantry.origin, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freightIn.id, writeOffAccountId: damage.id, writeOffReasonCode: 'crushed', writeOffApprovalLimit: '0', taxCode: 'exempt' });
    const bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'LANDED-INVOICE', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', freight: '40', tax: '2.50', lines: po.lines.map(l => ({ poLineId: l.id, quantity: l.quantity, unitPrice: lines.find(x => x.itemId === l.itemId).price })) });
    await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
    await pier.command('book.sync', {});
    // The approved invoice carries tax but no purchase tax account is chosen yet: it waits for review, never posts a partial bill.
    let state = await pier.state();
    const waiting = state.bookJobs.find(j => j.sourceKind === 'supplierBill');
    assert.equal(waiting.status, 'review');
    assert.match(waiting.reason, /Purchase tax account/);
    assert.equal((await pantry.view('sales')).bills.length, 0);
    await pier.command('book.connect', { baseUrl: pantry.origin, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freightIn.id, writeOffAccountId: damage.id, writeOffReasonCode: 'crushed', writeOffApprovalLimit: '0', purchaseTaxAccountId: purchaseTax.id, taxCode: 'exempt' });
    await pier.command('book.sync', {});
    state = await pier.state();
    assert.equal(state.bookJobs.find(j => j.sourceKind === 'supplierBill').status, 'posted');
    const payable = (await pantry.view('sales')).bills.find(x => x.reference === state.bookJobs.find(j => j.sourceKind === 'supplierBill').reference);
    assert.equal(payable.open_cents, 3636 + 4000 + 250, 'goods, freight and tax are one payable');
    const cogsJob = state.bookJobs.find(j => j.key === `cogs:${shipment.id}`);
    assert.equal(cogsJob.status, 'posted', JSON.stringify(cogsJob));

    dropCreditRequest = true;
    const returned = await pier.command('return.scan', { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines.find(l => l.itemId === bowl.id).id, quantity: '1', locationId: b.source.id, binCode: b.source.name, reason: 'Customer returned damaged bowl', condition: 'damaged', disposition: 'writeoff', reasonCode: 'crushed', approveWriteOff: true });
    await pier.command('book.sync', {});
    state = await pier.state();
    let credit = state.bookJobs.find(j => j.key === `credit:${returned.id}`);
    assert.equal(credit.status, 'uncertain');
    await pier.command('book.sync', {});
    credit = (await pier.state()).bookJobs.find(j => j.key === `credit:${returned.id}`);
    assert.equal(credit.status, 'uncertain', 'an unknown outcome is never re-sent without the owner');
    assert.match(credit.fix, /Check Pantry/);
    await pier.command('book.retry', { jobId: credit.id, version: credit.version });
    await pier.command('book.sync', {});
    state = await pier.invariant();
    credit = state.bookJobs.find(j => j.key === `credit:${returned.id}`);
    assert.equal(credit.status, 'posted', JSON.stringify(credit));
    assert.equal(state.bookJobs.find(j => j.key === `return-cogs:${returned.id}`).status, 'posted');
    const sales = await pantry.view('sales');
    const invoice = sales.invoices.find(i => i.kind === 'invoice');
    assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 1);
    assert.equal(invoice.open_cents, 4700 - 400);
    assert.equal(state.bookJobs.filter(j => ['review', 'uncertain'].includes(j.status) && j.kind !== 'valuation').length, 0);

    assert.equal(state.bookJobs.find(j => j.key === `landed:${receipt.id}`).status, 'posted');
    // A late bill after partial shipment and return preserves original receipt
    // values and physical events while supplementing their retained cost layers.
    const original = structuredClone(state.receipts.find(r => r.id === receipt.id));
    const movements = structuredClone(state.movements);
    const originalJournals = (await pantry.view('journal')).entries.map(({ documents, ...posting }) => posting);
    loseLateResponse = true;
    const lateInput = { receiptId: receipt.id, version: original.version, reference: 'synthetic-pier-201', reason: 'Approved late carrier bill', landedCost: { freight: '33', duty: '0', allocation: 'weight' } };
    const lateId = crypto.randomUUID();
    const late = await pier.command('receipt.landed', lateInput, { commandId: lateId });
    assert.deepEqual(late.impacts, { inventory: '20.000000000000', cogs: '11.000000000000', expense: '2.000000000000' });
    assert.deepEqual(late.shares.map(s => s.amount), ['7.000000000000', '26.000000000000']);
    state = await pier.state();
    assert.deepEqual(state.receipts.find(r => r.id === receipt.id).lines, original.lines);
    assert.deepEqual(state.movements, movements);
    let lateJob = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
    assert.equal(lateJob.status, 'uncertain');
    await pier.command('book.retry', { jobId: lateJob.id, version: lateJob.version });
    await pier.command('book.sync', {});
    state = await pier.state();
    lateJob = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
    assert.equal(lateJob.status, 'posted', JSON.stringify(lateJob));
    assert.deepEqual(await pier.command('receipt.landed', lateInput, { commandId: lateId }), late);
    assert.equal(state.bookJobs.find(j => j.key === `late-bill:${late.id}`).status, 'posted');
    const latePayables = (await pantry.view('sales')).bills.filter(b => b.reference === state.bookJobs.find(j => j.key === `late-bill:${late.id}`).reference);
    // Receipt-state attachments can grow; posted amounts, lines and dates cannot.
    const journalsAfterLateBill = (await pantry.view('journal')).entries.map(({ documents, ...posting }) => posting);
    for (const journal of originalJournals) assert.deepEqual(journalsAfterLateBill.find(j => j.id === journal.id), journal, 'a successful supplemental posting preserves every original Pantry journal');
    assert.equal(latePayables.length, 1);
    assert.equal(state.supplierBills.find(b => b.id === bill.id).match.withinTolerance, true, 'late payables do not consume the original goods receipt allocation');
    assert.equal(latePayables[0].open_cents, 3300);
    const closure = state.receiptClosures.find(r => r.id === receipt.id);
    assert.equal(new Set(closure.jobIds).size, closure.jobIds.length);
    assert.ok(closure.jobIds.includes(state.bookJobs.find(j => j.key === `late-bill:${late.id}`).id));
    await pier.command('receipt.landed', { ...lateInput, version: state.receipts.find(r => r.id === receipt.id).version }, { error: 'DUPLICATE' });
    // Pantry's inventory account equals Pier's landed valuation to the cent.
    await pier.command('book.sync', {});
    state = await pier.state();
    const report = await (await pier.request('/api/pier/reports')).json();
    const tb = await pantry.view('./reports/trial-balance');
    assert.equal(tb.rows.find(r => r.id === inventory.id).net, cents(report.valuation.total));
    assert.equal(tb.rows.find(r => r.id === damage.id).net, cents(returned.writeOffCostTotal) + 200);
    assert.equal(tb.rows.find(r => r.id === purchaseTax.id).net, 250, 'supplier tax posts to the chosen account, never into inventory');
    assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');

    // A fully valued, human-reviewed count can remove stock without supplying
    // an expense mapping. A later bill must not invent that missing account.
    let count = await pier.command('count.capture', { locationId: b.source.id });
    count = await pier.command('count.record', { countId: count.id, version: count.version, reason: 'Reviewed missing unit', lines: count.lines.map(l => ({ ...l, quantity: l.itemId === b.item.id ? '3' : l.quantity })) });
    count = await pier.command('count.approve', { countId: count.id, version: count.version });
    assert.equal(count.status, 'posted');
    state = await pier.state();
    assert.equal(state.movements.filter(m => m.documentId === count.id).length, 1);
    assert.equal(state.movements.find(m => m.documentId === count.id).quantity, '-1000000');
    const beforeUnmapped = await costEffects(pier, pantry);
    assert.equal(beforeUnmapped.valuation.unvaluedQuantity, '0');
    assert.equal(beforeUnmapped.positions.find(p => p.itemId === b.item.id && p.locationId === b.source.id && p.status === 'sellable').quantity, '3');
    assert.ok(beforeUnmapped.bills.length > 0 && beforeUnmapped.journals.length > 0);
    assert.equal(beforeUnmapped.jobs.some(j => j.kind === 'journal' && !j.document), false, 'the refusal reaches the unmapped adjustment, beyond the baseline guard');
    const currentReceipt = state.receipts.find(r => r.id === receipt.id);
    const refusedAdjustment = await pier.command('receipt.landed', { ...lateInput, version: currentReceipt.version, reference: 'synthetic-pier-223' }, { error: 'COST_REVIEW' });
    assert.match(refusedAdjustment.error.message, /prior stock adjustment without a mapped expense account/);
    assert.deepEqual(await costEffects(pier, pantry), beforeUnmapped, 'unmapped adjustment refusal preserves original and supplemental dates, accounts, amounts and physical events');
  } finally { await pier?.close(); await pantry.close(); }
});

test('FIFO and moving-average late bill deltas reconcile exact Pantry inventory, net COGS and shipment margin across two cost layers', async () => {
  for (const method of ['fifo', 'average']) {
    const pantry = await pantryInstallation();
    let pier, closedPeriod = false;
    try {
      await pantry.command('chart.start', {});
      const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
      const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
      const freight = await pantry.command('account.save', { code: '5200', name: 'Freight', type: 'expense', subtype: 'other' });
      const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
      pier = await installation({ async outboundService(request) {
        const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
        if (closedPeriod && request.method === 'POST' && request.url.endsWith('/integration/v1/journals') && JSON.parse(new TextDecoder().decode(body)).memo.startsWith('PIER-LATECOST')) return Response.json({ error: 'Period is locked' }, { status: 409 });
        return fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
      } });
      let batch = await pier.command('import.stage', { namespace: 'synthetic-pier-214', sourceVersion: '1', exportedAt: '2026-10-01T00:00:00Z', filters: {}, cutoffTimezone: 'UTC', currency: 'USD', mappingRevision: '1', files: [
        { name: 'items.csv', kind: 'items', csv: 'key,sku,name,barcode,unit,packSize\ni,synthetic-pier-215,Opening stock,,each,1\n' },
        { name: 'locations.csv', kind: 'locations', csv: 'key,name,warehouse,kind\nb,synthetic-pier-216,East,bin\n' },
        { name: 'parties.csv', kind: 'parties', csv: 'key,name,kind\ns,synthetic-pier-217,supplier\nc,synthetic-pier-218,customer\n' },
        { name: 'positions.csv', kind: 'positions', csv: 'key,itemKey,locationKey,status,quantity,unit,cost\np,i,b,sellable,2,each,1\n' },
      ] });
      for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) batch = await pier.command('import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Reviewed USD cutover against opening ledger' });
      await pier.command('import.commit', { batchId: batch.id, version: batch.version });
      const imported = await pier.state();
      const b = { item: imported.items[0], source: imported.locations[0], supplier: imported.parties.find(p => p.kind === 'supplier'), customer: imported.parties.find(p => p.kind === 'customer') };
      const equity = (await pantry.view('state')).accounts.find(a => a.type === 'equity');
      const opening = await pantry.command('journal.save-draft', { date: new Date().toISOString().slice(0, 10), memo: 'synthetic-pier-219 reviewed opening cutover', lines: [{ accountId: inventory.id, debit: '2.00', memo: 'USD opening stock' }, { accountId: equity.id, credit: '2.00', memo: 'Opening equity' }] });
      await pantry.command('journal.post', { id: opening.id, revision: opening.revision });
      await pier.command('costing.method', { method, confirm: true, reason: 'Reviewed stock costing' });
      const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
      await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freight.id, taxCode: 'exempt' });
      const receipts = [];
      for (const [quantity, price, reference] of [['6', '2', 'synthetic-pier-210'], ['4', '4', 'synthetic-pier-211']]) {
        const po = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Two retained cost layers', lines: [{ itemId: b.item.id, quantity, price }] });
        await pier.command('po.approve', { poId: po.id, version: po.version });
        await pier.command('po.commit', { poId: po.id, version: po.version });
        receipts.push(await pier.command('receipt.create', { poId: po.id, supplierReference: reference, lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity, cost: price }] }));
        const bill = await pier.command('supplierBill.save', { poId: po.id, reference, date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity, unitPrice: price }] });
        await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
      }
      const order = await pier.command('order.create', { customerId: b.customer.id, warehouse: b.source.warehouse, lines: [{ itemId: b.item.id, quantity: '4', price: '10' }] });
      const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-212', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] });
      await pier.command('return.scan', { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, quantity: '1', locationId: b.source.id, reason: 'Returned sellable unit', condition: 'sellable', disposition: 'restock' });
      const current = (await pier.state()).receipts.find(r => r.id === receipts[0].id);
      closedPeriod = true;
      const late = await pier.command('receipt.landed', { receiptId: current.id, version: current.version, reference: 'synthetic-pier-213', reason: 'Approved carrier invoice', landedCost: { freight: '3', duty: '1', insurance: '1', other: '1', allocation: 'quantity' } });
      let state = await pier.state(), job = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
      assert.equal(job.status, 'review');
      assert.match(job.reason, /HTTP 409/);
      assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'review');
      closedPeriod = false;
      await pier.command('book.retry', { jobId: job.id, version: job.version });
      await pier.command('book.sync', {});
      state = await pier.state();
      const report = await (await pier.request('/api/pier/reports')).json(), tb = await pantry.view('./reports/trial-balance');
      const expected = method === 'fifo' ? { inventory: 2900, netCogs: 700, grossCogs: 800, margin: 3200 } : { inventory: 2700, netCogs: 900, grossCogs: 1200, margin: 2800 };
      assert.equal(cents(report.valuation.reconciliation.openings), 200);
      assert.equal(cents(report.valuation.total), expected.inventory);
      assert.equal(cents(report.margin.cost), expected.grossCogs);
      assert.equal(cents(report.margin.margin), expected.margin);
      assert.equal(tb.rows.find(r => r.id === inventory.id).net, expected.inventory);
      assert.equal(tb.rows.find(r => r.id === cogs.id).net, expected.netCogs);
      assert.equal(tb.rows.find(r => r.id === revenue.id).net, -3000);
      assert.equal(cents(report.valuation.reconciliation.difference), 0);
      assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
      assert.equal(state.bookJobs.find(j => j.key === `late-cost:${late.id}`).status, 'posted');
      const roundingPO = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Retained sub-cent source cost', lines: [{ itemId: b.item.id, quantity: '1', price: '0.333333' }] });
      await pier.command('po.approve', { poId: roundingPO.id, version: roundingPO.version });
      await pier.command('po.commit', { poId: roundingPO.id, version: roundingPO.version });
      await pier.command('receipt.create', { poId: roundingPO.id, supplierReference: 'synthetic-pier-220', lines: [{ poLineId: roundingPO.lines[0].id, locationId: b.source.id, quantity: '1', cost: '0.333333' }] });
      const roundingBill = await pier.command('supplierBill.save', { poId: roundingPO.id, reference: 'synthetic-pier-221', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: roundingPO.lines[0].id, quantity: '1', unitPrice: '0.333333' }] });
      await pier.command('supplierBill.approve', { id: roundingBill.id, version: roundingBill.version, receiptEvidence: roundingBill.match.receiptEvidence });
      const roundingJob = (await pier.state()).bookJobs.find(j => j.sourceId === roundingBill.id && j.kind === 'bill');
      assert.equal(roundingJob.status, 'review');
      assert.match(roundingJob.reason, /fractions of a cent/i);
      assert.equal((await pantry.view('sales')).bills.some(b => b.reference === roundingJob.reference), false);

    } finally { await pier?.close(); await pantry.close(); }
  }
});
