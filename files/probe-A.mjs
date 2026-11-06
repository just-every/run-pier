import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics } from '/workspace/run-pier/tests/api/harness.mjs';
const h=await installation({now:'2026-11-06T12:00:00.000Z'});
try {
 const b=await basics(h);
 await h.command('sales.taxTable',{state:'CA',rate:'0',reason:'Owner reviewed native estimate'});
 const input={customerId:b.customer.id,warehouse:'North',shipTo:{state:'CA',country:'US'},currency:'USD',validUntil:'2026-12-20',lines:[{itemId:b.item.id,quantity:'1',price:'12.34'}]};
 let q=await h.command('quote.create',input);
 q=await h.command('quote.approve',{orderId:q.id,version:q.version,reason:'Reviewed original USD terms'});
 q=await h.command('quote.accept',{orderId:q.id,version:q.version});
 const snapshot=async()=>{const r=await h.request('/api/pier/export');assert.equal(r.status,200);const e=await r.json(),s=await h.state();return Object.fromEntries(['orders','invoices','invoiceCredits','shipments','returns','movements','reservations','salesDocuments','priceLists'].map(k=>[k,e[k]]).concat([['positions',s.positions],['commands',s.commands]]));};
 const before=await snapshot();
 const payload={...input,currency:'CAD',orderId:q.id,version:q.version,reason:'Owner revises USD quote to CAD'};
 const r=await h.request('/api/pier/commands',{method:'POST',body:{commandId:randomUUID(),type:'quote.revise',payload}});
 const body=await r.json();
 assert.equal(body.ok,false);assert.equal(body.error.code,'DECIMAL');assert.deepEqual(await snapshot(),before);
 console.log(JSON.stringify({finding:'A',door:'POST /api/pier/commands',command:'quote.revise',input:'USD accepted quote to CAD, usdRate omitted',status:r.status,error:body.error.code,businessEffectsUnchanged:true}));
 q=await h.command('quote.revise',{...payload,usdRate:'0.75'});
 assert.equal(q.currency,'CAD');assert.equal(q.usdRate,'0.75');assert.equal(q.usdTotal,'9.260000000000');assert.equal(q.quoteApproval,null);assert.equal(q.acceptedAt,null);
 const next={...input,currency:'CAD',orderId:q.id,version:q.version,reason:'Owner revises quantity using retained CAD rate'};
 q=await h.command('quote.revise',next);
 assert.equal(q.usdRate,'0.75');
 console.log(JSON.stringify({finding:'A',door:'POST /api/pier/commands',command:'quote.revise',explicitRate:'0.75',currency:q.currency,usdTotal:q.usdTotal,priorApprovalCleared:true,sameCurrencyRetainsRate:true}));
} finally { await h.close(); }
