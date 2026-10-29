import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';
import { pdfText } from './pdf-text.mjs';

export async function packedFreight(h) {
  const b = await basics(h);
  await receive(h, b, await buy(h, b, '8'), '8');
  await h.command('business.save', { name: 'Synthetic Pier Freight', address: '10 North Dock', shipTo: {} });
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '4' }] });
  const carrier = await h.command('carrier.save', { name: 'Manual freight pickup', warehouse: 'North', dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' });
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: b.source.name, itemCode: b.item.barcode, quantity: '4' });
  const payload = { waveId: wave.id, orderId: order.id };
  let pack;
  for (let carton = 1; carton <= 2; carton++) {
    if (carton === 2) await h.command('pack.carton', payload);
    for (let unit = 0; unit < 2; unit++) pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
    await h.command('pack.measure', { ...payload, carton, weight: String(carton + 2), length: '12', width: '8', height: '6' });
  }
  pack = await h.command('pack.close', payload);
  return { b, order, wave, pack, payload };
}
export function manifestInput(pack) {
  return { packId: pack.id, packVersion: pack.version, reference: 'synthetic-pier-ltl-1', shipFrom: '10 North Dock', shipTo: '20 South Dock', commodity: 'Synthetic brass fittings', accessorials: ['liftgate'], pallets: [
    { cartons: [1], weight: '10', length: '48', width: '40', height: '36', nmfc: '12345', freightClass: '70' },
    { cartons: [2], weight: '12', length: '48', width: '40', height: '42', nmfc: '12346', freightClass: '85' },
  ] };
}
export const manualQuote = { carrier: 'Synthetic Freight Lines', scac: 'SYNT', quoteReference: 'synthetic-pier-quote-1', amount: '125.50', freightTerms: 'Prepaid', evidence: 'Operator retained the carrier phone quote including liftgate' };
export const pickupReview = { proNumber: 'synthetic-pier-pro-1', pickupDate: '2026-11-02', reason: 'Owner reviewed the exact quote, cartons, accessorials and operator pickup details' };

