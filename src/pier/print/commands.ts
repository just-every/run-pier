import { queuePurchase } from '../purchasing-workflow';
import { poMaterial } from '../correspondence-delivery-eligibility';
import { shipTo } from '../business';
import type { Bindings } from '../../auth.server';
import { fail, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { currentQuote } from '../sales-quotes';
import { requireQuoteApproval } from '../quote-approval';
import { businessPDF } from './pdf';
import { billOfLadingPDF } from './bol';
import { freightFields } from './freight-fields';
import { documentKind, documentKinds, mergeText, saveTemplate, templateFor, type DocumentKind } from './templates';
import { orderSource } from './order-sources';
import { otherSource } from './other-sources';
import { mailSettings } from './mail-settings';
import { nativeBalance } from '../invoices/index';
import { amount } from '../money';

export async function generateDocument(c:Context,p:any,recipient?:string,purchaseSend=false):Promise<Row> {
  const kind=documentKind(p.kind);
  if (purchaseSend && kind === 'purchase-order') {
    requireRole(c, ['buyer', 'agent']);
    if (c.actor.role === 'agent' && c.purchaseSendAuthority?.poId !== p.sourceId) fail('SEND_AUTHORITY', 'An exact delegated purchase send is required.');
  } else requireRole(c, []);
  const template=templateFor(c,kind);
  const profile=c.s.businessProfile.find(b=>b.id==='business')??fail('BUSINESS_PROFILE','Add your business name and address in Purchasing before generating business documents.');
  const company={name:profile.name,address:profile.address,remitTo:template.remitTo};
  const source=orderSource(c,kind,p.sourceId)??otherSource(c,kind,p.sourceId)??fail('DOCUMENT_SOURCE','Choose a live source record.');
  if(kind==='quote'){
    if(source.source.documentType!=='quote'||source.source.acceptedAt)fail('QUOTE_STATE','Choose an open quote.');
    currentQuote(c,source.source);requireQuoteApproval(c,source.source);
  }
  if(kind==='order-confirmation'&&source.source.documentType==='quote'&&!source.source.acceptedAt)fail('QUOTE_STATE','Accept the quote before confirming it.');
  const fields=[...source.fields];
  if(kind==='bill-of-lading'){
    const freight=p.freight??{};
    for(const [key,label,required]of freightFields)fields.push({label,value:required?text(freight[key],label):String(freight[key]??'').trim()});
    fields.push({label:'Customer order number',value:source.fields.find(field=>field.label==='Order')?.value??source.reference});
  }
  const merged={title:template.title,reference:source.reference,company:company.name,recipient:source.recipient??'',total:source.totals.at(-1)?.value??'',dueDate:source.source.dueDate??'',payNowUrl:('payNowUrl'in source?source.payNowUrl:undefined)??''};
  const input={title:mergeText(template.title,merged),reference:source.reference,recordVersion:source.source.version,templateVersion:template.version,company,
    recipient:source.recipient,terms:mergeText(template.terms,merged),fields,lines:source.lines,totals:source.totals,
    payNowUrl:merged.payNowUrl||undefined,footer:mergeText(template.footer,merged),logo:template.logo,logoBase64:template.logo?template.logoBase64:undefined};
  let pdf:string;
  try{pdf=await(kind==='bill-of-lading'?billOfLadingPDF(input):businessPDF(input));}catch(error){fail((error as any).code??'DOCUMENT_RENDER',(error as Error).message||'The business PDF could not be generated.');}
  const filename=`${String(source.reference).replace(/[^a-zA-Z0-9_-]/g,'-')}-v${source.source.version}-${kind}.pdf`;
  return row(c,'salesDocuments',{kind,recordId:source.source.id,recordVersion:source.source.version,sourceKind:source.sourceKind,
    templateId:template.id,templateVersion:template.version,snapshot:structuredClone(source.source),rendered:input,pdf:pdf!,filename,
    recipient:recipient??null,subject:mergeText(template.emailSubject,merged),body:mergeText(template.emailBody,merged)+(kind==='customer-statement'?'\n'+source.lines.filter(l=>l.payNowUrl).map(l=>`${l.description}: ${l.payNowUrl}`).join('\n'):''),
    createdBy:c.actor.id,...(recipient?{approvedBy:c.actor.id,approvedAt:c.now}:{})});
}
export async function printedDocuments(c:Context,type:string,p:any,env:Bindings):Promise<Row|undefined>{
  if(!type.startsWith('print.'))return;
  requireRole(c,[]);
  if(type==='print.template.save')return saveTemplate(c,p);
  const settings=await mailSettings(c,type,p,env);if(settings!==undefined)return settings;
  if(type==='print.generate')return generateDocument(c,p);
  if(type==='print.send'){
    const document=get(c.s,'salesDocuments',p.documentId);fresh(document,p.version);
    const recipient=text(p.recipient,'Explicitly approved recipient');
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))fail('EMAIL','Enter one valid recipient.');
    if (document.kind === 'purchase-order') {
      const po = get(c.s, 'purchaseOrders', document.recordId), profile = c.s.businessProfile.find(b => b.id === 'business');
      if (po.status !== 'committed' || document.recordVersion !== po.version || poMaterial(document.snapshot) !== poMaterial(po) ||
          !profile || document.rendered.company.name !== profile.name || document.rendered.company.address !== profile.address ||
          !document.rendered.fields.some((field: any) => field.label === 'Ship to' && field.value === shipTo(profile, po.destinationWarehouse)))
        fail('PO_STATE', 'Generate the current committed purchase document before approving its recipient.');
      const message = queuePurchase(c, po, { recipient, maxChases: 0 });
      message.documentId = document.id;
      return message;
    }
    if(document.kind==='quote'){const quote=get(c.s,'orders',document.recordId);if(quote.documentType!=='quote'||quote.acceptedAt||quote.version!==document.recordVersion)fail('QUOTE_STATE','Generate the current approved quote version before emailing it.');currentQuote(c,quote);requireQuoteApproval(c,quote);}
    if(['invoice','proforma'].includes(document.kind)&&!document.rendered?.payNowUrl)fail('PAY_LINK','Create the invoice-specific payment link and regenerate this invoice before emailing it.');
    if(document.kind==='customer-statement'&&document.rendered.lines.some((l:any)=>l.invoiceId&&l.total!=='0.000000000000'&&!l.payNowUrl))fail('PAY_LINK','Create each open invoice payment link and regenerate the statement before emailing it.');
    const linkedInvoices=['invoice','proforma'].includes(document.kind)?[{invoiceId:document.recordId,payNowUrl:document.rendered.payNowUrl}]:document.kind==='customer-statement'?document.rendered.lines.filter((line:any)=>line.invoiceId):[];
    for(const linked of linkedInvoices)if(amount(nativeBalance(c.s,linked.invoiceId))>0n&&!c.s.invoicePayLinks.some(link=>link.invoiceId===linked.invoiceId&&link.status==='active'&&link.url===linked.payNowUrl))fail('PAY_LINK','This retained PDF has an expired payment link. Create the current invoice link and generate a new PDF before emailing it.');
    const {id,version,createdAt,...copy}=document;
    return row(c,'salesDocuments',{...copy,copyOf:id,recipient,approvedBy:c.actor.id,approvedAt:c.now});
  }
  fail('COMMAND','Unknown print command.');
}
