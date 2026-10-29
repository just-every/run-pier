import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';
import { shippingEdge } from './shipping-edge.mjs';
import { destination } from './shipping-fixtures.mjs';

const localDate = (at, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
const localTime = (at, zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));

test('WMS-003: twenty due orders, eighteen dispatches and a retained close reconcile independently', async t => {
  const now = '2026-10-29T20:00:00.000Z', zone = 'America/Chicago';
  const today = '2026-10-29'; // The test Worker's clock is 15:00 at this warehouse.
  let edge = shippingEdge();
  const h = await installation({ now, outboundService: request => edge.outbound(request) });
  t.after(() => h.close());
  const b = await basics(h);
  await receive(h, b, await buy(h, b, '40'), '40');
  const carrier = await h.command('carrier.save', { name: 'Daily parcel', warehouse: 'North', dock: 'Dock A', cutoff: '16:00', timeZone: zone });
  await h.command('shipping.save', { apiKey: 'synthetic-pier-1', mode: 'test', fromAddress: destination });
  const later = '2026-10-30';
  const orders = [];
  for (let i = 0; i < 20; i++) {
    const order = await h.command('order.create', { warehouse: 'North', customerId: b.customer.id, promiseDate: i === 19 ? later : today, lines: [{ itemId: b.item.id, quantity: '2', price: '3' }] });
    await h.command('order.carrier', { orderId: order.id, carrierId: carrier.id, ...(i === 19 ? { shipByDate: today } : {}) }); orders.push(order);
  }
  const board = async () => {
    const response = await h.request(`/api/pier/dispatch-summary?${new URLSearchParams({ date: today, timeZone: zone, warehouse: 'North' })}`);
    assert.equal(response.status, 200); return response.json();
  };
  const risk = (view, dispatched, current, reason) => {
    const shipped = new Set(orders.slice(0, dispatched).map(order => order.id));
    assert.deepEqual(view.atRisk.map(order => order.orderId).sort(), orders.filter(order => !shipped.has(order.id)).map(order => order.id).sort(), 'only each posted dispatch clears its own flag');
    for (const order of view.orders) {
      const done = shipped.has(order.orderId);
      assert.equal(order.atRisk, !done, `${order.order}: risk follows its own dispatch`);
      assert.equal(order.cutoff, '16:00');
      assert.equal(order.timeZone, zone);
      assert.equal(order.beforeCutoff, true);
      if (done) {
        assert.equal(order.state, 'shipped');
        assert.equal(order.reason, null);
        assert.equal(order.riskReason, null);
      } else {
        assert.ok(order.riskReason.includes(order.reason), 'the flag explains the remaining work');
      }
    }
    if (current) assert.equal(view.orders.find(order => order.orderId === current).reason, reason);
    assert.equal(view.counts.shipped, dispatched);
  };
  await h.command('order.carrier', { orderId: orders[19].id, carrierId: carrier.id, shipByDate: '2026-02-30' }, { error: 'DATE' });
  let view = await board();
  assert.equal(view.counts['to pick'], 20);
  assert.equal(view.orders.length, 20);
  assert.deepEqual(view.pickups.map(pickup => [pickup.carrierId, pickup.cutoff, pickup.timeZone]), [[carrier.id, '16:00', zone]]);
  assert.match(view.riskBasis, /conservative/i);
  assert.match(view.riskBasis, /unfinished due order.*until dispatch posts/i);
  assert.match(view.riskBasis, /no processing-time estimate/i);
  risk(view, 0);
  assert.equal(view.orders.find(o => o.orderId === orders[19].id).dueDate, today, 'reviewed ship-by date takes precedence over later promise');
  // Public dispatch state is independent of labels and pick/pack status.
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: orders.slice(0, 19).map(o => o.id) });
  const short = wave.lines.find(l => l.orderId === orders[18].id);
  await h.command('pick.short', { waveId: wave.id, lineId: short.id, reason: 'Physical bin short' });
  for (let i = 0; i < 18; i++) {
    const order = orders[i], line = wave.lines.find(l => l.orderId === order.id);
    view = await board(); risk(view, i, order.id, 'unpicked');
    await h.command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: 'A1', itemCode: '10001', quantity: '1' });
    view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'picking');
    risk(view, i, order.id, 'unpicked');
    await h.command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: 'A1', itemCode: '10001', quantity: '1' });
    view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'picked');
    risk(view, i, order.id, 'unpacked');
    const payload = { waveId: wave.id, orderId: order.id };
    for (let unit = 0; unit < 2; unit++) await h.command('pack.scan', { ...payload, code: '10001' });
    await h.command('pack.measure', { ...payload, carton: 1, weight: '2.5', length: '12', width: '8', height: '4' });
    const pack = await h.command('pack.close', payload);
    view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'packed');
    risk(view, i, order.id, 'unlabeled');
    edge = shippingEdge(); // Fresh synthetic provider transaction, solely at the paid network edge.
    let job = await h.command('shipping.prepare', { packId: pack.id, carton: 1, address: destination, email: ['synthetic-pier-1', 'example.test'].join('@') });
    for (const [type, extra] of [['shipping.verify', {}], ['shipping.address', { choice: 'suggested' }], ['shipping.rates', {}], ['shipping.buy', { rateId: 'rate_usps' }]])
      job = await h.command(type, { jobId: job.id, version: job.version, ...extra });
    view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'labeled');
    risk(view, i, order.id, 'awaiting dispatch');
    assert.equal(view.counts.shipped, i, 'a label never posts dispatch');
    await h.command('pack.dispatch', { ...payload, shipmentReference: `WMS-003-${i}` });
    view = await board(); assert.equal(view.counts.shipped, i + 1);
    risk(view, i + 1);
    assert.equal(Object.values(view.counts).reduce((n, count) => n + count, 0), 20);
  }
  const state = await h.invariant();
  const shipments = state.shipments.filter(sh => localDate(sh.createdAt, zone) === today);
  assert.equal(new Set(shipments.map(sh => sh.orderId)).size, 18);
  assert.equal(shipments.reduce((n, sh) => n + sh.lines.reduce((m, l) => m + Number(l.quantity), 0), 0), 36);
  assert.equal(view.ordersShipped, 18); assert.equal(view.units, '36');
  assert.deepEqual(view.atRisk.map(o => [o.orderId, o.reason, o.beforeCutoff]).sort(), [[orders[18].id, 'short', true], [orders[19].id, 'unpicked', true]].sort());
  const closed = await h.command('dispatch.close', { date: today, timeZone: zone, warehouse: 'North' });
  assert.equal(closed.summary.ordersShipped, 18); assert.equal(closed.summary.units, '36');
  assert.equal(closed.summary.lastShipmentAt, shipments.map(sh => localTime(sh.createdAt, zone)).sort().at(-1));
  assert.deepEqual(closed.summary.exceptions.filter(e => e.kind === 'not shipped').map(e => [e.orderId, e.boardReason]).sort(), [[orders[18].id, 'short'], [orders[19].id, 'unpicked']].sort());
  const exported = await (await h.request('/api/pier/export')).json();
  assert.equal(exported.dispatchDays.find(d => d.id === closed.id).summary.ordersShipped, 18);
  const report = await (await h.request(`/api/pier/reports?${new URLSearchParams({ asOf: today })}`)).json();
  assert.equal(report.overdueOrders.closedDays.find(d => d.id === closed.id).missed.length, 2);
  const other = await h.request(`/api/pier/dispatch-summary?${new URLSearchParams({ date: today, timeZone: zone, warehouse: 'South' })}`);
  assert.equal((await other.json()).orders.length, 0);
});
