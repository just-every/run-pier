import test from "node:test";
import assert from "node:assert/strict";
import { installation } from "./harness.mjs";

// The warehouse floor through the public command door: scan-to-receive with an
// over and a short line, a pick wave whose wrong scans are refused and whose
// empty bin sends the picker to overflow, cartons packed and measured, and the
// day's dispatch summary and close. Barcodes and names are synthetic.
const zone = "America/Chicago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

test("warehouse floor: receive, wave pick, pack and dispatch summary", async (t) => {
  const h = await installation();
  t.after(() => h.close());
  const mug = await h.command("item.save", { sku: "MUG-12", name: "Blue Mug 12oz", unit: "each", barcode: "036000291452", caseBarcode: "10036000291459", packSize: "4" });
  const towel = await h.command("item.save", { sku: "TOWEL", name: "Tea towel", unit: "each", barcode: "4006381333931", packSize: "1" });
  const b03 = await h.command("location.save", { name: "B-03", warehouse: "Dallas", kind: "bin", barcode: "LOC-B03" });
  const b09 = await h.command("location.save", { name: "B-09", warehouse: "Dallas", kind: "bin" });
  const supplier = await h.command("party.save", { name: "Prairie Ceramics", kind: "supplier" });
  const [north, south] = [await h.command("party.save", { name: "North Cafe", kind: "customer" }), await h.command("party.save", { name: "South Deli", kind: "customer" })];
  await h.command("location.save", { name: "B-04", warehouse: "Dallas", kind: "bin", barcode: "036000291452" }, { error: "DUPLICATE" });
  let po = await h.command("po.draft", { supplierId: supplier.id, promiseDate: today, reason: "Restock", lines: [{ itemId: mug.id, quantity: "10", price: "2.5" }, { itemId: towel.id, quantity: "5", price: "1" }] });
  await h.command("po.approve", { poId: po.id, version: po.version });
  po = await h.command("po.commit", { poId: po.id, version: po.version });

  await t.test("scan-to-receive records an over and a short line", async () => {
    let r = await h.command("receiving.start", { poId: po.id, locationId: b03.id });
    const scan = async (code, extra = {}) => (r = await h.command("receiving.scan", { receivingId: r.id, code, ...extra }));
    await scan("10036000291459"); // one case: 4
    await scan("0036000291452"); // the unit UPC read as EAN-13
    await scan("036000291452");
    await scan("4006381333931", { count: 3 });
    await h.command("receiving.scan", { receivingId: r.id, code: "999999" }, { error: "UNKNOWN_CODE" });
    await scan("B-09"); // a bin label moves put-away to B-09
    await scan("10036000291459", { count: 2 });
    assert.equal(r.locationId, b09.id);
    await h.command("receiving.post", { receivingId: r.id, version: r.version, supplierReference: "ASN 7731" }, { error: "OVER_RECEIPT" });
    const receipt = await h.command("receiving.post", { receivingId: r.id, version: r.version, supplierReference: "ASN 7731", overReason: "Supplier shipped a spare case" });
    const v = Object.fromEntries(receipt.variance.map((x) => [x.itemId, x]));
    assert.deepEqual([v[mug.id].received, v[mug.id].over, v[towel.id].received, v[towel.id].short], ["14", "4", "3", "2"]);
    const s = await h.invariant(), at = (item, bin) => s.positions.find((p) => p.itemId === item.id && p.locationId === bin.id)?.quantity;
    assert.deepEqual([at(mug, b03), at(mug, b09), at(towel, b03)], ["6", "8", "3"]);
    assert.equal(s.purchaseOrders[0].lines.find((l) => l.itemId === towel.id).received, "3");
  });

  let wave, so1, so2, ups;
  await t.test("a wave refuses wrong scans and sends a short pick to overflow", async () => {
    ups = await h.command("carrier.save", { name: "UPS Ground", warehouse: "Dallas", dock: "Dock A", cutoff: "23:59", timeZone: zone });
    so1 = await h.command("order.create", { customerId: north.id, promiseDate: today, lines: [{ itemId: mug.id, quantity: "5" }] });
    so2 = await h.command("order.create", { customerId: south.id, promiseDate: today, lines: [{ itemId: mug.id, quantity: "3" }, { itemId: towel.id, quantity: "2" }] });
    for (const o of [so1, so2]) await h.command("order.carrier", { orderId: o.id, carrierId: ups.id });
    wave = await h.command("wave.release", { carrierId: ups.id, orderIds: [so1.id, so2.id] });
    assert.equal(wave.dock, "Dock A");
    const first = wave.lines[0];
    assert.equal(first.locationId, b03.id);
    const wrongBin = await h.command("pick.scan", { waveId: wave.id, lineId: first.id, binCode: "B-09", itemCode: "036000291452" }, { error: "WRONG_BIN" });
    assert.match(wrongBin.error.message, /B-03/);
    const wrongItem = await h.command("pick.scan", { waveId: wave.id, lineId: first.id, binCode: "LOC-B03", itemCode: "4006381333931" }, { error: "WRONG_ITEM" });
    assert.match(wrongItem.error.message, /TOWEL.*MUG-12/);
    const before = (await h.state()).reservations.filter((r) => r.orderId === so2.id);
    wave = await h.command("pick.scan", { waveId: wave.id, lineId: first.id, binCode: "LOC-B03", itemCode: "036000291452", quantity: "2" });
    wave = await h.command("pick.short", { waveId: wave.id, lineId: first.id, reason: "B-03 empty" });
    const reported = wave.lines.find((l) => l.id === first.id), overflow = wave.lines.find((l) => l.overflowFrom === b03.id);
    assert.deepEqual([reported.short.overflowLocationId, reported.short.moved, overflow.locationId, overflow.quantity], [b09.id, "3", b09.id, "3"]);
    const s = await h.invariant();
    assert.deepEqual(s.reservations.filter((r) => r.orderId === so2.id), before, "no other order's reservation moved");
    assert.ok(s.counts.some((c) => c.id === reported.short.countId && c.locationId === b03.id));
    for (const line of wave.lines.filter((l) => l.status === "open")) {
      const bin = line.locationId === b03.id ? "LOC-B03" : "B-09", code = line.itemId === mug.id ? "036000291452" : "4006381333931";
      wave = await h.command("pick.scan", { waveId: wave.id, lineId: line.id, binCode: bin, itemCode: code, quantity: line.quantity });
    }
    assert.equal(wave.status, "picked");
    assert.equal(wave.ordersPicked, 2);
    // Picked units stay reserved until they ship, but they never wait for or join a second wave.
    await h.command("wave.release", { carrierId: ups.id, orderIds: [so1.id, so2.id] }, { error: "ALREADY_PICKED" });
  });

  await t.test("cartons are packed, measured and dispatched; the day is summarized", async () => {
    const pack = (type, payload, opts) => h.command(type, { waveId: wave.id, ...payload }, opts);
    for (const code of ["036000291452", "036000291452"]) await pack("pack.scan", { orderId: so1.id, code });
    await pack("pack.scan", { orderId: so1.id, code: "10036000291459" }, { error: "OVER_PACK" });
    for (let i = 0; i < 3; i++) await pack("pack.scan", { orderId: so1.id, code: "036000291452" });
    await pack("pack.close", { orderId: so1.id }, { error: "MEASURE" });
    await pack("pack.measure", { orderId: so1.id, carton: 1, weight: "6.5", length: "12", width: "10", height: "8" });
    assert.equal((await pack("pack.close", { orderId: so1.id })).status, "packed");
    const shipped = await pack("pack.dispatch", { orderId: so1.id, shipmentReference: "BOL 55120" });
    assert.equal(shipped.status, "shipped");
    await h.command("wave.release", { carrierId: ups.id, orderIds: [so1.id] }, { error: "NOTHING_TO_PICK" });
    for (let i = 0; i < 3; i++) await pack("pack.scan", { orderId: so2.id, code: "036000291452" });
    await pack("pack.carton", { orderId: so2.id });
    await pack("pack.scan", { orderId: so2.id, code: "4006381333931" });
    await pack("pack.close", { orderId: so2.id }, { error: "UNPACKED" });
    await pack("pack.scan", { orderId: so2.id, code: "4006381333931" });
    for (const carton of [1, 2]) await pack("pack.measure", { orderId: so2.id, carton, weight: "3", length: "10", width: "8", height: "6" });
    await pack("pack.close", { orderId: so2.id });

    const summary = async () => { const res = await h.request(`/api/pier/dispatch-summary?date=${today}&timeZone=${encodeURIComponent(zone)}`); assert.equal(res.status, 200); return res.json(); };
    let day = await summary();
    assert.deepEqual([day.ordersShipped, day.units, day.byCarrier[0].carrier, day.byCarrier[0].dock, day.allOut], [1, "5", "UPS Ground", "Dock A", false]);
    const kinds = day.exceptions.map((e) => `${e.kind}:${e.order ?? e.purchaseOrder}:${(e.kind === "short pick" ? e.overflow : e.reason) ?? ""}`);
    assert.deepEqual(kinds.sort(), [`not shipped:${so2.reference}:packed, not shipped`, `received over:${po.reference}:`, `received short:${po.reference}:`, `short pick:${so1.reference}:B-09`].sort());
    await pack("pack.dispatch", { orderId: so2.id, shipmentReference: "BOL 55121" });
    day = await summary();
    assert.deepEqual([day.ordersShipped, day.shipments, day.units, day.allOut], [2, 2, "10", true]);
    const s = await h.invariant(), at = (bin) => s.positions.find((p) => p.itemId === mug.id && p.locationId === bin.id).quantity;
    assert.deepEqual([at(b03), at(b09), s.reservations.length], ["3", "3", 0]);

    const closed = await h.command("dispatch.close", { date: today, timeZone: zone });
    assert.equal(closed.summary.ordersShipped, 2);
    assert.equal(closed.delivery.status, "not sent");
    await h.command("dispatch.delivered", { dayId: closed.id, version: closed.version, status: "sent" }, { error: "COMMAND" });
  });
});

