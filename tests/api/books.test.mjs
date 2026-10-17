import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics, buy, receive } from './harness.mjs';
import { exerciseBooksFixtures } from './books-fixtures.mjs';
import { pantryInstallation } from './pantry-installation.mjs';

test('shipment posts invoice and COGS to real Pantry; receipt evidence, payment readback reconciles without duplicate posts',async()=>{
  const pantry=await pantryInstallation();
  let pier;
  let loseJournalResponse=false;
  try{
    await pantry.command('chart.start',{});
    const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory Asset',type:'asset',subtype:'other'});
    const cogs=await pantry.command('account.save',{code:'5000',name:'Cost of Goods Sold',type:'expense',subtype:'other'});
    const lookups=await pantry.view('state'),revenue=lookups.accounts.find(a=>a.code==='4000');
    const bank=await pantry.command('bank-account.save',{name:'Operating checking',institution:'Synthetic bank',accountId:lookups.accounts.find(a=>a.code==='1000').id,numberLast4:'4242',routing:'',openingDate:'2026-01-01',openingBalance:'0.00'});
    pier=await installation({async outboundService(request){
      assert.equal(new URL(request.url).origin,pantry.origin);
      const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([key])=>!['transfer-encoding','content-length','host','connection'].includes(key))),redirect:'manual',...(request.method==='GET'?{}:{body:await request.arrayBuffer()})});
      if(loseJournalResponse&&request.url.endsWith('/journal.save-draft')){loseJournalResponse=false;await response.text();throw new Error('Synthetic response loss after Pantry saved the journal');}
      return response;
    }});
    const b=await basics(pier),po=await buy(pier,b,'12');
    const receipt=await receive(pier,b,po,'12');
    const connection={baseUrl:pantry.origin,sessionCookie:pantry.cookie,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,taxCode:'exempt'};
    await pier.command('book.connect',connection);
    let state=await pier.state();
    const bill=state.bookJobs.find(j=>j.kind==='bill');assert.equal(bill.status,'posted',JSON.stringify(bill));assert.equal(bill.received,true);
    assert.equal(state.receipts.find(r=>r.id===receipt.id).books.received,true);
    let sales=await pantry.view('sales');assert.equal(sales.bills.length,1);assert.equal(sales.bills[0].open_cents,300);assert.equal(sales.bills[0].documents.length,1);
    const order=await pier.command('order.create',{customerId:b.customer.id,lines:[{itemId:b.item.id,quantity:'4',price:'2'}]});
    loseJournalResponse=true;
    const dispatchId=randomUUID(),dispatchPayload={orderId:order.id,shipmentReference:'SYNTHETIC-BOOKS-1',lines:[{orderLineId:order.lines[0].id,quantity:'4'}]};
    await pier.command('dispatch.create',dispatchPayload,{commandId:dispatchId});
    state=await pier.state();assert.equal(state.bookJobs.find(j=>j.kind==='journal').status,'uncertain');
    await pier.command('dispatch.create',dispatchPayload,{commandId:dispatchId});
    await pier.command('book.sync',{});
    state=await pier.state();assert.equal(state.bookJobs.find(j=>j.kind==='journal').status,'posted');
    sales=await pantry.view('sales');assert.equal(sales.invoices.length,1);assert.equal(sales.invoices[0].total_cents,800);assert.equal(sales.invoices[0].status,'issued');
    const journal=(await pantry.view('journal')).entries.filter(e=>e.memo.startsWith('PIER-COGS-'));
    assert.equal(journal.length,1);assert.equal(journal[0].status,'posted');assert.equal(journal[0].lines.find(l=>l.account_id===cogs.id).debit_cents,100);assert.equal(journal[0].lines.find(l=>l.account_id===inventory.id).credit_cents,100);
    const payment=await pantry.command('payment.record',{direction:'received',contactId:sales.invoices[0].customer_id,date:new Date().toISOString().slice(0,10),amount:'8.00',bankAccountId:bank.id,reference:'SYNTHETIC-INVOICE-PAYMENT',allocations:[{targetId:sales.invoices[0].id,amount:'8.00'}]});
    await pantry.command('payment.record',{direction:'paid',contactId:sales.bills[0].vendor_id,date:new Date().toISOString().slice(0,10),amount:'3.00',bankAccountId:bank.id,reference:'SYNTHETIC-BILL-PAYMENT',allocations:[{targetId:sales.bills[0].id,amount:'3.00'}]});
    await pier.command('book.sync',{});await pier.command('book.sync',{});
    state=await pier.invariant();assert.equal(state.orders.find(o=>o.id===order.id).books.status,'reconciled');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').paid,'8.00');assert.equal(state.bookJobs.find(j=>j.kind==='bill').status,'reconciled');
    await pantry.command('journal.reverse',{id:payment.journal_id,date:new Date().toISOString().slice(0,10),memo:'Synthetic bank payment was reversed'});
    await pier.command('book.sync',{});state=await pier.state();assert.equal(state.orders.find(o=>o.id===order.id).books.status,'open');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').paid,'0.00');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').open,'8.00');
    await pantry.command('payment.record',{direction:'received',contactId:sales.invoices[0].customer_id,date:new Date().toISOString().slice(0,10),amount:'8.00',bankAccountId:bank.id,reference:'SYNTHETIC-REPLACEMENT-PAYMENT',allocations:[{targetId:sales.invoices[0].id,amount:'8.00'}]});
    await pier.command('book.sync',{});state=await pier.state();assert.equal(state.orders.find(o=>o.id===order.id).books.status,'reconciled');
    const tb=await pantry.view('reports/trial-balance');
    assert.equal(tb.balanced,true);assert.equal(tb.rows.find(r=>r.id===inventory.id).net,200);
    assert.equal(state.bookJobs.find(j=>j.key==='inventory-reconciliation').status,'reconciled');
    const exp=await pier.request('/api/pier/books/export.iif');assert.equal(exp.status,200);assert.match(await exp.text(),/Cost of Goods Sold/);
    const exported=await (await pier.request('/api/pier/export')).text();assert.ok(!exported.includes(pantry.cookie),'connection credentials must not enter exports');
    // A receiver refusal belongs to the same queue and offers a useful fix.
    await pier.command('book.connect',{...connection,sessionCookie:'invalid=session'});
    state=await pier.state();assert.ok(state.bookJobs.some(j=>j.status==='review'&&j.reason.includes('Sign')));
    await pier.command('book.connect',connection);await pier.command('book.sync',{});
    state=await pier.state();assert.equal(state.bookJobs.filter(j=>['review','uncertain'].includes(j.status)).length,0);
    sales=await pantry.view('sales');assert.equal(sales.invoices.length,1);assert.equal(sales.bills.length,1);assert.equal((await pantry.view('journal')).entries.filter(e=>e.memo.startsWith('PIER-COGS-')).length,1);
    await exerciseBooksFixtures();
  }finally{await pier?.close();await pantry.close();}
});
