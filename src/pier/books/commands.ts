import { decimal, format, movementFrontier, fail, fresh, get, requireRole, text, type Context } from '../model';
import type { Bindings } from '../../auth.server';
import { seal } from '../channels/secrets';
import { PANTRY_CREDENTIAL } from './adapters/pantry-client';
import { pantryOrigin } from './pantry-accounts';
import { planBooks } from './planning';
import { amount, money, toCents, usdText } from '../money';
export async function books(c:Context,type:string,p:any,env:Bindings):Promise<any> {
  if(!type.startsWith('book.'))return;
  requireRole(c,['owner']);
  if(type==='book.connect'){
    const origin=pantryOrigin(p.baseUrl,env);
    if(p.taxCode!=='exempt')fail('BOOK_TAX','Explicitly confirm tax-exempt wholesale invoices. Taxable sales need reviewed tax mapping before this connector can post them.');
    const integrationToken=String(p.integrationToken??'').trim();
    const keep=!integrationToken&&c.s.bookConnections[0]?.enabled&&c.s.bookConnections[0].baseUrl===origin;
    if(!keep&&!PANTRY_CREDENTIAL.test(integrationToken))fail('BOOK_CREDENTIAL','Paste the Pantry integration credential (it starts with pantry_integration_).');
    const url={origin};
    const old=c.s.bookConnections[0];
    if(old&&old.baseUrl!==url.origin&&c.s.bookJobs.some(j=>j.attempted))fail('BOOK_DESTINATION','This installation already posted to another Pantry. Review and migrate that accounting history before changing the destination.');
    const reasons = structuredClone(old?.writeOffReasons ?? []);
    if (p.writeOffAccountId) {
      const code = text(p.writeOffReasonCode || 'damaged', 'Write-off reason code');
      const accountId = text(p.writeOffAccountId, 'Reason-mapped expense account');
      if ([p.inventoryAccountId,p.cogsAccountId,p.revenueAccountId].includes(accountId)) fail('BOOK_ACCOUNTS', 'Choose a separate damage expense account for the reason code.');
      const approvalLimit = format(decimal(p.writeOffApprovalLimit ?? '0'));
      const index = reasons.findIndex((r: any) => r.code === code);
      const reason = { code, accountId, approvalLimit, approvedBy: c.actor.id, approvedAt: c.now };
      if (index < 0) reasons.push(reason); else reasons[index] = reason;
    }
    const connection={writeOffReasons:reasons,id:'pantry',version:(old?.version??0)+1,provider:'pantry',baseUrl:url.origin,enabled:true,problem:null,approvedBy:c.actor.id,createdAt:old?.createdAt??c.now,inventoryAccountId:text(p.inventoryAccountId,'Inventory asset account'),cogsAccountId:text(p.cogsAccountId,'Cost of goods expense account'),revenueAccountId:text(p.revenueAccountId,'Sales income account'),writeOffAccountId:p.writeOffAccountId?text(p.writeOffAccountId,'Damaged stock expense account'):old?.writeOffAccountId??null,landedCostAccountId:p.landedCostAccountId?text(p.landedCostAccountId,'Freight and duty account'):old?.landedCostAccountId??null,purchaseTaxAccountId:p.purchaseTaxAccountId?text(p.purchaseTaxAccountId,'Purchase tax account'):old?.purchaseTaxAccountId??null,stripeBankAccountId:p.stripeBankAccountId?text(p.stripeBankAccountId,'Stripe payment account'):old?.stripeBankAccountId??null,taxCode:'exempt',lastSync:old?.lastSync??null};
    if(new Set([connection.inventoryAccountId,connection.cogsAccountId,connection.revenueAccountId]).size!==3)fail('BOOK_ACCOUNTS','Choose separate inventory, cost of goods and sales accounts.');
    if(connection.landedCostAccountId===connection.inventoryAccountId)fail('BOOK_ACCOUNTS','Choose a freight and duty account other than inventory.');
    if(connection.purchaseTaxAccountId&&[connection.inventoryAccountId,connection.cogsAccountId,connection.revenueAccountId].includes(connection.purchaseTaxAccountId))fail('BOOK_ACCOUNTS','Choose a purchase tax account other than inventory, cost of goods or sales.');
    c.s.bookConnections=[connection];
    if(!keep)c.channelSecrets=[{channelId:'books:pantry',secret:await seal(env,'books:pantry',{integrationToken,taxCode:'exempt'})}];
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
    }else if(job.status==='review'||job.status==='uncertain') {job.status=job.attempted?'uncertain':'pending';job.reason='';job.resend=job.attempted;}
    job.version++;return job;
  }
  if(type==='book.begin'){
    const job=get(c.s,'bookJobs',p.jobId);job.attempted=true;job.resend=false;job.status='uncertain';job.reason='Checking Pantry for the outcome. If the response is lost, Pier will reconcile before sending anything again.';job.version++;return job;
  }
  if(type==='book.record'){
    const job=get(c.s,'bookJobs',p.jobId);
    Object.assign(job,p.result,{resend:false,version:job.version+1,checkedAt:c.now});
    for(const order of c.s.orders){
      const invoices=c.s.bookJobs.filter(j=>j.sourceKind==='order'&&j.sourceId===order.id&&j.kind==='invoice');
      const returnIds=new Set(c.s.returns.filter(r=>c.s.shipments.some(sh=>sh.id===r.shipmentId&&sh.orderId===order.id)).map(r=>r.id));
      const creditIds=new Set(c.s.customerCredits.filter(cr=>cr.orderId===order.id).map(cr=>cr.id));
      const credits=c.s.bookJobs.filter(j=>j.kind==='credit'&&(returnIds.has(j.sourceId)||creditIds.has(j.sourceId)));
      if(invoices.length)order.books={invoiceIds:invoices.map(j=>j.remoteId).filter(Boolean),creditIds:credits.map(j=>j.remoteId).filter(Boolean),credited:money(credits.filter(j=>j.status==='posted'||j.status==='reconciled').reduce((n,j)=>n+amount(j.total??'0.00'),0n)),paid:money(invoices.reduce((n,j)=>n+amount(j.paid??'0.00'),0n)),open:invoices.every(j=>j.open!==null&&j.open!==undefined)?money(invoices.reduce((n,j)=>n+amount(j.open),0n)):null,status:invoices.every(j=>j.status==='reconciled')?'reconciled':'open'};
    }
    if(job.sourceKind==='supplierCredit'){
      for(const returned of c.s.supplierReturns){
        const resolution=returned.resolutions.find((r:any)=>r.id===job.sourceId);
        if(resolution)Object.assign(resolution,{posting:job.status,books:{creditId:job.remoteId,status:job.status,allocated:job.allocated,unallocated:job.unallocated,checkedAt:c.now}});
      }
    }
    if(job.sourceKind==='customerCredit'){
      const credit=c.s.customerCredits.find(r=>r.id===job.sourceId);
      if(credit){
        Object.assign(credit,{posting:job.status,books:{creditId:job.remoteId,status:job.status,checkedAt:c.now}});
        const drop=c.s.dropships.find(r=>r.id===credit.dropshipId);
        const retained=drop?.credits.find((r:any)=>r.id===credit.id);
        if(retained)Object.assign(retained,credit);
      }
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
    const current=p.movementSequence===movementFrontier(c.s);
    const agrees=current&&p.expected!==null&&p.actual!==null&&amount(p.expected)===amount(p.actual);
    Object.assign(job,{version:job.version+1,status:agrees?'reconciled':'review',movementSequence:p.movementSequence,connectionVersion:connection.version,through:p.through??null,total:p.expected,actual:p.actual,reason:agrees?'':!current?'Stock moved while Pantry inventory value was being checked. Sync again to compare the current movement history.':p.problem??`Pier inventory value is ${p.expected===null?'unvalued':usdText(money(toCents(amount(p.expected))))}; Pantry through ${p.through??'the comparison date'} holds ${p.actual===null?'an unknown amount':usdText(money(toCents(amount(p.actual))))}. Review missing costs, reversed receipts, returns or other ledger adjustments.`,fix:'Open Reports and the Pantry inventory account, reconcile the difference with your accountant, then sync again.',checkedAt:c.now});
    return job;
  }
  if(type==='book.checked'){connection.lastSync=c.now;connection.problem=p.problem??null;return connection;}
  fail('COMMAND','Unknown books command.');
}
