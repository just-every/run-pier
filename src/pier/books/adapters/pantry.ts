import { pantryClient, PantryRefusal } from './pantry-client';
import type { BookDocument, BookResult, BooksAdapter, BooksAdapterConfig } from './types';
const cents=(value:string)=>BigInt(value.replace('.',''));
const dollars=(value:number)=>`${Math.trunc(value/100)}.${String(value%100).padStart(2,'0')}`;
export function createPantryAdapter(config:BooksAdapterConfig):BooksAdapter {
  const client=pantryClient(config);
  const raw=async(doc:BookDocument) => {
    if(doc.kind==='item')return client.attachment(doc);
    if(doc.kind==='journal')return client.matching((await client.request('journal')).entries,r=>r.memo===doc.reference);
    const sales=await client.request('sales');
    return client.matching(['invoice','credit'].includes(doc.kind)?sales.invoices:sales.bills,r=>doc.remoteId?r.id===doc.remoteId:['invoice','credit'].includes(doc.kind)?r.number===doc.reference:r.reference===doc.reference);
  };
  const validate=(doc:BookDocument,r:any) => {
    const mismatch=()=>{throw new PantryRefusal('The Pantry record with this Pier reference has different amounts, accounts or lines. Review both records before continuing.',409);};
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
    if(doc.kind==='credit') {
      const target=client.matching((await client.request('sales')).invoices,i=>i.kind==='invoice'&&i.number===doc.creditForReference);
      if(!target||r.credit_for!==target.id)throw new PantryRefusal('The return credit is linked to a different invoice. Review its dispatch reference in Pantry.',409);
    }
    return {id:r.id,status:r.status??'posted',...(['invoice','bill'].includes(doc.kind)?{paid:dollars(((await client.request('sales')).payments as any[]).filter(p=>!p.reversal_id).flatMap(p=>p.allocations).filter(a=>a.target_id===r.id&&a.target_kind===doc.kind).reduce((n,a)=>n+a.amount_cents,0)),open:dollars(r.open_cents)}:{}),...(doc.kind==='bill'?{received:!!await client.attachment(doc,r.id)}:{})};
  };
  return {
    async read(doc){const r=await raw(doc);return r?result(doc,r):null;},
    async post(doc){
      if(doc.kind==='receipt')throw new PantryRefusal('Attach the goods receipt to its posted supplier bill. A receipt never records a payment.',400);
      if(doc.kind==='item'){const r=await client.upload(doc);return{id:r.id,status:'posted'};}
      let r=await raw(doc);
      if(r)validate(doc,r);
      if(doc.kind==='invoice'||doc.kind==='credit'){
        let target:any;
        if(doc.kind==='credit') {
          target=client.matching((await client.request('sales')).invoices,i=>i.kind==='invoice'&&i.number===doc.creditForReference);
          if(!target||target.status!=='issued')throw new PantryRefusal('Post the original dispatch invoice in Pantry before issuing its return credit.',409);
          if(r&&r.credit_for!==target.id)throw new PantryRefusal('The return credit is linked to a different invoice. Review it in Pantry.',409);
        }
        if(!r){const party=await client.contact(doc);r=await client.command('invoice.save-draft',{kind:doc.kind,...(target?{creditFor:target.id}:{}),customerId:party.id,number:doc.reference,issueDate:doc.date,memo:doc.key,lines:doc.lines.map(l=>({description:l.description,quantity:l.quantity,rate:l.unitPrice,accountId:l.account,taxCode:config.credentials.taxCode}))});}
        validate(doc,r);
        if(r.status==='draft')r=await client.command('invoice.approve',{id:r.id,revision:r.revision});
        if(r.status==='approved')r=await client.command('invoice.issue',{id:r.id});
      } else if(doc.kind==='bill'){
        if(!r){const party=await client.contact(doc);r=await client.command('bill.save',{vendorId:party.id,reference:doc.reference,billDate:doc.date,memo:doc.key,post:true,lines:doc.lines.map(l=>({description:l.description,accountId:l.account,amount:l.amount}))});}
        if(r.status==='draft')r=await client.command('bill.record',{id:r.id,revision:r.revision});
        await client.upload(doc,r.id);
      } else if(doc.kind==='journal'){
        if(!r)r=await client.command('journal.save-draft',{date:doc.date,memo:doc.reference,lines:doc.lines.map(l=>({accountId:l.account,...(l.debit?{debit:l.debit}:{credit:l.credit}),memo:l.description}))});
        if(r.status==='draft')r=await client.command('journal.post',{id:r.id,revision:r.revision});
      }
      return result(doc,r);
    },
  };
}