// Added to the existing warehouse journey budget: every business effect uses
// the real authenticated Worker; only WooCommerce's network edge is synthetic.
test('KIT-001: concurrent channel kits, whole shortages, versioned picks, assembly, returns and exact cost', async t => {
  const { kitStock, kitFloor } = await import('./kits-fixture.mjs');
  const incoming = [], publications = [];
  const h = await installation({ async outboundService(request) {
    const url = new URL(request.url);
    assert.equal(url.hostname,'kits.example.test');
    if (request.method === 'PUT') { const body=await request.json(); publications.push(body.stock_quantity); return Response.json({ id:1,...body }); }
    if (url.pathname.endsWith('/products')) return Response.json([{ id:1, type:'simple', name:'Case assortment', sku:'synthetic-pier-4' }]);
    if (url.pathname.endsWith('/orders')) return Response.json(incoming);
    throw new Error('Unexpected kit network request');
  } }); t.after(()=>h.close());
  const b = await kitStock(h);
  await h.command('channel.save', { name:'Kit shop', provider:'woocommerce', baseUrl:'https://kits.example.test', warehouse:'North', buffer:'1', credentials:{consumerKey:'synthetic-pier-6',consumerSecret:'synthetic-pier-7'} });
  assert.equal((await h.state()).channelListings[0].available,'14');
  incoming.push({ id:1,number:'1',status:'processing',currency:'USD',billing:{first_name:'Synthetic',last_name:'Buyer'},refunds:[],line_items:[{id:1,sku:b.assortment.sku,quantity:2,price:10}] });
  const [manual] = await Promise.all([
    h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'2',price:'10'}]}),
    h.command('channel.sync',{}),
  ]);
  let s=await h.state();
  assert.equal(s.orders.length,2);
  assert.ok(s.orders.every(order=>order.lines[0].reserved==='2'));
  assert.equal(s.reservations.filter(r=>r.itemId===b.components[0].id).reduce((n,r)=>n+BigInt(r.quantity),0n),8000000n);
  assert.equal(s.reservations.filter(r=>r.itemId===b.components[1].id).reduce((n,r)=>n+BigInt(r.quantity),0n),4000000n);
  assert.equal(s.channelListings[0].available,'10');
  assert.ok(!s.forecasts.some(f=>f.itemId===b.assortment.id), 'A virtual kit is not purchased as independent stock');
  assert.equal(s.forecasts.find(f=>f.itemId===b.components[0].id&&f.warehouse==='North').reserved,'8');
  assert.equal(publications.at(-1),10);
  await h.command('kit.define',{itemId:b.assortment.id,version:b.definition.version,components:b.components.slice(0,2).map(part=>({itemId:part.id,quantity:'1',unit:'each'})),shortagePolicy:'block',reason:'Next version'});
  assert.equal((await h.state()).orders.find(o=>o.id===manual.id).lines[0].kit.revision,1);
  await kitFloor(h,b,manual);
  let report=await (await h.request('/api/pier/reports')).json();
  const margin=report.margin.bySku.find(row=>row.key===b.assortment.id);
  assert.deepEqual([Number(margin.revenue),Number(margin.cost),Number(margin.margin)],[20,8,12]);
  assert.equal(Number(report.valuation.reconciliation.difference),0);
  // A component drain leaves no partially reserved kit set.
  const drain=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.components[0].id,quantity:'100',price:'1'}]});
  s=await h.state(); assert.equal(s.channelListings[0].available,'0');
  const before=await (await h.request('/api/pier/export')).json();
  await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'1',price:'10'}]},{error:'KIT_SHORTAGE'});
  assert.equal((await h.state()).version,before.version);
  const currentDefinition=(await h.state()).kitDefinitions.filter(k=>k.itemId===b.assortment.id).sort((a,b)=>b.revision-a.revision)[0];
  await h.command('kit.define',{itemId:b.assortment.id,version:currentDefinition.version,components:b.definition.components,shortagePolicy:'backorder',reason:'Retain whole-kit backorders'});
  const short=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'1',price:'10'}]});
  assert.deepEqual([short.lines[0].reserved,short.lines[0].backorder],['0','1']);
  assert.equal((await h.state()).reservations.filter(r=>r.orderId===short.id).length,0);
  // Cancel only the drain: existing manual/channel reservations survive.
  await h.command('order.cancel',{orderId:drain.id,reason:'End shortage probe'});
  const quote=await h.command('quote.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.assortment.id,quantity:'1',price:'10'}]});
  assert.equal(quote.lines[0].kit.revision,3);
  assert.equal(quote.lines[0].reserved,'1');
  await h.command('dispatch.create',{orderId:quote.id,shipmentReference:'synthetic-pier-quote-1',lines:[{orderLineId:quote.lines[0].id,quantity:'1'}]},{error:'QUOTE_STATE'});
  const quoteDocument=await h.request(`/api/pier/orders/${quote.id}/packing-slip`);
  assert.equal(quoteDocument.status,200); assert.match(await quoteDocument.text(),/Quote.*Kit definition 3/s);
  await h.command('quote.accept',{orderId:quote.id,version:quote.version});
  await h.command('order.cancel',{orderId:quote.id,reason:'Quote lifecycle proof'});
  const packingSlip=await h.request(`/api/pier/orders/${manual.id}/packing-slip`);
  assert.match(await packingSlip.text(),/Kit definition 1.*Component picks and bins.*Kit bench/s);
  let task=await h.command('kitting.plan' ,{itemId:b.display.id,quantity:'5',locationId:b.bin.id,bins:Object.fromEntries(b.components.map(part=>[part.id,b.bin.id])),direction:'assemble',reason:'Preassemble five displays'});
  await h.command('kitting.post',{taskId:task.id,version:task.version},{error:'APPROVAL'});
  await h.command('kitting.approve',{taskId:task.id,version:task.version});
  const taskCommand='synthetic-pier-assembly-1';
  task=await h.command('kitting.post',{taskId:task.id,version:task.version},{commandId:taskCommand});
  await h.command('kitting.post',{taskId:task.id,version:1},{commandId:taskCommand});
  const displays=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.display.id,quantity:'2',price:'12'}]});
  assert.equal(displays.lines[0].reserved,'2');
  await h.command('kit.define',{itemId:b.display.id,version:b.displayDefinition.version,components:b.components.map((part,n)=>({itemId:part.id,quantity:n===0?'2':'1',unit:'each'})),shortagePolicy:'backorder',reason:'New display composition while old kits remain'});
  const revised=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.display.id,quantity:'1',price:'12'}]});
  assert.equal((await h.state()).reservations.filter(r=>r.orderId===revised.id&&r.itemId===b.display.id).length,0,'An old pre-assembled composition cannot satisfy a newer definition');
  await h.command('order.cancel',{orderId:revised.id,reason:'End versioned-stock probe'});
  const shipment=await h.command('dispatch.create',{orderId:displays.id,shipmentReference:'synthetic-pier-shipment-5',lines:[{orderLineId:displays.lines[0].id,quantity:'2'}]});
  const payload={shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:b.bin.id,quantity:'1',reason:'Inspect each returned component'};
  await h.command('return.create',payload,{error:'KIT_INSPECTION'});
  const returned=await h.command('return.create',{...payload,inspection:b.components.map(part=>({itemId:part.id,condition:'sellable',reason:'Checked intact'}))});
  await h.command('return.approve',{returnId:returned.id,version:returned.version});
  await h.command('return.restock',{returnId:returned.id,version:returned.version});
  let disassembly=await h.command('kitting.plan',{itemId:b.display.id,definitionId:b.displayDefinition.id,quantity:'1',locationId:b.bin.id,bins:Object.fromEntries(b.components.map(part=>[part.id,b.bin.id])),direction:'disassemble',reason:'Recover returned display components'});
  await h.command('kitting.approve',{taskId:disassembly.id,version:disassembly.version});
  await h.command('kitting.post',{taskId:disassembly.id,version:disassembly.version});
  report=await (await h.request('/api/pier/reports')).json();
  const displayMargin=report.margin.bySku.find(row=>row.key===b.display.id);
  assert.deepEqual([Number(displayMargin.revenue),Number(displayMargin.cost),Number(displayMargin.margin)],[24,12,12]);
  assert.equal(Number(report.valuation.reconciliation.difference),0);
  const net=report.kitMargins.find(row=>row.key===b.display.id);
  assert.deepEqual([net.quantity,net.returned,Number(net.revenue),Number(net.cost),Number(net.margin)],['1','1',12,6,6]);
  const exported=await (await h.request('/api/pier/export')).json();
  assert.equal(exported.kittingTasks.filter(task=>task.status==='posted').length,2);
  assert.equal(exported.returns[0].inspection.length,3);
  s=await h.state();
  for(const position of s.positions) assert.ok(Number(position.available)>=0);
  assert.equal(s.positions.find(p=>p.itemId===b.display.id&&p.status==='sellable').quantity,'3');
});

