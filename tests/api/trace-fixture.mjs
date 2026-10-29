export async function traceStock(h) {
  let lot=await h.command('item.save',{sku:'synthetic-pier-301',name:'Dated stock',unit:'each',packSize:'1',dimensions:{length:'1',width:'1',height:'1',unit:'cm'},barcode:'12345678901231'});
  let serial=await h.command('item.save',{sku:'synthetic-pier-302',name:'Serialized stock',unit:'each',packSize:'1',dimensions:{length:'1',width:'1',height:'1',unit:'cm'},barcode:'12345678901248'});
  lot=await h.command('trace.configure',{itemId:lot.id,version:lot.version,mode:'lot',allocation:'fefo',expiryRequired:true,reason:'Owner-approved earliest-expiry allocation'});
  serial=await h.command('trace.configure',{itemId:serial.id,version:serial.version,mode:'serial',allocation:'fifo',expiryRequired:false,reason:'Owner-approved serialized FIFO'});
  const source=await h.command('location.save',{name:'Trace receiving',warehouse:'Trace North',kind:'bin',barcode:'synthetic-pier-303'});
  const destination=await h.command('location.save',{name:'Trace picking',warehouse:'Trace North',kind:'bin',barcode:'synthetic-pier-304'});
  const transit=await h.command('location.save',{name:'Trace van',warehouse:'Trace transit',kind:'transit'});
  const supplier=await h.command('party.save',{kind:'supplier',name:'Trace supplier'}),customer=await h.command('party.save',{kind:'customer',name:'Trace customer'});
  let po=await h.command('po.draft',{supplierId:supplier.id,destinationWarehouse:'Trace North',promiseDate:'2026-11-01',reason:'Trace receipt',lines:[{itemId:lot.id,quantity:'10',price:'2'},{itemId:serial.id,quantity:'2',price:'3'}]});
  await h.command('po.approve',{poId:po.id,version:po.version});po=await h.command('po.commit',{poId:po.id,version:po.version});
  let routing=await h.command('routing.save',{source:'manual',mode:'fixed',shortage:'hold',eligible:['Trace North']});routing=await h.command('routing.preview',{ruleId:routing.id,version:routing.version});await h.command('routing.activate',{ruleId:routing.id,version:routing.version});
  return {lot,serial,source,destination,transit,supplier,customer,po};
}
export const gs1Lot=(lot,expiry)=>`(01)12345678901231(10)${lot}(17)${expiry}`;

// Deliberately interleave bins, lexical lot order and receipt dates. Expected
// allocation order belongs to the journey, never to the product's comparator.
export async function tracePolicyStock(h, b) {
  const create = (sku, name) => h.command('item.save', {sku, name, unit:'each', packSize:'1'});
  let fifo = await create('synthetic-pier-340', 'Receipt ordered stock');
  let fefo = await create('synthetic-pier-341', 'Optional expiry stock');
  let other = await create('synthetic-pier-342', 'Separate supplier lot stock');
  const configure = (item, allocation, reason) => h.command('trace.configure', {itemId:item.id, version:item.version, mode:'lot', allocation, expiryRequired:false, reason});
  fifo = await configure(fifo, 'fifo', 'Owner approved first receipt and original arrival order');
  fefo = await configure(fefo, 'fifo', 'Initial owner receipt policy');
  fefo = await configure(fefo, 'fefo', 'Owner approved expiry first with undated stock last');
  other = await configure(other, 'fifo', 'Owner retains exact supplier lot references per SKU');
  let po = await h.command('po.draft', {supplierId:b.supplier.id, destinationWarehouse:'Trace North', promiseDate:'2026-11-01', reason:'Independent allocation order proof', lines:[
    {itemId:fifo.id, quantity:'5', price:'2'}, {itemId:fefo.id, quantity:'4', price:'2'}, {itemId:other.id, quantity:'2', price:'2'},
  ]});
  await h.command('po.approve', {poId:po.id, version:po.version});
  po = await h.command('po.commit', {poId:po.id, version:po.version});
  const at = now => ({headers:{'x-pier-test-now':now}});
  const firstAt = '2026-11-01T09:00:00.000Z';
  let receiving = await h.command('receiving.start', {poId:po.id, locationId:b.destination.id}, at(firstAt));
  for (const [bin, lot] of [[b.destination,'synthetic-pier-348'], [b.source,'synthetic-pier-349'], [b.destination,'synthetic-pier-347']]) {
    receiving = await h.command('receiving.scan', {receivingId:receiving.id, code:bin.barcode}, at(firstAt));
    receiving = await h.command('receiving.scan', {receivingId:receiving.id, code:fifo.sku, trace:{lot}}, at(firstAt));
  }
  const first = await h.command('receiving.post', {receivingId:receiving.id, version:receiving.version, supplierReference:'synthetic-pier-343'}, at(firstAt));
  const receive = (item, location, trace, now, reference) => h.command('receipt.create', {poId:po.id, supplierReference:reference, lines:[{
    poLineId:po.lines.find(line=>line.itemId===item.id).id, locationId:location.id, quantity:'1', cost:'2', trace,
  }]}, at(now));
  const later = await receive(fifo, b.source, {lot:'synthetic-pier-346'}, '2026-11-02T09:00:00.000Z', 'synthetic-pier-344');
  const repeated = await receive(fifo, b.destination, {lot:'synthetic-pier-348'}, '2026-11-03T09:00:00.000Z', 'synthetic-pier-345');
  const undated = await receive(fefo, b.source, {lot:'synthetic-pier-350'}, firstAt, 'synthetic-pier-354');
  const dated = await h.command('receipt.create', {poId:po.id, supplierReference:'synthetic-pier-355', lines:[
    {poLineId:po.lines[1].id, locationId:b.destination.id, quantity:'1', cost:'2', trace:{lot:'synthetic-pier-351',expiry:'2028-12-31'}},
    {poLineId:po.lines[1].id, locationId:b.source.id, quantity:'1', cost:'2', trace:{lot:'synthetic-pier-352',expiry:'2027-06-30'}},
    {poLineId:po.lines[1].id, locationId:b.destination.id, quantity:'1', cost:'2', trace:{lot:'synthetic-pier-353',expiry:'2027-06-30'}},
  ]}, at('2026-11-02T10:00:00.000Z'));
  const exact = await h.command('receipt.create', {poId:po.id, supplierReference:'synthetic-pier-356', lines:[
    {poLineId:po.lines[2].id, locationId:b.source.id, quantity:'2', cost:'2', trace:[{lot:'synthetic-pier-348',quantity:'1'},{lot:'SYNTHETIC-PIER-348',quantity:'1'}]},
  ]}, at('2026-11-03T10:00:00.000Z'));
  return {fifo, fefo, other, po, firstAt, first, later, repeated, undated, dated, exact};
}
