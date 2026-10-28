import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Match receipts, land costs, post and reconcile real Pantry payables and paid sales", async () => {

  // books: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy, receive } = await import("./harness.mjs");

    const { pantryInstallation } = await import("./pantry-installation.mjs");


    await phase('Pantry connects with a scoped credential and picked accounts; a matched invoice posts a ready payable, replays never duplicate, and revocation shows a broken connection',async()=>{
      const pantry=await pantryInstallation();
      let pier;
      let loseJournalResponse=false, echoFailure=false, providerRequests=0;
      try{
        await pantry.command('chart.start',{});
        const inventory=await pantry.command('account.save',{code:'1300',name:'Inventory Asset',type:'asset',subtype:'other'});
        const cogs=await pantry.command('account.save',{code:'5000',name:'Cost of Goods Sold',type:'expense',subtype:'other'});
        const lookups=await pantry.view('state'),revenue=lookups.accounts.find(a=>a.code==='4000');
        const bank=await pantry.command('bank-account.save',{name:'Operating checking',institution:'Synthetic bank',accountId:lookups.accounts.find(a=>a.code==='1000').id,numberLast4:'4242',routing:'',openingDate:'2026-01-01',openingBalance:'0.00'});
        const edge={now:'2026-10-27T12:00:00.000Z',async outboundService(request){
          assert.equal(new URL(request.url).origin,pantry.origin);
          if(echoFailure)return Response.json({error:request.headers.get('authorization')+' synthetic-pier-private-response'},{status:400});
          const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([key])=>!['transfer-encoding','content-length','host','connection'].includes(key))),redirect:'manual',...(request.method==='GET'?{}:{body:await request.arrayBuffer()})});
          if(loseJournalResponse&&request.method==='POST'&&request.url.endsWith('/integration/v1/journals')){loseJournalResponse=false;await response.text();throw new Error('Synthetic response loss after Pantry saved the journal');}
          return response;
        }};
        pier=await installation(edge);
        const b=await basics(pier);
        await pier.command('supplierItem.save',{supplierId:b.supplier.id,itemId:b.item.id,code:'synthetic-pier-closure-1',packSize:'1',minimum:'1',price:'0.25',leadDays:6});
        await pier.command('replenishment.save',{version:0,itemId:b.item.id,warehouse:'North',supplierId:b.supplier.id,method:'fixed',safetyStock:'0',reorderPoint:'0',reorderQuantity:'12',windowDays:30,reviewDays:10});
        const planned=await pier.command('replenishment.plan',{lines:[{itemId:b.item.id,warehouse:'North',quantity:'12'}]});
        let po=planned.drafts[0];
        po=await pier.command('po.revise',{poId:po.id,version:po.version,supplierId:po.supplierId,destinationWarehouse:po.destinationWarehouse,promiseDate:'2026-10-26',reason:'Buyer reviewed overdue requested delivery',lines:po.lines.map(line=>({itemId:line.itemId,quantity:line.quantity,price:line.price}))});
        await pier.command('po.approve',{poId:po.id,version:po.version});
        po=await pier.command('po.commit',{poId:po.id,version:po.version});
        const ownerId=(await pier.state()).actor.id;
        await pier.command('exception.policy',{version:0,enabled:true,assigneeId:ownerId,escalationOwnerId:ownerId,dueHours:1});
        edge.now='2026-10-27T12:05:00.000Z';
        await pier.command('exception.check',{});
        let cases=(await pier.state()).operationalExceptions;
        assert.deepEqual(cases.map(r=>[r.kind,r.sourceId,r.status]),[['overdue-po-confirmation',po.id,'open']]);
        const poCaseId=cases[0].id;
        await pier.command('exception.resolve',{exceptionId:poCaseId,version:cases[0].version},{error:'EXCEPTION_EVIDENCE'});
        const receipt=await receive(pier,b,po,'11');
        assert.equal((await pier.state()).operationalExceptions.find(r=>r.id===poCaseId).status,'open','partial receipt cannot close overdue confirmation');
        const ALL=['contacts:write','invoices:write','bills:write','journals:write','documents:write','payments:read','reports:read','post'];
        const narrow=await pantry.command('integration.create',{name:'Pier, bills only',scopes:['bills:write']});
        const refused=await pier.command('book.accounts',{baseUrl:pantry.origin,integrationToken:narrow.token},{error:'BOOK_SCOPES'});
        assert.match(refused.error.message,/Contacts.*Payments readback/);
        let credential=await pantry.command('integration.create',{name:'Pier',scopes:ALL});
        const chart=await pier.command('book.accounts',{baseUrl:pantry.origin+'/',integrationToken:credential.token});
        assert.equal(chart.baseUrl,pantry.origin);
        for(const account of [inventory,cogs,revenue])assert.ok(chart.accounts.some(a=>a.id===account.id&&a.name===account.name),'the owner picks accounts from the list Pantry returns');
        const connection={baseUrl:pantry.origin,integrationToken:credential.token,inventoryAccountId:inventory.id,cogsAccountId:cogs.id,revenueAccountId:revenue.id,taxCode:'exempt'};
        await pier.command('book.connect',connection);
        let state=await pier.state();
        assert.equal(state.bookJobs.filter(j=>j.kind==='bill').length,0,'a goods receipt alone must not invent a supplier invoice');
        assert.equal(state.receiptClosures.find(r=>r.id===receipt.id).status,'invoice');
        let follow=(await pier.command('replenishment.review',{poId:po.id})).followThrough;
        assert.equal(follow.status,'open');assert.equal(follow.remaining,'1');assert.equal(follow.actualLandedCost,'2.750000000000');
        assert.equal(follow.lines[0].forecast.expected,'0');
        assert.deepEqual(state.receiptClosures.find(r=>r.id===receipt.id).unbilled,[{itemId:b.item.id,quantity:'11'}]);
        let supplierBill=await pier.command('supplierBill.save',{poId:po.id,reference:'METALS-7731',date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'0',priceTolerancePercent:'0',lines:[{poLineId:po.lines[0].id,quantity:'12',unitPrice:'0.30'}]});
        assert.equal(supplierBill.match.withinTolerance,false);
        assert.ok(supplierBill.match.differences.some(d=>d.kind==='receiptShortfall'));
        assert.ok(supplierBill.match.differences.some(d=>d.kind==='purchasePrice'));
        assert.ok(supplierBill.match.differences.some(d=>d.kind==='receiptPrice'));
        await pier.command('supplierBill.approve',{id:supplierBill.id,version:supplierBill.version,receiptEvidence:supplierBill.match.receiptEvidence},{error:'SUPPLIER_BILL_MATCH'});
        supplierBill=await pier.command('supplierBill.hold',{id:supplierBill.id,version:supplierBill.version,reason:'Supplier charged the wrong price and final carton is missing'});
        assert.equal(supplierBill.status,'held');assert.equal((await pantry.view('sales')).bills.length,0);
        supplierBill=await pier.command('supplierBill.save',{id:supplierBill.id,version:supplierBill.version,poId:po.id,reference:'METALS-7731',date:new Date().toISOString().slice(0,10),quantityTolerancePercent:'10',priceTolerancePercent:'0',lines:[{poLineId:po.lines[0].id,quantity:'12',unitPrice:'0.25'}]});
        await pier.command('supplierBill.approve',{id:supplierBill.id,version:supplierBill.version,receiptEvidence:'stale evidence'},{error:'SUPPLIER_BILL_STALE'});
        await pier.command('supplierBill.approve',{id:supplierBill.id,version:supplierBill.version,receiptEvidence:supplierBill.match.receiptEvidence});
        state=await pier.state();
        let bill=state.bookJobs.find(j=>j.kind==='bill');assert.equal(bill.status,'posted',JSON.stringify(bill));assert.equal(bill.received,false);assert.equal(bill.readyToPay,false);
        assert.equal(state.receiptClosures.find(r=>r.id===receipt.id).status,'receiving');
        const remoteBillId=bill.remoteId;
        await receive(pier,b,po,'1');
        state=await pier.state();bill=state.bookJobs.find(j=>j.kind==='bill');assert.equal(bill.received,true);assert.equal(bill.readyToPay,true);assert.equal(bill.remoteId,remoteBillId);
        assert.equal(state.supplierBills.find(r=>r.id===supplierBill.id).books.received,true);
        assert.equal(state.supplierBills.find(r=>r.id===supplierBill.id).books.readyToPay,true);
        assert.ok(state.receiptClosures.every(r=>r.status==='payment'&&r.unbilled.length===0));
        let sales=await pantry.view('sales');assert.equal(sales.bills.length,1);assert.equal(sales.bills[0].open_cents,300);
        assert.deepEqual([sales.bills[0].received,sales.bills[0].ready_to_pay],[1,1],'Pantry records receipt and payment readiness natively');
        const receiptStates=sales.bills[0].documents.filter(d=>d.name.includes('-receipt-state-'));
        assert.equal(receiptStates.length,2,'the final receipt updates linked evidence on the existing payable');
        const confirmed=await Promise.all(receiptStates.map(async d=>JSON.parse(await (await fetch(pantry.origin+'/api/pantry/integration/v1/documents/'+d.id,{headers:{authorization:`Bearer ${credential.token}`}})).text())));
        assert.ok(confirmed.some(d=>d.received===true&&d.readyToPay===true));
        const order=await pier.command('order.create',{customerId:b.customer.id,promiseDate:'2026-10-25',lines:[{itemId:b.item.id,quantity:'4',price:'2'}]});
        await pier.command('exception.check',{});
        cases=(await pier.state()).operationalExceptions;
        assert.deepEqual(cases.map(r=>r.kind).sort(),['late-customer-delivery','overdue-po-confirmation']);
        const orderCaseId=cases.find(r=>r.sourceId===order.id).id;
        loseJournalResponse=true;
        const dispatchId=randomUUID(),dispatchPayload={orderId:order.id,shipmentReference:'SYNTHETIC-BOOKS-1',lines:[{orderLineId:order.lines[0].id,quantity:'4'}]};
        await pier.command('dispatch.create',dispatchPayload,{commandId:dispatchId});
        state=await pier.state();assert.equal(state.bookJobs.find(j=>j.kind==='journal').status,'uncertain');assert.equal(state.operationalExceptions.find(r=>r.id===orderCaseId).status,'open','uncertain ledger work cannot close a delivery case');
        let health = await (await pier.request('/api/pier/integrations')).json();
        assert.equal(health.connectors.find(row => row.id === 'pantry').uncertain, 1);
        await pier.restart();
        health = await (await pier.request('/api/pier/integrations')).json();
        assert.equal(health.connectors.find(row => row.id === 'pantry').uncertain, 1);
        await pier.command('dispatch.create',dispatchPayload,{commandId:dispatchId});
        await pier.command('book.sync',{});
        state=await pier.state();assert.equal(state.bookJobs.find(j=>j.kind==='journal').status,'posted');
        health = await (await pier.request('/api/pier/integrations')).json();
        const books = health.connectors.find(row => row.id === 'pantry');
        assert.equal(books.uncertain, 0);
        assert.ok(books.lastSuccessfulSync);
        assert.ok(books.effects.some(row => row.mapping.includes(state.bookJobs.find(job => job.kind === 'journal').remoteId)));
        assert.ok(!JSON.stringify(health).includes(credential.token));
        sales=await pantry.view('sales');assert.equal(sales.invoices.length,1);assert.equal(sales.invoices[0].total_cents,800);assert.equal(sales.invoices[0].status,'issued');
        const journal=(await pantry.view('journal')).entries.filter(e=>e.memo.startsWith('PIER-COGS-'));
        assert.equal(journal.length,1);assert.equal(journal[0].status,'posted');assert.equal(journal[0].lines.find(l=>l.account_id===cogs.id).debit_cents,100);assert.equal(journal[0].lines.find(l=>l.account_id===inventory.id).credit_cents,100);
        const payment=await pantry.command('payment.record',{direction:'received',contactId:sales.invoices[0].customer_id,date:new Date().toISOString().slice(0,10),amount:'8.00',bankAccountId:bank.id,reference:'SYNTHETIC-INVOICE-PAYMENT',allocations:[{targetId:sales.invoices[0].id,amount:'8.00'}]});
        const supplierPayment=await pantry.command('payment.record',{direction:'paid',contactId:sales.bills[0].vendor_id,date:new Date().toISOString().slice(0,10),amount:'3.00',bankAccountId:bank.id,reference:'SYNTHETIC-BILL-PAYMENT',allocations:[{targetId:sales.bills[0].id,amount:'3.00'}]});
        await pier.command('book.sync',{});await pier.command('book.sync',{});
        state=await pier.invariant();assert.equal(state.supplierBills.find(b=>b.id===supplierBill.id).status,'paid');assert.equal(state.supplierBills.find(b=>b.id===supplierBill.id).books.open,'0.00');assert.equal(state.orders.find(o=>o.id===order.id).books.status,'reconciled');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').paid,'8.00');assert.equal(state.bookJobs.find(j=>j.kind==='bill').status,'reconciled');assert.equal(state.bookJobs.find(j=>j.kind==='bill').readyToPay,false);
        assert.ok(state.receiptClosures.every(r=>r.status==='closed'));
        assert.deepEqual(state.operationalExceptions.map(r=>[r.kind,r.status]).sort(),[['late-customer-delivery','closed'],['overdue-po-confirmation','closed']]);
        assert.deepEqual(state.operationalExceptions.find(r=>r.id===poCaseId).closure.receiptIds.sort(),state.receipts.map(r=>r.id).sort());
        assert.equal(state.operationalExceptions.find(r=>r.id===orderCaseId).closure.shipmentIds.length,1);
        await pantry.command('journal.reverse',{id:supplierPayment.journal_id,date:new Date().toISOString().slice(0,10),memo:'Supplier payment returned by bank'});
        await pier.command('book.sync',{});state=await pier.state();
        assert.ok(state.receiptClosures.every(r=>r.status==='payment'),'supplier payment reversal reopens each affected receipt: '+JSON.stringify({closures:state.receiptClosures,jobs:state.bookJobs.filter(j=>j.kind==='bill').map(({status,received,readyToPay,paid,open,reason})=>({status,received,readyToPay,paid,open,reason}))}));
        assert.equal(state.supplierBills.find(b=>b.id===supplierBill.id).books.open,'3.00');assert.equal(state.operationalExceptions.find(r=>r.id===poCaseId).status,'open','payment reversal reopens the purchase case');
        assert.equal((await pier.command('replenishment.review',{poId:po.id})).followThrough.status,'open','a reversed payment reopens the forecast follow-through');
        await pantry.command('payment.record',{direction:'paid',contactId:sales.bills[0].vendor_id,date:new Date().toISOString().slice(0,10),amount:'3.00',bankAccountId:bank.id,reference:'SYNTHETIC-REPLACEMENT-BILL-PAYMENT',allocations:[{targetId:sales.bills[0].id,amount:'3.00'}]});
        await pier.command('book.sync',{});state=await pier.state();assert.ok(state.receiptClosures.every(r=>r.status==='closed'));
        await pantry.command('journal.reverse',{id:payment.journal_id,date:new Date().toISOString().slice(0,10),memo:'Synthetic bank payment was reversed'});
        await pier.command('book.sync',{});state=await pier.state();assert.equal(state.orders.find(o=>o.id===order.id).books.status,'open');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').paid,'0.00');assert.equal(state.bookJobs.find(j=>j.kind==='invoice').open,'8.00');assert.equal(state.operationalExceptions.find(r=>r.id===orderCaseId).status,'open','customer payment reversal reopens the delivery case');
        await pantry.command('payment.record',{direction:'received',contactId:sales.invoices[0].customer_id,date:new Date().toISOString().slice(0,10),amount:'8.00',bankAccountId:bank.id,reference:'SYNTHETIC-REPLACEMENT-PAYMENT',allocations:[{targetId:sales.invoices[0].id,amount:'8.00'}]});
        await pier.command('book.sync',{});state=await pier.state();assert.equal(state.orders.find(o=>o.id===order.id).books.status,'reconciled');
        const tb=await pantry.view('reports/trial-balance');
        assert.equal(tb.balanced,true);assert.equal(tb.rows.find(r=>r.id===inventory.id).net,200);
        assert.equal(state.bookJobs.find(j=>j.key==='inventory-reconciliation').status,'reconciled');
        follow=(await pier.command('replenishment.review',{poId:po.id})).followThrough;
        assert.equal(follow.status,'closed');assert.equal(follow.remaining,'0');
        assert.deepEqual([follow.expectedLandedCost,follow.actualLandedCost,follow.landedCostDifference],['3.000000000000','3.000000000000','0.000000000000']);
        assert.deepEqual([follow.lines[0].predicted,follow.lines[0].actual,follow.lines[0].difference,follow.lines[0].received],['0','4','4','12']);
        assert.equal(follow.receiptClosures.length,2);assert.ok(follow.receiptClosures.every(r=>r.status==='closed'));
        assert.equal(follow.inventoryReconciliation.status,'reconciled');
        const exp=await pier.request('/api/pier/books/export.iif');assert.equal(exp.status,200);assert.match(await exp.text(),/Cost of Goods Sold/);
        const exported=await (await pier.request('/api/pier/export')).text();assert.ok(!exported.includes(credential.token),'connection credentials must not enter exports');
        // Revoking the credential in Pantry stops Pier with a plain broken connection, not a queue of errors.
        const lastSuccessfulSync=(await (await pier.request('/api/pier/integrations')).json()).connectors.find(row => row.id === 'pantry').lastSuccessfulSync;
        await pantry.command('integration.revoke',{id:credential.id});
        await pier.command('book.sync',{});
        state=await pier.state();assert.match(state.bookConnections[0].problem,/revoked or replaced in Pantry.*Reconnect Pantry/);
        assert.equal((await (await pier.request('/api/pier/integrations')).json()).connectors.find(row => row.id === 'pantry').lastSuccessfulSync,lastSuccessfulSync);
        assert.ok(state.receiptClosures.every(r=>r.status==='connection'),'revoked credentials cannot claim current receipt closure');
        assert.ok(state.operationalExceptions.every(r=>r.status==='open'),'lost current Pantry authority reopens both operational cases');
        assert.equal((await pier.command('replenishment.review',{poId:po.id})).followThrough.status,'open','a revoked ledger connection cannot retain forecast closure');
        assert.equal(state.bookJobs.filter(j=>j.status==='review'&&j.kind!=='valuation').length,1,'one refused check, not every job');
        credential=await pantry.command('integration.create',{name:'Pier replacement',scopes:ALL});
        await pier.command('book.connect',{...connection,integrationToken:credential.token});await pier.command('book.sync',{});
        assert.equal((await pier.state()).bookConnections[0].problem,null);
        state=await pier.state();assert.equal(state.bookJobs.filter(j=>['review','uncertain'].includes(j.status)).length,0);
        sales=await pantry.view('sales');assert.equal(sales.invoices.length,1);assert.equal(sales.bills.length,1);assert.equal((await pantry.view('journal')).entries.filter(e=>e.memo.startsWith('PIER-COGS-')).length,1);
        const entered=await fetch(pier.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':pier.devKey}});
        const secondOwnerCookie=entered.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
        const secondOwner=(await(await pier.request('/auth/session',{as:secondOwnerCookie})).json()).operator.id;
        await pier.command('role.set',{operatorId:secondOwner,role:'owner'});
        let casePolicy=(await pier.state()).operationalExceptionPolicies[0];
        await pier.command('exception.policy',{...casePolicy,version:casePolicy.version,assigneeId:ownerId,escalationOwnerId:ownerId},{as:secondOwnerCookie});
        await pier.command('exception.check',{});
        state=await pier.state();assert.ok(state.operationalExceptions.every(record=>record.status==='closed'));
        await pier.command('role.set',{operatorId:secondOwner,role:'viewer'});
        state=await pier.state();
        assert.equal(state.bookConnections[0].approvedBy,ownerId,'Books keeps its current owner authority');
        assert.equal(state.bookJobs.find(job=>job.key==='inventory-reconciliation').status,'reconciled');
        assert.ok(state.operationalExceptions.every(record=>record.status==='open'),'revoking the case-policy owner immediately invalidates retained closure');
        await pier.command('exception.check',{});
        state=await pier.state();assert.ok(state.operationalExceptions.every(record=>record.status==='open'&&record.history.some(event=>event.kind==='reopened')));
        casePolicy=state.operationalExceptionPolicies[0];
        await pier.command('exception.policy',{...casePolicy,version:casePolicy.version});
        await pier.command('exception.check',{});
        assert.ok((await pier.state()).operationalExceptions.every(record=>record.status==='closed'),'fresh owner policy restores valid closure');
        await pantry.command('journal.reverse',{id:journal[0].id,date:new Date().toISOString().slice(0,10),memo:'synthetic-pier-201'});
        const replacement=await pantry.command('journal.save-draft',{date:journal[0].entry_date,memo:'synthetic-pier-202',lines:[{accountId:cogs.id,debit:'1.00'},{accountId:inventory.id,credit:'1.00'}]});
        await pantry.command('journal.post',{id:replacement.id,revision:replacement.revision});
        await pier.command('book.sync',{});
        state=await pier.state();
        assert.equal(state.bookJobs.find(job=>job.key==='inventory-reconciliation').status,'reconciled','a separate journal can restore the aggregate inventory balance');
        const reversedJob=state.bookJobs.find(job=>job.key.startsWith('cogs:'));
        assert.equal(reversedJob.remoteId,journal[0].id);assert.equal(reversedJob.status,'review','the original reversed journal cannot remain accepted posting evidence');
        assert.equal(state.operationalExceptions.find(record=>record.id===orderCaseId).status,'open','a balanced ledger cannot close delivery using its reversed cost journal');
        await pier.command('book.sync',{});
        assert.equal((await pier.state()).bookJobs.find(job=>job.id===reversedJob.id).status,'review');
        assert.equal((await pantry.view('journal')).entries.filter(entry=>entry.memo.startsWith('PIER-COGS-')).length,1,'checking a reversal never posts a replacement');
        echoFailure=true;
        await pier.command('book.sync',{});
        const safeExport=await(await pier.request('/api/pier/export')).text();
        assert.ok(!safeExport.includes(credential.token));assert.ok(!safeExport.includes('synthetic-pier-private-response'),'provider error bodies never become retained command/job/audit messages');
        echoFailure=false;
        await pier.command('book.disconnect',{});
        const stoppedRequests=providerRequests;
        await pier.restart();
        await pier.command('book.sync',{});
        assert.equal(providerRequests,stoppedRequests,'local revocation survives restart and sends no further book request');
        assert.equal((await (await pier.request('/api/pier/integrations')).json()).connectors.find(row => row.id === 'pantry').status,'paused');
        await pier.command('book.connect',{...connection,integrationToken:credential.token});
        const csvCustomer=(await pier.state()).parties.find(p=>p.id===b.customer.id);
        await pier.command('party.save',{...csvCustomer,name:'=1+2'});
        const safeCsv=await(await pier.request('/api/pier/books/export.csv')).text();
        assert.ok(safeCsv.includes("\"'=1+2\""),'spreadsheet-facing CSV keeps hostile text literal');
        await pier.restartWithFreshSigningKey();
        assert.ok((await pier.state()).operationalExceptions.every(r=>r.closure&&r.history.some(h=>h.kind==='closed')),'closure and evidence survive restart');
        await pier.command('exception.check',{});
        assert.ok((await pier.state()).operationalExceptions.every(r=>r.status==='open'),'unreadable credentials after restart cannot retain current closure');
      }finally{await pier?.close();await pantry.close();}
    });


    await phase('an adjusted connected forecast follows its exact approved send through landed receipt and the real Pantry ledger', async t => {
      const pantry = await pantryInstallation(); t.after(() => pantry.close());
      await pantry.command('chart.start', {});
      const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
      const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
      const landed = await pantry.command('account.save', { code: '5100', name: 'Freight and duty', type: 'expense', subtype: 'other' });
      const chart = await pantry.view('state');
      const bank = await pantry.command('bank-account.save', { name: 'Operating', institution: 'Synthetic bank', accountId: chart.accounts.find(a => a.code === '1000').id, numberLast4: '4242', routing: '', openingDate: '2026-01-01', openingBalance: '0.00' });
      const credential = await pantry.command('integration.create', { name: 'Forecast closure', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
      const mail = [];
      let trialBalanceGate;
      const edge = { now: '2026-10-27T00:00:00.000Z', bindings: { MAIL_PROVIDER: 'resend', MAIL_FROM: 'buyer@example.test', MAIL_API_KEY: 'synthetic-pier-closure-2' }, outboundService: async request => {
        const url = new URL(request.url);
        if (url.hostname === 'api.resend.com') { mail.push(await request.json()); return Response.json({ id: `synthetic-pier-mail-${mail.length}` }); }
        if (url.hostname === 'closure.example.test') {
          if (request.method === 'PUT') return Response.json({ id: 1, ...await request.json() });
          return Response.json(url.pathname.endsWith('/products') ? [{ id: 1, name: 'Brass bolt', type: 'simple', sku: 'BOLT' }] : [{ id: 1, number: 'synthetic-pier-closure-3', status: 'processing', currency: 'USD', billing: { first_name: 'Buyer', last_name: '' }, refunds: [], line_items: [{ id: 1, sku: 'BOLT', quantity: 30, price: 8 }] }]);
        }
        assert.equal(url.origin, pantry.origin);
        const response=await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }) });
        if(trialBalanceGate&&url.pathname.endsWith('/reports/trial-balance')){
          const gate=trialBalanceGate;trialBalanceGate=undefined;gate.arrived.resolve();await gate.release.promise;
        }
        return response;
      } };
      const pier = await installation(edge); t.after(() => pier.close()); const b = await basics(pier);
      await pier.command('business.save', { name: 'Harbor Wholesale', address: '40 Pier Road, Portland OR 97210' });
      let opening = await pier.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: 'North', promiseDate: '2026-09-26', reason: 'Retained supplier history', lines: [{ itemId: b.item.id, quantity: '30', price: '2' }] });
      await pier.command('po.approve', { poId: opening.id, version: opening.version }); opening = await pier.command('po.commit', { poId: opening.id, version: opening.version });
      await pier.command('receipt.create', { poId: opening.id, supplierReference: 'synthetic-pier-closure-4', lines: [{ poLineId: opening.lines[0].id, locationId: b.source.id, quantity: '30', cost: '2' }] }, { headers: { 'x-pier-test-now': '2026-09-27T00:00:00.000Z' } });
      let channel = await pier.command('channel.save', { name: 'Connected forecast', provider: 'woocommerce', baseUrl: 'https://closure.example.test', warehouse: 'North', credentials: { consumerKey: 'synthetic-pier-closure-5', consumerSecret: 'synthetic-pier-closure-6' } }, { headers: { 'x-pier-test-now': '2026-10-02T00:00:00.000Z' } });
      const captured = await pier.state(), order = captured.orders.find(o => o.id === captured.channelOrders[0].orderId);
      await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-closure-7', lines: [{ orderLineId: order.lines[0].id, quantity: '30' }] }, { headers: { 'x-pier-test-now': '2026-10-07T00:00:00.000Z' } });
      await pier.command('channel.save', { ...channel, enabled: false });
      await pier.command('supplierItem.save', { supplierId: b.supplier.id, itemId: b.item.id, code: 'synthetic-pier-closure-8', packSize: '6', minimum: '12', price: '2', leadDays: 6 });
      const policy = await pier.command('replenishment.save', { version: 0, itemId: b.item.id, warehouse: 'North', supplierId: b.supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: '20', reorderQuantity: '30', windowDays: 30, leadDays: 6, reviewDays: 10, freight: '6', duty: '0', forecastAssumptions: { seasonality: { low: '1', expected: '1.5', high: '2', source: 'Reviewed seasonal campaign' }, promotion: { low: '1', expected: '2', high: '3', source: 'Reviewed promotion campaign' } } });
      const comparison = await pier.command('replenishment.compare', { itemId: b.item.id, warehouse: 'North', cashCeiling: '128' });
      const choice = comparison.optimization.rankings.cash[0];
      assert.equal(comparison.optimization.forecast.expected, '270'); assert.equal(choice.quantity, '60'); assert.equal(choice.reliability.delayDays, 1);
      assert.equal(comparison.optimization.rankings.service[0].quantity, '486');
      const selected = await pier.command(choice.command.type, choice.command.payload); let po = selected.drafts[0];
      assert.equal(po.replenishment.evidence[0].forecast.expected, '270'); assert.equal(po.replenishment.expectedLandedCost, '126.000000000000');
      await pier.command('po.approve', { poId: po.id, version: po.version }); po = await pier.command('po.commit', { poId: po.id, version: po.version });
      const authorize = current => pier.command('po.authorizeSend', { poId: current.id, version: current.version, recipient: 'supplier@example.test', maxSpend: '128', expiresAt: '2026-10-28T00:00:00.000Z', maxChases: 0, confirm: true });
      po = await authorize(po); await pier.command('po.sendApproved', { poId: po.id, version: po.version }); assert.equal(mail.length, 1);
      let second = await pier.command('po.draft', { supplierId: b.supplier.id, destinationWarehouse: 'North', promiseDate: '2026-11-02', reason: 'Second exact approval', lines: [{ itemId: b.item.id, quantity: '12', price: '2' }] });
      await pier.command('po.approve', { poId: second.id, version: second.version }); second = await pier.command('po.commit', { poId: second.id, version: second.version }); second = await authorize(second);
      await pier.command('replenishment.save', { ...policy, version: policy.version, freight: '7' });
      second = (await pier.state()).purchaseOrders.find(p => p.id === second.id);
      await pier.command('po.sendApproved', { poId: second.id, version: second.version }, { error: 'SEND_AUTHORITY' }); assert.equal(mail.length, 1);
      await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: chart.accounts.find(a => a.code === '4000').id, landedCostAccountId: landed.id, taxCode: 'exempt' });
      const historicalBill = await pier.command('supplierBill.save', { poId: opening.id, reference: 'synthetic-pier-closure-12', date: '2026-10-27', quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: opening.lines[0].id, quantity: '30', unitPrice: '2' }] });
      await pier.command('supplierBill.approve', { id: historicalBill.id, version: historicalBill.version, receiptEvidence: historicalBill.match.receiptEvidence });
      edge.now = '2026-10-27T01:00:00.000Z';
      const receipt = await pier.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-pier-closure-9', landedCost: { freight: '6', duty: '0', allocation: 'quantity' }, lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '60', cost: '2' }] });
      let bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'synthetic-pier-closure-10', date: '2026-10-27', quantityTolerancePercent: '0', priceTolerancePercent: '0', freight: '6', duty: '0', lines: [{ poLineId: po.lines[0].id, quantity: '60', unitPrice: '2' }] });
      assert.equal(bill.match.withinTolerance, true, JSON.stringify(bill.match));
      await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
      let follow = (await pier.command('replenishment.review', { poId: po.id })).followThrough;
      assert.equal(follow.status, 'open'); assert.equal(follow.actualLandedCost, '126.000000000000'); assert.equal(follow.lines[0].predicted, '0.375'); assert.equal(follow.lines[0].actual, '0');
      const sales = await pantry.view('sales'), remote = sales.bills.find(r => r.reference === `PIER-SB-${bill.id.replaceAll('-', '').slice(0, 24)}`) ?? sales.bills.find(r => r.total_cents === 12600);
      assert.ok(remote); assert.equal(remote.total_cents, 12600);
      await pantry.command('payment.record', { direction: 'paid', contactId: remote.vendor_id, date: '2026-10-27', amount: '126.00', bankAccountId: bank.id, reference: 'synthetic-pier-closure-11', allocations: [{ targetId: remote.id, amount: '126.00' }] });
      await pier.command('book.sync', {});
      follow = (await pier.command('replenishment.review', { poId: po.id })).followThrough;
      assert.equal(follow.status, 'closed', JSON.stringify(follow)); assert.deepEqual(follow.receiptIds, [receipt.id]);
      assert.equal(follow.inventoryReconciliation.status, 'reconciled'); assert.equal(follow.landedCostDifference, '0.000000000000');
      const ledger = await pantry.view('reports/trial-balance'); assert.equal(ledger.balanced, true);
      assert.equal((await pier.state()).supplierBills.find(b => b.id === bill.id).books.open, '0.00');
      const beforeRace=await pier.state(),sampledSequence=beforeRace.movements.at(-1).sequence;
      const gate={arrived:Promise.withResolvers(),release:Promise.withResolvers()};trialBalanceGate=gate;
      const syncing=pier.command('book.sync',{});
      let concurrentReceipt;
      try{
        await gate.arrived.promise;
        concurrentReceipt=await pier.command('receipt.create',{poId:second.id,supplierReference:'synthetic-pier-203',lines:[{poLineId:second.lines[0].id,locationId:b.source.id,quantity:'12',cost:'2'}]});
        assert.ok((await pier.state()).movements.at(-1).sequence>sampledSequence);
      }finally{gate.release.resolve();await syncing;}
      const afterRace=await pier.state(),stale=afterRace.bookJobs.find(job=>job.key==='inventory-reconciliation');
      assert.equal(stale.movementSequence,sampledSequence,'reconciliation keeps the movement frontier of the sampled amounts');
      assert.equal(stale.status,'review','matching older amounts cannot certify a concurrent receipt');
      assert.equal((await pier.command('replenishment.review',{poId:po.id})).followThrough.status,'open');
      await pier.command('receipt.reverse',{receiptId:concurrentReceipt.id,reason:'Synthetic extra receipt was physically returned before use'});
      await pier.command('book.sync',{});
      const recovered=await pier.state(),current=recovered.bookJobs.find(job=>job.key==='inventory-reconciliation');
      assert.equal(current.status,'reconciled');assert.equal(current.movementSequence,recovered.movements.at(-1).sequence);
      assert.equal((await pier.command('replenishment.review',{poId:po.id})).followThrough.status,'closed');
      await pier.invariant();
    });
  }

  // books-landed: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics } = await import("./harness.mjs");
    const { pantryInstallation } = await import("./pantry-installation.mjs");


    const cents = value => { const [whole, fraction = ''] = value.split('.'); assert.match(fraction, /^\d{2}0*$/, `${value} is whole cents`); return Number(whole) * 100 + Number(fraction.slice(0, 2)); };


    await phase('landed receipts and late weight-allocated bills reconcile Pantry after partial shipment, return and response loss', async () => {
      const pantry = await pantryInstallation();
      let pier, dropCreditRequest = false, loseLateResponse = false;
      try {
        await pantry.command('chart.start', {});
        const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
        const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
        const freightIn = await pantry.command('account.save', { code: '5200', name: 'Freight and duty in', type: 'expense', subtype: 'other' });
        const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' });
        const purchaseTax = await pantry.command('account.save', { code: '5300', name: 'Purchase tax', type: 'expense', subtype: 'other' });
        const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
        pier = await installation({ async outboundService(request) {
          const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
          const isCredit = request.method === 'POST' && request.url.endsWith('/integration/v1/invoices') && JSON.parse(new TextDecoder().decode(body)).kind === 'credit';
          // The credit request is lost before Pantry sees it: Pier cannot know whether it arrived.
          if (dropCreditRequest && isCredit) { dropCreditRequest = false; throw new Error('Synthetic connection loss before Pantry received the credit'); }
          const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
          if (loseLateResponse && request.method === 'POST' && request.url.endsWith('/integration/v1/journals') && JSON.parse(new TextDecoder().decode(body)).memo.startsWith('PIER-LATECOST')) { loseLateResponse = false; throw new Error('Synthetic response loss after the late-cost journal was saved'); }
          return response;
        } });
        const b = await basics(pier);
        await pier.command('item.save', { ...b.item, weight: '1' });
        const bowl = await pier.command('item.save', { sku: 'BOWL', name: 'Serving bowl', unit: 'each', packSize: '1', weight: '2' });
        const lines = [{ itemId: b.item.id, quantity: '7', price: '3.17' }, { itemId: bowl.id, quantity: '13', price: '1.09' }];
        const po = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Landed stock', freight: '40', tax: '2.50', lines });
        await pier.command('po.approve', { poId: po.id, version: po.version });
        await pier.command('po.commit', { poId: po.id, version: po.version });
        await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight', landedCost: { freight: '40.005', duty: '0', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: lines.find(x => x.itemId === l.itemId).price })) }, { error: 'LANDED_COST' });
        const receipt = await pier.command('receipt.create', { poId: po.id, supplierReference: 'Freight and duty', currency: 'AUD', usdRate: '0.5', landedCost: { freight: '40', duty: '10', allocation: 'value' }, lines: po.lines.map(l => ({ poLineId: l.id, locationId: b.source.id, quantity: l.quantity, cost: l.itemId === b.item.id ? '6.34' : '2.18' })) });
        assert.equal(receipt.lines.reduce((n, l) => n + cents(l.freight), 0), 4000);
        assert.equal(receipt.lines.reduce((n, l) => n + cents(l.duty), 0), 1000);
        for (const line of receipt.lines) { cents(line.landedTotal); cents(line.landedUnitCost); }
        assert.equal(cents(receipt.landedCost.total), 2219 + 1417 + 5000);

        assert.equal(receipt.sourceCurrency, 'AUD');
        assert.equal(receipt.usdRate, '0.5');
        assert.deepEqual(receipt.lines.map(l => l.cost), ['3.17', '1.09']);
        const order = await pier.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '3', price: '9' }, { itemId: bowl.id, quantity: '5', price: '4' }] });
        const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'LANDED-1', lines: order.lines.map(l => ({ orderLineId: l.id, quantity: l.quantity })) });
        const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
        await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freightIn.id, writeOffAccountId: damage.id, writeOffReasonCode: 'crushed', writeOffApprovalLimit: '0', taxCode: 'exempt' });
        const bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'LANDED-INVOICE', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', freight: '40', tax: '2.50', lines: po.lines.map(l => ({ poLineId: l.id, quantity: l.quantity, unitPrice: lines.find(x => x.itemId === l.itemId).price })) });
        await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
        await pier.command('book.sync', {});
        // The approved invoice carries tax but no purchase tax account is chosen yet: it waits for review, never posts a partial bill.
        let state = await pier.state();
        const waiting = state.bookJobs.find(j => j.sourceKind === 'supplierBill');
        assert.equal(waiting.status, 'review');
        assert.match(waiting.reason, /Purchase tax account/);
        assert.equal((await pantry.view('sales')).bills.length, 0);
        await pier.command('book.connect', { baseUrl: pantry.origin, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freightIn.id, writeOffAccountId: damage.id, writeOffReasonCode: 'crushed', writeOffApprovalLimit: '0', purchaseTaxAccountId: purchaseTax.id, taxCode: 'exempt' });
        await pier.command('book.sync', {});
        state = await pier.state();
        assert.equal(state.bookJobs.find(j => j.sourceKind === 'supplierBill').status, 'posted');
        const payable = (await pantry.view('sales')).bills.find(x => x.reference === state.bookJobs.find(j => j.sourceKind === 'supplierBill').reference);
        assert.equal(payable.open_cents, 3636 + 4000 + 250, 'goods, freight and tax are one payable');
        const cogsJob = state.bookJobs.find(j => j.key === `cogs:${shipment.id}`);
        assert.equal(cogsJob.status, 'posted', JSON.stringify(cogsJob));

        dropCreditRequest = true;
        const returned = await pier.command('return.scan', { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines.find(l => l.itemId === bowl.id).id, quantity: '1', locationId: b.source.id, binCode: b.source.name, reason: 'Customer returned damaged bowl', condition: 'damaged', disposition: 'writeoff', reasonCode: 'crushed', approveWriteOff: true });
        await pier.command('book.sync', {});
        state = await pier.state();
        let credit = state.bookJobs.find(j => j.key === `credit:${returned.id}`);
        assert.equal(credit.status, 'uncertain');
        await pier.command('book.sync', {});
        credit = (await pier.state()).bookJobs.find(j => j.key === `credit:${returned.id}`);
        assert.equal(credit.status, 'uncertain', 'an unknown outcome is never re-sent without the owner');
        assert.match(credit.fix, /Check Pantry/);
        await pier.command('book.retry', { jobId: credit.id, version: credit.version });
        await pier.command('book.sync', {});
        state = await pier.invariant();
        credit = state.bookJobs.find(j => j.key === `credit:${returned.id}`);
        assert.equal(credit.status, 'posted', JSON.stringify(credit));
        assert.equal(state.bookJobs.find(j => j.key === `return-cogs:${returned.id}`).status, 'posted');
        const sales = await pantry.view('sales');
        const invoice = sales.invoices.find(i => i.kind === 'invoice');
        assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 1);
        assert.equal(invoice.open_cents, 4700 - 400);
        assert.equal(state.bookJobs.filter(j => ['review', 'uncertain'].includes(j.status) && j.kind !== 'valuation').length, 0);

        assert.equal(state.bookJobs.find(j => j.key === `landed:${receipt.id}`).status, 'posted');
        // A late bill after partial shipment and return preserves original receipt
        // values and physical events while supplementing their retained cost layers.
        const original = structuredClone(state.receipts.find(r => r.id === receipt.id));
        const movements = structuredClone(state.movements);
        loseLateResponse = true;
        const lateInput = { receiptId: receipt.id, version: original.version, reference: 'synthetic-pier-201', reason: 'Approved late carrier bill', landedCost: { freight: '33', duty: '0', allocation: 'weight' } };
        const lateId = crypto.randomUUID();
        const late = await pier.command('receipt.landed', lateInput, { commandId: lateId });
        assert.deepEqual(late.impacts, { inventory: '20.000000000000', cogs: '11.000000000000', expense: '2.000000000000' });
        assert.deepEqual(late.shares.map(s => s.amount), ['7.000000000000', '26.000000000000']);
        state = await pier.state();
        assert.deepEqual(state.receipts.find(r => r.id === receipt.id).lines, original.lines);
        assert.deepEqual(state.movements, movements);
        let lateJob = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
        assert.equal(lateJob.status, 'uncertain');
        await pier.command('book.retry', { jobId: lateJob.id, version: lateJob.version });
        await pier.command('book.sync', {});
        state = await pier.state();
        lateJob = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
        assert.equal(lateJob.status, 'posted', JSON.stringify(lateJob));
        assert.deepEqual(await pier.command('receipt.landed', lateInput, { commandId: lateId }), late);
        assert.equal(state.bookJobs.find(j => j.key === `late-bill:${late.id}`).status, 'posted');
        const latePayables = (await pantry.view('sales')).bills.filter(b => b.reference === state.bookJobs.find(j => j.key === `late-bill:${late.id}`).reference);
        assert.equal(latePayables.length, 1);
        assert.equal(state.supplierBills.find(b => b.id === bill.id).match.withinTolerance, true, 'late payables do not consume the original goods receipt allocation');
        assert.equal(latePayables[0].open_cents, 3300);
        const closure = state.receiptClosures.find(r => r.id === receipt.id);
        assert.equal(new Set(closure.jobIds).size, closure.jobIds.length);
        assert.ok(closure.jobIds.includes(state.bookJobs.find(j => j.key === `late-bill:${late.id}`).id));
        await pier.command('receipt.landed', { ...lateInput, version: state.receipts.find(r => r.id === receipt.id).version }, { error: 'DUPLICATE' });
        // Pantry's inventory account equals Pier's landed valuation to the cent.
        await pier.command('book.sync', {});
        state = await pier.state();
        const report = await (await pier.request('/api/pier/reports')).json();
        const tb = await pantry.view('./reports/trial-balance');
        assert.equal(tb.rows.find(r => r.id === inventory.id).net, cents(report.valuation.total));
        assert.equal(tb.rows.find(r => r.id === damage.id).net, cents(returned.writeOffCostTotal) + 200);
        assert.equal(tb.rows.find(r => r.id === purchaseTax.id).net, 250, 'supplier tax posts to the chosen account, never into inventory');
        assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
      } finally { await pier?.close(); await pantry.close(); }
    });


    await phase('FIFO and moving-average late bill deltas reconcile exact Pantry inventory, net COGS and shipment margin across two cost layers', async () => {
      for (const method of ['fifo', 'average']) {
        const pantry = await pantryInstallation();
        let pier, closedPeriod = false;
        try {
          await pantry.command('chart.start', {});
          const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
          const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
          const freight = await pantry.command('account.save', { code: '5200', name: 'Freight', type: 'expense', subtype: 'other' });
          const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
          pier = await installation({ async outboundService(request) {
            const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
            if (closedPeriod && request.method === 'POST' && request.url.endsWith('/integration/v1/journals') && JSON.parse(new TextDecoder().decode(body)).memo.startsWith('PIER-LATECOST')) return Response.json({ error: 'Period is locked' }, { status: 409 });
            return fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
          } });
          let batch = await pier.command('import.stage', { namespace: 'synthetic-pier-214', sourceVersion: '1', exportedAt: '2026-10-01T00:00:00Z', filters: {}, cutoffTimezone: 'UTC', currency: 'USD', mappingRevision: '1', files: [
            { name: 'items.csv', kind: 'items', csv: 'key,sku,name,barcode,unit,packSize\ni,synthetic-pier-215,Opening stock,,each,1\n' },
            { name: 'locations.csv', kind: 'locations', csv: 'key,name,warehouse,kind\nb,synthetic-pier-216,East,bin\n' },
            { name: 'parties.csv', kind: 'parties', csv: 'key,name,kind\ns,synthetic-pier-217,supplier\nc,synthetic-pier-218,customer\n' },
            { name: 'positions.csv', kind: 'positions', csv: 'key,itemKey,locationKey,status,quantity,unit,cost\np,i,b,sellable,2,each,1\n' },
          ] });
          for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) batch = await pier.command('import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Reviewed USD cutover against opening ledger' });
          await pier.command('import.commit', { batchId: batch.id, version: batch.version });
          const imported = await pier.state();
          const b = { item: imported.items[0], source: imported.locations[0], supplier: imported.parties.find(p => p.kind === 'supplier'), customer: imported.parties.find(p => p.kind === 'customer') };
          const equity = (await pantry.view('state')).accounts.find(a => a.type === 'equity');
          const opening = await pantry.command('journal.save-draft', { date: new Date().toISOString().slice(0, 10), memo: 'synthetic-pier-219 reviewed opening cutover', lines: [{ accountId: inventory.id, debit: '2.00', memo: 'USD opening stock' }, { accountId: equity.id, credit: '2.00', memo: 'Opening equity' }] });
          await pantry.command('journal.post', { id: opening.id, revision: opening.revision });
          await pier.command('costing.method', { method, confirm: true, reason: 'Reviewed stock costing' });
          const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
          await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, landedCostAccountId: freight.id, taxCode: 'exempt' });
          const receipts = [];
          for (const [quantity, price, reference] of [['6', '2', 'synthetic-pier-210'], ['4', '4', 'synthetic-pier-211']]) {
            const po = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Two retained cost layers', lines: [{ itemId: b.item.id, quantity, price }] });
            await pier.command('po.approve', { poId: po.id, version: po.version });
            await pier.command('po.commit', { poId: po.id, version: po.version });
            receipts.push(await pier.command('receipt.create', { poId: po.id, supplierReference: reference, lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity, cost: price }] }));
            const bill = await pier.command('supplierBill.save', { poId: po.id, reference, date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity, unitPrice: price }] });
            await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
          }
          const order = await pier.command('order.create', { customerId: b.customer.id, warehouse: b.source.warehouse, lines: [{ itemId: b.item.id, quantity: '4', price: '10' }] });
          const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-212', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] });
          await pier.command('return.scan', { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, quantity: '1', locationId: b.source.id, reason: 'Returned sellable unit', condition: 'sellable', disposition: 'restock' });
          const current = (await pier.state()).receipts.find(r => r.id === receipts[0].id);
          closedPeriod = true;
          const late = await pier.command('receipt.landed', { receiptId: current.id, version: current.version, reference: 'synthetic-pier-213', reason: 'Approved carrier invoice', landedCost: { freight: '3', duty: '1', insurance: '1', other: '1', allocation: 'quantity' } });
          let state = await pier.state(), job = state.bookJobs.find(j => j.key === `late-cost:${late.id}`);
          assert.equal(job.status, 'review');
          assert.match(job.reason, /HTTP 409/);
          assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'review');
          closedPeriod = false;
          await pier.command('book.retry', { jobId: job.id, version: job.version });
          await pier.command('book.sync', {});
          state = await pier.state();
          const report = await (await pier.request('/api/pier/reports')).json(), tb = await pantry.view('./reports/trial-balance');
          const expected = method === 'fifo' ? { inventory: 2900, netCogs: 700, grossCogs: 800, margin: 3200 } : { inventory: 2700, netCogs: 900, grossCogs: 1200, margin: 2800 };
          assert.equal(cents(report.valuation.reconciliation.openings), 200);
          assert.equal(cents(report.valuation.total), expected.inventory);
          assert.equal(cents(report.margin.cost), expected.grossCogs);
          assert.equal(cents(report.margin.margin), expected.margin);
          assert.equal(tb.rows.find(r => r.id === inventory.id).net, expected.inventory);
          assert.equal(tb.rows.find(r => r.id === cogs.id).net, expected.netCogs);
          assert.equal(tb.rows.find(r => r.id === revenue.id).net, -3000);
          assert.equal(cents(report.valuation.reconciliation.difference), 0);
          assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
          assert.equal(state.bookJobs.find(j => j.key === `late-cost:${late.id}`).status, 'posted');
          const roundingPO = await pier.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Retained sub-cent source cost', lines: [{ itemId: b.item.id, quantity: '1', price: '0.333333' }] });
          await pier.command('po.approve', { poId: roundingPO.id, version: roundingPO.version });
          await pier.command('po.commit', { poId: roundingPO.id, version: roundingPO.version });
          await pier.command('receipt.create', { poId: roundingPO.id, supplierReference: 'synthetic-pier-220', lines: [{ poLineId: roundingPO.lines[0].id, locationId: b.source.id, quantity: '1', cost: '0.333333' }] });
          const roundingBill = await pier.command('supplierBill.save', { poId: roundingPO.id, reference: 'synthetic-pier-221', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: roundingPO.lines[0].id, quantity: '1', unitPrice: '0.333333' }] });
          await pier.command('supplierBill.approve', { id: roundingBill.id, version: roundingBill.version, receiptEvidence: roundingBill.match.receiptEvidence });
          const roundingJob = (await pier.state()).bookJobs.find(j => j.sourceId === roundingBill.id && j.kind === 'bill');
          assert.equal(roundingJob.status, 'review');
          assert.match(roundingJob.reason, /fractions of a cent/i);
          assert.equal((await pantry.view('sales')).bills.some(b => b.reference === roundingJob.reference), false);

        } finally { await pier?.close(); await pantry.close(); }
      }
    });
  }

  // books-shop: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");
    const { pantryInstallation } = await import("./pantry-installation.mjs");


    await phase('a Stripe-confirmed shop order posts its shipped shares as paid Pantry invoices without duplicating a payment', async t => {
      const pantry = await pantryInstallation(); t.after(() => pantry.close());
      await pantry.command('chart.start', {});
      const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory', type: 'asset', subtype: 'other' });
      const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of goods', type: 'expense', subtype: 'other' });
      const chart = await pantry.view('state');
      const bank = await pantry.command('bank-account.save', { name: 'Stripe clearing', institution: 'Stripe', accountId: chart.accounts.find(a => a.code === '1000').id, numberLast4: '4242', openingDate: '2026-01-01', openingBalance: '0.00' });
      const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'payments:write', 'reports:read', 'post'] });
      let losePaymentReply = true;
      const pier = await installation({ async outboundService(request) {
        if (new URL(request.url).hostname === 'shop.example.test') return Response.json({ products: [], orders: [] });
        const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }) });
        if (losePaymentReply && request.method === 'POST' && request.url.endsWith('/payments')) { losePaymentReply = false; await response.text(); throw new Error('Network response lost after Pantry recorded payment'); }
        return response;
      } }); t.after(() => pier.close());
      const b = await basics(pier); await receive(pier, b, await buy(pier, b, '10'), '10');
      const channel = await pier.command('channel.save', { name: 'Shop', provider: 'stall', baseUrl: 'https://shop.example.test', warehouse: 'North', credentials: { accessToken: 'synthetic-network-edge' } });
      const key = await pier.command('channel.stallKey', { channelId: channel.id, version: channel.version, customerId: b.customer.id });
      async function shop(type, payload, commandId = crypto.randomUUID()) {
        const response = await fetch(pier.origin + '/api/pier/commands', { method: 'POST', headers: { origin: pier.origin, cookie: `pier_channel=${key.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ commandId, type, payload }) });
        const value = await response.json(); assert.equal(value.ok, true, JSON.stringify(value)); return value.result;
      }
      const order = await shop('order.create', { customerId: b.customer.id, channel: 'stall', currency: 'USD', lines: [{ itemId: b.item.id, quantity: '2', price: '14.00' }] });
      const evidence = { provider: 'stripe', reference: 'pi_shop_transport', amount: '28.00', currency: 'USD', paidAt: new Date().toISOString(), orderReference: 'shop-123' };
      await pier.command('order.channelPayment', { orderId: order.id, payment: evidence }, { error: 'CHANNEL_PAYMENT' });
      await shop('order.channelPayment', { orderId: order.id, payment: evidence }, 'shop-payment-123');
      await shop('order.channelPayment', { orderId: order.id, payment: evidence }, 'shop-payment-123');
      const connection = { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: chart.accounts.find(a => a.code === '4000').id, stripeBankAccountId: bank.id, taxCode: 'exempt' };
      const accounts = await pier.command('book.accounts', connection); assert.ok(accounts.bankAccounts.some(a => a.id === bank.id));
      await pier.command('book.connect', connection);
      const first = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SHOP-FIRST', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
      await pier.command('book.sync', {}); await pier.command('book.sync', {});
      let sales = await pantry.view('sales'); assert.equal(sales.invoices.length, 1); assert.equal(sales.invoices[0].open_cents, 0);
      let state = await pier.state(); assert.equal(state.bookJobs.find(j => j.key === `invoice:${first.id}`).status, 'reconciled');
      await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SHOP-SECOND', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
      await pier.command('book.sync', {}); await pier.command('book.sync', {});
      sales = await pantry.view('sales'); assert.equal(sales.invoices.length, 2); assert.ok(sales.invoices.every(i => i.open_cents === 0));
      const payments = await pantry.view('sales'); assert.equal(payments.payments.length, 2); assert.equal(payments.payments.reduce((n, p) => n + p.amount_cents, 0), 2800);
      const tb = await pantry.view('reports/trial-balance'); assert.equal(tb.balanced, true);
      await pantry.command('journal.reverse', { id: payments.payments[0].journal_id, date: new Date().toISOString().slice(0, 10), memo: 'Stripe payment reversed by accountant' });
      await pier.command('book.sync', {});
      state = await pier.state();
      assert.equal(Number(state.orders.find(o => o.id === order.id).books.open), 14);
      assert.ok(state.bookJobs.some(j => j.kind === 'invoice' && j.status === 'review' && /reversed in Pantry/.test(j.reason)));
      assert.equal((await pantry.view('sales')).payments.length, 2, 'a reversal never creates another payment');
      // Restoring public business state without its secret must be visible before syncing.
      await pier.db.prepare("DELETE FROM pier_channel_secrets WHERE channel_id='books:pantry'").run();
      state = await pier.state(); assert.equal(state.bookConnections[0].credentialPresent, false); assert.match(state.bookConnections[0].problem, /Restored backups/);
    });
  }
});
