import type { Bindings } from '../../auth.server';
import { withReceiptState } from './receipt-state';
import { execute } from '../api';
import { activeAutomationActors, load } from '../storage';
import { credentials } from '../channels/secrets';
import { createPantryAdapter } from './adapters/pantry';
import { pantryClient, PantryRefusal, PANTRY_CREDENTIAL } from './adapters/pantry-client';

const BROKEN='Pantry no longer accepts Pier\'s credential: it was revoked or replaced in Pantry. Nothing more is sent until you reconnect. In Pantry open People & settings → Integration credentials, create a new credential for Pier, then choose Reconnect Pantry here and paste it.';
// No readable credential is held: a restored backup never carries one, and nothing was revoked.
const MISSING='Pier holds no Pantry credential. A restored backup never carries one, so this is expected after a restore. In Pantry open People & settings → Integration credentials, create a new credential for Pier, then choose Reconnect Pantry here and paste it.';
import type { BookDocument } from './adapters/types';
import { valuationLedger } from '../valuation-ledger';
import { amount, money } from '../money';

// A sync after a command runs under waitUntil, which Cloudflare ends about 30 s
// after the response. Work stops well inside that, and the lease outlives the
// work only briefly, so a cut-off run never blocks the next sync for long.
const BUDGET=20000,LEASE=60000;
/** Serialize dispatch, persist intent before sending, and never repeat an unknown create. */
export async function syncBooks(env:Bindings){
  const token=crypto.randomUUID(),start=Date.now();
  const lease=await env.DB.prepare('INSERT INTO pier_book_locks(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?').bind(token,start+LEASE,start).run();
  if(!lease.meta.changes)return {busy:true};
  let processed=0, connectionProblem:string|null=null;
  try{
    const initial=await load(env.DB),connection=initial.bookConnections.find(r=>r.enabled);
    if(!connection||(await activeAutomationActors(env.DB))[connection.approvedBy]!=='owner')return {processed};
    const op=await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(connection.approvedBy).first<any>();
    const actor={id:connection.approvedBy,role:'owner',name:op.display_name,operatorVersion:op.version,sessionId:'books-policy'};
    const policy={collection:'bookConnections' as const,id:connection.id,version:connection.version};
    const record=(type:string,payload:object)=>execute(env,actor,`book-${crypto.randomUUID()}`,type,payload,undefined,policy);
    await record('book.plan',{});
    let secret:Record<string,string>;
    try {
      secret=await credentials(env,'books:pantry');
      if(!PANTRY_CREDENTIAL.test(secret.integrationToken??''))throw new Error('Reconnect Pantry');
    } catch {
      await record('book.reconcile',{actual:null,expected:null,problem:'Reconnect Pantry with a Pantry integration credential. Restored backups never carry connection credentials.'});
      await record('book.checked',{problem:MISSING});
      return {processed};
    }
    const remote=createPantryAdapter({baseUrl:connection.baseUrl,credentials:secret});
    const jobs=(await load(env.DB)).bookJobs.filter(j=>j.status!=='skipped'&&j.document);
    for(const snapshot of jobs){
      if(Date.now()-start>BUDGET)break;
      const state=await load(env.DB),current=state.bookConnections.find(c=>c.id===connection.id),job=state.bookJobs.find(j=>j.id===snapshot.id)!;
      if(!current?.enabled||current.version!==connection.version)break;
      // Re-read payments even after settlement: reversal reopens the source order/bill.
      if(['posted','reconciled'].includes(job.status)&&!['invoice','bill'].includes(job.kind))continue;
      let doc={...job.document,...(job.remoteId?{remoteId:job.remoteId}:{})} as BookDocument;
      if(job.sourceKind==='supplierBill')doc=withReceiptState(state,job.sourceId,doc);
      let creating=false;
      try{
        let result=await remote.read(doc);
        // The owner's Check Pantry re-sends a request Pantry has no record of, under
        // its original idempotency keys, so a request that did arrive is never doubled.
        if(!result&&job.attempted&&!job.resend){
          await record('book.record',{jobId:job.id,result:{status:'uncertain',reason:'Pantry has not returned a matching record for a request already sent. Choose Check Pantry: Pier looks again and, if Pantry still has no record, re-sends the same request, which Pantry recognises if it already arrived.',fix:'Choose Check Pantry. Pier re-sends with the original request keys and never creates a second document.'}});continue;
        }
        if(!result||['draft','approved'].includes(result.status)||(job.kind==='bill'&&!(result.evidenceCurrent??result.received))){
          // A known remote ID resumes state transitions, never creates another financial document.
          if(result)doc.remoteId=result.id;
          await record('book.begin',{jobId:job.id});creating=true;
          result=await remote.post(doc);
        }
        const posted=['issued','posted','attached'].includes(result.status);
        const settled=['invoice','bill'].includes(job.kind)&&(result.open!==undefined?amount(result.open)===0n:result.paid!==undefined&&amount(result.paid)===amount(doc.total));
        await record('book.record',{jobId:job.id,result:{remoteId:result.id,status:settled?'reconciled':posted?'posted':'review',paid:result.paid??null,open:result.open??null,received:result.received??false,readyToPay:result.readyToPay??false,reason:posted?'':'Pantry has not posted this document. Review its current approval state.',fix:'Open the matching record in Pantry, resolve its review, then check again.'}});processed++;
      }catch(error){
        if(error instanceof PantryRefusal&&error.status===401)connectionProblem=BROKEN;
        if(error instanceof PantryRefusal&&error.status===403)connectionProblem=`Pantry refused part of Pier's work: ${error.message}. In Pantry, create a new integration credential for Pier with every permission listed in Books settings, then reconnect here.`;
        const refused=error instanceof PantryRefusal&&error.status>=400&&error.status<500;
        await record('book.record',{jobId:job.id,result:{status:refused||(!creating&&!job.attempted)?'review':'uncertain',...(refused&&error.safeCreationRefusal&&creating&&!doc.remoteId&&!job.attempted?{attempted:false}:{}),reason:refused?error.message:'Pantry did not confirm the request. The connection may have stopped after it saved. Pier will check for the source reference before any further write.',fix:refused?'Resolve this in Pantry or reconnect with a new integration credential, then retry.':'Check Pantry for the source reference, then check again. An uncertain create will never be repeated automatically.'}});
      }
      // A revoked or under-permitted credential refuses every job alike; stop rather than mark each one.
      if(connectionProblem)break;
    }
    const state=await load(env.DB),ledger=valuationLedger(state,new Date().toISOString());
    const layers=ledger.positions.flatMap(p=>p.layers).filter(l=>l.quantity>0n);
    const expected=layers.some(l=>l.value===null)?null:money(layers.reduce((n,l)=>n+l.value!,0n));
    try {
      const tb=await pantryClient({baseUrl:connection.baseUrl,credentials:await credentials(env,'books:pantry')}).request('reports/trial-balance');
      const actual=money(BigInt(tb.rows.find((r:any)=>r.id===connection.inventoryAccountId)?.net??0)*10000000000n);
      await record('book.reconcile',{actual,expected});
    } catch (error) { connectionProblem??=error instanceof PantryRefusal&&error.status===401?BROKEN:`Pier could not reach Pantry at ${connection.baseUrl}. Check that Pantry is running at that address, then choose Sync now.`; await record('book.reconcile',{actual:null,expected,problem:'Pantry inventory value could not be checked. Restore the connection, then sync again.'}); }
    await record('book.checked',{problem:connectionProblem});return {processed};
  }finally{await env.DB.prepare('DELETE FROM pier_book_locks WHERE id=1 AND token=?').bind(token).run();}
}
