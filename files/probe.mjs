import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {installation,basics}=await import(pathToFileURL(process.cwd()+'/tests/api/harness.mjs'));
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
let outbound=0;
const h=await installation({now:'2026-11-06T12:00:00.000Z',outboundService:async()=>{outbound++;throw Error('Unexpected outbound request');}});
try {
  const b=await basics(h);
  await h.command('sales.taxTable',{state:'CA',rate:'8',reason:'Reviewed native estimate'});
  await h.command('customer.resaleCertificate',{customerId:b.customer.id,version:b.customer.version,state:'CA',number:'synthetic-pier-810',document:'Owner reference',expires:'2027-12-31',reason:'Reviewed resale exemption'});
  const input={customerId:b.customer.id,warehouse:'North',shipTo:{state:'CA',country:'US'},currency:'USD',validUntil:'2026-12-20',lines:[{itemId:b.item.id,quantity:'1',price:'12.34'}]};
  let quote=await h.command('quote.create',input);
  quote=await h.command('quote.approve',{orderId:quote.id,version:quote.version,reason:'Reviewed USD original'});
  quote=await h.command('quote.accept',{orderId:quote.id,version:quote.version});
  const snapshot=async()=>{
    const res=await h.request('/api/pier/export');assert.equal(res.status,200);const e=await res.json(),s=await h.state();
    return Object.fromEntries(['orders','invoices','invoiceCredits','shipments','returns','movements','reservations','salesDocuments','priceLists'].map(k=>[k,e[k]]).concat([['positions',s.positions],['commands',s.commands]]));
  };
  const before=await snapshot();
  const payload={...input,orderId:quote.id,version:quote.version,currency:'CAD',reason:'Owner changes USD to CAD without a rate'};
  const response=await h.request('/api/pier/commands',{method:'POST',body:{commandId:crypto.randomUUID(),type:'quote.revise',payload}});
  const refused=await response.json();assert.equal(response.status,409);assert.equal(refused.ok,false);assert.equal(refused.error.code,'DECIMAL');assert.deepEqual(await snapshot(),before);
  const revised=await h.command('quote.revise',{...payload,usdRate:'0.75'});
  assert.deepEqual([revised.currency,revised.usdRate,revised.usdTotal,revised.quoteApproval,revised.acceptedAt],['CAD','0.75','9.260000000000',null,null]);
  assert.equal(revised.quoteHistory.at(-1).usdRate,'1');assert.equal(outbound,0);
  console.log('PROBE SALES-006 A: POST /api/pier/commands quote.revise USD to CAD with usdRate omitted -> HTTP 409 DECIMAL; business state and successful command results unchanged; explicit 0.75 -> HTTP 200 CAD with USD 9.26, historical USD rate 1 and renewed approval required; outbound=0');
  console.log(JSON.stringify({head,point:'BLOCKING A',status:'pass',missingRate:{http:response.status,error:refused.error.code,unchanged:true},explicitRate:{currency:revised.currency,usdRate:revised.usdRate,usdTotal:revised.usdTotal,approval:revised.quoteApproval,acceptedAt:revised.acceptedAt},outbound}));
} finally {await h.close();}
