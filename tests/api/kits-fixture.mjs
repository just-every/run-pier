import assert from 'node:assert/strict';
export async function kitStock(h) {
  const components = [];
  for (let n = 1; n <= 3; n++) components.push(await h.command('item.save', { sku:`synthetic-pier-${n}`, name:`Component ${n}`, unit:'each', barcode:`synthetic-pier-code-${n}`, packSize:'1' }));
  const assortment = await h.command('item.save', { sku:'synthetic-pier-4', name:'Case assortment', unit:'kit', barcode:'synthetic-pier-code-4', packSize:'1' });
  const display = await h.command('item.save', { sku:'synthetic-pier-5', name:'Display kit', unit:'kit', barcode:'synthetic-pier-code-5', packSize:'1' });
  const bin = await h.command('location.save', { name:'Kit bench', warehouse:'North', kind:'bin', barcode:'synthetic-pier-bin-1' });
  const supplier = await h.command('party.save', { kind:'supplier', name:'Synthetic supplier' });
  const customer = await h.command('party.save', { kind:'customer', name:'Synthetic customer' });
  let po = await h.command('po.draft', { supplierId:supplier.id, destinationWarehouse:'North', promiseDate:'2026-11-01', reason:'Kit stock', lines:components.map((part,n) => ({ itemId:part.id, quantity:'30', price:String(n+1) })) });
  await h.command('po.approve', { poId:po.id, version:po.version });
  po = await h.command('po.commit', { poId:po.id, version:po.version });
  await h.command('receipt.create', { poId:po.id, supplierReference:'synthetic-pier-receipt-1', lines:po.lines.map((part,n) => ({ poLineId:part.id, locationId:bin.id, quantity:'30', cost:String(n+1) })) });
  const definition = await h.command('kit.define', { itemId:assortment.id, components:components.slice(0,2).map((part,n) => ({ itemId:part.id, quantity:n ? '1':'2', unit:'each' })), shortagePolicy:'backorder', reason:'Two-component assortment' });
  const displayDefinition = await h.command('kit.define', { itemId:display.id, components:components.map(part => ({ itemId:part.id, quantity:'1', unit:'each' })), shortagePolicy:'backorder', reason:'Three-component display' });
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
