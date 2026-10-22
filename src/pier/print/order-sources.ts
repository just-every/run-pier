import type { DocumentSource } from "./source";
import { businessParticulars } from "./display";
import { decimal, format, get, type Context, type Row } from '../model';
import { money, toCents } from '../money';
import type { BusinessPDFInput } from './pdf-types';
export function itemLine(c:Context,line:any,partyId?:string):BusinessPDFInput['lines'][number] {
  const item=get(c.s,'items',line.itemId),quantity=line.quantity ?? '0',pack=decimal(line.packSize??item.packSize,true);
  const commercial=line.commercialQuantity??(decimal(quantity)%pack===0n?format(decimal(quantity)*1000000n/pack):quantity);
  const unit=line.commercialUnit??(decimal(quantity)%pack===0n?'case':item.unit);
  const codes=(item.references??[]).filter((r:any)=>r.partyId===partyId).map((r:any)=>r.code);
  const identities=(line.trace??[]).map((t:any)=>c.s.traceIdentities.find(i=>i.id===t.identityId)).filter(Boolean).map((i:any)=>[i.lot&&`Lot ${i.lot}`,i.serial&&`Serial ${i.serial}`,i.expiry&&`Expiry ${i.expiry}`].filter(Boolean).join(' / '));
  const price=line.price??line.unitPrice;
  return {description:`${item.sku} · ${item.name}${line.description?` · ${line.description}`:''}`,itemCode:codes.join(', '),quantity:commercial,unit,baseQuantity:`${quantity} ${item.unit}`,price:price??undefined,
    total:line.amount??line.lineTotal??(price?money(toCents(decimal(quantity)*decimal(price))):undefined),lotSerial:identities.join('; '),customFields:item.customFields?businessParticulars(item.customFields):undefined};
}
export function orderSource(c:Context,kind:string,sourceId:string):DocumentSource|undefined{
  if(['quote','order-confirmation','pick-list'].includes(kind)){
    const order=get(c.s,'orders',sourceId),customer=get(c.s,'parties',order.customerId);
    const lines=kind==='pick-list'?c.s.reservations.filter(r=>r.orderId===order.id).map(r=>{
      const line=order.lines.find((l:any)=>l.id===r.orderLineId),bin=get(c.s,'locations',r.locationId);
      return itemLine(c,{...line,itemId:r.itemId,quantity:format(BigInt(r.quantity)),commercialQuantity:undefined,commercialUnit:undefined,lineTotal:undefined,amount:undefined,description:`Pick ${bin.warehouse} / ${bin.name}`},customer.id);
    }):order.lines.map((l:any)=>itemLine(c,l,customer.id));
    return {source:order,sourceKind:'orders',reference:order.reference,recipient:customer.name,lines,
      fields:[{label:'Destination',value:businessParticulars(order.shipTo)},{label:'Customer PO',value:order.customerPO??'Not supplied'},{label:'Currency',value:order.currency??'USD'}],
      totals:order.total?[{label:'Subtotal',value:order.subtotal??order.total},{label:'Tax estimate',value:order.tax?.amount??'Pending'},{label:'Total',value:order.total}]:[]};
  }
  if(kind==='packing-slip'){
    const pack=get(c.s,'packs',sourceId),order=get(c.s,'orders',pack.orderId),customer=get(c.s,'parties',order.customerId);
    const lines=pack.cartons.flatMap((carton:any)=>carton.lines.map((l:any)=>itemLine(c,{...order.lines.find((ol:any)=>ol.id===l.orderLineId),...l,commercialQuantity:undefined,commercialUnit:undefined,lineTotal:undefined,amount:undefined,description:`Carton ${carton.number}`},customer.id)));
    return {source:pack,sourceKind:'packs',reference:`${order.reference} / Pack ${pack.id}`,recipient:customer.name,lines,
      fields:[{label:'Pack state',value:pack.status},{label:'Warehouse',value:pack.warehouse??order.warehouse??''}],totals:[]};
  }
  if(['shipment-manifest','bill-of-lading'].includes(kind)){
    const shipment=get(c.s,'shipments',sourceId),order=get(c.s,'orders',shipment.orderId),customer=get(c.s,'parties',order.customerId);
    return {source:shipment,sourceKind:'shipments',reference:shipment.reference,recipient:customer.name,
      lines:shipment.lines.map((l:any)=>itemLine(c,{...order.lines.find((ol:any)=>ol.id===l.orderLineId),...l,commercialQuantity:undefined,commercialUnit:undefined,lineTotal:undefined,amount:undefined},customer.id)),
      fields:[{label:'Order',value:order.reference},{label:'Destination',value:businessParticulars(order.shipTo)}],totals:[]};
  }
}
