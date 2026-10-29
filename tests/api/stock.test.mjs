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
  for (const item of [b.item, b.heldItem]) {
    const warehouses = new Map();
    const at = warehouse => { if (!warehouses.has(warehouse)) warehouses.set(warehouse, zero()); return warehouses.get(warehouse); };
    for (const m of exported.movements.filter(m => m.itemId === item.id)) {
      const q = at(exported.locations.find(l => l.id === m.locationId).warehouse);
      q[m.status === 'sellable' ? 'onHand' : m.status] += BigInt(m.quantity);
    }
    for (const r of exported.reservations.filter(r => r.itemId === item.id)) at(exported.locations.find(l => l.id === r.locationId).warehouse).reserved += BigInt(r.quantity);
    for (const hold of exported.channelHolds.filter(row => !row.releasedAt && row.itemId === item.id)) for (const allocation of hold.allocations) at(exported.locations.find(l => l.id === allocation.locationId).warehouse).reserved += BigInt(allocation.quantity);
    for (const po of exported.purchaseOrders.filter(po => po.status === 'committed')) for (const line of po.lines) if (line.itemId === item.id && parse(line.quantity) > parse(line.received)) at(line.destinationWarehouse ?? po.destinationWarehouse ?? 'Unassigned receiving warehouse').expected += parse(line.quantity) - parse(line.received);
    const total = zero();
    for (const [warehouse, q] of warehouses) {
      q.available = q.onHand - q.reserved;
      const actual = state.warehouseStocks.find(row => row.itemId === item.id && row.warehouse === warehouse);
      for (const field of Object.keys(q)) { assert.equal(parse(actual[field]), q[field], `${item.sku} ${warehouse}: ${field}`); total[field] += q[field]; }
    }
    const company = state.companyStocks.find(row => row.itemId === item.id);
    for (const field of Object.keys(total)) assert.equal(parse(company[field]), total[field], `${item.sku} company: ${field}`);
    assert.equal(state.warehouseStocks.filter(row => row.itemId === item.id).length, warehouses.size);
  }
  assert.equal(state.warehouseStocks.find(row => row.itemId === b.item.id && row.warehouse === 'South').expected, '13');
  const heldLine = state.orders.find(row => row.id === b.heldOrder.id).lines[0];
  assert.equal(heldLine.quantity, '5');
  assert.equal(heldLine.reserved, '0');
  assert.equal(heldLine.backorder, '5');
  assert.deepEqual(exported.reservations.filter(row => row.itemId === b.heldItem.id), [], 'held units never become order reservations');
  assert.ok(exported.reservations.some(row => row.itemId === b.item.id), 'ordinary order reservations remain separately exported');
  assert.deepEqual(exported.channelHolds.filter(row => row.itemId === b.heldItem.id), [b.hold]);
  assert.deepEqual(b.hold.allocations, [{ locationId: b.north2.id, quantity: '3500000' }]);
  assert.equal(exported.movements.filter(row => row.itemId === b.heldItem.id).reduce((sum, row) => sum + BigInt(row.quantity), 0n), 3500000n, 'held stock remains physical');
  const heldBin = state.stockPositions.find(row => row.itemId === b.heldItem.id && row.locationId === b.north2.id);
  assert.equal(heldBin.quantity, '3.5');
  assert.equal(heldBin.reserved, '3.5');
  assert.equal(heldBin.available, '0');
  const rawBin = state.positions.find(row => row.itemId === b.heldItem.id && row.locationId === b.north2.id);
  assert.equal(rawBin.reserved, '0');
  assert.equal(rawBin.held, '3.5');
  const legacy = exported.purchaseOrders.find(row => row.id === b.legacyPo.id);
  assert.equal(legacy.status, 'committed');
  assert.equal(legacy.destinationWarehouse, null);
  assert.equal(legacy.lines[0].destinationWarehouse, undefined);
  assert.equal(legacy.lines[0].quantity, '9.25');
  assert.equal(legacy.lines[0].received, '2');
  assert.equal(state.warehouseStocks.find(row => row.itemId === b.item.id && row.warehouse === 'Unassigned receiving warehouse').expected, '7.25');
  assert.equal(state.warehouseStocks.find(row => row.itemId === b.item.id && row.warehouse === 'North').expected, '10');
  assert.equal(state.companyStocks.find(row => row.itemId === b.item.id).expected, '30.25');
  await h.command('dispatch.create', { orderId: b.heldOrder.id, shipmentReference: 'synthetic-pier-8612', lines: [{ orderLineId: heldLine.id, quantity: '1' }] }, { error: 'RESERVATION' });
  const afterRefusal = await (await h.request('/api/pier/export')).json();
  for (const key of ['movements', 'reservations', 'channelHolds', 'orders', 'shipments', 'purchaseOrders', 'commands']) assert.deepEqual(afterRefusal[key], exported[key], `held-stock dispatch refusal leaves ${key} unchanged`);
  assert.ok(!state.positions.some(row => row.itemId === state.items.find(row => row.sku === 'EMPTY').id));
  for (const p of state.stockPositions) {
    const amount = exported.movements.filter(m => m.itemId === p.itemId && m.locationId === p.locationId && m.status === p.status).reduce((n, m) => n + BigInt(m.quantity), 0n);
    const reserved = p.status !== 'sellable' ? 0n : exported.reservations.filter(r => r.itemId === p.itemId && r.locationId === p.locationId).reduce((n, r) => n + BigInt(r.quantity), 0n) + exported.channelHolds.filter(h => !h.releasedAt && h.itemId === p.itemId).flatMap(h => h.allocations).filter(a => a.locationId === p.locationId).reduce((n, a) => n + BigInt(a.quantity), 0n);
    assert.equal(parse(p.quantity), amount); assert.equal(parse(p.reserved), reserved);
    assert.equal(parse(p.available), p.status === 'sellable' ? amount - reserved : 0n);
  }
});


