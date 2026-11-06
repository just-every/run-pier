import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics } from '../run-pier/tests/api/harness.mjs';
const h = await installation({ now: '2026-11-06T12:00:00.000Z', outboundService: async () => { throw Error('Unexpected provider request'); } });
try {
  const b = await basics(h);
  await h.command('sales.taxTable', { state: 'CA', rate: '8', reason: 'Owner jurisdiction estimate' });
  let q = await h.command('quote.create', { customerId: b.customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, currency: 'USD', lines: [{ itemId: b.item.id, quantity: '1', price: '10' }] });
  q = await h.command('quote.approve', { orderId: q.id, version: q.version, reason: 'Review original USD quote' });
  q = await h.command('quote.accept', { orderId: q.id, version: q.version });
  const snapshot = async () => {
    const response = await h.request('/api/pier/export'); assert.equal(response.status, 200);
    const e = await response.json(), s = await h.state();
    return Object.fromEntries(['orders', 'invoices', 'invoiceCredits', 'shipments', 'returns', 'movements', 'reservations', 'salesDocuments', 'priceLists'].map(k => [k, e[k]]).concat([['positions', s.positions], ['commands', s.commands]]));
  };
  const payload = { orderId: q.id, version: q.version, currency: 'CAD', validUntil: q.validUntil, shipTo: q.shipTo, lines: [{ itemId: b.item.id, quantity: '1', price: '12.34' }], reason: 'Change currency with explicit CAD price' };
  const before = await snapshot();
  const response = await h.request('/api/pier/commands', { method: 'POST', body: { commandId: randomUUID(), type: 'quote.revise', payload } });
  const body = await response.json();
  assert.equal(body.ok, false); assert.equal(body.error.code, 'DECIMAL'); assert.deepEqual(await snapshot(), before);
  const revised = await h.command('quote.revise', { ...payload, usdRate: '0.75' });
  assert.equal(revised.currency, 'CAD'); assert.equal(revised.usdRate, '0.75');
  console.log(JSON.stringify({ finding: 'A', door: 'POST /api/pier/commands', command: 'quote.revise', omittedRate: { httpStatus: response.status, ok: body.ok, error: body.error.code, businessStateUnchanged: true }, explicitRate: { currency: revised.currency, usdRate: revised.usdRate, approvalCleared: revised.quoteApproval === null, acceptanceCleared: revised.acceptedAt === null, originalCurrency: revised.quoteHistory.at(-1).currency, originalRate: revised.quoteHistory.at(-1).usdRate } }, null, 2));
} finally { await h.close(); }
