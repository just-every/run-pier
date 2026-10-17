import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics, buy, receive } from './harness.mjs';
import { pantryInstallation } from './pantry-installation.mjs';

test('one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs', async () => {
  const pantry = await pantryInstallation();
  let pier, loseCreditResponse = false;
  try {
    await pantry.command('chart.start', {});
    const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
    const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
    const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' });
    const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
    pier = await installation({ async outboundService(request) {
      assert.equal(new URL(request.url).origin, pantry.origin);
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const isCredit = request.url.endsWith('/invoice.save-draft') && JSON.parse(new TextDecoder().decode(body)).kind === 'credit';
      const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
      if (loseCreditResponse && isCredit) { loseCreditResponse = false; await response.text(); throw new Error('Synthetic response loss after Pantry saved a credit'); }
      return response;
    } });
    const b = await basics(pier), po = await buy(pier, b, '12');
    await receive(pier, b, po, '12');
    const bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'METALS-RETURN-STOCK', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity: '12', unitPrice: '0.25' }] });
    await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
    await pier.command('book.connect', { baseUrl: pantry.origin, sessionCookie: pantry.cookie, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, writeOffAccountId: damage.id, taxCode: 'exempt' });
    const order = await pier.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '4', price: '2' }] });
    const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SYNTHETIC-RETURN-LABEL', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] });
    const lookup = async code => {
      const response = await pier.request(`/api/pier/returns/lookup?code=${encodeURIComponent(code)}`);
      assert.equal(response.status, 200);
      return response.json();
    };
    const label = await lookup(order.reference), item = await lookup(b.item.barcode);
    assert.deepEqual(label.map(r => r.shipmentLineId), [shipment.lines[0].id]);
    assert.deepEqual(item, label);
    const destination = { locationId: b.destination.id, binCode: b.destination.name, reason: 'Customer ordered too many', condition: 'sellable', disposition: 'restock' };
    const intakeId = randomUUID();
    loseCreditResponse = true;
    const restocked = await pier.command('return.scan', { code: b.item.barcode, ...destination }, { commandId: intakeId });
    assert.equal(restocked.status, 'restocked');
    let state = await pier.invariant();
    assert.equal(state.positions.find(p => p.itemId === b.item.id && p.locationId === b.destination.id && p.status === 'sellable').available, '1');
    assert.equal(state.bookJobs.find(j => j.key === `credit:${restocked.id}`).status, 'uncertain');
    await pier.command('return.scan', { code: b.item.barcode, ...destination }, { commandId: intakeId });
    await pier.command('book.sync', {});
    state = await pier.state();
    assert.equal(state.returns.length, 1);
    assert.equal(state.bookJobs.find(j => j.key === `credit:${restocked.id}`).status, 'posted');
    let sales = await pantry.view('sales');
    assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 1);
    const invoice = sales.invoices.find(i => i.kind === 'invoice');
    const credit = sales.invoices.find(i => i.kind === 'credit');
    assert.equal(credit.credit_for, invoice.id); assert.equal(credit.total_cents, 200); assert.equal(credit.status, 'issued');
    assert.equal(invoice.open_cents, 600);
    // An order label needs a deliberate line/quantity confirmation, then posts without a second item scan.
    const fromLabel = { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, quantity: '1', ...destination, condition: 'damaged', disposition: 'writeoff', reason: 'Crushed in transit' };
    const beforeRefusal = await pier.state();
    await pier.command('return.scan', { ...fromLabel, disposition: 'restock' }, { error: 'RETURN_CONDITION' });
    const refused = await pier.state(); assert.equal(refused.returns.length, beforeRefusal.returns.length); assert.equal(refused.movements.length, beforeRefusal.movements.length);
    const writtenoff = await pier.command('return.scan', fromLabel);
    assert.equal(writtenoff.status, 'writtenoff'); assert.equal(writtenoff.writeOffCostTotal, '0.250000000000');
    await pier.command('return.scan', { ...fromLabel, quantity: '3' }, { error: 'RETURN_LIMIT' });
    // A receiver lacking inspection authority cannot make the same scan sellable.
    const entered = await fetch(`${pier.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': pier.devKey } });
    assert.equal(entered.status, 303);
    const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const session = await (await pier.request('/auth/session', { as: cookie })).json();
    await pier.command('role.set', { operatorId: session.operator.id, role: 'operator' });
    const waiting = await pier.command('return.scan', { code: b.item.barcode, ...destination }, { as: cookie });
    assert.equal(waiting.status, 'quarantine'); assert.equal(waiting.inspectedBy, undefined);
    await pier.command('return.inspect', { returnId: waiting.id, version: waiting.version, ...destination }, { as: cookie, error: 'FORBIDDEN' });
    state = await pier.invariant();
    assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'sellable').quantity, '1');
    assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'quarantine').quantity, '1');
    await pier.command('return.inspect', { returnId: waiting.id, version: waiting.version, ...destination });
    const quarantined = await pier.command('return.scan', { ...fromLabel, code: shipment.reference, disposition: 'quarantine', reason: 'Damaged packaging pending review' });
    assert.equal(quarantined.status, 'quarantine');
    await pier.command('book.sync', {}); await pier.command('book.sync', {});
    state = await pier.invariant(); sales = await pantry.view('sales');
    assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'sellable').quantity, '2');
    assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'quarantine').quantity, '1');
    assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 4);
    assert.equal(sales.invoices.find(i => i.kind === 'invoice').open_cents, 0);
    assert.equal(state.orders.find(o => o.id === order.id).books.credited, '8.000000000000');
    assert.equal(state.orders.find(o => o.id === order.id).books.status, 'reconciled');
    const tb = await pantry.view('reports/trial-balance');
    assert.equal(tb.balanced, true); assert.equal(tb.rows.find(r => r.id === inventory.id).net, 275);
    // Pantry omits zero-net accounts from trial balance; its general ledger
    // proves both the original COGS and all four reversals, rather than treating a missing row as zero.
    const cogsLedger = await pantry.view(`reports/general-ledger?from=2000-01-01&to=${new Date().toISOString().slice(0, 10)}&account=${encodeURIComponent(cogs.id)}`);
    const cogsAccount = cogsLedger.accounts.find(a => a.id === cogs.id);
    assert.ok(cogsAccount);
    assert.equal(cogsAccount.rows.reduce((n, r) => n + r.debit_cents, 0), 100);
    assert.equal(cogsAccount.rows.reduce((n, r) => n + r.credit_cents, 0), 100);
    assert.equal(cogsAccount.closing, 0); assert.equal(tb.rows.find(r => r.id === damage.id).net, 25);
    assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
    assert.equal(state.bookJobs.filter(j => ['review', 'uncertain'].includes(j.status)).length, 0);
  } finally { await pier?.close(); await pantry.close(); }
});
