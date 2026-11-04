import assert from 'node:assert/strict';
// Read the owner export, including successful command results. Refusal audits
// remain append-only evidence, separate from the unchanged business record.
export async function kitExport(h) {
  const response = await h.request('/api/pier/export');
  assert.equal(response.status, 200);
  const { exportedAt, auditEvents, ...business } = await response.json();
  const stateResponse = await h.request('/api/pier/state');
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  for (const position of state.positions) {
    const physical = business.movements.filter(row => row.itemId === position.itemId && row.locationId === position.locationId && row.status === position.status).reduce((n, row) => n + BigInt(row.quantity), 0n);
    const reserved = position.status === 'sellable' ? business.reservations.filter(row => row.itemId === position.itemId && row.locationId === position.locationId).reduce((n, row) => n + BigInt(row.quantity), 0n) : 0n;
    const units = value => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')); };
    assert.equal(units(position.quantity), physical, 'Public bin stock equals exported movement sums');
    assert.equal(units(position.available), position.status === 'sellable' ? physical - reserved : 0n, 'Public availability excludes exactly the exported reservations');
  }
  return business;
}

function sums(rows, fields) {
  const totals = new Map();
  for (const row of rows) {
    const key = JSON.stringify(fields.map(field => row[field]));
    totals.set(key, (totals.get(key) ?? 0n) + BigInt(row.quantity));
  }
  return [...totals].filter(([, quantity]) => quantity !== 0n).sort(([a], [b]) => a.localeCompare(b));
}

// Expectations are operation quantities supplied by the journey, independently
// of computed availability, task components and the application's cost ledger.
export function kitStockChange(before, after, { movements = [], reservations = [] } = {}) {
  for (const [field, keys, expected] of [
    ['movements', ['itemId', 'locationId', 'status'], movements],
    ['reservations', ['orderId', 'itemId', 'locationId'], reservations],
  ]) {
    const delta = [...before[field].map(row => ({ ...row, quantity: (-BigInt(row.quantity)).toString() })), ...after[field]];
    assert.deepEqual(sums(delta, keys), sums(expected, keys), `${field} reconcile by item, bin, status and owning order`);
  }
}

export function kitMovementLinks(before, after, documentId, expected) {
  const old = new Set(before.movements.map(row => row.id));
  const added = after.movements.filter(row => !old.has(row.id));
  assert.equal(added.length, expected.length, 'Exactly one movement per physical issue or receipt');
  assert.ok(added.every(row => row.documentId === documentId));
  assert.deepEqual(sums(added, ['itemId', 'locationId', 'status']), sums(expected, ['itemId', 'locationId', 'status']));
}

export async function kitStock(h, {prices}={}) {
  const components = [];
  for (let n = 1; n <= 3; n++) components.push(await h.command('item.save', { sku:`synthetic-pier-${n}`, name:`Component ${n}`, unit:'each', barcode:`synthetic-pier-code-${n}`, packSize:'1' }));
  const assortment = await h.command('item.save', { sku:'synthetic-pier-4', name:'Case assortment', unit:'kit', barcode:'synthetic-pier-code-4', packSize:'1' });
  const display = await h.command('item.save', { sku:'synthetic-pier-5', name:'Display kit', unit:'kit', barcode:'synthetic-pier-code-5', packSize:'1' });
  const bin = await h.command('location.save', { name:'Kit bench', warehouse:'North', kind:'bin', barcode:'synthetic-pier-bin-1' });
  const supplier = await h.command('party.save', { kind:'supplier', name:'Synthetic supplier' });
  const customer = await h.command('party.save', { kind:'customer', name:'Synthetic customer' });
  let po = await h.command('po.draft', { supplierId:supplier.id, destinationWarehouse:'North', promiseDate:'2026-11-01', reason:'Kit stock', lines:components.map((part,n) => ({ itemId:part.id, quantity:'30', price:prices?.[n] ?? String(n+1) })) });
  await h.command('po.approve', { poId:po.id, version:po.version });
  po = await h.command('po.commit', { poId:po.id, version:po.version });
  await h.command('receipt.create', { poId:po.id, supplierReference:'synthetic-pier-receipt-1', lines:po.lines.map((part,n) => ({ poLineId:part.id, locationId:bin.id, quantity:'30', cost:prices?.[n] ?? String(n+1) })) });
  const definition = await h.command('kit.define', { itemId:assortment.id, components:components.slice(0,2).map((part,n) => ({ itemId:part.id, quantity:n ? '1':'2', unit:'each' })), shortagePolicy:'backorder', reason:'Two-component assortment' });
  const displayDefinition = await h.command('kit.define', { itemId:display.id, components:components.map(part => ({ itemId:part.id, quantity:'1', unit:'each' })), shortagePolicy:'backorder', reason:'Three-component display' });
  let routing=await h.command('routing.save',{source:'manual',mode:'fixed',shortage:'hold',eligible:['North']});routing=await h.command('routing.preview',{ruleId:routing.id,version:routing.version});await h.command('routing.activate',{ruleId:routing.id,version:routing.version});
  return { components, assortment, display, definition, displayDefinition, bin, supplier, customer };
}
export async function kitFloor(h, b, order) {
  const carrier = await h.command('carrier.save', { name:'Kit pickup '+order.id, warehouse:'North', dock:'Kit dock', cutoff:'23:59', timeZone:'America/Chicago' });
  let wave = await h.command('wave.release', { carrierId:carrier.id, orderIds:[order.id] });
  assert.equal(wave.lines.length, 2);
  assert.deepEqual(wave.lines.map(l => [l.itemId,l.quantity]).sort(), b.components.slice(0,2).map((part,n)=>[part.id,n ? '2':'4']).sort());
  for (const line of wave.lines) wave = await h.command('pick.scan', { waveId:wave.id, lineId:line.id, binCode:b.bin.barcode, itemCode:b.components.find(part=>part.id===line.itemId).barcode, quantity:line.quantity });
  for (const line of wave.lines) for (let n=0;n<Number(line.quantity);n++) await h.command('pack.scan', { waveId:wave.id, orderId:order.id, code:b.components.find(part=>part.id===line.itemId).barcode });
  await h.command('pack.measure', { waveId:wave.id, orderId:order.id, carton:1, weight:'5', length:'10', width:'10', height:'10' });
  await h.command('pack.close', { waveId:wave.id, orderId:order.id });
  const pack = await h.command('pack.dispatch', { waveId:wave.id, orderId:order.id, shipmentReference:'synthetic-pier-shipment-'+order.id });
  assert.equal(pack.status,'shipped');
  return { wave, pack };
}
