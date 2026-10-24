import { sha256 } from '../../import-kit';
import { pantryClient, PantryRefusal } from './pantry-client';
import { shopPaymentCurrent, postShopPayment } from './pantry-payment';
import type { BookDocument, BookResult, BooksAdapter, BooksAdapterConfig } from './types';
const cents=(value:string)=>BigInt(value.replace('.',''));
const dollars=(value:bigint)=>{
  const n=value<0n?-value:value;
  return `${value<0n?'-':''}${n/100n}.${String(n%100n).padStart(2,'0')}`;
};
const flag=(value:unknown)=>value===true||value===1;
export function createPantryAdapter(config:BooksAdapterConfig):BooksAdapter {
  const client=pantryClient(config);
  const lookup=async(path:string,collection:string,field:string,value:string) => {
    const rows=(await client.request(`${path}?${field}=${encodeURIComponent(value)}`))[collection];
    return client.matching(rows,r=>r[field]===value);
  };
  const invoice=(number:string)=>lookup('invoices','invoices','number',number);
  const raw=async(doc:BookDocument) => {
    if(doc.vendorCreditForReference)return lookup('vendor-credits','vendorCredits',doc.remoteId?'id':'reference',doc.remoteId??doc.reference);
    if(doc.kind==='item')return client.attachment(doc);
    if(doc.kind==='journal')return lookup('journals','entries',doc.remoteId?'id':'memo',doc.remoteId??doc.reference);
    const sales=['invoice','credit'].includes(doc.kind);
    return lookup(sales?'invoices':'bills',sales?'invoices':'bills',doc.remoteId?'id':sales?'number':'reference',doc.remoteId??doc.reference);
  };
  // Pier's receipt match decides readiness; Pantry records it natively on the bill.
  const wanted=(doc:BookDocument,open:bigint)=>{
    const received=doc.receiptState?.received??true;
    return {received,readyToPay:received&&(doc.receiptState?.readyToPay??true)&&open>0n};
  };
  const validate=(doc:BookDocument,r:any) => {
    const mismatch=()=>{throw new PantryRefusal('The Pantry record with this Pier reference has different amounts, accounts or lines. Review both records before continuing.',409);};
    if(doc.vendorCreditForReference){
      if(r.credit_date!==doc.date || r.vendor_name!==doc.party?.name || r.account_id!==doc.lines[0].account || BigInt(r.amount_cents)!==cents(doc.total))mismatch();
      return;
    }
    if(doc.kind==='item')return;
    if((doc.kind==='journal'?r.entry_date:['invoice','credit'].includes(doc.kind)?r.issue_date:r.bill_date)!==doc.date || r.reversed_by_id) mismatch();
    if(doc.kind==='journal') {
      if(r.lines.length!==doc.lines.length)return mismatch();
      for(let i=0;i<doc.lines.length;i++){const l=doc.lines[i],rl=r.lines[i];if(rl.account_id!==l.account||BigInt(rl.debit_cents)!==cents(l.debit??'0.00')||BigInt(rl.credit_cents)!==cents(l.credit??'0.00'))mismatch();}
    } else {
      if(BigInt(r.total_cents)!==cents(doc.total)||r.lines.length!==doc.lines.length||r.status==='void'||(['invoice','credit'].includes(doc.kind)&&r.kind!==doc.kind))mismatch();
      for(let i=0;i<doc.lines.length;i++){const l=doc.lines[i],rl=r.lines[i];if(rl.account_id!==l.account||BigInt(rl.amount_cents)!==cents(l.amount)||rl.description!==l.description)mismatch();}
      if((['invoice','credit'].includes(doc.kind)?r.customer_name:r.vendor_name)!==doc.party?.name)mismatch();
    }
  };
  const result=async(doc:BookDocument,r:any):Promise<BookResult>=>{
    validate(doc,r);
    if(doc.vendorCreditForReference){
      const target=await lookup('bills','bills','reference',doc.vendorCreditForReference);
      const allocated=r.allocations.reduce((n:bigint,a:any)=>n+BigInt(a.amount_cents),0n);
      if(!target||r.vendor_id!==target.vendor_id||r.allocations.some((a:any)=>a.target_id!==target.id||a.target_kind!=='bill')||allocated!==cents(doc.total)||BigInt(r.unallocated_cents)!==0n)throw new PantryRefusal('The supplier credit is not fully allocated to its matched payable. Review it in Pantry.',409);
      return {id:r.id,status:'posted',allocated:dollars(allocated),unallocated:dollars(BigInt(r.unallocated_cents))};
    }
    if(doc.kind==='credit') {
      const target=await invoice(doc.creditForReference!);
      if(!target||target.kind!=='invoice'||r.credit_for!==target.id)throw new PantryRefusal('The return credit is linked to a different invoice. Review its dispatch reference in Pantry.',409);
    }
    const balance=doc.kind==='invoice'||doc.kind==='bill'?{
      paid:dollars((await client.payments(doc.kind,r.id)).filter(p=>!p.reversal_id).flatMap(p=>p.allocations).filter(a=>a.target_id===r.id&&a.target_kind===doc.kind).reduce((n:bigint,a:any)=>n+BigInt(a.amount_cents),0n)),
      open:dollars(BigInt(r.open_cents)),
    }:{};
    let paymentCurrent: boolean | undefined;
    if(doc.payment) {
      try { paymentCurrent=await shopPaymentCurrent(client,doc,r); }
      catch(error) { if(error instanceof PantryRefusal) error.readback=balance; throw error; }
    }
    return {id:r.id,status:r.status??'posted',...balance,...(doc.kind==='bill'?await receiptResult(doc,r):{}),...(doc.payment?{paymentCurrent}:{})};
  };
  const receiptResult=async(doc:BookDocument,r:any)=>{
    const want=wanted(doc,BigInt(r.open_cents)),received=flag(r.received),readyToPay=flag(r.ready_to_pay);
    const evidence=!!await client.attachment(doc.receiptState?{...doc,attachment:doc.receiptState.attachment}:doc,r.id);
    return {evidenceCurrent:evidence&&received===want.received&&readyToPay===want.readyToPay,received,readyToPay};
  };
  return {
    async read(doc){const r=await raw(doc);return r?result(doc,r):null;},
    async post(doc){
      if(doc.kind==='receipt')throw new PantryRefusal('Attach the goods receipt to its posted supplier bill. A receipt never records a payment.',400);
      if(doc.kind==='item'){const r=await client.upload(doc);return{id:r.id,status:'posted'};}
      let r=await raw(doc);
      if(r)validate(doc,r);
      if(doc.vendorCreditForReference){
        const target=await lookup('bills','bills','reference',doc.vendorCreditForReference);
        if(!target||target.status!=='posted'||target.vendor_name!==doc.party?.name)throw new PantryRefusal('Post the matched supplier payable in Pantry before its credit.',409);
        if(!r){
          if(BigInt(target.open_cents)<cents(doc.total))throw new PantryRefusal('The matched payable has insufficient open balance. Review the supplier credit with your accountant.',409);
          r=await client.post('vendor-credits',{vendorId:target.vendor_id,reference:doc.reference,date:doc.date,amount:doc.total,accountId:doc.lines[0].account,allocations:[{targetId:target.id,amount:doc.total}]},doc,'vendor-credit');
        }
        return result(doc,r);
      }
      if(doc.kind==='invoice'||doc.kind==='credit'){
        let target:any;
        if(doc.kind==='credit') {
          target=await invoice(doc.creditForReference!);
          if(!target||target.kind!=='invoice'||target.status!=='issued'){
            // Refused before anything was sent: the credit can be created later without doubt.
            const waiting=new PantryRefusal('The original dispatch invoice is not posted in Pantry yet. Pier posts the credit once that invoice is posted.',409);
            waiting.safeCreationRefusal=!r;throw waiting;
          }
          if(r&&r.credit_for!==target.id)throw new PantryRefusal('The return credit is linked to a different invoice. Review it in Pantry.',409);
        }
        if(!r){const party=await client.contact(doc);r=await client.post('invoices',{kind:doc.kind,...(target?{creditFor:target.id}:{}),customerId:party.id,number:doc.reference,issueDate:doc.date,memo:doc.key,post:true,lines:doc.lines.map(l=>({description:l.description,quantity:l.quantity,rate:l.unitPrice,accountId:l.account,taxCode:config.credentials.taxCode}))},doc,'invoice');}
        validate(doc,r);
        if(r.status!=='issued')throw new PantryRefusal('Issue the existing invoice in Pantry, then sync again. Pier will not create a replacement for its draft.',409);
        if(doc.payment){await postShopPayment(client,doc,r);r=await raw(doc);}
      } else if(doc.kind==='bill'){
        if(!r){const party=await client.contact(doc);r=await client.post('bills',{vendorId:party.id,reference:doc.reference,billDate:doc.date,memo:doc.key,post:true,lines:doc.lines.map(l=>({description:l.description,accountId:l.account,amount:l.amount}))},doc,'bill');}
        validate(doc,r);
        if(r.status!=='posted')throw new PantryRefusal('Post the existing bill in Pantry, then sync again. Pier will not create a replacement for its draft.',409);
        await client.upload(doc,r.id);
        if(doc.receiptState)await client.upload({...doc,attachment:doc.receiptState.attachment},r.id);
        // Receipt and payment readiness are native Pantry bill states; they record no payment.
        const want=wanted(doc,BigInt(r.open_cents)),state=doc.receiptState?.attachment.name??'receipt';
        if(flag(r.received)!==want.received||flag(r.ready_to_pay)!==want.readyToPay) {
          if(typeof r.revision!=='string'||!r.revision)throw new PantryRefusal('Pantry returned no current bill revision. Check the bill before changing its receipt readiness.',502);
          // A later reversal can need the same readiness again. Its current bill
          // revision makes that a new transition, while response-loss replay stays stable.
          r=await client.post(`bills/${encodeURIComponent(r.id)}/readiness`,want,doc,'readiness:'+sha256(`${state}:${r.revision}:${want.received}:${want.readyToPay}`).slice(0,24));
        }
      } else if(doc.kind==='journal'){
        if(!r)r=await client.post('journals',{date:doc.date,memo:doc.reference,post:true,lines:doc.lines.map(l=>({accountId:l.account,...(l.debit?{debit:l.debit}:{credit:l.credit}),memo:l.description}))},doc,'journal');
        if(r.status!=='posted')throw new PantryRefusal('Post the existing journal in Pantry, then sync again. Pier will not create a replacement for its draft.',409);
      }
      return result(doc,r);
    },
  };
}
