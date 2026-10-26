import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics } from './harness.mjs';

async function member(h) {
  const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
  assert.equal(entered.status, 303);
  const cookie = entered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const session = await (await h.request('/auth/session', { as: cookie })).json();
  return { cookie, id: session.operator.id };
}
async function fixedRoute(h, warehouse) {
  let route = await h.command('routing.save', { source: 'manual', mode: 'fixed', shortage: 'hold', eligible: [warehouse] });
  route = await h.command('routing.preview', { ruleId: route.id, version: route.version });
  await h.command('routing.activate', { ruleId: route.id, version: route.version });
}
async function committed(h, b, warehouse, quantity = '10') {
  const po = await h.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: warehouse, promiseDate: '2099-01-01', reason: 'synthetic-pier-1', lines: [{ itemId: b.item.id, quantity, price: '19.37' }] });
  await h.command('po.approve', { poId: po.id, version: po.version });
  return h.command('po.commit', { poId: po.id, version: po.version });
}
const exportBusiness = async h => { const { exportedAt, ...business } = await (await h.request('/api/pier/export')).json(); return business; };

export async function scopedWarehouseWork(t) {
  const outbound = [];
  const h = await installation({ outboundService: request => { outbound.push(new URL(request.url).origin); throw new Error('No external destination was authorized.'); } });
  t.after(async () => { await h.close(); assert.deepEqual(outbound, []); });
  const b = await basics(h), staff = await member(h);
  const second = await h.command('location.save', { name: 'A2', warehouse: 'North', kind: 'bin', barcode: 'synthetic-pier-2' });
  const north = await committed(h, b, 'North'), south = await committed(h, b, 'South');
  await h.command('customField.define', { ownerType: 'item', key: 'private', label: 'Private', type: 'text' });
  await h.command('customField.set', { ownerType: 'item', recordId: b.item.id, version: b.item.version, values: { private: 'synthetic-pier-3' } });
  const grant = async locationIds => h.command('role.set', { operatorId: staff.id, role: 'warehouse', permissions: { warehouses: ['North'], locationIds } });
  await grant([b.source.id]);
  const run = (type, payload, opts = {}) => h.command(type, payload, { as: staff.cookie, ...opts });
  const get = path => h.request(path, { as: staff.cookie });
  let state = await (await get('/api/pier/state')).json();
  assert.deepEqual(state.purchaseOrders.map(po => po.id), [north.id]);
  assert.deepEqual(state.parties, []);
  assert.equal(state.purchaseOrders[0].lines[0].price, undefined);
  assert.equal(state.items[0].customFields, undefined);
  const before = await exportBusiness(h);
  await run('receiving.start', { poId: south.id, locationId: b.source.id }, { error: 'SCOPE' });
  await run('receiving.start', { poId: north.id, locationId: b.destination.id }, { error: 'SCOPE' });
  assert.deepEqual(await exportBusiness(h), before);
  const misdirected = await committed(h, b, 'North');
  await h.command('receiving.start', { poId: misdirected.id, locationId: b.destination.id });
  const outsideTally = await exportBusiness(h);
  await run('receiving.start', { poId: misdirected.id, locationId: b.source.id }, { error: 'SCOPE' });
  assert.deepEqual(await exportBusiness(h), outsideTally, 'an existing outside tally cannot write a successful command result');
  let receiving = await run('receiving.start', { poId: north.id, locationId: b.source.id });
  const tallyBefore = await exportBusiness(h);
  for (const code of [b.destination.name, second.barcode]) await run('receiving.scan', { receivingId: receiving.id, code }, { error: 'SCOPE' });
  assert.deepEqual(await exportBusiness(h), tallyBefore, 'denied bin scans leave the tally, stock, audit and successful results untouched');
  receiving = await run('receiving.scan', { receivingId: receiving.id, code: b.item.barcode, count: '8' });
  const payload = { receivingId: receiving.id, version: receiving.version, supplierReference: 'synthetic-pier-4' }, commandId = randomUUID();
  await run('receiving.post', { ...payload, landedCost: { freight: '1', duty: '0', allocation: 'value' } }, { error: 'SCOPE' });
  const receipt = await run('receiving.post', payload, { commandId });
  assert.equal(receipt.lines[0].quantity, '8');
  assert.equal(receipt.lines[0].cost, undefined);
  assert.deepEqual(await run('receiving.post', payload, { commandId }), receipt);
  const recovered = await (await get('/api/pier/state?commandId=' + commandId)).json();
  assert.ok(recovered.commands.some(command => command.id === commandId));
  assert.ok(recovered.commands.every(command => command.actorId === staff.id && !('result' in command)), 'recovery metadata discloses neither other people nor result bodies');
  assert.equal((await h.state()).receipts.find(row => row.id === receipt.id).lines[0].cost, '19.37');
  await fixedRoute(h, 'North');
  const order = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '3', price: '71.29' }] });
  const carrier = await h.command('carrier.save', { name: 'synthetic-pier-5', warehouse: 'North', dock: 'North dock', cutoff: '16:00', timeZone: 'America/Chicago' });
  await run('wave.release', { carrierId: carrier.id, orderIds: [order.id] }, { error: 'SCOPE' });
  await grant([]);
  let wave = await run('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  const line = wave.lines[0];
  wave = await run('pick.scan', { waveId: wave.id, lineId: line.id, binCode: b.source.name, itemCode: b.item.barcode, quantity: '3' });
  assert.equal(wave.status, 'picked');
  const packing = { waveId: wave.id, orderId: order.id };
  let pack;
  for (let i = 0; i < 3; i++) pack = await run('pack.scan', { ...packing, code: b.item.barcode });
  pack = await run('pack.measure', { ...packing, carton: 1, weight: '1', length: '8', width: '6', height: '4' });
  pack = await run('pack.close', packing);
  assert.equal(pack.status, 'packed');
  for (const path of [`/api/pier/orders/${order.id}/packing-slip`, `/api/pier/packs/${pack.id}/packing-slip`]) {
    const response = await get(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(b.item.name));
    for (const privateValue of [b.customer.name, '19.37', '71.29', 'synthetic-pier-3']) assert.ok(!html.includes(privateValue), path + ' excludes protected data');
  }
  const dispatchId = randomUUID();
  const shipped = await run('pack.dispatch', { ...packing, shipmentReference: 'synthetic-pier-6' }, { commandId: dispatchId });
  assert.ok(shipped.id);
  assert.equal((await h.state()).positions.find(row => row.locationId === b.source.id && row.itemId === b.item.id).quantity, '5');
  state = await (await get('/api/pier/scope-export')).json();
  assert.equal(state.orders[0].customerId, undefined);
  assert.equal(state.orders[0].lines[0].price, undefined);
  assert.equal(state.receipts[0].lines[0].cost, undefined);
  const exact = await exportBusiness(h);
  await h.command('role.set', { operatorId: staff.id, role: 'warehouse', permissions: { warehouses: [], locationIds: [] } });
  const revoked = await exportBusiness(h);
  for (const path of [`/api/pier/orders/${order.id}/packing-slip`, `/api/pier/packs/${pack.id}/packing-slip`]) assert.equal((await get(path)).status, 403);
  await run('pack.dispatch', { ...packing, shipmentReference: 'synthetic-pier-6' }, { commandId: dispatchId, error: 'SCOPE' });
  await run('receiving.post', payload, { commandId, error: 'SCOPE' });
  assert.deepEqual(await exportBusiness(h), revoked);
  assert.deepEqual(revoked.movements, exact.movements);
}

