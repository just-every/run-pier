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
  return {lot,serial,source,destination,transit,supplier,customer,po};
}
export const gs1Lot=(lot,expiry)=>`(01)12345678901231(10)${lot}(17)${expiry}`;
