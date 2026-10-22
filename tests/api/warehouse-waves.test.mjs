import test from 'node:test';
import assert from 'node:assert/strict';
import { installation } from './harness.mjs';

async function stock(h, bins, quantities) {
  const item = await h.command('item.save', { sku: `synthetic-wave-${quantities.join('-')}`, name: 'Warehouse unit', unit: 'each', barcode: `synthetic-wave-code-${quantities.join('-')}`, packSize: '1' });
  const supplier = await h.command('party.save', { name: 'Warehouse supplier', kind: 'supplier' });
  let po = await h.command('po.draft', { supplierId: supplier.id, promiseDate: '2026-11-01', reason: 'Warehouse journey stock', lines: [{ itemId: item.id, quantity: String(quantities.reduce((a, b) => a + b, 0)), price: '1' }] });
  await h.command('po.approve', { poId: po.id, version: po.version });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-wave-delivery', lines: bins.map((bin, index) => ({ poLineId: po.lines[0].id, locationId: bin.id, quantity: String(quantities[index]), cost: '1' })) });
  return item;
}
const customer = h => h.command('party.save', { name: 'Warehouse customer', kind: 'customer' });
const pickup = h => h.command('carrier.save', { name: 'Warehouse pickup', warehouse: 'Wave warehouse', dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' });
const order = (h, party, lines) => h.command('order.create', { customerId: party.id, warehouse: 'Wave warehouse', lines: lines.map(([item, quantity]) => ({ itemId: item.id, quantity, price: '3' })) });
const measure = (h, payload, carton = 1) => h.command('pack.measure', { ...payload, carton, weight: '1', length: '8', width: '6', height: '4' });

test('zone picks retain separate contributions and merge only the completed order tote at pack', async t => {
  const h = await installation(); t.after(() => h.close());
  const bins = [];
  for (const [name, zone] of [['A-01', 'East'], ['C-01', 'West']]) bins.push(await h.command('location.save', { name, zone, kind: 'bin', warehouse: 'Wave warehouse' }));
  const a = await stock(h, [bins[0]], [2]), b = await stock(h, [bins[1]], [3]);
  const party = await customer(h), carrier = await pickup(h), so = await order(h, party, [[a, '1'], [b, '1']]);
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [so.id], pickMode: 'zone' });
  assert.deepEqual(wave.zones.map(z => [z.name, z.linesOpen]), [['East', 1], ['West', 1]]);
  const first = wave.lines[0], last = wave.lines[1], payload = { waveId: wave.id, orderId: so.id };
  await h.command('pick.scan', { waveId: wave.id, lineId: first.id, zone: 'West', binCode: bins[0].name, itemCode: a.barcode }, { error: 'PICK_ZONE' });
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: first.id, zone: 'East', binCode: bins[0].name, itemCode: a.barcode });
  await h.command('pack.scan', { ...payload, code: a.barcode }); await measure(h, payload);
  const before = await h.state();
  await h.command('pack.close', payload, { error: 'ZONE_INCOMPLETE' });
  assert.equal((await h.state()).version, before.version, 'unfinished zone close is atomic');
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: last.id, zone: 'West', binCode: bins[1].name, itemCode: b.barcode });
  assert.ok(wave.zones.every(z => z.linesOpen === 0));
  await h.command('pack.scan', { ...payload, code: b.barcode });
  const pack = await h.command('pack.close', payload);
  assert.deepEqual(pack.mergedZones, ['East', 'West']); assert.equal(pack.tote, wave.orders[0].tote);
  assert.equal((await h.state()).shipments.length, 0, 'merging and packing do not ship');
  await h.command('pack.dispatch', { ...payload, shipmentReference: 'synthetic-wave-merge' });
  const state = await h.invariant(); assert.equal(state.shipments[0].orderId, so.id);
});

