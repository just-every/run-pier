import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Print and send current commercial documents, inspect returns and retain exact credits", async () => {

  // returns: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { randomUUID } = await import("node:crypto");
    const { installation, basics, buy, receive } = await import("./harness.mjs");
    const { pantryInstallation } = await import("./pantry-installation.mjs");


    await phase('one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs', async () => {
      const pantry = await pantryInstallation();
      let pier, loseCreditResponse = false;
      try {
        await pantry.command('chart.start', {});
        const inventory = await pantry.command('account.save', { code: '1300', name: 'Inventory Asset', type: 'asset', subtype: 'other' });
        const cogs = await pantry.command('account.save', { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'other' });
        const damage = await pantry.command('account.save', { code: '5100', name: 'Damaged stock', type: 'expense', subtype: 'other' });
        const revenue = (await pantry.view('state')).accounts.find(a => a.code === '4000');
        pier = await installation({ async outboundService(request) {
          assert.equal(new URL(request.url).origin, pantry.origin);
          const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
          const isCredit = request.method === 'POST' && request.url.endsWith('/integration/v1/invoices') && JSON.parse(new TextDecoder().decode(body)).kind === 'credit';
          const response = await fetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([key]) => !['transfer-encoding', 'content-length', 'host', 'connection'].includes(key))), redirect: 'manual', ...(body ? { body } : {}) });
          if (loseCreditResponse && isCredit) { loseCreditResponse = false; await response.text(); throw new Error('Synthetic response loss after Pantry saved a credit'); }
          return response;
        } });
        const b = await basics(pier), po = await buy(pier, b, '12');
        await receive(pier, b, po, '12');
        const bill = await pier.command('supplierBill.save', { poId: po.id, reference: 'METALS-RETURN-STOCK', date: new Date().toISOString().slice(0, 10), quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity: '12', unitPrice: '0.25' }] });
        await pier.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
        const credential = await pantry.command('integration.create', { name: 'Pier', scopes: ['contacts:write', 'invoices:write', 'bills:write', 'journals:write', 'documents:write', 'payments:read', 'reports:read', 'post'] });
        await pier.command('book.connect', { baseUrl: pantry.origin, integrationToken: credential.token, inventoryAccountId: inventory.id, cogsAccountId: cogs.id, revenueAccountId: revenue.id, writeOffAccountId: damage.id, writeOffReasonCode: 'damaged', writeOffApprovalLimit: '0.10', taxCode: 'exempt' });
        const order = await pier.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '4', price: '2' }] });
        const shipment = await pier.command('dispatch.create', { orderId: order.id, shipmentReference: 'SYNTHETIC-RETURN-LABEL', lines: [{ orderLineId: order.lines[0].id, quantity: '4' }] });
        const lookup = async code => {
          const response = await pier.request(`/api/pier/returns/lookup?code=${encodeURIComponent(code)}`);
          assert.equal(response.status, 200);
          return response.json();
        };
        const label = await lookup(order.reference), item = await lookup(b.item.barcode);
        assert.deepEqual(label.map(r => r.shipmentLineId), [shipment.lines[0].id]);
        assert.deepEqual(item, label);
        const destination = { locationId: b.destination.id, binCode: b.destination.name, reason: 'Customer ordered too many', condition: 'sellable', disposition: 'restock' };
        const intakeId = randomUUID();
        loseCreditResponse = true;
        const restocked = await pier.command('return.scan', { code: b.item.barcode, ...destination }, { commandId: intakeId });
        assert.equal(restocked.status, 'restocked');
        let state = await pier.invariant();
        assert.equal(state.positions.find(p => p.itemId === b.item.id && p.locationId === b.destination.id && p.status === 'sellable').available, '1');
        assert.equal(state.bookJobs.find(j => j.key === `credit:${restocked.id}`).status, 'uncertain');
        await pier.command('return.scan', { code: b.item.barcode, ...destination }, { commandId: intakeId });
        await pier.command('book.sync', {});
        state = await pier.state();
        assert.equal(state.returns.length, 1);
        assert.equal(state.bookJobs.find(j => j.key === `credit:${restocked.id}`).status, 'posted');
        let sales = await pantry.view('sales');
        assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 1);
        const invoice = sales.invoices.find(i => i.kind === 'invoice');
        const credit = sales.invoices.find(i => i.kind === 'credit');
        assert.equal(credit.credit_for, invoice.id); assert.equal(credit.total_cents, 200); assert.equal(credit.status, 'issued');
        assert.equal(invoice.open_cents, 600);
        // An order label needs a deliberate line/quantity confirmation, then posts without a second item scan.
        const fromLabel = { code: order.reference, shipmentId: shipment.id, shipmentLineId: shipment.lines[0].id, quantity: '1', ...destination, condition: 'damaged', disposition: 'writeoff', reasonCode: 'damaged', approveWriteOff: true, reason: 'Crushed in transit' };
        const beforeRefusal = await pier.state();
        await pier.command('return.scan', { ...fromLabel, disposition: 'restock' }, { error: 'RETURN_CONDITION' });
        const refused = await pier.state(); assert.equal(refused.returns.length, beforeRefusal.returns.length); assert.equal(refused.movements.length, beforeRefusal.movements.length);
        await pier.command('return.scan', { ...fromLabel, reasonCode: 'unknown' }, { error: 'WRITE_OFF_REASON' });
        await pier.command('return.scan', { ...fromLabel, approveWriteOff: false }, { error: 'WRITE_OFF_APPROVAL' });
        assert.equal((await pier.state()).movements.length, beforeRefusal.movements.length);
        const writtenoff = await pier.command('return.scan', fromLabel);
        assert.equal(writtenoff.status, 'writtenoff'); assert.equal(writtenoff.writeOffCostTotal, '0.250000000000');
        assert.equal(writtenoff.writeOffReason.code, 'damaged');
        assert.equal(writtenoff.writeOffReason.accountId, damage.id);
        assert.equal(writtenoff.writeOffReason.approvalLimit, '0.1');
        assert.ok(writtenoff.writeOffApprovedBy);
        await pier.command('return.scan', { ...fromLabel, quantity: '3' }, { error: 'RETURN_LIMIT' });
        // A receiver lacking inspection authority cannot make the same scan sellable.
        const entered = await fetch(`${pier.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': pier.devKey } });
        assert.equal(entered.status, 303);
        const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
        const session = await (await pier.request('/auth/session', { as: cookie })).json();
        await pier.command('role.set', { operatorId: session.operator.id, role: 'operator' });
        const waiting = await pier.command('return.scan', { code: b.item.barcode, ...destination }, { as: cookie });
        assert.equal(waiting.status, 'quarantine'); assert.equal(waiting.inspectedBy, undefined);
        await pier.command('return.inspect', { returnId: waiting.id, version: waiting.version, ...destination }, { as: cookie, error: 'FORBIDDEN' });
        state = await pier.invariant();
        assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'sellable').quantity, '1');
        assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'quarantine').quantity, '1');
        await pier.command('return.inspect', { returnId: waiting.id, version: waiting.version, ...destination });
        const quarantined = await pier.command('return.scan', { ...fromLabel, code: shipment.reference, disposition: 'writeoff', reason: 'Damaged packaging pending review' }, { as: cookie });
        assert.equal(quarantined.status, 'quarantine');
        assert.equal(quarantined.inspectedBy, undefined);
        assert.equal(quarantined.writeOffAccountId, undefined, 'An unauthorized damaged scan cannot post a write-off');
        await pier.command('book.sync', {}); await pier.command('book.sync', {});
        state = await pier.invariant(); sales = await pantry.view('sales');
        assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'sellable').quantity, '2');
        assert.equal(state.positions.find(p => p.locationId === b.destination.id && p.status === 'quarantine').quantity, '1');
        assert.equal(sales.invoices.filter(i => i.kind === 'credit').length, 4);
        assert.equal(sales.invoices.find(i => i.kind === 'invoice').open_cents, 0);
        assert.equal(state.orders.find(o => o.id === order.id).books.credited, '8.000000000000');
        assert.equal(state.orders.find(o => o.id === order.id).books.status, 'reconciled');
        const tb = await pantry.view('reports/trial-balance');
        assert.equal(tb.balanced, true); assert.equal(tb.rows.find(r => r.id === inventory.id).net, 275);
        // Pantry omits zero-net accounts from trial balance; its general ledger
        // proves both the original COGS and all four reversals, rather than treating a missing row as zero.
        const cogsLedger = await pantry.view(`reports/general-ledger?from=2000-01-01&to=${new Date().toISOString().slice(0, 10)}&account=${encodeURIComponent(cogs.id)}`);
        const cogsAccount = cogsLedger.accounts.find(a => a.id === cogs.id);
        assert.ok(cogsAccount);
        assert.equal(cogsAccount.rows.reduce((n, r) => n + r.debit_cents, 0), 100);
        assert.equal(cogsAccount.rows.reduce((n, r) => n + r.credit_cents, 0), 100);
        assert.equal(cogsAccount.closing, 0); assert.equal(tb.rows.find(r => r.id === damage.id).net, 25);
        assert.equal(state.bookJobs.find(j => j.key === 'inventory-reconciliation').status, 'reconciled');
        assert.equal(state.bookJobs.filter(j => ['review', 'uncertain'].includes(j.status)).length, 0);
      } finally { await pier?.close(); await pantry.close(); }
    });


    await phase('customer terms, currency aging and invoice representatives retain their own source history', async t => {
      const now = '2026-10-15T12:00:00Z';
      const h = await installation({ now }); t.after(() => h.close());
      const b = await basics(h);
      const rep = await h.command('salesRep.save', { name: 'synthetic-pier-outside-rep', kind: 'outside' });
      const nextRep = await h.command('salesRep.save', { name: 'synthetic-pier-next-rep', kind: 'outside' });
      let customer = await h.command('customer.profile', { customerId: b.customer.id, version: b.customer.version, contacts: ['Accounts contact'], addresses: ['Synthetic delivery address'], paymentTerms: { kind: 'net30' }, reason: 'Reviewed customer terms' });
      customer = await h.command('customer.rep', { customerId: customer.id, version: customer.version, salesRepId: rep.id, reason: 'Assigned outside representative' });
      await h.command('sales.taxTable', { state: 'CA', rate: '0', reason: 'Reviewed synthetic no-tax table' });
      const today = now.slice(0, 10), day = n => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
      const invoices = [], orders = [];
      for (const days of [0, 1, 31, 61, 91]) {
        let order = await h.command('order.create', { customerId: customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '1', price: '10' }] });
        assert.equal(order.salesRepId, rep.id); orders.push(order);
        await h.command('invoice.policy', { orderId: order.id, mode: 'prepay', reason: 'Reviewed prepayment' });
        let invoice = await h.command('invoice.draft', { orderId: order.id, invoiceDate: day(days + 30) });
        assert.equal(invoice.dueDate, day(days)); assert.equal(invoice.salesRepId, rep.id);
        invoice = await h.command('invoice.review', { invoiceId: invoice.id, version: invoice.version });
        invoice = await h.command('invoice.authorize', { invoiceId: invoice.id, version: invoice.version }); invoices.push(invoice);
      }
      const current = (await h.state()).orders.find(o => o.id === orders[0].id);
      await h.command('order.salesRep', { orderId: current.id, version: current.version, salesRepId: nextRep.id, reason: 'Audited per-order reassignment' });
      const s = await h.state(), profile = s.customerProfiles.find(p => p.customerId === customer.id);
      assert.deepEqual(profile.aging.USD, { current: '10.000000000000', '1-30': '10.000000000000', '31-60': '10.000000000000', '61-90': '10.000000000000', over90: '10.000000000000' });
      assert.equal(profile.balance.USD, '50.000000000000');
      assert.equal(s.invoices.find(i => i.id === invoices[0].id).salesRepId, rep.id, 'an order reassignment does not rewrite an authorized invoice');
      assert.equal(s.orders.find(o => o.id === current.id).repHistory.at(-1).reason, 'Audited per-order reassignment');
      let cadOrder = await h.command('order.create', { customerId: customer.id, warehouse: 'North', shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '1', price: '10' }] });
      cadOrder = await h.command('order.salesRep', { orderId: cadOrder.id, version: cadOrder.version, salesRepId: nextRep.id, reason: 'Rep for this invoice' });
      await h.command('invoice.policy', { orderId: cadOrder.id, mode: 'prepay', reason: 'Reviewed CAD prepayment' });
      let cad = await h.command('invoice.draft', { orderId: cadOrder.id, currency: 'CAD', usdRate: '0.75', unitPrices: [{ orderLineId: cadOrder.lines[0].id, price: '12' }], priceReason: 'Reviewed CAD price', terms: { kind: 'dueReceipt' } });
      cad = await h.command('invoice.review', { invoiceId: cad.id, version: cad.version }); await h.command('invoice.authorize', { invoiceId: cad.id, version: cad.version });
      const last = await h.state(), separated = last.customerProfiles.find(p => p.customerId === customer.id);
      assert.equal(separated.aging.CAD.current, '12.000000000000'); assert.equal(separated.balance.USD, '50.000000000000');
      assert.equal(last.invoices.find(i => i.id === cad.id).salesRepId, nextRep.id);
      const entered = await fetch(`${h.origin}/auth/dev/enter?as=member`, { redirect: 'manual', headers: { 'x-rer-dev-key': h.devKey } });
      const cookie = entered.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      assert.deepEqual((await (await h.request('/api/pier/state', { as: cookie })).json()).customerProfiles, []);
      await h.command('salesRep.save', { name: 'Denied', kind: 'outside' }, { as: cookie, error: 'FORBIDDEN' });
    });
  }

  // packing-documents: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


    await phase('pack slip contains only current partial cartons and reading cannot dispatch', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await basics(h), po = await buy(h, b);
      await receive(h, b, po, '10');
      const order = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '5' }] });
      const prior = await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-prior-1', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
      const pickup = await h.command('carrier.save', { name: 'synthetic-pier-pickup-1', warehouse: 'North', dock: 'synthetic-pier-dock-1', cutoff: '23:59', timeZone: 'America/Chicago' });
      let wave = await h.command('wave.release', { carrierId: pickup.id, orderIds: [order.id] });
      wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: b.source.name, itemCode: b.item.barcode, quantity: '2' });
      await h.command('pick.short', { waveId: wave.id, lineId: wave.lines[0].id, reason: 'Leave the remaining two units for another walk' });
      const payload = { waveId: wave.id, orderId: order.id };
      let pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
      await h.command('pack.carton', payload);
      pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
      const path = `/api/pier/packs/${pack.id}/packing-slip`;
      for (const as of ['', 'oa_session=synthetic-pier-invalid-1']) assert.equal((await h.request(path, { as })).status, 401);
      const before = await (await h.request('/api/pier/export')).json();
      for (let read = 0; read < 2; read++) {
        const response = await h.request(path);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const html = await response.text();
        const cartons = [...html.matchAll(/<article>(.*?)<\/article>/gs)].map(match => match[1]);
        assert.equal(cartons.length, 2);
        for (const carton of cartons) {
          assert.ok(carton.includes(b.item.sku));
          assert.match(carton, /Packed: 1 each/);
          assert.ok(carton.includes(b.source.name));
        }
        for (const value of [order.reference, `Wave ${wave.number}`, 'Tote 1', pickup.dock]) assert.ok(html.includes(value));
        assert.ok(!html.includes(prior.reference));
        assert.doesNotMatch(html, /Packed: [345] each/);
      }
      const after = await (await h.request('/api/pier/export')).json();
      for (const key of ['version', 'movements', 'reservations', 'orders', 'packs', 'shipments', 'commands']) assert.deepEqual(after[key], before[key]);
      assert.equal((await h.request(`/api/pier/orders/${order.id}/packing-slip`)).status, 200);
    });


    await phase('business PDFs retain every live document kind, Unicode, aliases, packs and edited template versions', async t=>{
      const {pdfText}=await import('./pdf-text.mjs');
      const h=await installation();t.after(()=>h.close());const b=await basics(h);
      b.item=await h.command('item.save',{...b.item,name:'Brass fitting · café',packSize:'12',references:[{partyId:b.customer.id,code:'HH-FITTING'},{partyId:b.supplier.id,code:'SUP-FITTING'}]});
      await h.command('business.save',{name:'Harbor Wholesale · Québec',address:'30 Dock Road, San Francisco CA 94107',shipTo:{}});
      await h.command('sales.taxTable',{state:'CA',rate:'0',reason:'Reviewed owner estimate'});
      const po=await buy(h,b,'40'),receipt=await receive(h,b,po,'40');
      const destination={state:'CA',country:'US',postalCode:'94107'};
      let quote=await h.command('quote.create',{customerId:b.customer.id,shipTo:destination,lines:[{itemId:b.item.id,quantity:'2',unit:'case',price:'2'}]});quote=await h.command('quote.approve',{orderId:quote.id,version:quote.version,reason:'Reviewed exact case quote'});
      const order=await h.command('order.create',{customerId:b.customer.id,shipTo:destination,lines:[{itemId:b.item.id,quantity:'4',price:'2'}]});
      const carrier=await h.command('carrier.save',{name:'Dock pickup',warehouse:'North',dock:'Dock 1',cutoff:'23:59',timeZone:'America/Chicago'});
      let wave=await h.command('wave.release',{carrierId:carrier.id,orderIds:[order.id]});wave=await h.command('pick.scan',{waveId:wave.id,lineId:wave.lines[0].id,binCode:b.source.name,itemCode:b.item.barcode,quantity:'2'});await h.command('pick.short',{waveId:wave.id,lineId:wave.lines[0].id,reason:'Retain the second partial shipment'});
      let pack=await h.command('pack.scan',{waveId:wave.id,orderId:order.id,code:b.item.barcode});pack=await h.command('pack.scan',{waveId:wave.id,orderId:order.id,code:b.item.barcode});
      await h.command('pack.measure',{waveId:wave.id,orderId:order.id,carton:1,weight:'2',length:'10',width:'8',height:'6'});pack=await h.command('pack.close',{waveId:wave.id,orderId:order.id});pack=await h.command('pack.dispatch',{waveId:wave.id,orderId:order.id,shipmentReference:'HARBOR-DOCK-1'});
      const shipment=(await h.state()).shipments.find(s=>s.id===pack.shipmentId);
      let invoice=await h.command('invoice.draft',{orderId:order.id,shipmentId:shipment.id,terms:{kind:'net30'},charges:[{kind:'freight',amount:'3.00',taxable:false}]});invoice=await h.command('invoice.review',{invoiceId:invoice.id,version:invoice.version});invoice=await h.command('invoice.authorize',{invoiceId:invoice.id,version:invoice.version});
      let credit=await h.command('invoice.credit.draft',{invoiceId:invoice.id,kind:'price',reason:'Reviewed price adjustment',lines:[{invoiceLineId:invoice.lines[0].id,amount:'1.00'}]});credit=await h.command('invoice.credit.review',{creditId:credit.id,version:credit.version});credit=await h.command('invoice.credit.authorize',{creditId:credit.id,version:credit.version});
      const prepayOrder=await h.command('order.create',{customerId:b.customer.id,shipTo:destination,lines:[{itemId:b.item.id,quantity:'1',price:'2'}]});await h.command('invoice.policy',{orderId:prepayOrder.id,mode:'prepay',reason:'Customer prepay terms'});
      let prepay=await h.command('invoice.draft',{orderId:prepayOrder.id});prepay=await h.command('invoice.review',{invoiceId:prepay.id,version:prepay.version});prepay=await h.command('invoice.authorize',{invoiceId:prepay.id,version:prepay.version});
      let returned=await h.command('supplierReturn.create',{receiptId:receipt.id,reason:'Supplier agreed return',lines:[{receiptLineId:receipt.lines[0].id,quantity:'1'}]});returned=await h.command('supplierReturn.authorize',{returnId:returned.id,version:returned.version,authorizationReference:'HARBOR-RMA-1',evidence:'Supplier authorization retained'});
      const transfer=await h.command('transfer.send',{itemId:b.item.id,fromLocationId:b.source.id,toLocationId:b.destination.id,transitLocationId:b.transit.id,quantity:'1',reason:'Transfer to South'});
      const cases=[['quote',quote.id],['order-confirmation',order.id],['proforma',prepay.id],['pick-list',order.id],['packing-slip',pack.id],['invoice',invoice.id],['credit-note',credit.id],['customer-statement',b.customer.id],['purchase-order',po.id],['supplier-return-authorization',returned.id],['transfer-note',transfer.id],['shipment-manifest',shipment.id],['bill-of-lading',shipment.id]];
      const docs=[];
      for(const[kind,sourceId]of cases){
        const doc=await h.command('print.generate',{kind,sourceId,...(kind==='bill-of-lading'?{freight:{carrier:'Harbor Freight Lines',scac:'HARB',freightTerms:'Prepaid',packageCount:'1',packageType:'Carton',handlingType:'Pallet',palletSlip:'Y',netWeight:'1.5',commodity:'Brass fittings',nmfc:'12345',proNumber:'HARBOR-PRO-1',pickupDate:'2026-11-01',palletCount:'1',weight:'2',freightClass:'70',accessorials:'None',shipFrom:'30 Dock Road',shipTo:'40 Pier Road'}}:{})});docs.push(doc);
        const res=await h.request(`/api/pier/sales-documents/${doc.id}.pdf`);assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer());if(process.env.PIER_PDF_OUTPUT){const{mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.PIER_PDF_OUTPUT,{recursive:true});await writeFile(`${process.env.PIER_PDF_OUTPUT}/${kind}.pdf`,bytes);}const text=await pdfText(bytes).catch(error=>{throw new Error(`Cannot read ${kind} PDF: ${error.message}`)});
        assert.match(text,/Harbor Wholesale · Québec/);assert.match(text,/See the source record for agreed terms/);assert.ok(text.includes(doc.rendered.title));
        if(kind==='quote'){assert.match(text,/HH-FITTING/);assert.match(text,/Commercial quantity: 2 case/);assert.match(text,/Base quantity: 24 each/);}
        if(kind==='packing-slip'){assert.match(text,/Carton 1/);assert.match(text,/Base quantity: 2 each/);assert.doesNotMatch(text,/Base quantity: 4 each/);}
        if(['packing-slip','shipment-manifest','bill-of-lading'].includes(kind))assert.equal(doc.rendered.lines[0].total,'4.000000000000');
        if(kind==='invoice'){assert.match(text,/Commercial quantity: 2 each/);assert.match(text,/Base quantity: 2 each/);assert.doesNotMatch(text,/Commercial quantity: 4/);}
        if(kind==='purchase-order')assert.match(text,/SUP-FITTING/);
        if(kind==='bill-of-lading'){assert.match(text,/CUSTOMER ORDER INFORMATION/);assert.match(text,/CARRIER INFORMATION/);assert.match(text,/HARB/);assert.match(text,/SHIPPER SIGNATURE/);}
        if(process.env.PIER_PDF_OUTPUT){const{mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.PIER_PDF_OUTPUT,{recursive:true});await writeFile(`${process.env.PIER_PDF_OUTPUT}/${kind}.pdf`,bytes);}
      }
      const old=docs.find(d=>d.kind==='invoice'),bytes=Buffer.from(await(await h.request(`/api/pier/sales-documents/${old.id}.pdf`)).arrayBuffer()),template=(await h.state()).businessTemplates.find(t=>t.kind==='invoice');
      await h.command('print.template.save',{kind:'invoice',version:template.version,title:'Harbor revised invoice',terms:'Net 30 from invoice date',footer:'Thank you, Café team',remitTo:'Harbor bank details on file',emailSubject:'{{title}} {{reference}}',emailBody:'{{company}} invoice {{reference}}. {{payNowUrl}}',logo:true});
      const revised=await h.command('print.generate',{kind:'invoice',sourceId:invoice.id});assert.ok(revised.templateVersion>old.templateVersion);assert.match(await pdfText(Buffer.from(revised.pdf,'base64')),/Harbor revised invoice/);assert.deepEqual(Buffer.from(await(await h.request(`/api/pier/sales-documents/${old.id}.pdf`)).arrayBuffer()),bytes);
      assert.equal((await h.request(`/api/pier/sales-documents/${old.id}.pdf`,{as:''})).status,401);
      await h.invariant();
    });


    await phase('explicit quote and invoice PDF sends retain recipients and signed bounces become failed without resending',async t=>{
      const{generateKeyPairSync,sign}=await import('node:crypto'),{pdfText}=await import('./pdf-text.mjs');const mail=[];
      const h=await installation({bindings:{MAIL_PROVIDER:'sendgrid',MAIL_FROM:'sales@example.test',MAIL_API_KEY:'synthetic-pier-1'},outboundService:async request=>{mail.push(await request.json());return new Response(null,{status:202,headers:{'x-message-id':`synthetic-pier-${mail.length+1}`}})}});t.after(()=>h.close());const b=await basics(h);
      await h.command('business.save',{name:'Harbor Wholesale Supply',address:'30 Dock Road, San Francisco CA 94107',shipTo:{}});await h.command('sales.taxTable',{state:'CA',rate:'0',reason:'Owner reviewed test table'});
      let quote=await h.command('quote.create',{customerId:b.customer.id,shipTo:{state:'CA',country:'US'},lines:[{itemId:b.item.id,quantity:'1',price:'10'}]});quote=await h.command('quote.approve',{orderId:quote.id,version:quote.version,reason:'Owner approves exact PDF prices'});
      const sentQuote=await h.command('quote.send',{orderId:quote.id,version:quote.version,recipient:'buyer@example.test'});assert.equal((await h.state()).deliveries.find(d=>d.correspondenceId===sentQuote.id).phase,'sent');
      quote=await h.command('quote.accept',{orderId:quote.id,version:quote.version});await h.command('invoice.policy',{orderId:quote.id,mode:'prepay',reason:'Wholesale prepay'});
      let invoice=await h.command('invoice.draft',{orderId:quote.id});invoice=await h.command('invoice.review',{invoiceId:invoice.id,version:invoice.version});invoice=await h.command('invoice.authorize',{invoiceId:invoice.id,version:invoice.version});
      await h.command('payment.configure',{mode:'test',secretKey:'synthetic-pier-1',webhookSecret:'synthetic-pier-2',consent:true});const link=await h.command('invoice.payLink',{invoiceId:invoice.id,version:invoice.version});
      const generated=await h.command('print.generate',{kind:'invoice',sourceId:invoice.id}),send={documentId:generated.id,version:generated.version,recipient:'buyer@example.test'},commandId=crypto.randomUUID();
      const sentInvoice=await h.command('print.send',send,{commandId});await h.command('print.send',send,{commandId});assert.equal(mail.length,2);assert.equal(sentInvoice.recipient,'buyer@example.test');assert.equal(sentInvoice.pdf,generated.pdf);assert.ok((await pdfText(Buffer.from(generated.pdf,'base64'))).includes('Pay now'));assert.ok(sentInvoice.body.includes(link.url));
      assert.equal((await h.state()).deliveries.find(d=>d.correspondenceId===sentInvoice.id).phase,'sent');
      for(const[packet,doc]of[[mail[0],sentQuote],[mail[1],sentInvoice]]){assert.deepEqual(packet.personalizations[0].to,[{email:'buyer@example.test'}]);assert.equal(packet.attachments[0].content,doc.pdf);}
      const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});await h.command('print.delivery.configure',{version:0,provider:'sendgrid',verificationKey:keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),consent:true});
      const events=[{sg_event_id:'synthetic-pier-7',sg_message_id:'synthetic-pier-3',email:'buyer@example.test',event:'bounce',timestamp:Math.floor(Date.now()/1000)}],raw=JSON.stringify(events),timestamp=String(Math.floor(Date.now()/1000)),signature=sign('sha256',Buffer.from(timestamp+raw),keys.privateKey).toString('base64');
      assert.equal((await h.request('/api/pier/print/delivery-events',{method:'POST',as:'',body:events})).status,401);
      const options={method:'POST',as:'',body:events,headers:{'x-twilio-email-event-webhook-timestamp':timestamp,'x-twilio-email-event-webhook-signature':signature}};
      assert.equal((await h.request('/api/pier/print/delivery-events',options)).status,200);assert.equal((await h.request('/api/pier/print/delivery-events',options)).status,200);
      const state=await h.state();assert.equal(state.deliveries.find(d=>d.correspondenceId===sentInvoice.id).phase,'failed');assert.equal(state.printMailEvents.length,1);assert.equal(mail.length,2);assert.equal(state.deliveries.find(d=>d.correspondenceId===sentQuote.id).phase,'sent');
      const statement=await h.command('print.generate',{kind:'customer-statement',sourceId:b.customer.id});assert.match(await pdfText(Buffer.from(statement.pdf,'base64')),/invoiced quantities/);const sentStatement=await h.command('print.send',{documentId:statement.id,version:statement.version,recipient:'buyer@example.test'});assert.ok(sentStatement.body.includes(link.url));assert.equal(mail.length,3);assert.equal((await h.state()).deliveries.find(d=>d.correspondenceId===sentStatement.id).phase,'sent');
      let credit=await h.command('invoice.credit.draft',{invoiceId:invoice.id,kind:'price',reason:'Reviewed adjustment after retained send',lines:[{invoiceLineId:invoice.lines[0].id,amount:'1.00'}]});credit=await h.command('invoice.credit.review',{creditId:credit.id,version:credit.version});await h.command('invoice.credit.authorize',{creditId:credit.id,version:credit.version});await h.command('print.send',{documentId:generated.id,version:generated.version,recipient:'buyer@example.test'},{error:'PAY_LINK'});await h.command('print.send',{documentId:statement.id,version:statement.version,recipient:'buyer@example.test'},{error:'PAY_LINK'});assert.equal(mail.length,3);
    });
  }
});
