import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, parse } from './harness.mjs';
import { stockJourney } from './stock-fixtures.mjs';


test('STOCK-001: warehouse and company stock reconcile to exported movements, reservations and destination POs', async t => {
  const h = await installation(); t.after(() => h.close());
  const b = await stockJourney(h);
  const state = await h.state();
  const exported = await (await h.request('/api/pier/export')).json();
  const zero = () => ({ onHand: 0n, reserved: 0n, available: 0n, quarantine: 0n, transit: 0n, expected: 0n });
  const warehouses = new Map();
  const at = warehouse => { if (!warehouses.has(warehouse)) warehouses.set(warehouse, zero()); return warehouses.get(warehouse); };
  for (const m of exported.movements.filter(m => m.itemId === b.item.id)) {
    const q = at(exported.locations.find(l => l.id === m.locationId).warehouse);
    q[m.status === 'sellable' ? 'onHand' : m.status] += BigInt(m.quantity);
  }
  for (const r of exported.reservations.filter(r => r.itemId === b.item.id)) at(exported.locations.find(l => l.id === r.locationId).warehouse).reserved += BigInt(r.quantity);
  for (const hold of exported.channelHolds.filter(row => !row.releasedAt && row.itemId === b.item.id)) for (const allocation of hold.allocations) at(exported.locations.find(l => l.id === allocation.locationId).warehouse).reserved += BigInt(allocation.quantity);
  for (const po of exported.purchaseOrders.filter(po => po.status === 'committed')) for (const line of po.lines) if (line.itemId === b.item.id) at(line.destinationWarehouse ?? po.destinationWarehouse).expected += parse(line.quantity) - parse(line.received);
  const total = zero();
  for (const [warehouse, q] of warehouses) {
    q.available = q.onHand - q.reserved;
    const actual = state.warehouseStocks.find(row => row.itemId === b.item.id && row.warehouse === warehouse);
    for (const field of Object.keys(q)) { assert.equal(parse(actual[field]), q[field], `${warehouse}: ${field}`); total[field] += q[field]; }
  }
  const company = state.companyStocks.find(row => row.itemId === b.item.id);
  for (const field of Object.keys(total)) assert.equal(parse(company[field]), total[field], `Company: ${field}`);
  assert.equal(state.warehouseStocks.find(row => row.warehouse === 'South').expected, '13');
  assert.equal(state.warehouseStocks.filter(row => row.itemId === b.item.id).length, warehouses.size);
  assert.ok(!state.positions.some(row => row.itemId === state.items.find(row => row.sku === 'EMPTY').id));
  for (const p of state.stockPositions) {
    const amount = exported.movements.filter(m => m.itemId === p.itemId && m.locationId === p.locationId && m.status === p.status).reduce((n, m) => n + BigInt(m.quantity), 0n);
    const reserved = p.status !== 'sellable' ? 0n : exported.reservations.filter(r => r.itemId === p.itemId && r.locationId === p.locationId).reduce((n, r) => n + BigInt(r.quantity), 0n) + exported.channelHolds.filter(h => !h.releasedAt && h.itemId === p.itemId).flatMap(h => h.allocations).filter(a => a.locationId === p.locationId).reduce((n, a) => n + BigInt(a.quantity), 0n);
    assert.equal(parse(p.quantity), amount); assert.equal(parse(p.reserved), reserved);
    assert.equal(parse(p.available), p.status === 'sellable' ? amount - reserved : 0n);
  }
});