test('ten order totes share one bin walk, overflow moves only its owner, and one short order alone remains open', async t => {
  const h = await installation(); t.after(() => h.close());
  const bins = [];
  for (const name of ['B-03', 'B-09']) bins.push(await h.command('location.save', { name, kind: 'bin', warehouse: 'Wave warehouse' }));
  const item = await stock(h, bins, [20, 2]), party = await customer(h), carrier = await pickup(h), orders = [];
  for (let n = 0; n < 10; n++) orders.push(await order(h, party, [[item, '2']]));
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: orders.map(o => o.id) });
  assert.equal(new Set(wave.orders.map(o => o.tote)).size, 10);
  assert.ok(wave.lines.every(l => l.locationId === bins[0].id));
  const original = (await h.state()).reservations, first = wave.lines[0];
  await h.command('pick.scan', { waveId: wave.id, lineId: first.id, binCode: bins[1].name, itemCode: item.barcode }, { error: 'WRONG_BIN' });
  await h.command('pick.scan', { waveId: wave.id, lineId: first.id, binCode: bins[0].name, itemCode: bins[1].name }, { error: 'SCAN_BIN' });
  wave = await h.command('pick.short', { waveId: wave.id, lineId: first.id, reason: 'B-03 physically empty for this line' });
  let state = await h.state();
  assert.deepEqual(state.reservations.filter(r => r.orderId !== first.orderId), original.filter(r => r.orderId !== first.orderId));
  const overflow = wave.lines.find(l => l.overflowFrom === bins[0].id);
  assert.equal(overflow.locationId, bins[1].id);
  assert.ok(state.counts.some(count => count.locationId === bins[0].id));
  const short = wave.lines.find(l => l.orderId === orders[9].id);
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: short.id, binCode: bins[0].name, itemCode: item.barcode });
  wave = await h.command('pick.short', { waveId: wave.id, lineId: short.id, reason: 'One physical unit missing' });
  assert.equal(wave.lines.find(l => l.id === short.id).short.unfilled, '1');
  for (const line of wave.lines.filter(l => l.status === 'open')) wave = await h.command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: bins.find(b => b.id === line.locationId).name, itemCode: item.barcode, quantity: line.quantity });
  assert.equal(wave.status, 'picked');
  const allocations = (await h.state()).reservations;
  for (const [index, so] of orders.entries()) {
    const payload = { waveId: wave.id, orderId: so.id }, units = index === 9 ? 1 : 2;
    for (let unit = 0; unit < units; unit++) {
      await h.command('pack.scan', { ...payload, code: item.barcode });
      if (index === 0 && unit === 0) await h.command('pack.carton', payload);
    }
    await measure(h, payload); if (index === 0) await measure(h, payload, 2);
    await h.command('pack.close', payload);
    await h.command('pack.dispatch', { ...payload, shipmentReference: `synthetic-wave-shipment-${index}` });
  }
  state = await h.invariant();
  for (const shipment of state.shipments) for (const line of shipment.lines) {
    assert.ok(orders.find(o => o.id === shipment.orderId).lines.some(l => l.id === line.orderLineId));
    for (const link of line.reservations) assert.equal(allocations.find(r => r.id === link.reservationId).orderId, shipment.orderId);
  }
  assert.equal(state.shipments.length, 10);
  assert.deepEqual(state.orders.filter(o => o.lines.some(l => l.dispatched !== l.quantity)).map(o => o.id), [orders[9].id]);
  assert.equal(state.orders.find(o => o.id === orders[9].id).lines[0].backorder, '1');
});

test('a resumed pick refuses its original bin after reviewed reallocation reserves replacement stock elsewhere', async t => {
  const h = await installation(); t.after(() => h.close());
  const bins = [];
  for (const name of ['A-01', 'B-01']) bins.push(await h.command('location.save', { name, kind: 'bin', warehouse: 'Wave warehouse' }));
  const item = await stock(h, [bins[0]], [1]), party = await customer(h), carrier = await pickup(h);
  const first = await order(h, party, [[item, '1']]), second = await order(h, party, [[item, '1']]);
  const wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [first.id] });
  const proposal = await h.command('proposal.prepare', { kind: 'reallocation', assumptions: 'Reviewed customer priority', evidence: [first.id, second.id], plan: { fromOrderId: first.id, toOrderId: second.id, itemId: item.id, quantity: '1' } });
  await h.command('proposal.approve', { proposalId: proposal.id, version: proposal.version });
  await h.command('proposal.execute', { proposalId: proposal.id, version: proposal.version });
  let po = await h.command('po.draft', { supplierId: (await h.state()).parties.find(p => p.kind === 'supplier').id, promiseDate: '2026-11-01', reason: 'Replacement stock', lines: [{ itemId: item.id, quantity: '1', price: '1' }] });
  await h.command('po.approve', { poId: po.id, version: po.version }); po = await h.command('po.commit', { poId: po.id, version: po.version });
  await h.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-wave-replacement', lines: [{ poLineId: po.lines[0].id, locationId: bins[1].id, quantity: '1', cost: '1' }] });
  await h.command('order.reserve', { orderId: first.id });
  const before = await h.state();
  assert.equal(before.reservations.find(r => r.orderId === first.id).locationId, bins[1].id);
  await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: bins[0].name, itemCode: item.barcode }, { error: 'STALE_ALLOCATION' });
  await h.command('pick.short', { waveId: wave.id, lineId: wave.lines[0].id, reason: 'Stale task' }, { error: 'STALE_ALLOCATION' });
  const after = await h.state();
  assert.equal(after.version, before.version); assert.deepEqual(after.movements, before.movements); assert.deepEqual(after.reservations, before.reservations);
});
