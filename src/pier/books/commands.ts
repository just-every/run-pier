import { fail, fresh, get, requireRole, text, type Context } from '../model';
import type { Bindings } from '../../auth.server';
import { seal } from '../channels/secrets';
import { planBooks } from './planning';
import { amount, money } from '../money';
export async function books(c:Context,type:string,p:any,env:Bindings):Promise<any> {
  if(!type.startsWith('book.'))return;
  requireRole(c,['owner']);
  if(type==='book.connect'){
    let url:URL;try{url=new URL(p.baseUrl);}catch{ return fail('BOOK_URL','Enter the Pantry installation origin.'); }
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost');
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||(local&&env.AUTH_LOCAL!=='true'))fail('BOOK_URL','Use a public HTTPS Pantry origin. Loopback HTTP works only in a local Pier installation.');
    if(p.taxCode!=='exempt')fail('BOOK_TAX','Explicitly confirm tax-exempt wholesale invoices. Taxable sales need reviewed tax mapping before this connector can post them.');
    const sessionCookie=text(p.sessionCookie,'Current Pantry owner session cookie');
    if(/[\r\n]/.test(sessionCookie))fail('BOOK_CREDENTIAL','Use the session cookie value on one line.');
    const old=c.s.bookConnections[0];
    if(old&&old.baseUrl!==url.origin&&c.s.bookJobs.some(j=>j.attempted))fail('BOOK_DESTINATION','This installation already posted to another Pantry. Review and migrate that accounting history before changing the destination.');
    const connection={id:'pantry',version:(old?.version??0)+1,provider:'pantry',baseUrl:url.origin,enabled:true,approvedBy:c.actor.id,createdAt:old?.createdAt??c.now,inventoryAccountId:text(p.inventoryAccountId,'Inventory asset account'),cogsAccountId:text(p.cogsAccountId,'Cost of goods expense account'),revenueAccountId:text(p.revenueAccountId,'Sales income account'),writeOffAccountId:p.writeOffAccountId?text(p.writeOffAccountId,'Damaged stock expense account'):old?.writeOffAccountId??null,taxCode:'exempt',lastSync:old?.lastSync??null};
    if(new Set([connection.inventoryAccountId,connection.cogsAccountId,connection.revenueAccountId]).size!==3)fail('BOOK_ACCOUNTS','Choose separate inventory, cost of goods and sales accounts.');
    c.s.bookConnections=[connection];
    c.channelSecrets=[{channelId:'books:pantry',secret:await seal(env,'books:pantry',{sessionCookie,taxCode:'exempt'})}];
    return connection;
  }
  const connection=c.s.bookConnections[0];
  if(!connection)fail('BOOK_CONNECTION','Connect Pantry before syncing the books.');
  if(type==='book.disconnect'){connection.enabled=false;connection.version++;c.channelSecrets=[{channelId:'books:pantry',secret:await seal(env,'books:pantry',{})}];return connection;}
  if(type==='book.plan'){planBooks(c);return {jobs:c.s.bookJobs.length};}
  if(type==='book.retry'||type==='book.resolve'){
    const job=get(c.s,'bookJobs',p.jobId);fresh(job,p.version);
    if(p.action==='skip'){
      if(job.attempted||job.remoteId||job.status!=='review'||job.sourceKind==='valuation')fail('BOOK_UNCERTAIN','A request that may have reached Pantry cannot be skipped. Check the remote record first.');
      job.status='skipped';job.resolution=text(p.reason,'Decision reason');job.resolvedBy=c.actor.id;
    }else if(job.status==='review'||job.status==='uncertain') {job.status=job.attempted?'uncertain':'pending';job.reason='';}
    job.version++;return job;
  }
  if(type==='book.begin'){
    const job=get(c.s,'bookJobs',p.jobId);job.attempted=true;job.status='uncertain';job.reason='Checking Pantry for the outcome. If the response is lost, Pier will reconcile before sending anything again.';job.version++;return job;
  }
  if(type==='book.record'){
    const job=get(c.s,'bookJobs',p.jobId);
    Object.assign(job,p.result,{version:job.version+1,checkedAt:c.now});
    for(const order of c.s.orders){
      const invoices=c.s.bookJobs.filter(j=>j.sourceKind==='order'&&j.sourceId===order.id&&j.kind==='invoice');
      const returnIds=new Set(c.s.returns.filter(r=>c.s.shipments.some(sh=>sh.id===r.shipmentId&&sh.orderId===order.id)).map(r=>r.id));
      const credits=c.s.bookJobs.filter(j=>j.kind==='credit'&&returnIds.has(j.sourceId));
      if(invoices.length)order.books={invoiceIds:invoices.map(j=>j.remoteId).filter(Boolean),creditIds:credits.map(j=>j.remoteId).filter(Boolean),credited:money(credits.filter(j=>j.status==='posted'||j.status==='reconciled').reduce((n,j)=>n+amount(j.total??'0.00'),0n)),paid:money(invoices.reduce((n,j)=>n+amount(j.paid??'0.00'),0n)),open:invoices.every(j=>j.open!==null&&j.open!==undefined)?money(invoices.reduce((n,j)=>n+amount(j.open),0n)):null,status:invoices.every(j=>j.status==='reconciled')?'reconciled':'open'};
    }
    if(job.sourceKind==='supplierBill'){
      const bill=c.s.supplierBills.find(r=>r.id===job.sourceId);
      if(bill)bill.books={billId:job.remoteId,paid:job.paid,open:job.open,received:job.received,readyToPay:job.readyToPay,status:job.status};
    }
    if(job.sourceKind==='receipt'){
      const receipt=c.s.receipts.find(r=>r.id===job.sourceId);if(receipt)receipt.books={billId:job.remoteId,paid:job.paid,received:job.received,status:job.status};
    }
    if(job.sourceKind==='return'){const returned=c.s.returns.find(r=>r.id===job.sourceId);if(returned){returned.books={...(returned.books??{}),...(job.kind==='credit'?{creditId:job.remoteId,creditStatus:job.status,credited:job.total}:{})};}}
    return job;
  }
  if(type==='book.reconcile'){
    let job=c.s.bookJobs.find(j=>j.key==='inventory-reconciliation');
    if(!job){job={id:crypto.randomUUID(),version:0,key:'inventory-reconciliation',kind:'valuation',sourceKind:'valuation',sourceId:'',reference:'Inventory value reconciliation',currency:'USD',createdAt:c.now,attempted:false};c.s.bookJobs.push(job);}
    const agrees=p.expected!==null&&p.actual!==null&&amount(p.expected)===amount(p.actual);
    Object.assign(job,{version:job.version+1,status:agrees?'reconciled':'review',total:p.expected,actual:p.actual,reason:agrees?'':p.problem??`Pier inventory value is ${p.expected??'unvalued'} USD; Pantry holds ${p.actual??'an unknown amount'} USD. Review missing costs, reversed receipts, returns or other ledger adjustments.`,fix:'Open Reports and the Pantry inventory account, reconcile the difference with your accountant, then sync again.',checkedAt:c.now});
    return job;
  }
  if(type==='book.checked'){connection.lastSync=c.now;connection.problem=p.problem??null;return connection;}
  fail('COMMAND','Unknown books command.');
}
