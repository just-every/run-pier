import test from 'node:test';
import assert from 'node:assert/strict';
import { installation } from './harness.mjs';

test('BUY-005: exported A–E stock reproduces reorder batches, coverage, alternate supplier, defaults and shared company/location low stock', async t => {
 const h = await installation(); t.after(() => h.close());
 const command = h.command;
 const supplier = async name => command('party.save', { name, kind: 'supplier' });
 const s1 = await supplier('S1'), s2 = await supplier('S2'), s3 = await supplier('S3');
 const customer = await command('party.save', { name: 'Wholesale buyer', kind: 'customer' });
 const bin = async (name, warehouse, kind = 'bin') => command('location.save', { name, warehouse, kind });
 const east = await bin('East rack', 'East'), west = await bin('West rack', 'West'), transit = await bin('Transfer van', 'Road', 'transit');
 const items = {};
 for (const sku of ['A', 'B', 'C', 'D', 'E']) items[sku] = await command('item.save', { sku, name: `SKU ${sku}`, unit: 'each', packSize: '1' });
 const purchase = async (item, quantity, destination, received = quantity) => {
  let po = await command('po.draft', { supplierId: s1.id, destinationWarehouse: destination.warehouse, promiseDate: '2026-11-01', reason: 'Independent fixture supply', lines: [{ itemId: item.id, quantity, price: '1' }] });
  await command('po.approve', { poId: po.id, version: po.version }); po = await command('po.commit', { poId: po.id, version: po.version });
  if (received !== '0') await command('receipt.create', { poId: po.id, supplierReference: `${item.sku}-${destination.warehouse}`, lines: [{ poLineId: po.lines[0].id, locationId: destination.id, quantity: received, cost: '1' }] });
  return po;
 };
 await purchase(items.A, '8', east); await purchase(items.A, '6', east, '0');
 const bp = await purchase(items.B, '30', west, '25');
 await command('order.create', { customerId: customer.id, warehouse: 'West', lines: [{ itemId: items.B.id, quantity: '32', price: '2' }] });
 // Later receipt leaves the existing 25 allocated and 7 unfilled, without silently reallocating.
 await command('receipt.create', { poId: bp.id, supplierReference: 'B later five', lines: [{ poLineId: bp.lines[0].id, locationId: west.id, quantity: '5', cost: '1' }] });
 await purchase(items.C, '4', east); await purchase(items.D, '8', east); await purchase(items.D, '6', west);
 await command('transfer.send', { itemId: items.D.id, quantity: '8', fromLocationId: east.id, toLocationId: west.id, transitLocationId: transit.id, reason: 'Eight inbound to West' });
 await purchase(items.E, '2', east); await purchase(items.E, '40', west);
 const terms = async (sku, supplier, pack, minimum, extra = {}) => command('supplierItem.save', { itemId: items[sku].id, supplierId: supplier.id, code: `${sku}-${supplier.name}`, packSize: pack, minimum, price: '1', leadDays: 7, ...extra });
 await terms('A', s1, '12', '24', { minimumValue: '1000' }); await terms('B', s2, '6', '0'); await terms('B', s3, '10', '0', { leadDays: 2 });
 await terms('C', s1, '1', '10', { reorderQuantity: '3' }); await terms('D', s1, '1', '0'); await terms('E', s1, '1', '0');
 const policy = async (sku, warehouse, supplier, point, quantity, extra = {}) => command('replenishment.save', { itemId: items[sku].id, warehouse, version: 0, supplierId: supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: point, reorderQuantity: quantity, ...extra });
 await policy('A', 'East', s1, '20', '40'); await policy('B', 'West', s2, '10', '20', { method: 'upTo', maximum: '60' });
 await policy('C', 'East', s1, '5', '8'); await policy('D', 'West', s1, '10', '10'); await policy('E', 'East', s1, '5', '10');
 const read = async path => { const response = await h.request(path); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
 const low = s => s.forecasts.filter(f => f.configured && f.low);
 // Independent integer-unit calculator reads source exports, never product projections or implementation helpers.
 function calculate(source, itemId, warehouse, supplierId) {
   const locs = new Set(source.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse).map(l => l.id));
   const onHand = source.movements.filter(m => m.itemId === itemId && m.status === 'sellable' && locs.has(m.locationId)).reduce((n, m) => n + Number(m.quantity) / 1e6, 0);
   const reserved = source.reservations.filter(r => r.itemId === itemId && locs.has(r.locationId)).reduce((n, r) => n + Number(r.quantity) / 1e6, 0);
   let backorders = 0;
   for (const o of source.orders.filter(o => o.warehouse === warehouse)) for (const l of o.lines.filter(l => l.itemId === itemId)) backorders += Math.max(0, Number(l.quantity) - Number(l.dispatched) - Number(l.cancelled) - source.reservations.filter(r => r.orderLineId === l.id).reduce((n, r) => n + Number(r.quantity) / 1e6, 0));
   const poQuantity = status => source.purchaseOrders.filter(p => p.destinationWarehouse === warehouse && p.status === status).flatMap(p => p.lines).filter(l => l.itemId === itemId).reduce((n, l) => n + Math.max(0, Number(l.quantity) - Number(l.received)), 0);
   const inbound = source.transfers.filter(x => x.itemId === itemId && x.status === 'transit' && locs.has(x.toLocationId)).reduce((n, x) => n + Number(x.quantity) - Number(x.received ?? 0), 0);
   const p = source.replenishmentPolicies.find(p => p.itemId === itemId && p.warehouse === warehouse), term = source.supplierItems.find(t => t.itemId === itemId && t.supplierId === supplierId);
   const position = onHand - reserved - backorders + poQuantity('committed') + inbound;
   const unrounded = Math.max(0, (p.method === 'upTo' ? Number(p.maximum) : Number(p.reorderPoint) + Number(term.reorderQuantity ?? p.reorderQuantity)) - position);
   const rounded = Math.ceil(Math.max(unrounded, Number(term.minimum)) / Number(term.packSize)) * Number(term.packSize);
   return { position, onHand, reserved, backorders, inbound, need: unrounded, rounded, remaining: Math.max(0, rounded - poQuantity('draft')) };
 }
 const concordance = async () => {
   const state = await h.state(), expected = low(state).map(f => `${f.itemId}:${f.scope}:${f.warehouse}`).sort();
   const report = await read('/api/pier/reports');
   assert.deepEqual(report.lowStock.map(f => `${f.itemId}:${f.scope}:${f.warehouse}`).sort(), expected);
   assert.deepEqual(state.replenishmentExceptions.filter(e => e.status === 'open').map(e => `${e.itemId}:${e.scope}:${e.warehouse}`).sort(), expected);
   return state;
 };
 let state = await concordance(), source = await read('/api/pier/export');
 assert.deepEqual(low(state).map(f => [source.items.find(i => i.id === f.itemId).sku, f.suggestedQuantity]).sort(), [['A', '48'], ['B', '66'], ['C', '10'], ['E', '13']]);
 for (const f of low(state)) {
   const expected = calculate(source, f.itemId, f.warehouse, f.supplierId);
   assert.equal(Number(f.position), expected.position); assert.equal(Number(f.onHand), expected.onHand); assert.equal(Number(f.reserved), expected.reserved); assert.equal(Number(f.backorders), expected.backorders);
   assert.equal(Number(f.inboundTransfers), expected.inbound); assert.equal(Number(f.unroundedNeed), expected.need); assert.equal(Number(f.roundedQuantity), expected.rounded); assert.equal(Number(f.suggestedQuantity), expected.remaining);
 }
 const movements = source.movements;
 const batch = await command('replenishment.plan', {});
 assert.equal(batch.drafts.length, 2);
 const eastDraft = batch.drafts.find(p => p.destinationWarehouse === 'East'), westDraft = batch.drafts.find(p => p.destinationWarehouse === 'West');
 assert.equal(eastDraft.supplierId, s1.id); assert.equal(eastDraft.minimumOrderValueUnmet, true);
 let revised = await command('po.revise', { poId: eastDraft.id, version: eastDraft.version, supplierId: s1.id, destinationWarehouse: 'East', promiseDate: eastDraft.promiseDate, reason: 'Reviewed price revision', lines: eastDraft.lines.map(l => ({ ...l, price: l.itemId === items.A.id ? '100' : l.price })) });
 assert.equal(revised.minimumOrderValueUnmet, false, 'the actual revised draft value is checked again');
 revised = await command('po.revise', { poId: eastDraft.id, version: revised.version, supplierId: s1.id, destinationWarehouse: 'East', promiseDate: eastDraft.promiseDate, reason: 'Restore supplier price', lines: eastDraft.lines });
 assert.equal(revised.minimumOrderValueUnmet, true);
 assert.deepEqual(eastDraft.lines.map(l => [items.A.id === l.itemId ? 'A' : items.C.id === l.itemId ? 'C' : 'E', l.quantity]).sort(), [['A', '48'], ['C', '10'], ['E', '13']]);
 assert.equal(westDraft.supplierId, s2.id); assert.equal(westDraft.lines[0].quantity, '66');
 state = await concordance(); assert.equal(low(state).length, 4); assert.ok(low(state).every(f => f.suggestedQuantity === '0' && f.draftIds.length === 1));
 assert.deepEqual((await command('replenishment.plan', {})).draftIds, []);
 await command('po.delete', { poId: westDraft.id, version: westDraft.version });
 state = await concordance(); assert.equal(low(state).find(f => f.itemId === items.B.id).suggestedQuantity, '66');
 const alternate = await read(`/api/pier/replenishment?${new URLSearchParams({ itemId: items.B.id, warehouse: 'West', supplierId: s3.id })}`);
 assert.equal(alternate.find(f => f.itemId === items.B.id && f.warehouse === 'West').suggestedQuantity, '70');
 const altBatch = await command('replenishment.plan', { stateVersion: state.version, lines: [{ itemId: items.B.id, warehouse: 'West', supplierId: s3.id, quantity: '80' }] });
 assert.equal(altBatch.drafts.length, 1); assert.equal(altBatch.drafts[0].supplierId, s3.id); assert.equal(altBatch.drafts[0].lines[0].quantity, '80');
 await command('po.delete', { poId: altBatch.drafts[0].id, version: 1 });
 const restored = (await command('replenishment.plan', { lines: [{ itemId: items.B.id, warehouse: 'West' }] })).drafts[0];
 await command('po.approve', { poId: restored.id, version: restored.version }); await command('po.commit', { poId: restored.id, version: restored.version });
 state = await concordance(); assert.ok(!low(state).some(f => f.itemId === items.B.id));
 await command('replenishment.check', {}); await command('replenishment.check', {}); assert.equal((await h.state()).replenishmentExceptions.length, state.replenishmentExceptions.length);
 let settings = await command('replenishment.configure', { version: 0, mode: 'company', warehouses: ['East', 'West'], destinationWarehouse: 'East' });
 state = await concordance(); assert.ok(!low(state).some(f => f.itemId === items.E.id)); assert.ok(low(state).every(f => f.warehouse === 'East' && f.scope === 'company'));
 assert.deepEqual((await read('/api/pier/export')).movements, movements, 'drafts, settings, checks and reports never move physical stock');
 // A SKU default fills missing local settings; an explicit location retains precedence.
 await policy('E', 'East', s1, '4', '9', { scope: 'sku', companyReorderPoint: '60' });
 state = await concordance(); assert.equal(low(state).find(f => f.itemId === items.E.id).applied.reorderPoint, '60');
 settings = await command('replenishment.configure', { version: settings.version, mode: 'location', warehouses: ['East', 'West'], destinationWarehouse: 'East' });
 state = await concordance(); const eWest = state.forecasts.find(f => f.itemId === items.E.id && f.warehouse === 'West'); assert.equal(eWest.applied.reorderPoint, '4'); assert.equal(eWest.applied.reorderQuantity, '9'); assert.equal(eWest.supplierId, s1.id);
 const eEast = state.forecasts.find(f => f.itemId === items.E.id && f.warehouse === 'East'); assert.equal(eEast.applied.reorderPoint, '5'); assert.equal(eEast.applied.reorderQuantity, '10');
 await command('replenishment.plan', { stateVersion: state.version - 1, lines: [{ itemId: items.E.id, warehouse: 'East' }] }, { error: 'STALE' });
 await command('replenishment.configure', { version: settings.version, mode: 'company', warehouses: ['East'], destinationWarehouse: 'West' }, { error: 'WAREHOUSE' });
 await command('location.save', { ...west, warehouse: 'Renamed West' });
 state = await h.state(); assert.match(state.replenishmentProblem, /Planning warehouses changed/);
 await command('replenishment.plan', {}, { error: 'WAREHOUSE' });
 await h.invariant();
});
