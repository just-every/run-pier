import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics } from './harness.mjs';
import { pantryInstallation } from './pantry-installation.mjs';

const cents = value => { const [whole, fraction = ''] = value.split('.'); assert.match(fraction, /^\d{2}0*$/, `${value} is whole cents`); return Number(whole) * 100 + Number(fraction.slice(0, 2)); };

test('freight and duty split by value post cost of goods, the return credit reaches Pantry after Check Pantry, and Pantry inventory matches Pier', async () => {
  const pantry = await pantryInstallation();
  let pier, dropCreditRequest = false;
  try {
    await pantry.command('chart.start', {});
    const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
    const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
    const freightIn = await pantry.command('account.save', { code: '5200', name: 'Freight and duty in', type: 'expense', subtype: 'other' });
    const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
    pier = await installation({ async outboundService(request) {
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const isCredit = request.method === 'POST' && request.url.endsWith('/integration/v1/invoices') && JSON.parse(new TextDecoder().decode(body)).kind === 'credit';
      // The credit request is lost before Pantry sees it: Pier cannot know whether it arrived.
      if (dropCreditRequest && isCredit) { dropCreditRequest = false; throw new Error('Synthetic connection loss before Pantry received the credit'); }
      return fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
    } });
    const b = await basics(pier);
    const bowl = await pier.command('item.save', { sku: 'BOWL', name: 'Serving bowl', unit: 'each', packSize: '1' });
    const lines = [{ itemId: b.item.id, quantity: '7', price: '3.17' }, { itemId: bowl.id, quantity: '13', price: '1.09' }];
    const po = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Landed stock', lines });
    await pier.command('po.approve', { poId: po.id, version: po.version });
    await pier.command('po.commit', { poId: po.id, version: po.version });
    await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight', landedCost: { freight: '40.005', duty: '0', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: lines.find(x => x.itemId === l.itemId).price })) }, { error: 'LANDED_COST' });
    const receipt = await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight and duty', landedCost: { freight: '40', duty: '10', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: lines.find(x => x.itemId === l.itemId).price })) });
    assert.equal(receipt.lines.reduce((n, l) => n + cents(l.freight), 0), 4000);
    assert.equal(receipt.lines.reduce((n, l) => n + cents(l.duty), 0), 1000);
    for (const line of receipt.lines) { cents(line.landedTotal); cents(line.landedUnitCost); }
    assert.equal(cents(receipt.landedCost.total), 2219 + 1417 + 5000);

    const order = await pier.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '3', price: '9' }, { itemId: bowl.id, quantity: '5', price: '4' }] });
    const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'LANDED-1', lines: order.lines.map(l => ({ orderLineId: l.id, quantity: l.quantity })) });
    const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
    await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freightIn.id, taxCode: 'exempt' });
    const bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'LANDED-INVOICE', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: po.lines.map(l => ({ poLineId: l.id, quantity: l.quantity, unitPrice: lines.find(x => x.itemId === l.itemId).price })) });
    await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
    await pier.command('book.sync', {});
    let state = await pier.state();
    const cogsJob = state.bookJobs.find(j => j.key === `cogs:${shipment.id}`);
    assert.equal(cogsJob.status, 'posted', JSON.stringify(cogsJob));

    dropCreditRequest = true;
    const returned = await pier.command('return.scan', { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines.find(l => l.itemId === bowl.id).id, quantity: '1', locationId: b.source.id, binCode: b.source.name, reason: 'Customer ordered too many', condition: 'sellable', disposition: 'restock' });
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
    // Pantry's inventory account equals Pier's landed valuation to the cent.
    await pier.command('book.sync', {});
    state = await pier.state();
    const report = await (await pier.request('/api/pier/reports')).json();
    const tb = await pantry.view('reports/trial-balance');
    assert.equal(tb.rows.find(r => r.id === inventory.id).net, cents(report.valuation.total));
    assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
  } finally { await pier?.close(); await pantry.close(); }
});