test('manual LTL retains two pallets and quote, prints before pickup, refuses stale work and dispatches once after restart', async t => {
  let outbound = 0;
  const h = await installation({ outboundService: async () => { outbound++; return new Response('Unexpected outbound request', { status: 502 }); } }); t.after(() => h.close());
  const { b, order, pack, payload } = await packedFreight(h);
  const exported = async () => (await h.request('/api/pier/export')).json();
  const business = state => Object.fromEntries(['positions','movements','reservations','orders','packs','shipments','purchaseOrders','receipts'].map(key => [key, state[key]]));
  const stable = async () => { const state = await exported(); return { ...business(state), manifests: state.ltlManifests, documents: state.salesDocuments, commands: state.commands }; };
  const refuse = async (type, input, error) => { const before = await stable(); await h.command(type, input, { error }); assert.deepEqual(await stable(), before); };
  const before = business(await exported()), input = manifestInput(pack);
  await refuse('ltl.save', { ...input, pallets: [{ ...input.pallets[0], cartons: [1, 99] }] }, 'LTL_CARTON');
  await refuse('ltl.save', { ...input, pallets: [{ ...input.pallets[0], cartons: [{ packId: 'synthetic-pier-foreign-1', number: 1 }] }] }, 'LTL_CARTON');
  await refuse('ltl.save', { ...input, packVersion: pack.version - 1 }, 'STALE');
  let manifest = await h.command('ltl.save', input);
  const retained = (await exported()).ltlManifests.find(row => row.id === manifest.id);
  assert.equal(retained.pallets.length, 2); assert.deepEqual(retained.accessorials, ['liftgate']);
  assert.deepEqual(retained.pallets.map(pallet => [pallet.packId, pallet.orderId, pallet.cartons.map(carton => [carton.number, carton.weight, carton.length, carton.width, carton.height, carton.lines.map(line => [line.orderLineId, line.itemId, line.quantity])]), pallet.weight, pallet.length, pallet.width, pallet.height, pallet.nmfc, pallet.freightClass]), [
    [pack.id, order.id, [[1, '3', '12', '8', '6', [[order.lines[0].id, b.item.id, '2']]]], '10', '48', '40', '36', '12345', '70'],
    [pack.id, order.id, [[2, '4', '12', '8', '6', [[order.lines[0].id, b.item.id, '2']]]], '12', '48', '40', '42', '12346', '85'],
  ]);
  await refuse('pack.dispatch', { ...payload, shipmentReference: 'synthetic-pier-premature-1', ltlManifestId: manifest.id }, 'LTL_PICKUP');
  await refuse('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-premature-2', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] }, 'LTL_PICKUP');
  await refuse('print.generate', { kind: 'bill-of-lading', sourceId: manifest.id }, 'LTL_REVIEW');
  manifest = await h.command('ltl.quote', { manifestId: manifest.id, version: manifest.version, ...manualQuote });
  assert.equal(manifest.quote.amount, '125.50'); assert.equal(manifest.quote.evidence, manualQuote.evidence);
  manifest = await h.command('ltl.review', { manifestId: manifest.id, version: manifest.version, ...pickupReview });
  const doc = await h.command('print.generate', { kind: 'bill-of-lading', sourceId: manifest.id, freight: { weight: '999' } });
  const download = () => h.request(`/api/pier/sales-documents/${doc.id}.pdf`);
  const bytes = Buffer.from(await (await download()).arrayBuffer()), contents = await pdfText(bytes);
  assert.equal(doc.sourceKind, 'ltlManifests'); assert.equal(doc.recordId, manifest.id); assert.equal(doc.recordVersion, manifest.version); assert.equal(doc.templateVersion, doc.rendered.templateVersion);
  assert.match(contents, /BILL OF LADING/); assert.match(contents, /CUSTOMER ORDER INFORMATION/); assert.match(contents, /CARRIER INFORMATION/);
  for (const value of ['synthetic-pier-pro-1', '2026-11-02', 'SYNT', 'liftgate', '22 lb', '7 lb', '12345', '12346', '70, 85', '125.50', '48 x 40 x 36', 'Pallet 2', order.reference, manifest.id, pack.id]) assert.ok(contents.includes(value), value);
  assert.doesNotMatch(contents, /999 lb/);
  const reprint = await h.command('print.generate', { kind: 'bill-of-lading', sourceId: manifest.id });
  assert.equal(reprint.recordVersion, doc.recordVersion); assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), bytes);
  assert.deepEqual(business(await exported()), before);
  const oldVersion = manifest.version;
  manifest = await h.command('ltl.save', { ...input, manifestId: manifest.id, version: manifest.version, accessorials: ['liftgate', 'appointment'] });
  assert.equal(manifest.review, null); assert.equal(manifest.quote, null); assert.equal(manifest.history[0].quote.amount, '125.50');
  await refuse('ltl.pickup', { manifestId: manifest.id, version: oldVersion, confirmed: true, documentId: doc.id, evidence: 'Driver arrived' }, 'STALE');
  await refuse('ltl.pickup', { manifestId: manifest.id, version: manifest.version, confirmed: true, documentId: doc.id, evidence: 'Driver arrived' }, 'LTL_REVIEW');
  manifest = await h.command('ltl.quote', { manifestId: manifest.id, version: manifest.version, ...manualQuote });
  manifest = await h.command('ltl.review', { manifestId: manifest.id, version: manifest.version, ...pickupReview });
  await refuse('ltl.pickup', { manifestId: manifest.id, version: manifest.version, confirmed: true, documentId: doc.id, evidence: 'Driver arrived' }, 'LTL_BOL');
  const current = await h.command('print.generate', { kind: 'bill-of-lading', sourceId: manifest.id });
  await refuse('ltl.pickup', { manifestId: manifest.id, version: manifest.version, confirmed: false, documentId: current.id, evidence: 'Driver arrived' }, 'LTL_PICKUP');
  assert.deepEqual(business(await exported()), before);
  const commandId = crypto.randomUUID(), pickup = { manifestId: manifest.id, version: manifest.version, confirmed: true, documentId: current.id, evidence: 'Owner observed two pallets handed to the driver' };
  const dispatched = await h.command('ltl.pickup', pickup, { commandId });
  let state = await h.invariant(), shipment = state.shipments.find(row => row.id === dispatched.shipmentId);
  assert.equal(state.shipments.length, 1); assert.equal(shipment.packId, pack.id); assert.equal(shipment.ltlManifestId, manifest.id); assert.equal(shipment.bolDocumentId, current.id);
  assert.equal(shipment.operatorRecordedPickup.proNumber, pickupReview.proNumber); assert.equal(shipment.operatorRecordedPickup.evidence, pickup.evidence);
  assert.equal(shipment.lines[0].quantity, '4'); assert.equal(state.orders.find(row => row.id === order.id).lines[0].dispatched, '4');
  assert.equal(state.reservations.filter(row => row.orderId === order.id).length, 0);
  const dispatchMovements = state.movements.filter(row => row.documentId === shipment.id);
  assert.equal(dispatchMovements.length, 1); assert.equal(dispatchMovements.reduce((sum, row) => sum + BigInt(row.quantity), 0n), -4000000n);
  const posted = await stable(); await h.restart(); await h.command('ltl.pickup', pickup, { commandId }); assert.deepEqual(await stable(), posted);
  await refuse('ltl.pickup', { ...pickup, version: dispatched.version }, 'LTL_STATE');
  assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), bytes); assert.equal(outbound, 0);
});
