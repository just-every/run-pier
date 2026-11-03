import { fail, fresh, requireRole, row, text, type Context, type Row } from '../model';
export const documentKinds = {
  quote:'Quote', 'order-confirmation':'Sales order confirmation', proforma:'Proforma / prepay invoice',
  'pick-list':'Pick list', 'packing-slip':'Packing slip', invoice:'Invoice', 'credit-note':'Credit note',
  'customer-statement':'Customer statement', 'purchase-order':'Purchase order',
  'supplier-return-authorization':'Supplier return authorization', 'transfer-note':'Transfer note',
  'shipment-manifest':'Shipment / carton manifest', 'bill-of-lading':'VICS bill of lading',
} as const;
export type DocumentKind = keyof typeof documentKinds;
export function documentKind(value: unknown): DocumentKind {
  if (typeof value !== 'string' || !Object.hasOwn(documentKinds,value)) fail('DOCUMENT_KIND','Choose a business document kind.');
  return value as DocumentKind;
}
export function mergeText(value:string, fields:Record<string,string>) {
  return value.replace(/\{\{([a-zA-Z]+)\}\}/g,(_,key)=>Object.hasOwn(fields,key)?fields[key]:fail('DOCUMENT_FIELD',`Unknown merge field ${key}.`));
}
export function templateFor(c:Context,kind:DocumentKind) {
  const existing=c.s.businessTemplates.find(t=>t.kind===kind);
  if(existing)return existing;
  return row(c,'businessTemplates',{kind,group:['purchase-order','supplier-return-authorization'].includes(kind)?'purchasing':['pick-list','packing-slip','transfer-note','shipment-manifest','bill-of-lading'].includes(kind)?'inventory':'sales',
    title:documentKinds[kind],terms:'See the source record for agreed terms.',footer:'',remitTo:'',logo:true,
    emailSubject:'{{title}} {{reference}}',emailBody:'Please find {{title}} {{reference}} attached. {{payNowUrl}}',history:[],updatedBy:c.actor.id});
}
export function saveTemplate(c:Context,p:any):Row {
  requireRole(c,[]);const kind=documentKind(p.kind),existing=c.s.businessTemplates.find(t=>t.kind===kind),old=templateFor(c,kind);if(existing)fresh(old,p.version);else if(p.version!==0)fail('STALE','Reload the document template.');
  const limit=(value:unknown,name:string,empty=false)=>empty&&!value?'':text(value,name);
  const data={title:text(p.title,'Document title'),terms:text(p.terms,'Document terms'),footer:limit(p.footer,'Footer',true),remitTo:limit(p.remitTo,'Remit-to',true),
    emailSubject:text(p.emailSubject,'Email subject'),emailBody:text(p.emailBody,'Email body'),logo:p.logo!==false,
    ...(p.logoBase64?{logoBase64:String(p.logoBase64)}:{}),updatedBy:c.actor.id,updatedAt:c.now};
  if(p.logoBase64){
    if(typeof p.logoBase64!=='string'||p.logoBase64.length>180000||!/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(p.logoBase64))fail('DOCUMENT_LOGO','Choose a PNG logo up to 128 KiB.');
    // Logo bytes are owner-approved template data, never executable markup.
    data.logoBase64=p.logoBase64;
  }
  for(const field of[data.emailSubject,data.emailBody,data.title,data.terms,data.footer])mergeText(field,{title:'',reference:'',company:'',recipient:'',total:'',dueDate:'',payNowUrl:''});
  const {history,...previous}=structuredClone(old);old.history=[...history,previous];
  return Object.assign(old,data,{version:old.version+1});
}
