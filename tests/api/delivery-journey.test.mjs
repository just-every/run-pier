import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Fulfil connected orders through shipping and EDI, reconcile stock feeds and close overdue work", async () => {

  // shipping: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { createHash, createHmac } = await import("node:crypto");
    const { installation } = await import("./harness.mjs");
    const { shippingEdge } = await import("./shipping-edge.mjs");
    const { destination, packedOrder } = await import("./shipping-fixtures.mjs");

    await phase('packed order → verified rates → label → emailed tracking → delivered shipment', async t => {
      const edge = shippingEdge(), h = await installation({ outboundService: edge.outbound, bindings: { MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'synthetic-pier-322', MAIL_FROM: 'shipping@example.test' } });
      t.after(() => h.close());
      await h.command('shipping.save', { apiKey: 'synthetic-pier-321', webhookSecret: 'synthetic-pier-323', mode: 'test', fromAddress: { ...destination, name: 'Pier warehouse' } });
      const { order, pack, payload } = await packedOrder(h);
      let job = await h.command('shipping.prepare', { packId: pack.id, carton: 1, address: destination, email: 'buyer@example.test' });
      edge.redirectNext();
      await h.command('shipping.verify', { jobId: job.id, version: job.version }, { error: 'TRANSACTION' });
      assert.deepEqual(edge.unapproved, [], 'an upstream redirect cannot send approved customer address data to another destination');
      assert.equal((await h.state()).shippingJobs[0].status, 'draft');
      const act = async (type, extra = {}, opts) => { job = await h.command(type, { jobId: job.id, version: job.version, ...extra }, opts); return job; };
      await act('shipping.buy', { rateId: 'invented' }, { error: 'SHIPPING_STATE' });
      job = (await h.state()).shippingJobs[0];
      edge.undeliverable(true); await act('shipping.verify');
      assert.equal(job.verified, false);
      await act('shipping.rates', {}, { error: 'ADDRESS' }); job = (await h.state()).shippingJobs[0];
      edge.undeliverable(false); await act('shipping.verify');
      assert.equal(job.suggestedAddress.zip, '94104-1210');
      await act('shipping.address', { choice: 'original' });
      assert.equal((await h.state()).orders.find(o => o.id === order.id).shippingAddress.choice, 'original');
      // Both choices are public actions; rate the accepted provider suggestion.
      await act('shipping.verify'); await act('shipping.address', { choice: 'suggested' });
      edge.setShipmentMode('production');
      await act('shipping.rates', {}, { error: 'TRANSACTION' });
      assert.equal(edge.calls.filter(call => call.path.endsWith('/buy')).length, 0);
      edge.setShipmentMode('test');
      job = (await h.state()).shippingJobs[0];
      await act('shipping.rates');
      assert.deepEqual(new Set(job.rates.map(r => r.carrier)), new Set(['UPS','FedEx','USPS']));
      assert.equal(job.rates.find(r => r.cheapest).carrier, 'USPS');
      assert.equal(job.rates.find(r => r.fastest).carrier, 'FedEx');
      edge.loseBuy();
      const buyPayload = { jobId: job.id, version: job.version, rateId: 'rate_usps' };
      job = await h.command('shipping.buy', buyPayload, { commandId: 'buy-label-once' });
      const replay = await h.command('shipping.buy', buyPayload, { commandId: 'buy-label-once' });
      assert.deepEqual(replay, job, 'same purchase command recovers the recorded response');
      assert.equal(job.status, 'uncertain');
      let health = await (await h.request('/api/pier/integrations')).json();
      let carrier = health.connectors.find(row => row.id === 'shipping:easypost');
      assert.equal(carrier.uncertain, 1);
      assert.equal(carrier.effects.find(row => row.id === job.id).state, 'uncertain');
      assert.deepEqual(carrier.effects[0].mapping.slice(0,2), [order.id, pack.id]);
      assert.ok(carrier.attempts.some(row => row.operation === 'provider.shipping.buy' && row.outcome === 'uncertain'));
      const attempts = await (await h.request('/api/pier/audit?documentId=' + job.id)).json();
      const buyAttempt = attempts.find(event => event.type === 'provider.shipping.buy' && event.phase === 'attempt');
      assert.ok(buyAttempt);
      assert.equal(buyAttempt.outcome, 'uncertain');
      assert.equal(buyAttempt.commandId, 'buy-label-once');
      assert.ok(attempts.some(event => event.attemptId === buyAttempt.attemptId && event.phase === 'outcome' && event.outcome === 'uncertain'));
      assert.ok(attempts.some(event => event.type === 'provider.shipping.verify' && event.outcome === 'refused'));
      await h.restartWithFreshSigningKey();
      health = await (await h.request('/api/pier/integrations')).json();
      carrier = health.connectors.find(row => row.id === 'shipping:easypost');
      assert.equal(carrier.status, 'reconnect required');
      assert.equal(carrier.uncertain, 1);
      assert.deepEqual(await (await h.request('/api/pier/audit?documentId=' + job.id)).json(), attempts);
      const auditExport = await (await h.request('/api/pier/export')).json();
      for (const event of attempts) assert.deepEqual(auditExport.auditEvents.find(row => row.id === event.id), event);
      assert.ok(!JSON.stringify(attempts).includes('buyer@example.test'));
      assert.ok(!JSON.stringify(attempts).includes('synthetic-pier-321'));
      await h.command('shipping.save', { apiKey: 'synthetic-pier-321', webhookSecret: 'synthetic-pier-323', mode:'test', fromAddress: { ...destination, name:'Pier warehouse' } });
      await act('shipping.reconcile');
      health = await (await h.request('/api/pier/integrations')).json();
      carrier = health.connectors.find(row => row.id === 'shipping:easypost');
      assert.equal(carrier.uncertain, 0);
      assert.ok(carrier.lastSuccessfulRequest);
      assert.equal(carrier.effects.find(row => row.id === job.id).state, 'resolved');
      const recovery = carrier.effects.find(row => row.id === job.id).recovery;
      assert.equal(recovery.type, 'shipping.reconcile');
      const replayed = await h.command(recovery.type, recovery.payload, { commandId:'synthetic-pier-recovery-1' });
      assert.equal(replayed.status, 'labelled');
      const replayAudit = await (await h.request('/api/pier/audit?commandId=synthetic-pier-recovery-1')).json();
      assert.ok(replayAudit.some(event => event.type === 'shipping.complete' && event.outcome === 'accepted'));
      job = replayed;
      assert.ok(!JSON.stringify(health).includes('synthetic-pier-321'));
      assert.ok(!JSON.stringify(health).includes('buyer@example.test'));
      assert.equal(job.status, 'labelled'); assert.equal(job.mail.status, 'sent');
      assert.equal(edge.emails.length, 1);
      assert.ok(edge.emails[0].content.some(c => c.value.includes(job.trackingCode)));
      await act('shipping.email'); assert.equal(edge.emails.length, 1);
      assert.equal((await h.state()).reservations.length, 1, 'buying a label does not dispatch stock');
      for (const format of ['pdf','zpl']) {
        const res = await h.request(`/api/pier/shipping/labels/${job.id}.${format}`);
        assert.equal(res.status, 200, await res.clone().text());
        const label = await res.text();
        if (format === 'pdf') { assert.match(res.headers.get('content-type'), /application\/pdf/); assert.ok(label.startsWith('%PDF-')); }
        else { assert.ok(label.startsWith('^XA')); assert.ok(label.includes(job.trackingCode)); }
      }
      const dispatched = await h.command('pack.dispatch', { ...payload, shipmentReference: job.trackingCode });
      const shipment = (await h.state()).shipments.find(s => s.id === dispatched.shipmentId);
      assert.equal(shipment.tracking[0].trackingCode, job.trackingCode);
      edge.delivered();
      const event = JSON.stringify({ id: 'evt_synthetic_delivered', description: 'tracker.updated', mode: 'test', result: { id: 'trk_synthetic' } });
      const timestamp = String(Math.floor(Date.now() / 1000)), path = '/api/pier/shipping/webhook';
      const signature = createHmac('sha256', 'synthetic-pier-323').update(`${timestamp}POST${path}${event}`).digest('hex');
      const staleTimestamp = String(Number(timestamp) - 120);
      const staleSignature = createHmac('sha256', 'synthetic-pier-323').update(`${staleTimestamp}POST${path}${event}`).digest('hex');
      assert.equal((await fetch(h.origin + path, { method:'POST', headers:{'x-timestamp':staleTimestamp,'x-path':path,'x-hmac-signature-v2':staleSignature}, body:event })).status,401);
      const notify = sig => fetch(h.origin + path, { method: 'POST', headers: { 'x-timestamp': timestamp, 'x-path': path, 'x-hmac-signature-v2': `hmac-sha256-hex=${sig}` }, body: event });
      assert.equal((await notify('0'.repeat(64))).status, 401);
      const response = await notify(signature); assert.equal(response.status, 200, await response.text());
      assert.equal((await notify(signature)).status, 200);
      let channel = await h.command('channel.save', { provider: 'stall', name: 'Tracking projection', baseUrl: 'https://trade.example.test', warehouse: 'North', enabled: false, credentials: { accessToken: 'synthetic-pier-17' } });
      const key = 'synthetic-pier-11-tracking-buyer-credential';
      channel = await h.command('channel.save', { id: channel.id, version: channel.version, provider: 'stall', name: 'Tracking projection', baseUrl: 'https://trade.example.test', warehouse: 'North', enabled: true, credentials: { accessToken: 'synthetic-pier-17' } });
      await h.command('trade.grant', { channelId: channel.id, version: channel.version, buyerId: 'tracking', customerId: order.customerId, itemIds: [order.lines[0].itemId], keyHash: createHash('sha256').update('pier-trade-buyer\0' + key).digest('hex'), shipTo: { country: 'US', postalCode: '94104' } });
      const projection = await (await h.request('/api/pier/trade/catalog', { as: '', headers: { authorization: `Bearer ${key}` } })).json();
      assert.deepEqual(projection.orders.map(row => row.id), [order.id]);
      assert.deepEqual(projection.orders[0].shipments, [{ id: shipment.id, reference: shipment.reference, createdAt: shipment.createdAt, deliveryStatus: 'delivered', tracking: [{ trackingCode: job.trackingCode, trackingStatus: 'delivered', mode: 'test' }] }]);
      assert.equal(JSON.stringify(projection).includes('labelUrl'), false);
      const state = await h.invariant();
      assert.equal(state.shipments[0].deliveryStatus, 'delivered'); assert.ok(state.shipments[0].closedAt);
      assert.equal(state.orders.find(o => o.id === order.id).deliveryStatus, 'delivered');
      assert.equal(state.shippingJobs[0].events.length, 3);
      assert.equal(edge.calls.filter(c => c.path.endsWith('/buy')).length, 1);
      assert.equal(JSON.stringify(state).includes('synthetic-pier-321'), false);
      const beforeRevoke = edge.calls.length;
      await h.command('shipping.disconnect', { version: state.shippingSettings[0].version });
      await h.restart();
      assert.equal((await notify(signature)).status,409);
      assert.equal((await h.request(`/api/pier/shipping/labels/${job.id}.pdf`)).status,409);
      await h.command('shipping.track', { jobId: job.id, version: state.shippingJobs[0].version }, { error:'SHIPPING_KEY' });
      assert.equal(edge.calls.length, beforeRevoke, 'revocation survives restart and stops future carrier reads');
      health = await (await h.request('/api/pier/integrations')).json();
      assert.equal(health.connectors.find(row => row.id === 'shipping:easypost').status, 'paused');
      const managedEdge = shippingEdge(), managed = await installation({ outboundService: managedEdge.outbound, bindings: { RER_OWNER_CLAIM_ISSUER: 'https://managed.example.test' } });
      t.after(() => managed.close());
      await managed.command('shipping.save', { apiKey: 'synthetic-pier-321', mode: 'test', fromAddress: destination });
      const managedPack = await packedOrder(managed);
      const managedJob = await managed.command('shipping.prepare', { packId: managedPack.pack.id, carton: 1, address: destination, email: 'buyer@example.test' });
      await managed.command('shipping.verify', { jobId: managedJob.id, version: managedJob.version }, { error: 'SHIPPING_UNAVAILABLE' });
      assert.equal(managedEdge.calls.length, 0, 'Managed never attempts provider egress');
      assert.ok((await managed.state()).shippingUnavailable);

    });
  }

  // edi: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { readFile } = await import("node:fs/promises");
    const { installation } = await import("./harness.mjs");


    const segments = raw => raw.split('~').map(s => s.trim().split('*')).filter(s => s[0]);

    function validate(raw, kind) {
      const s = segments(raw), st = s.findIndex(r => r[0] === 'ST'), se = s.findIndex(r => r[0] === 'SE');
      assert.equal(s[st][1], kind);
      assert.equal(Number(s[se][1]), se - st + 1);
      assert.equal(s[se][2], s[st][2]);
      assert.equal(s.at(-1)[2], s[0][13]);
      assert.equal(s.at(-2)[2], s[1][6]);
      assert.equal(s[0].join('*').length, 105);
      return s;
    }

    const ssccDigit = value => {
      let sum = 0;
      [...value.slice(0,17)].reverse().forEach((n,i) => sum += Number(n) * (i % 2 ? 1 : 3));
      return String((10-sum%10)%10);
    };


    await phase('retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge', async t => {
      const traffic = [];
      let loseResponse = false;
      const h = await installation({ bindings: { EDI_BRIDGE_URL: 'https://edi-edge.example.test/documents', EDI_BRIDGE_TOKEN: 'synthetic-network-edge-token' }, outboundService: async request => {
        assert.equal(request.url, 'https://edi-edge.example.test/documents');
        const body = await request.json();
        assert.equal(request.headers.get('idempotency-key'), body.documentId);
        validate(body.x12, body.kind);
        traffic.push(body);
        if (loseResponse) throw new Error("Synthetic bridge response loss");
        const receipt = JSON.parse(await readFile('tests/fixtures/edi/bridge-accepted.json', 'utf8'));
        return Response.json({ ...receipt, documentId: body.documentId });
      } });
      t.after(() => h.close());
      const mug = await h.command('item.save', { sku:'MUG-BLUE', name:'Blue mug', unit:'each', barcode:'036000291452', packSize:'1' });
      const towel = await h.command('item.save', { sku:'TOWEL', name:'Tea towel', unit:'each', barcode:'4006381333931', packSize:'1' });
      const bin = await h.command('location.save', { name:'A-14', warehouse:'West', kind:'bin', barcode:'BIN-A14' });
      const customer = await h.command('party.save', { name:'Synthetic retailer DC 0593', kind:'customer' });
      const supplier = await h.command('party.save', { name:'Synthetic ceramics supplier', kind:'supplier' });
      let po = await h.command('po.draft', {supplierId:supplier.id,promiseDate:'2026-11-01',reason:'EDI stock',lines:[{itemId:mug.id,quantity:'20',price:'1'},{itemId:towel.id,quantity:'20',price:'0.5'}]});
      await h.command('po.approve',{poId:po.id,version:po.version});
      po = await h.command('po.commit',{poId:po.id,version:po.version});
      await h.command('receipt.create',{poId:po.id,supplierReference:'EDI-RECEIPT',lines:po.lines.map(l=>({poLineId:l.id,locationId:bin.id,quantity:'20',cost:'1'}))});
      await h.command('location.save',{name:'synthetic-pier-East',warehouse:'East',kind:'bin'});
      const partner = await h.command('edi.partner.save',{name:'Synthetic retailer',customerId:customer.id,warehouse:'East',senderId:'PIER',receiverId:'RETAILER',gs1Prefix:'0614141',ackMinutes:1440,asnBeforeArrivalMinutes:120,invoiceMinutes:1440,transport:'pending'});
      let route=await h.command('routing.save',{source:`edi:${partner.id}`,mode:'rules',shortage:'hold',zones:[{name:'Oregon DC',zipPrefixes:[],states:['OR'],countries:[],eligible:['West','East']}],defaultEligible:['East','West']});route=await h.command('routing.preview',{ruleId:route.id,version:route.version});await h.command('routing.activate',{ruleId:route.id,version:route.version});
      await h.command('edi.mapping.save',{partnerId:partner.id,buyerCode:'MUG-BLUE',upc:'036000291452',itemId:mug.id,unit:'EA',packQuantity:'1'});
      const x12 = await readFile('tests/fixtures/edi/850-synthetic.x12','utf8');
      await h.command('edi.receive',{partnerId:partner.id,x12:x12.replace('SE*','SE*999')},{error:'EDI_850'});
      let incoming = await h.command('edi.receive',{partnerId:partner.id,x12});
      assert.equal(incoming.status,'blocked');
      assert.ok(incoming.lines.some(l=>l.blocker && l.identifiers.some(i=>i.value==='TOWEL')));
      assert.equal((await h.state()).orders.length,0);
      assert.ok((await h.state()).edi.due.some(d=>d.kind==='855'&&d.status==='required'));
      assert.equal(traffic.length,1); // syntax acknowledgment sent despite unresolved business items
      const fa=validate(traffic[0].x12,'997');
      assert.deepEqual(fa.find(r=>r[0]==='AK1').slice(1),['PO',incoming.groupControl]);
      assert.deepEqual(fa.find(r=>r[0]==='AK5').slice(1),['A']);
      await h.command('edi.mapping.save',{partnerId:partner.id,buyerCode:'TOWEL',upc:'4006381333931',itemId:towel.id,unit:'EA',packQuantity:'1'});
      incoming = await h.command('edi.acknowledge',{ediOrderId:incoming.id,version:incoming.version,lines:incoming.lines.map((l,i)=>({lineId:l.id,decision:['accept','change','reject'][i],quantity:['4','2','0'][i],reason:i?'Retailer approved short / unavailable item':''}))});
      const ack = validate(incoming.x12,'855');
      assert.deepEqual(ack.filter(r=>r[0]==='ACK').map(r=>r.slice(1,4)),[['IA','4','EA'],['IQ','2','EA'],['IR','0','EA']]);
      await h.command('edi.send',{documentId:incoming.id,version:incoming.version});
      let state=await h.state(), ediOrder=state.ediOrders[0], order=state.orders[0];
      assert.equal(order.channel,'edi');assert.equal(order.channelReference,ediOrder.poNumber);
      assert.equal(order.warehouse,'West');assert.equal(order.routing.zone,'Oregon DC');assert.equal(order.routing.source,`edi:${partner.id}`);assert.equal(order.lines.length,2);
      assert.equal(order.lines[1].cancelled,'1');
      await h.command('edi.receive',{partnerId:partner.id,x12});
      assert.equal((await h.state()).orders.length,1);
      assert.equal(traffic.filter(d=>d.kind==='997').length,1);
      await h.command('edi.invoice.prepare',{ediOrderId:ediOrder.id,shipmentId:'absent'},{error:'NOT_FOUND'});
      const carrier=await h.command('carrier.save',{name:'Retailer routing',warehouse:'West',dock:'Dock A',cutoff:'23:59',timeZone:'America/Chicago'});
      await h.command('order.carrier',{orderId:order.id,carrierId:carrier.id});
      let wave=await h.command('wave.release',{carrierId:carrier.id,orderIds:[order.id]});
      for(const line of wave.lines) wave=await h.command('pick.scan',{waveId:wave.id,lineId:line.id,binCode:'BIN-A14',itemCode:line.itemId===mug.id?'036000291452':'4006381333931',quantity:line.quantity});
      let pack;
      for (const [code,count] of [['036000291452',4],['4006381333931',2]]) {
        if(pack) await h.command('pack.carton',{waveId:wave.id,orderId:order.id});
        for(let i=0;i<count;i++) pack=await h.command('pack.scan',{waveId:wave.id,orderId:order.id,code});
      }
      for(const carton of pack.cartons) pack=await h.command('pack.measure',{waveId:wave.id,orderId:order.id,carton:carton.number,weight:'3',length:'12',width:'10',height:'8'});
      pack=await h.command('pack.close',{waveId:wave.id,orderId:order.id});
      const asn=await h.command('edi.asn.prepare',{ediOrderId:ediOrder.id,packId:pack.id,pickupAt:new Date(Date.now()+3600000).toISOString(),arrivalAt:new Date(Date.now()+86400000).toISOString(),shipmentReference:'EDI-SHIP-1'});
      const sh=validate(asn.x12,'856');
      assert.deepEqual(sh.filter(r=>r[0]==='HL').map(r=>r[3]),['S','O','P','I','P','I']);
      assert.equal(sh.find(r=>r[0]==='PRF')[1],ediOrder.poNumber);
      assert.deepEqual(sh.filter(r=>r[0]==='SN1').map(r=>r.slice(2,4)),[['4','EA'],['2','EA']]);
      for(const carton of asn.cartons){
        assert.equal(carton.sscc[17],ssccDigit(carton.sscc));
        assert.ok(sh.some(r=>r[0]==='MAN'&&r[1]==='GM'&&r[2]==='00'+carton.sscc));
        const print=await h.command('edi.label.print',{documentId:asn.id,sscc:carton.sscc,reason:'Initial carton'});
        assert.match(print.svg,new RegExp(carton.sscc));assert.match(print.zpl,new RegExp('>800'+carton.sscc));
        const html=await h.request(`/api/pier/edi/labels/${asn.id}/${carton.sscc}`);assert.equal(html.status,200);assert.ok((await html.text()).includes(carton.sscc));
      }
      await h.command('edi.send',{documentId:asn.id,version:asn.version});
      const reprint=await h.command('edi.label.reprint',{documentId:asn.id,sscc:asn.cartons[0].sscc,reason:'Damaged label'});
      assert.equal(reprint.sscc,asn.cartons[0].sscc);
      assert.equal((await h.state()).ediDocuments.find(d=>d.id===asn.id).x12,asn.x12);
      pack=await h.command('pack.dispatch',{waveId:wave.id,orderId:order.id,shipmentReference:'EDI-SHIP-1'});
      const invoice=await h.command('edi.invoice.prepare',{ediOrderId:ediOrder.id,shipmentId:pack.shipmentId});
      const inv=validate(invoice.x12,'810');assert.equal(inv.find(r=>r[0]==='TDS')[1],'1200');
      assert.deepEqual(inv.filter(r=>r[0]==='IT1').map(r=>r.slice(2,5)),[['4','EA','2.50'],['2','EA','1.00']]);
      await h.command('edi.send',{documentId:invoice.id,version:invoice.version});
      state=await h.invariant();
      assert.deepEqual(traffic.map(d=>d.kind),['997','855','856','810']);
      assert.ok(state.ediDocuments.filter(d=>d.direction==='outbound'&&d.kind!=='997').every(d=>d.status==='sent'&&d.onTime));
      assert.equal(state.ediDocuments.find(d=>d.kind==='856').cartons.length,2);
      const reject = (await readFile('tests/fixtures/edi/997-rejected.x12','utf8')).replace('AK1*PR*103','AK1*PR*2').replace('AK2*855*000000103','AK2*855*000000002');
      await h.command('edi.997.receive',{partnerId:partner.id,x12:reject});
      assert.ok((await h.state()).edi.exceptions.some(e=>e.kind==='functional acknowledgment rejected'));
      loseResponse=true;
      const second=x12.replaceAll('000000101','000000102').replaceAll('*101*','*102*').replaceAll('*101~','*102~').replaceAll('0101','0102').replaceAll('PO-SYN-101','PO-SYN-102');
      const waiting=await h.command('edi.receive',{partnerId:partner.id,x12:second});
      state=await h.state();const uncertain=state.ediDocuments.find(d=>d.id===waiting.acknowledgmentDocumentId);
      assert.equal(uncertain.status,'uncertain');
      await h.restart();
      let ediHealth = (await (await h.request('/api/pier/integrations')).json()).connectors.find(row => row.id === partner.id);
      assert.equal(ediHealth.uncertain, 1);
      assert.ok(ediHealth.effects.some(row => row.id === uncertain.id && row.state === 'uncertain'));
      assert.ok(ediHealth.attempts.some(row => row.operation === 'provider.edi.send' && row.outcome === 'uncertain'));
      assert.ok(!JSON.stringify(ediHealth).includes('synthetic-network-edge-token'));
      assert.ok(!JSON.stringify(ediHealth).includes(x12));
      const attempts=traffic.length;
      await h.command('edi.send',{documentId:uncertain.id,version:uncertain.version});
      assert.equal(traffic.length,attempts,'uncertain sends require reconciliation instead of a blind repeat');
      await h.command('edi.send.result',{documentId:uncertain.id,version:uncertain.version,status:'accepted'},{error:'EDI_INTERNAL'});
      await h.command('edi.send.reconcile',{documentId:uncertain.id,version:uncertain.version,outcome:'accepted',providerId:'synthetic-pier-8911',sentAt:new Date().toISOString(),reason:'Verified retained bridge intake for the exact document identity'});
      ediHealth = (await (await h.request('/api/pier/integrations')).json()).connectors.find(row => row.id === partner.id);
      assert.equal(ediHealth.uncertain, 0);
      assert.ok(ediHealth.effects.find(row => row.id === uncertain.id).mapping.includes('synthetic-pier-8911'));
      const currentPartner=(await h.state()).ediPartners.find(row => row.id === partner.id);
      await h.command('edi.partner.save',{...currentPartner,enabled:false});
      await h.restart();
      assert.equal((await (await h.request('/api/pier/integrations')).json()).connectors.find(row => row.id === partner.id).status,'paused');
      assert.equal(traffic.length,attempts);

      const managed=await installation({bindings:{RER_MANAGEMENT_ORIGIN:'https://runeditrun.com',EDI_BRIDGE_URL:'https://edi-edge.example.test/documents',EDI_BRIDGE_TOKEN:'synthetic-token'},outboundService:()=>{throw new Error('Managed must never make provider egress');}});
      try {
        const cust=await managed.command('party.save',{name:'Managed synthetic retailer',kind:'customer'});
        await managed.command('location.save',{name:'D-01',warehouse:'West',kind:'bin'});
        const retail=await managed.command('edi.partner.save',{name:'Managed retailer',customerId:cust.id,warehouse:'West',senderId:'PIER',receiverId:'RETAILER',gs1Prefix:'0614141',ackMinutes:1440,asnBeforeArrivalMinutes:120,invoiceMinutes:1440,transport:'pending'});
        await managed.command('edi.receive',{partnerId:retail.id,x12});
        const queued=(await managed.state()).ediDocuments.find(d=>d.kind==='997');
        assert.equal(queued.status,'unavailable');assert.equal(queued.attempted,undefined);assert.match(queued.problem,/not available yet/);
      } finally {await managed.close();}

    });
  }

  // dispatch: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");
    const { shippingEdge } = await import("./shipping-edge.mjs");
    const { destination } = await import("./shipping-fixtures.mjs");


    const localDate = (at, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));

    const localTime = (at, zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));


    await phase('WMS-003: twenty due orders, eighteen dispatches and a retained close reconcile independently', async t => {
      // Select a real warehouse zone before 16:00, without changing the Worker clock.
      const zone = ['Pacific/Honolulu', 'America/Chicago', 'Europe/London', 'Asia/Tokyo'].find(z => localTime(Date.now(), z) < '15:30');
      assert.ok(zone);
      const today = localDate(Date.now(), zone);
      let edge = shippingEdge();
      const h = await installation({ outboundService: request => edge.outbound(request) });
      t.after(() => h.close());
      const b = await basics(h);
      await receive(h, b, await buy(h, b, '40'), '40');
      const carrier = await h.command('carrier.save', { name: 'Daily parcel', warehouse: 'North', dock: 'Dock A', cutoff: '16:00', timeZone: zone });
      await h.command('shipping.save', { apiKey: 'EZTK_synthetic', mode: 'test', fromAddress: destination });
      const later = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const orders = [];
      for (let i = 0; i < 20; i++) {
        const order = await h.command('order.create', { warehouse: 'North', customerId: b.customer.id, promiseDate: i === 19 ? later : today, lines: [{ itemId: b.item.id, quantity: '2', price: '3' }] });
        await h.command('order.carrier', { orderId: order.id, carrierId: carrier.id, ...(i === 19 ? { shipByDate: today } : {}) }); orders.push(order);
      }
      const board = async () => {
        const response = await h.request(`/api/pier/dispatch-summary?${new URLSearchParams({ date: today, timeZone: zone, warehouse: 'North' })}`);
        assert.equal(response.status, 200); return response.json();
      };
      await h.command('order.carrier', { orderId: orders[19].id, carrierId: carrier.id, shipByDate: '2026-02-30' }, { error: 'DATE' });
      let view = await board();
      assert.equal(view.counts['to pick'], 20);
      assert.equal(view.orders.length, 20);
      assert.equal(view.orders.find(o => o.orderId === orders[19].id).dueDate, today, 'reviewed ship-by date takes precedence over later promise');
      // Public dispatch state is independent of labels and pick/pack status.
      let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: orders.slice(0, 19).map(o => o.id) });
      const short = wave.lines.find(l => l.orderId === orders[18].id);
      await h.command('pick.short', { waveId: wave.id, lineId: short.id, reason: 'Physical bin short' });
      for (let i = 0; i < 18; i++) {
        const order = orders[i], line = wave.lines.find(l => l.orderId === order.id);
        await h.command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: 'A1', itemCode: '10001', quantity: '1' });
        view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'picking');
        await h.command('pick.scan', { waveId: wave.id, lineId: line.id, binCode: 'A1', itemCode: '10001', quantity: '1' });
        view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'picked');
        const payload = { waveId: wave.id, orderId: order.id };
        for (let unit = 0; unit < 2; unit++) await h.command('pack.scan', { ...payload, code: '10001' });
        await h.command('pack.measure', { ...payload, carton: 1, weight: '2.5', length: '12', width: '8', height: '4' });
        const pack = await h.command('pack.close', payload);
        view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'packed');
        edge = shippingEdge(); // Fresh synthetic provider transaction, solely at the paid network edge.
        let job = await h.command('shipping.prepare', { packId: pack.id, carton: 1, address: destination, email: 'dispatch@example.test' });
        for (const [type, extra] of [['shipping.verify', {}], ['shipping.address', { choice: 'suggested' }], ['shipping.rates', {}], ['shipping.buy', { rateId: 'rate_usps' }]])
          job = await h.command(type, { jobId: job.id, version: job.version, ...extra });
        view = await board(); assert.equal(view.orders.find(o => o.orderId === order.id).state, 'labeled');
        assert.equal(view.counts.shipped, i, 'a label never posts dispatch');
        await h.command('pack.dispatch', { ...payload, shipmentReference: `WMS-003-${i}` });
        view = await board(); assert.equal(view.counts.shipped, i + 1);
        assert.equal(Object.values(view.counts).reduce((n, count) => n + count, 0), 20);
      }
      const state = await h.invariant();
      const shipments = state.shipments.filter(sh => localDate(sh.createdAt, zone) === today);
      assert.equal(new Set(shipments.map(sh => sh.orderId)).size, 18);
      assert.equal(shipments.reduce((n, sh) => n + sh.lines.reduce((m, l) => m + Number(l.quantity), 0), 0), 36);
      assert.equal(view.ordersShipped, 18); assert.equal(view.units, '36');
      assert.deepEqual(view.atRisk.map(o => [o.orderId, o.reason, o.beforeCutoff]).sort(), [[orders[18].id, 'short', true], [orders[19].id, 'unpicked', true]].sort());
      const closed = await h.command('dispatch.close', { date: today, timeZone: zone, warehouse: 'North' });
      assert.equal(closed.summary.ordersShipped, 18); assert.equal(closed.summary.units, '36');
      assert.equal(closed.summary.lastShipmentAt, shipments.map(sh => localTime(sh.createdAt, zone)).sort().at(-1));
      assert.deepEqual(closed.summary.exceptions.filter(e => e.kind === 'not shipped').map(e => [e.orderId, e.boardReason]).sort(), [[orders[18].id, 'short'], [orders[19].id, 'unpicked']].sort());
      const exported = await (await h.request('/api/pier/export')).json();
      assert.equal(exported.dispatchDays.find(d => d.id === closed.id).summary.ordersShipped, 18);
      const report = await (await h.request(`/api/pier/reports?${new URLSearchParams({ asOf: new Date().toISOString().slice(0, 10) })}`)).json();
      if (today <= report.asOf) assert.equal(report.overdueOrders.closedDays.find(d => d.id === closed.id).missed.length, 2);
      const other = await h.request(`/api/pier/dispatch-summary?${new URLSearchParams({ date: today, timeZone: zone, warehouse: 'South' })}`);
      assert.equal((await other.json()).orders.length, 0);
    });
  }

  // stock: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, parse } = await import("./harness.mjs");
    const { stockJourney } = await import("./stock-fixtures.mjs");



    await phase('STOCK-001: warehouse and company stock reconcile to exported movements, reservations and destination POs', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await stockJourney(h);
      const state = await h.state();
      const exported = await (await h.request('/api/pier/export')).json();
      const zero = () => ({ onHand: 0n, reserved: 0n, available: 0n, quarantine: 0n, transit: 0n, expected: 0n });
      const warehouses = new Map();
      const at = warehouse => { if (!warehouses.has(warehouse)) warehouses.set(warehouse, zero()); return warehouses.get(warehouse); };
      for (const m of exported.movements.filter(m => m.itemId === b.item.id)) {
        const q = at(exported.locations.find(l => l.id === m.locationId).warehouse);
        q[m.status === 'sellable' ? 'onHand' : m.status] += BigInt(m.quantity);
      }
      for (const r of exported.reservations.filter(r => r.itemId === b.item.id)) at(exported.locations.find(l => l.id === r.locationId).warehouse).reserved += BigInt(r.quantity);
      for (const hold of exported.channelHolds.filter(row => !row.releasedAt && row.itemId === b.item.id)) for (const allocation of hold.allocations) at(exported.locations.find(l => l.id === allocation.locationId).warehouse).reserved += BigInt(allocation.quantity);
      for (const po of exported.purchaseOrders.filter(po => po.status === 'committed')) for (const line of po.lines) if (line.itemId === b.item.id) at(line.destinationWarehouse ?? po.destinationWarehouse).expected += parse(line.quantity) - parse(line.received);
      const total = zero();
      for (const [warehouse, q] of warehouses) {
        q.available = q.onHand - q.reserved;
        const actual = state.warehouseStocks.find(row => row.itemId === b.item.id && row.warehouse === warehouse);
        for (const field of Object.keys(q)) { assert.equal(parse(actual[field]), q[field], `${warehouse}: ${field}`); total[field] += q[field]; }
      }
      const company = state.companyStocks.find(row => row.itemId === b.item.id);
      for (const field of Object.keys(total)) assert.equal(parse(company[field]), total[field], `Company: ${field}`);
      assert.equal(state.warehouseStocks.find(row => row.warehouse === 'South').expected, '13');
      assert.equal(state.warehouseStocks.filter(row => row.itemId === b.item.id).length, warehouses.size);
      assert.ok(!state.positions.some(row => row.itemId === state.items.find(row => row.sku === 'EMPTY').id));
      for (const p of state.stockPositions) {
        const amount = exported.movements.filter(m => m.itemId === p.itemId && m.locationId === p.locationId && m.status === p.status).reduce((n, m) => n + BigInt(m.quantity), 0n);
        const reserved = p.status !== 'sellable' ? 0n : exported.reservations.filter(r => r.itemId === p.itemId && r.locationId === p.locationId).reduce((n, r) => n + BigInt(r.quantity), 0n) + exported.channelHolds.filter(h => !h.releasedAt && h.itemId === p.itemId).flatMap(h => h.allocations).filter(a => a.locationId === p.locationId).reduce((n, a) => n + BigInt(a.quantity), 0n);
        assert.equal(parse(p.quantity), amount); assert.equal(parse(p.reserved), reserved);
        assert.equal(parse(p.available), p.status === 'sellable' ? amount - reserved : 0n);
      }
    });



    await phase('stock consumers resume only acknowledged pages and replay stable events after Worker restart', async t => {
      const h = await installation(); t.after(() => h.close());
      const b = await stockJourney(h);
      // Upgrade fixture: business stock predates the newly installed journal tables.
      await h.db.batch([h.db.prepare('DELETE FROM pier_stock_events'),h.db.prepare('DELETE FROM pier_stock_feed_bootstrap')]);
      const page = async (consumer = 'synthetic-pier-1', checkpoint = '', as) => {
        const response = await h.request(`/api/pier/stock-changes?consumer=${consumer}&limit=2${checkpoint ? '&checkpoint='+checkpoint : ''}`, {as});
        assert.equal(response.status,200,await response.clone().text()); return response.json();
      };
      const ack = async (p, as) => {
        const response = await h.request('/api/pier/stock-changes/ack', {method:'POST',as,body:{consumer:p.consumer,checkpoint:p.pageToken}});
        assert.equal(response.status,200,await response.clone().text()); return response.json();
      };
      assert.equal((await h.request('/api/pier/stock-changes?consumer=anonymous',{as:''})).status,401);
      assert.equal((await h.request('/api/pier/stock-changes?consumer=invalid&limit=101')).status,400);
      const first = await page(); assert.equal(first.events.length,2); await ack(first);
      const healthClock = new Date(Date.parse(first.events[0].at) + 120000).toISOString();
      let health = await (await h.request('/api/pier/integrations', { headers:{'x-pier-test-now':healthClock} })).json();
      let consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-1');
      assert.equal(consumer.cursor, String(first.events.at(-1).sequence));
      assert.ok(consumer.lastSuccessfulSync);
      assert.equal(consumer.uncertain, 0);
      assert.equal(consumer.lagSeconds,120);
      assert.equal(health.observedAt,healthClock);
      assert.equal(consumer.pending,(await h.state()).positions.length-first.events.length);
      const interrupted = await page(); assert.ok(interrupted.events[0].sequence>first.events.at(-1).sequence);
      await h.restartWithFreshSigningKey();
      assert.deepEqual(await page(),interrupted,'fetch never advances the acknowledged checkpoint');
      assert.deepEqual(await page(first.consumer,first.pageToken),interrupted);
      health = await (await h.request('/api/pier/integrations')).json();
      consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-1');
      assert.deepEqual(consumer.effects[0].mapping, interrupted.events.map(event => event.eventId));
      assert.equal(consumer.cursor, String(first.events.at(-1).sequence));
      const processed = new Map(), ids = [];
      for (const event of first.events) { processed.set(event.eventId,event); ids.push(event.eventId); }
      // Replaying an unacknowledged page upserts the same event identities.
      for (const event of [...interrupted.events,...(await page()).events]) processed.set(event.eventId,event);
      assert.equal(processed.size,first.events.length+interrupted.events.length);
      await ack(interrupted); await ack(interrupted);
      assert.equal((await h.request('/api/pier/stock-changes/ack',{method:'POST',body:{consumer:first.consumer,checkpoint:first.pageToken}})).status,409);
      assert.equal((await h.request('/api/pier/stock-changes?consumer=foreign&checkpoint='+interrupted.pageToken)).status,409);
      ids.push(...interrupted.events.map(e=>e.eventId));
      let p = await page();
      while (true) {
        for (const event of p.events) { ids.push(event.eventId); processed.set(event.eventId,event); }
        await ack(p); if (!p.hasMore) break; p = await page();
      }
      const journal = (await (await h.mf.getD1Database('DB')).prepare('SELECT id FROM pier_stock_events ORDER BY sequence').all()).results.map(r=>r.id);
      assert.deepEqual(ids,journal,'pagination includes each committed event once, in durable total order');
      const latest = new Map(); for (const event of processed.values()) latest.set(JSON.stringify([event.itemId,event.locationId,event.status]),event);
      for (const position of (await h.state()).positions) {
        const actual=latest.get(JSON.stringify([position.itemId,position.locationId,position.status]));
        for (const key of ['quantity','reserved','held','available']) assert.equal(actual[key],position[key]);
      }
      assert.ok(p.lagSeconds>=0); assert.ok(p.observedAt);
      const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});
      const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
      const session=await(await h.request('/auth/session',{as:cookie})).json();
      await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['North'],locationIds:[b.source.id]}});
      assert.equal((await h.request('/api/pier/integrations',{as:cookie})).status,403);
      assert.equal((await h.request('/api/pier/integrations',{as:''})).status,401);
      const scopedPage=await page('synthetic-pier-2','',cookie);
      assert.ok(scopedPage.events.length); assert.ok(scopedPage.events.every(e=>e.locationId===b.source.id));
      for (const event of scopedPage.events) assert.deepEqual(Object.keys(event).sort(),['eventId','sequence','at','itemId','locationId','status','quantity','reserved','held','available','expiredOrBlocked','traceUnavailable'].sort());
      assert.equal((await h.request('/api/pier/stock-changes/ack',{method:'POST',as:cookie,body:{consumer:scopedPage.consumer,checkpoint:interrupted.pageToken}})).status,409);
      await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['South'],locationIds:[]}});
      assert.equal((await h.request('/api/pier/stock-changes?consumer=synthetic-pier-2',{as:cookie})).status,409,'changed grants invalidate checkpoints');
      health = await (await h.request('/api/pier/integrations')).json();
      consumer = health.connectors.find(row => row.name === 'Stock consumer synthetic-pier-2');
      assert.equal(consumer.status, 'authority changed');
      assert.equal(consumer.failed, 1);
      const expiresAt = new Date(Date.now()+3600000).toISOString();
      await h.command('role.set',{operatorId:session.operator.id,role:'viewer',permissions:{warehouses:['North'],locationIds:[b.source.id],expiresAt}});
      await page('synthetic-pier-expiry','',cookie);
      const afterExpiry = new Date(Date.parse(expiresAt)+60000).toISOString();
      const expiredHealth = await (await h.request('/api/pier/integrations',{headers:{'x-pier-test-now':afterExpiry}})).json();
      assert.equal(expiredHealth.connectors.find(row => row.name === 'Stock consumer synthetic-pier-expiry').status,'authority changed');
      assert.equal((await h.request('/api/pier/stock-changes?consumer=synthetic-pier-expiry',{as:cookie,headers:{'x-pier-test-now':afterExpiry}})).status,403);
    });
  }

  // operational-exceptions: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


    await phase('overdue cases deduplicate, retain assignment after restart, escalate unanswered work and require current owner cancellation', async t => {
      let submissions=0;
      const edge={now:'2026-11-02T12:00:00.000Z',bindings:{MAIL_PROVIDER:'resend',MAIL_FROM:'buyer@example.test',MAIL_API_KEY:'synthetic-pier-case-1'},async outboundService(request){assert.equal(new URL(request.url).hostname,'api.resend.com');submissions++;throw new Error('Synthetic uncertainty after submission');}};
      const h=await installation(edge); t.after(()=>h.close()); const b=await basics(h);
      const po=await buy(h,b,'4');
      const order=await h.command('order.create',{customerId:b.customer.id,promiseDate:'2026-11-01',lines:[{itemId:b.item.id,quantity:'2',price:'1'}]});
      const id=(await h.state()).actor.id;
      await h.command('exception.policy',{version:0,enabled:true,assigneeId:id,escalationOwnerId:id,dueHours:1});
      assert.equal((await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(edge.now),cron:'* * * * *'})).outcome,'ok');
      assert.equal((await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(Date.parse(edge.now)+60000),cron:'* * * * *'})).outcome,'ok');
      await h.command('exception.check',{}); await h.command('exception.check',{});
      let cases=(await h.state()).operationalExceptions;
      assert.deepEqual(cases.map(r=>[r.kind,r.sourceId]).sort(),[['late-customer-delivery',order.id],['overdue-po-confirmation',po.id]]);
      const purchase=cases.find(r=>r.sourceId===po.id), delivery=cases.find(r=>r.sourceId===order.id);
      assert.equal(purchase.assigneeId,id); assert.equal(purchase.dueAt,'2026-11-02T13:00:00.000Z');
      await h.command('exception.assign',{exceptionId:purchase.id,version:purchase.version,assigneeId:id,dueAt:'2026-11-02T12:30:00.000Z',nextAction:'Call the supplier with the retained PO reference.'});
      edge.now='2026-11-02T14:00:00.000Z';
      await h.command('exception.check',{}); await h.command('exception.check',{});
      await h.restartWithFreshSigningKey();
      cases=(await h.state()).operationalExceptions;
      assert.equal(cases.length,2);
      const retained=cases.find(r=>r.id===purchase.id);
      assert.equal(retained.assigneeId,id); assert.equal(retained.dueAt,'2026-11-02T12:30:00.000Z');
      assert.equal(retained.nextAction,'Call the supplier with the retained PO reference.');
      assert.equal(retained.escalatedTo,id); assert.equal(retained.history.filter(e=>e.kind==='escalated').length,1);
      assert.ok(cases.every(r=>r.status==='open')); assert.equal((await h.state()).correspondence.length,0,'internal checks never grant outbound authority');
      await h.command('exception.resolve',{exceptionId:retained.id,version:retained.version},{error:'EXCEPTION_EVIDENCE'});
      await h.command('exception.cancel',{exceptionId:retained.id,version:retained.version,reason:'Duplicate procurement was abandoned.'},{error:'APPROVAL'});
      const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});
      const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
      const member=await(await h.request('/auth/session',{as:cookie})).json();
      await h.command('role.set',{operatorId:member.operator.id,role:'owner'});
      await h.command('business.save',{name:'Harbor cases',address:'40 Pier Road'});
      const currentPo=(await h.state()).purchaseOrders.find(r=>r.id===po.id);
      await h.command('po.send',{poId:po.id,version:currentPo.version,recipient:'supplier@example.test',confirm:true,chaseEveryDays:1,maxChases:1},{as:cookie});
      assert.equal((await h.state()).deliveries.find(r=>r.phase==='uncertain')?.phase,'uncertain');
      await h.command('mail.process',{}); await h.command('exception.check',{});
      assert.equal(submissions,1,'uncertain delivery is never retried by case checks');
      assert.equal((await h.state()).operationalExceptions.find(r=>r.id===retained.id).status,'open');
      const prepared='synthetic-pier-case-pause';
      const pending=h.command('exception.cancel',{exceptionId:retained.id,version:retained.version,reason:'Unauthorized after revocation',confirm:true},{as:cookie,headers:{'x-pier-test-pause':prepared},error:'TRANSACTION'});
      try {
        for(let n=0;n<100;n++){if((await(await h.request('/__test/prepared/'+prepared)).json()).ready)break;await new Promise(r=>setTimeout(r,10));}
        assert.equal((await(await h.request('/__test/prepared/'+prepared)).json()).ready,true);
        await h.command('role.set',{operatorId:member.operator.id,role:'viewer'});
      } finally { await h.request('/__test/prepared/'+prepared,{method:'DELETE'}); }
      await pending;
      const privateState=await(await h.request('/api/pier/state',{as:cookie})).json();
      assert.deepEqual(privateState.operationalExceptions,[]);
      assert.equal((await h.state()).operationalExceptions.find(r=>r.id===retained.id).status,'open');
      await h.command('exception.cancel',{exceptionId:retained.id,version:retained.version,reason:'Duplicate procurement was abandoned.',confirm:true});
      await h.command('exception.check',{});
      cases=(await h.state()).operationalExceptions;
      assert.equal(cases.length,2); assert.equal(cases.find(r=>r.id===retained.id).status,'cancelled');
      assert.equal(cases.find(r=>r.id===retained.id).cancellation.actorId,id);
      assert.equal(cases.find(r=>r.id===delivery.id).status,'open');
      await h.command('role.set',{operatorId:member.operator.id,role:'owner'});
      const policy=(await h.state()).operationalExceptionPolicies[0];
      await h.command('exception.policy',{version:policy.version,enabled:true,assigneeId:member.operator.id,escalationOwnerId:member.operator.id,dueHours:1});
      const assigned=(await h.state()).operationalExceptions.find(r=>r.id===delivery.id);
      await h.command('exception.assign',{exceptionId:assigned.id,version:assigned.version,assigneeId:member.operator.id,dueAt:'2026-11-03T12:00:00.000Z',nextAction:'Review the original delivery promise.'});
      await h.command('role.set',{operatorId:member.operator.id,role:'viewer'});
      const unassigned=(await h.state()).operationalExceptions.find(r=>r.id===delivery.id);
      assert.equal(unassigned.assigneeId,null,'revoked case owners leave visibly unassigned work');
      assert.match(unassigned.assigneeProblem,/current owner/i);
      await h.command('supplierItem.save',{supplierId:b.supplier.id,itemId:b.item.id,code:'synthetic-pier-204',packSize:'1',price:'0.25',minimum:'1',leadDays:7});
      await receive(h,b,po,'1');
      let supply=(await h.state()).purchaseOrders.find(r=>r.id===po.id);
      await h.command('po.confirm',{poId:supply.id,version:supply.version,promiseDate:'2026-11-09',source:'Synthetic supplier confirmation',body:'Remaining goods arrive on November 9.',confirm:true});
      const mixed=await h.command('order.create',{customerId:b.customer.id,promiseDate:'2026-11-01',lines:[{itemId:b.item.id,quantity:'2',price:'1'}]});
      let mixedView=(await h.state()).orders.find(r=>r.id===mixed.id);
      assert.deepEqual([mixedView.lines[0].reserved,mixedView.lines[0].backorder],['1','1']);
      await h.command('order.repromise',{orderId:mixed.id,version:mixedView.version,fingerprint:mixedView.backorderPlan.fingerprint,recipient:edge.bindings.MAIL_FROM,confirm:true});
      mixedView=(await h.state()).orders.find(r=>r.id===mixed.id);
      assert.equal(mixedView.promiseDate,'2026-11-01');
      assert.deepEqual([mixedView.lines[0].backorderPromiseDate,mixedView.lines[0].backorderPromisedQuantity],['2026-11-09','1']);
      const future=await h.command('order.create',{customerId:b.customer.id,promiseDate:'2026-11-01',lines:[{itemId:b.item.id,quantity:'1',price:'1'}]});
      const futureView=(await h.state()).orders.find(r=>r.id===future.id);
      await h.command('order.repromise',{orderId:future.id,version:futureView.version,fingerprint:futureView.backorderPlan.fingerprint,recipient:edge.bindings.MAIL_FROM,confirm:true});
      const quote=await h.command('quote.create',{customerId:b.customer.id,promiseDate:'2026-11-01',validUntil:'2026-11-30',lines:[{itemId:b.item.id,quantity:'1',price:'1'}]});
      await h.command('exception.check',{}); await h.command('exception.check',{});
      cases=(await h.state()).operationalExceptions;
      assert.deepEqual(cases.filter(r=>r.kind==='late-customer-delivery').map(r=>r.sourceId).sort(),[order.id,mixed.id].sort(),'reserved overdue units stay late; future backorders and unaccepted quotes do not');
      assert.equal(cases.some(r=>r.sourceId===quote.id),false);
      assert.equal(cases.some(r=>r.sourceId===future.id),false);
      const mixedCase=cases.find(r=>r.sourceId===mixed.id);
      assert.equal(mixedCase.assigneeId,null,'new cases cannot inherit a revoked default owner');
      assert.match(mixedCase.assigneeProblem,/current owner/i);
      assert.equal(mixedCase.promise.date,'2026-11-01');
      assert.equal(mixedCase.promise.history.at(-1).lines[0].quantity,'1');
    });
  }
});
