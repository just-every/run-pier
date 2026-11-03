import { Problem, type Actor, type State } from '../model';
import { documentKinds } from './templates';
export function printRead(path:string,actor:Actor,s:State):Response|null{
  if(path!=='/api/pier/print')return null;
  if(actor.role!=='owner')throw new Problem('FORBIDDEN','Only an owner can read business templates and retained sends.',null,403);
  const sources:Record<string,any[]>={};
  for(const kind of Object.keys(documentKinds)){
    const collection=kind==='packing-slip'?s.packs:kind==='purchase-order'?s.purchaseOrders:kind==='supplier-return-authorization'?s.supplierReturns:kind==='transfer-note'?s.transfers:['shipment-manifest','bill-of-lading'].includes(kind)?s.shipments:kind==='credit-note'?s.invoiceCredits:['invoice','proforma'].includes(kind)?s.invoices:kind==='customer-statement'?s.parties.filter(p=>p.kind==='customer'):s.orders;
    sources[kind]=collection.filter(r=>kind!=='quote'||r.documentType==='quote'&&!r.acceptedAt).map(r=>({id:r.id,version:r.version,label:r.reference??r.name??r.id}));
  }
  return Response.json({kinds:documentKinds,templates:s.businessTemplates.filter(t=>t.kind),sources,
    documents:s.salesDocuments.map(({pdf,snapshot,...document})=>document),deliverySettings:s.businessTemplates.find(r=>r.id==='pier-print-delivery')??{version:0,enabled:false}},
    {headers:{'cache-control':'no-store'}});
}
