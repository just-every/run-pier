import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installation } from './harness.mjs';

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

test('retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge', async t => {
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
  const attempts=traffic.length;
  await h.command('edi.send',{documentId:uncertain.id,version:uncertain.version});
  assert.equal(traffic.length,attempts,'uncertain sends require reconciliation instead of a blind repeat');
  await h.command('edi.send.result',{documentId:uncertain.id,version:uncertain.version,status:'accepted'},{error:'EDI_INTERNAL'});

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