export async function commercialRoleMatrix(t) {
  const outbound = [];
  const h = await installation({ outboundService: request => { outbound.push(new URL(request.url).origin); throw new Error('No external destination was authorized.'); } });
  t.after(async () => { await h.close(); assert.deepEqual(outbound, []); });
  const b = await basics(h), staff = await member(h), po = await committed(h, b, 'North');
  await h.command('priceList.save', { itemId: b.item.id, customerId: b.customer.id, price: '71.29' });
  await h.command('customer.profile', { customerId: b.customer.id, version: b.customer.version, contacts: ['synthetic-pier-7 private@example.test'], addresses: [], paymentTerms: { kind: 'net30' }, reason: 'synthetic-pier-7' });
  const order = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '1' }] });
  const read = path => h.request(path, { as: staff.cookie });
  const run = (type, payload, opts = {}) => h.command(type, payload, { as: staff.cookie, ...opts });
  const setRole = (role, extra = {}) => h.command('role.set', { operatorId: staff.id, role, ...extra });
  const opaque = 'synthetic-pier-8';
  const privateDoors = ['/api/pier/export', '/api/pier/native-export', '/api/pier/reports', '/api/pier/books/export.csv', '/api/pier/books/export.iif', '/api/pier/audit', '/api/pier/privacy', '/api/pier/trace', '/api/pier/returns/lookup', '/api/pier/dispatch-summary', '/api/pier/print', '/api/pier/documents', '/api/pier/custom-fields', `/api/pier/report-snapshots/${opaque}.csv`, `/api/pier/documents/${opaque}/original`, `/api/pier/sales-documents/${opaque}.pdf`, `/api/pier/shipping/labels/${opaque}.pdf`, `/api/pier/shipping/labels/${opaque}.zpl`, `/api/pier/edi/documents/${opaque}`, `/api/pier/edi/labels/${opaque}/006141411234567890.svg`];
  for (const role of ['buyer', 'sales', 'operator', 'warehouse', 'finance', 'viewer', 'agent']) {
    await setRole(role);
    const stateResponse = await read('/api/pier/state');
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.deepEqual(state.invoices, []);
    assert.deepEqual(state.customerProfiles ?? [], []);
    assert.ok(!JSON.stringify(state).includes('private@example.test'));
    assert.ok(!JSON.stringify(state).includes('synthetic-pier-7'));
    if (role === 'buyer') assert.equal(state.purchaseOrders.find(row => row.id === po.id).lines[0].price, '19.37');
    else assert.ok(!JSON.stringify(state).includes('19.37'), role + ' has no purchasing cost');
    if (['sales', 'operator'].includes(role)) assert.equal(state.orders.find(row => row.id === order.id).lines[0].price, '71.29');
    else assert.ok(!JSON.stringify(state).includes('71.29'), role + ' has no customer pricing');
    for (const path of privateDoors) assert.equal((await read(path)).status, 403, role + ' cannot read ' + path);
    for (const kind of ['margin', 'allocation']) assert.equal((await read('/api/pier/questions?kind=' + kind)).status, 403);
    await run('role.set', { operatorId: staff.id, role: 'owner' }, { error: 'FORBIDDEN' });
    await run('customer.profile', { customerId: b.customer.id }, { error: 'FORBIDDEN' });
    await run('book.connect', {}, { error: 'FORBIDDEN' });
    if (role !== 'buyer') await run('po.approve', { poId: po.id, version: po.version }, { error: 'FORBIDDEN' });
    if (!['sales', 'operator'].includes(role)) await run('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '1' }] }, { error: 'FORBIDDEN' });
  }
  // Hiding costs removes both fresh purchasing authority and exact saved results.
  await setRole('buyer');
  const draftPayload = { supplierId: b.supplier.id, promiseDate: '2099-01-01', reason: 'synthetic-pier-9', lines: [{ itemId: b.item.id, quantity: '1', price: '19.37' }] }, draftId = randomUUID();
  const draft = await run('po.draft', draftPayload, { commandId: draftId });
  await run('po.approve', { poId: draft.id, version: draft.version });
  await setRole('buyer', { visibility: { costs: false } });
  const before = await exportBusiness(h);
  await run('po.draft', draftPayload, { commandId: draftId, error: 'VISIBILITY' });
  await h.command('po.commit', { poId: draft.id, version: draft.version }, { error: 'APPROVER_REVOKED' });
  const hidden = await (await read('/api/pier/state')).json();
  assert.ok(!JSON.stringify(hidden).includes('19.37'));
  assert.equal((await read('/api/pier/supplier-performance')).status, 403);
  assert.deepEqual(await exportBusiness(h), before);
  await setRole('sales');
  const priced = { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '1' }] }, saleId = randomUUID();
  const sale = await run('order.create', priced, { commandId: saleId });
  assert.equal(sale.lines[0].price, '71.29');
  await setRole('sales', { visibility: { prices: false } });
  await run('order.create', priced, { commandId: saleId, error: 'VISIBILITY' });
  assert.ok(!JSON.stringify(await (await read('/api/pier/state')).json()).includes('71.29'));
  // Restoring the same role is not permission to recover an old role revision.
  await setRole('sales');
  await run('order.create', priced, { commandId: saleId, error: 'FORBIDDEN' });
  await h.command('role.set', { operatorId: staff.id, role: 'finance', visibility: { costs: true } }, { error: 'VISIBILITY' });
}
