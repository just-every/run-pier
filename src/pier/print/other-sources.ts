import type { DocumentSource } from "./source";
import { paymentTerms } from "./display";
import { fail, get, type Context } from '../model';
import { itemLine } from './order-sources';
import { money, amount } from '../money';
import { nativeBalance } from '../invoices/index';
export function otherSource(c:Context,kind:string,sourceId:string):DocumentSource|undefined{
  if(kind==='purchase-order'){
    const po=get(c.s,'purchaseOrders',sourceId),supplier=get(c.s,'parties',po.supplierId);
    return {source:po,sourceKind:'purchaseOrders',reference:po.reference,recipient:supplier.name,
      lines:po.lines.map((l:any)=>itemLine(c,l,supplier.id)),fields:[{label:'Promise date',value:po.promiseDate??''},{label:'Warehouse',value:po.warehouse??''}],totals:[]};
  }
  if(kind==='supplier-return-authorization'){
    const returned=get(c.s,'supplierReturns',sourceId),receipt=get(c.s,'receipts',returned.receiptId),po=get(c.s,'purchaseOrders',receipt.poId),supplier=get(c.s,'parties',po.supplierId);
    return {source:returned,sourceKind:'supplierReturns',reference:returned.reference??returned.id,recipient:supplier.name,
      lines:returned.lines.map((line:any)=>itemLine(c,line,supplier.id)),fields:[{label:'Supplier authorization',value:returned.authorization?.reference??returned.authorizationReference??'Not authorized'},{label:'Original receipt',value:receipt.supplierReference},{label:'Reason',value:returned.reason}],totals:[]};
  }
  if(kind==='transfer-note'){
    const transfer=get(c.s,'transfers',sourceId),from=get(c.s,'locations',transfer.fromLocationId),to=get(c.s,'locations',transfer.toLocationId);
    return {source:transfer,sourceKind:'transfers',reference:transfer.reference??transfer.id,recipient:`${to.warehouse} / ${to.name}`,
      lines:[itemLine(c,transfer)],fields:[{label:'From',value:`${from.warehouse} / ${from.name}`},{label:'To',value:`${to.warehouse} / ${to.name}`},{label:'Status',value:transfer.status}],totals:[]};
  }
  if(['invoice','proforma','credit-note'].includes(kind)){
    const credit=kind==='credit-note',record=get(c.s,credit?'invoiceCredits':'invoices',sourceId);
    if(!['authorized','voided'].includes(record.status))fail('INVOICE_STATE','Authorize this financial document before printing it.');
    if(kind==='proforma'&&record.policy!=='prepay')fail('INVOICE_STATE','Choose an authorized prepay invoice.');
    const customer=get(c.s,'parties',record.customerId),links=c.s.invoicePayLinks.filter(l=>l.invoiceId===record.id&&l.url),link=credit?undefined:links.find(l=>l.status==='active')??(amount(nativeBalance(c.s,record.id))===0n?links.at(-1):undefined);
    const lines=record.lines.map((l:any)=>l.itemId&&l.quantity?itemLine(c,l,customer.id):{description:l.description??l.kind,...(l.quantity?{quantity:l.quantity}:{}),itemCode:l.itemId?(get(c.s,'items',l.itemId).references??[]).filter((r:any)=>r.partyId===customer.id).map((r:any)=>r.code).join(', '):undefined,price:l.unitPrice??l.price,total:l.amount});
    for(const charge of record.charges??[])lines.push({description:`${charge.kind}: ${charge.description??''}`,quantity:'1',total:charge.amount});
    return {source:record,sourceKind:credit?'invoiceCredits':'invoices',reference:record.reference,recipient:customer.name,lines,
      fields:[{label:'Invoice date',value:record.invoiceDate??record.date},{label:'Due date',value:record.dueDate??''},{label:'Terms',value:paymentTerms(record.terms)},{label:'State',value:record.status},{label:'Currency / USD rate',value:`${record.currency} / ${record.usdRate??'1'}`}],
      totals:[{label:'Tax',value:record.tax?.amount??record.taxTotal??'Not committed'},{label:`Total ${record.currency}`,value:record.total},{label:'USD value',value:record.usdTotal??record.total},...(!credit?[{label:'Open balance',value:nativeBalance(c.s,record.id)}]:[])],
      payNowUrl:!credit?link?.url:undefined};
  }
  if(kind==='customer-statement'){
    const customer=get(c.s,'parties',sourceId);if(customer.kind!=='customer')fail('CUSTOMER','Choose a customer.');
    const invoices=c.s.invoices.filter(i=>i.customerId===customer.id&&i.status==='authorized');
    const lines=invoices.flatMap(invoice=>[{invoiceId:invoice.id,description:`${invoice.reference} · due ${invoice.dueDate}`,total:nativeBalance(c.s,invoice.id),payNowUrl:(c.s.invoicePayLinks.find(l=>l.invoiceId===invoice.id&&l.status==='active')??(amount(nativeBalance(c.s,invoice.id))===0n?c.s.invoicePayLinks.filter(l=>l.invoiceId===invoice.id).at(-1):undefined))?.url},...invoice.lines.map((line:any)=>({...itemLine(c,line,customer.id),description:`${invoice.reference}: ${get(c.s,'items',line.itemId).sku} · invoiced quantities`}))]);
    return {source:{...customer,invoices:structuredClone(invoices),payments:structuredClone(c.s.invoicePayments.filter(p=>invoices.some(i=>i.id===p.invoiceId))),credits:structuredClone(c.s.invoiceCredits.filter(r=>r.customerId===customer.id))},sourceKind:'parties',reference:`Statement ${customer.name}`,recipient:customer.name,lines,
      fields:[{label:'As of',value:c.now.slice(0,10)}],totals:[...new Set(invoices.map(i=>i.currency))].map(currency=>({label:`${currency} outstanding`,value:money(invoices.filter(i=>i.currency===currency).reduce((n,i)=>n+amount(nativeBalance(c.s,i.id)),0n))}))};
  }
}
