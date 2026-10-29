import { randomUUID } from 'node:crypto';

export default async function({phase,request,origin,cookie}) {
  if (phase==='initial') return {values:{},clients:{}};
  async function command(type,payload) {
    const response=await request(origin+'/api/pier/commands',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({commandId:randomUUID(),type,payload})});
    const body=await response.json();
    if (!response.ok||!body.ok) throw new Error('Native fixture preparation failed: '+type+' '+body.error?.code);
    return body.result;
  }
  const suffix=randomUUID().slice(0,8);
  const item=await command('item.save',{sku:'DOOR-'+suffix,name:'Harbor ceramic mugs',unit:'each',packSize:'1',barcode:'DOOR-'+suffix});
  const supplier=await command('party.save',{name:'Harbor ceramics '+suffix,kind:'supplier',email:'supplier@example.invalid'});
  await command('business.save',{name:'Harbor Wholesale',address:'40 Pier Road, Portland OR 97210'});
  let po=await command('po.draft',{supplierId:supplier.id,promiseDate:'2026-12-15',reason:'Reviewed winter replenishment',lines:[{itemId:item.id,quantity:'10',price:'2.50'}]});
  await command('po.approve',{poId:po.id,version:po.version});
  po=await command('po.commit',{poId:po.id,version:po.version});
  po=await command('po.authorizeSend',{poId:po.id,version:po.version,recipient:'supplier@example.invalid',maxSpend:'25',expiresAt:new Date(Date.now()+86400000).toISOString(),maxChases:0,confirm:true});
  return {values:{item,supplier,send:po},clients:{}};
}
