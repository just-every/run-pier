import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';
import { pantryInstallation } from './pantry-installation.mjs';

test('a Stripe-confirmed shop order posts its shipped shares as paid Pantry invoices without duplicating a payment', async t => {
  const pantry = await pantryInstallation(); t.after(() => pantry.close());
  await pantry.command('chart.start', {});
  const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory', type: 'asset', subtype: 'other' });
  const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of goods', type: 'expense', subtype: 'other' });
  const chart = await pantry.view('state');
  const bank = await pantry.command('bank-account.save', { name: 'Stripe clearing', institution: 'Stripe', accountId: chart.accounts.find(a => a.code === '1000').id, numberLast4: '4242', openingDate: '2026-01-01', openingBalance: '0.00' });
  const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'payments:write', 'reports:read', 'post'] });
  let losePaymentReply = true;
  const pier = await installation({ async outboundService(request) {
    if (new URL(request.url).hostname === 'shop.example.test') return Response.json({ products: [], orders: [] });
    const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }) });
    if (losePaymentReply && request.method === 'POST' && request.url.endsWith('/payments')) { losePaymentReply = false; await response.text(); throw new Error('Network response lost after Pantry recorded payment'); }
    return response;
  } }); t.after(() => pier.close());
  const b = await basics(pier); await receive(pier, b, await buy(pier, b, '10'), '10');
  const channel = await pier.command('channel.save', { name: 'Shop', provider: 'stall', baseUrl: 'https://shop.example.test', warehouse: 'North', credentials: { accessToken: 'synthetic-network-edge' } });
  const key = await pier.command('channel.stallKey', { channelId: channel.id, version: channel.version, customerId: b.customer.id });
  async function shop(type, payload, commandId = crypto.randomUUID()) {
    const response = await fetch(pier.origin + '/api/pier/commands', { method: 'POST', headers: { origin: pier.origin, cookie: `pier_channel=${key.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ commandId, type, payload }) });
    const value = await response.json(); assert.equal(value.ok, true, JSON.stringify(value)); return value.result;
  }
  const order = await shop('order.create', { customerId: b.customer.id, channel: 'stall', currency: 'USD', lines: [{ itemId: b.item.id, quantity: '2', price: '14.00' }] });
  const evidence = { provider: 'stripe', reference: 'pi_shop_transport', amount: '28.00', currency: 'USD', paidAt: new Date().toISOString(), orderReference: 'shop-123' };
  await pier.command('order.channelPayment', { orderId: order.id, payment: evidence }, { error: 'CHANNEL_PAYMENT' });
  await shop('order.channelPayment', { orderId: order.id, payment: evidence }, 'shop-payment-123');
  await shop('order.channelPayment', { orderId: order.id, payment: evidence }, 'shop-payment-123');
  const connection = { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: chart.accounts.find(a => a.code === '4000').id, stripeBankAccountId: bank.id, taxCode: 'exempt' };
  const accounts = await pier.command('book.accounts', connection); assert.ok(accounts.bankAccounts.some(a => a.id === bank.id));
  await pier.command('book.connect', connection);
  const first = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SHOP-FIRST', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
  await pier.command('book.sync', {}); await pier.command('book.sync', {});
  let sales = await pantry.view('sales'); assert.equal(sales.invoices.length, 1); assert.equal(sales.invoices[0].open_cents, 0);
  let state = await pier.state(); assert.equal(state.bookJobs.find(j => j.key === `invoice:${first.id}`).status, 'reconciled');
  await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SHOP-SECOND', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
  await pier.command('book.sync', {}); await pier.command('book.sync', {});
  sales = await pantry.view('sales'); assert.equal(sales.invoices.length, 2); assert.ok(sales.invoices.every(i => i.open_cents === 0));
  const payments = await pantry.view('sales'); assert.equal(payments.payments.length, 2); assert.equal(payments.payments.reduce((n, p) => n + p.amount_cents, 0), 2800);
  const tb = await pantry.view('reports/trial-balance'); assert.equal(tb.balanced, true);
  await pantry.command('journal.reverse', { id: payments.payments[0].journal_id, date: new Date().toISOString().slice(0, 10), memo: 'Stripe payment reversed by accountant' });
  await pier.command('book.sync', {});
  state = await pier.state();
  assert.equal(Number(state.orders.find(o => o.id === order.id).books.open), 14);
  assert.ok(state.bookJobs.some(j => j.kind === 'invoice' && j.status === 'review' && /reversed in Pantry/.test(j.reason)));
  assert.equal((await pantry.view('sales')).payments.length, 2, 'a reversal never creates another payment');
  // Restoring public business state without its secret must be visible before syncing.
  await pier.db.prepare("DELETE FROM pier_channel_secrets WHERE channel_id='books:pantry'").run();
  state = await pier.state(); assert.equal(state.bookConnections[0].credentialPresent, false); assert.match(state.bookConnections[0].problem, /Restored backups/);
});
