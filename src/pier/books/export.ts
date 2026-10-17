import type { State } from '../model';
import { planBooks } from './planning';
import { amount, money } from '../money';
const clean=(value:unknown)=>String(value??'').replace(/[\t\r\n]/g,' ');
const csv=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
/** Export real source documents independently of any connected ledger. */
export function booksExport(state:State,format:'csv'|'iif'){
  const s=structuredClone(state);
  s.bookJobs=[];
  s.bookConnections=[{id:'export',version:1,enabled:true,inventoryAccountId:'Inventory Asset',cogsAccountId:'Cost of Goods Sold',revenueAccountId:'Sales'}];
  planBooks({s,now:new Date().toISOString(),commandId:'export',actor:{id:'',name:'',role:'viewer',sessionId:'',operatorVersion:0}});
  const jobs=s.bookJobs.filter(j=>['invoice','credit','bill','journal'].includes(j.kind));
  if(format==='csv'){
    const rows=[['Type','Date','Reference','Party','Description','Account','Quantity','Debit USD','Credit USD','Review reason']];
    for(const job of jobs){
      if(!job.document){rows.push([job.kind,'',job.reference,'','','','','','',job.reason]);continue;}
      const d=job.document;
      if(d.kind==='invoice')rows.push([d.kind,d.date,d.reference,d.party.name,'Invoice total','Accounts Receivable','1',d.total,'','']);
      if(d.kind==='credit')rows.push([d.kind,d.date,d.reference,d.party.name,'Return credit total','Accounts Receivable','1','',d.total,'']);
      if(d.kind==='bill')rows.push([d.kind,d.date,d.reference,d.party.name,'Bill total','Accounts Payable','1','',d.total,'']);
      for(const l of d.lines)rows.push([d.kind,d.date,d.reference,d.party?.name??'',l.description,l.account,l.quantity,l.debit??(['bill','credit'].includes(d.kind)?l.amount:''),l.credit??(d.kind==='invoice'?l.amount:''),'']);
    }
    return rows.map(r=>r.map(csv).join(',')).join('\r\n')+'\r\n';
  }
  const refused=jobs.filter(j=>!j.document);
  if(refused.length)throw new Error(`Resolve ${refused.length} unpriced or unvalued financial document(s) before exporting IIF. The CSV lists the reasons.`);
  const rows=['!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO','!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO','!ENDTRNS'];
  for(const job of jobs){
    const d=job.document,party=d.party?.name??'',date=d.date.slice(5,7)+'/'+d.date.slice(8,10)+'/'+d.date.slice(0,4);
    const lines=d.kind==='journal'?d.lines.map((l:any)=>({account:l.account,value:l.debit??`-${l.credit}`,description:l.description})):d.kind==='invoice'?[{account:'Accounts Receivable',value:d.total,description:'Invoice total'},...d.lines.map((l:any)=>({account:l.account,value:`-${l.amount}`,description:l.description}))]:d.kind==='credit'?[{account:'Accounts Receivable',value:`-${d.total}`,description:'Return credit total'},...d.lines.map((l:any)=>({account:l.account,value:l.amount,description:l.description}))]:[...d.lines.map((l:any)=>({account:l.account,value:l.amount,description:l.description})),{account:'Accounts Payable',value:`-${d.total}`,description:'Bill total'}];
    if(lines.reduce((n:bigint,l:any)=>n+amount(l.value),0n)!==0n)throw new Error('Export entries do not balance. Review the source document.');
    lines.forEach((l:any,i:number)=>rows.push([i?'SPL':'TRNS','',d.kind==='invoice'?'INVOICE':d.kind==='credit'?'CREDIT MEMO':d.kind==='bill'?'BILL':'GENERAL JOURNAL',date,l.account,party,l.value,d.reference,l.description].map(clean).join('\t')));
    rows.push('ENDTRNS');
  }
  return rows.join('\r\n')+'\r\n';
}