test('stock consumers resume only acknowledged pages and replay stable events after Worker restart', async t => {
  const h = await installation(); t.after(() => h.close());
  const b = await stockJourney(h);
  // Upgrade fixture: business stock predates the newly installed journal tables.
  await h.db.batch([h.db.prepare('DELETE FROM pier_stock_events'),h.db.prepare('DELETE FROM pier_stock_feed_bootstrap')]);
  const page = async (consumer = 'synthetic-pier-1', checkpoint = '', as) => {
    const response = await h.request(`/api/pier/stock-changes?consumer=${consumer}&limit=2${checkpoint ? '&checkpoint='+checkpoint : ''}`, {as});
    assert.equal(response.status,200,await response.clone().text()); return response.json();
  };
  const ack = async (p, as) => {
    const response = await h.request('/api/pier/stock-changes/ack', {method:'POST',as,body:{consumer:p.consumer,checkpoint:p.pageToken}});
    assert.equal(response.status,200,await response.clone().text()); return response.json();
  };
  assert.equal((await h.request('/api/pier/stock-changes?consumer=anonymous',{as:''})).status,401);
  assert.equal((await h.request('/api/pier/stock-changes?consumer=invalid&limit=101')).status,400);
  const first = await page(); assert.equal(first.events.length,2); await ack(first);
  const healthClock = new Date(Date.parse(first.events[0].at) + 120000).toISOString();
  let health = await (await h.request('/api/pier/integrations', { headers:{'x-pier-test-now':healthClock} })).json();
  let consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-1');
  assert.equal(consumer.cursor, String(first.events.at(-1).sequence));
  assert.ok(consumer.lastSuccessfulSync);
  assert.equal(consumer.uncertain, 0);
  assert.equal(consumer.lagSeconds,120);
  assert.equal(health.observedAt,healthClock);
  assert.equal(consumer.pending,(await h.state()).positions.length-first.events.length);
  const interrupted = await page(); assert.ok(interrupted.events[0].sequence>first.events.at(-1).sequence);
  await h.restartWithFreshSigningKey();
  assert.deepEqual(await page(),interrupted,'fetch never advances the acknowledged checkpoint');
  assert.deepEqual(await page(first.consumer,first.pageToken),interrupted);
  health = await (await h.request('/api/pier/integrations')).json();
  consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-1');
  assert.deepEqual(consumer.effects[0].mapping, interrupted.events.map(event => event.eventId));
  assert.equal(consumer.cursor, String(first.events.at(-1).sequence));
  const processed = new Map(), ids = [];
  for (const event of first.events) { processed.set(event.eventId,event); ids.push(event.eventId); }
  // Replaying an unacknowledged page upserts the same event identities.
  for (const event of [...interrupted.events,...(await page()).events]) processed.set(event.eventId,event);
  assert.equal(processed.size,first.events.length+interrupted.events.length);
  await ack(interrupted); await ack(interrupted);
  assert.equal((await h.request('/api/pier/stock-changes/ack',{method:'POST',body:{consumer:first.consumer,checkpoint:first.pageToken}})).status,409);
  assert.equal((await h.request('/api/pier/stock-changes?consumer=foreign&checkpoint='+interrupted.pageToken)).status,409);
  ids.push(...interrupted.events.map(e=>e.eventId));
  let p = await page();
  while (true) {
    for (const event of p.events) { ids.push(event.eventId); processed.set(event.eventId,event); }
    await ack(p); if (!p.hasMore) break; p = await page();
  }
  const journal = (await (await h.mf.getD1Database('DB')).prepare('SELECT id FROM pier_stock_events ORDER BY sequence').all()).results.map(r=>r.id);
  assert.deepEqual(ids,journal,'pagination includes each committed event once, in durable total order');
  const latest = new Map(); for (const event of processed.values()) latest.set(JSON.stringify([event.itemId,event.locationId,event.status]),event);
  for (const position of (await h.state()).positions) {
    const actual=latest.get(JSON.stringify([position.itemId,position.locationId,position.status]));
    for (const key of ['quantity','reserved','held','available']) assert.equal(actual[key],position[key]);
  }
  assert.ok(p.lagSeconds>=0); assert.ok(p.observedAt);
  const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});
  const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const session=await(await h.request('/auth/session',{as:cookie})).json();
  await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['North'],locationIds:[b.source.id]}});
  assert.equal((await h.request('/api/pier/integrations',{as:cookie})).status,403);
  assert.equal((await h.request('/api/pier/integrations',{as:''})).status,401);
  const scopedPage=await page('synthetic-pier-2','',cookie);
  assert.ok(scopedPage.events.length); assert.ok(scopedPage.events.every(e=>e.locationId===b.source.id));
  for (const event of scopedPage.events) assert.deepEqual(Object.keys(event).sort(),['eventId','sequence','at','itemId','locationId','status','quantity','reserved','held','available','expiredOrBlocked','traceUnavailable'].sort());
  assert.equal((await h.request('/api/pier/stock-changes/ack',{method:'POST',as:cookie,body:{consumer:scopedPage.consumer,checkpoint:interrupted.pageToken}})).status,409);
  await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['South'],locationIds:[]}});
  assert.equal((await h.request('/api/pier/stock-changes?consumer=synthetic-pier-2',{as:cookie})).status,409,'changed grants invalidate checkpoints');
  health = await (await h.request('/api/pier/integrations')).json();
  consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-2');
  assert.equal(consumer.status, 'authority changed');
  assert.equal(consumer.failed, 1);
  const expiresAt = new Date(Date.now()+3600000).toISOString();
  await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['North'],locationIds:[b.source.id],expiresAt}});
  await page('synthetic-pier-expiry','',cookie);
  const afterExpiry = new Date(Date.parse(expiresAt)+60000).toISOString();
  const expiredHealth = await (await h.request('/api/pier/integrations',{headers:{'x-pier-test-now':afterExpiry}})).json();
  assert.equal(expiredHealth.connectors.find(row => row.name === 'Stock consumer synthetic-pier-expiry').status,'authority changed');
  assert.equal((await h.request('/api/pier/stock-changes?consumer=synthetic-pier-expiry',{as:cookie,headers:{'x-pier-test-now':afterExpiry}})).status,403);
});