test('KIT-001: splitting and disassembling cent-valued kits conserves every cost layer', async t => {
  const { kitStock }=await import('./kits-fixture.mjs');
  const h=await installation();t.after(()=>h.close());
  const b=await kitStock(h,{prices:['0.01','0.01','0.01']});
  let task=await h.command('kitting.plan',{itemId:b.display.id,quantity:'2',locationId:b.bin.id,bins:Object.fromEntries(b.components.map(part=>[part.id,b.bin.id])),direction:'assemble',reason:'Cent-valued kit batch'});
  await h.command('kitting.approve',{taskId:task.id,version:task.version});await h.command('kitting.post',{taskId:task.id,version:task.version});
  const order=await h.command('order.create',{customerId:b.customer.id,warehouse:'North',lines:[{itemId:b.display.id,quantity:'1',price:'1'}]});
  const shipment=await h.command('dispatch.create',{orderId:order.id,shipmentReference:'synthetic-pier-901',lines:[{orderLineId:order.lines[0].id,quantity:'1'}]});
  const returned=await h.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:b.bin.id,quantity:'1',reason:'Checked cent-valued kit',inspection:b.components.map(part=>({itemId:part.id,condition:'sellable',reason:'Intact'}))});
  await h.command('return.approve',{returnId:returned.id,version:returned.version});await h.command('return.restock',{returnId:returned.id,version:returned.version});
  task=await h.command('kitting.plan',{itemId:b.display.id,quantity:'1',locationId:b.bin.id,bins:Object.fromEntries(b.components.map(part=>[part.id,b.bin.id])),direction:'disassemble',reason:'Recover original pennies'});
  await h.command('kitting.approve',{taskId:task.id,version:task.version});await h.command('kitting.post',{taskId:task.id,version:task.version});
  const response=await h.request('/api/pier/reports');assert.equal(response.status,200);const report=await response.json();
  assert.equal(Number(report.valuation.total),0.9);assert.equal(Number(report.valuation.reconciliation.difference),0);
  assert.equal(Number(report.margin.bySku.find(row=>row.key===b.display.id).cost),0.03);
});
