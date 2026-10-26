import test from 'node:test';
import assert from 'node:assert/strict';
import { installation } from './harness.mjs';
import { catalogueCsv, catalogueJourney } from './catalogue-fixtures.mjs';

test('CAT-001: reviewed variants, references and exact multi-pack barcodes survive public stock work and export', async t => {
  const h = await installation(); t.after(() => h.close());
  h.preview = async csv => {
    const response = await h.request('/api/pier/catalogue/preview', { method: 'POST', body: { csv } });
    assert.equal(response.status, 200); return response.json();
  };
  const b = await catalogueJourney(h), [blue, white] = b.items;
  assert.equal(b.preview.errors.length, 0);
  assert.equal(blue.dimensions.height, '4.5');
  assert.equal(blue.references[1].code, 'CAFE-B');
  assert.equal(white.variantFamily, blue.variantFamily);
  const before = await h.state();
  const collision = catalogueCsv([{ sku: 'VALID-ROW', name: 'Valid pending item', unit: 'each', packSize: '1' }, { sku: 'OTHER', name: 'Duplicate', unit: 'each', packSize: '1', barcode: '0036000291452' }]);
  const preview = await h.preview(collision);
  assert.match(preview.errors[0].message, /OTHER.*MUG-BLUE/);
  assert.deepEqual((await h.state()).items, before.items, 'preview creates nothing');
  await h.command('catalogue.apply', { csv: collision, stateVersion: preview.stateVersion }, { error: 'CATALOGUE_REVIEW' });
  assert.deepEqual((await h.state()).items, before.items, 'invalid batch is atomic');
  await h.command('location.save', { name: 'Overflow', warehouse: 'Dallas', kind: 'bin', barcode: 'INNER-BLUE' }, { error: 'DUPLICATE' });
  await h.command('item.save', { sku: 'BIN-ITEM', name: 'Invalid bin code', unit: 'each', packSize: '1', barcodes: [{ code: 'BIN-A14', quantity: '2' }] }, { error: 'DUPLICATE' });

  let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Catalogue scan journey', lines: [{ itemId: blue.id, quantity: '18', price: '2.5' }] });
  await h.command('po.approve', { poId: po.id, version: po.version });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  let receiving = await h.command('receiving.start', { poId: po.id, locationId: b.location.id });
  for (const code of ['10036000291459', 'INNER-BLUE', 'SUP-BLUE', '036000291452']) receiving = await h.command('receiving.scan', { receivingId: receiving.id, code });
  const receipt = await h.command('receiving.post', { receivingId: receiving.id, version: receiving.version, supplierReference: 'CAT delivery' });
  assert.equal(receipt.lines[0].quantity, '17.5');
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: blue.id, quantity: '4.5', price: '5' }] });
  const carrier = await h.command('carrier.save', { name: 'Collection', warehouse: 'Dallas', timeZone: 'America/Chicago', cutoff: '16:00', dock: 'Dock A' });
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  for (const itemCode of ['INNER-BLUE', 'SUP-BLUE']) wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: 'BIN-A14', itemCode });
  assert.equal(wave.status, 'picked');
  for (const code of ['INNER-BLUE', 'SUP-BLUE']) await h.command('pack.scan', { waveId: wave.id, orderId: order.id, code });
  await h.command('pack.scan', { waveId: wave.id, orderId: order.id, code: 'INNER-BLUE' }, { error: 'OVER_PACK' });
  await h.command('pack.measure', { waveId: wave.id, orderId: order.id, carton: 1, weight: '4', length: '12', width: '8', height: '6' });
  await h.command('pack.close', { waveId: wave.id, orderId: order.id });
  await h.command('pack.dispatch', { waveId: wave.id, orderId: order.id, shipmentReference: 'INNER-BLUE' }, { error: 'DUPLICATE' });
  await h.command('pack.dispatch', { waveId: wave.id, orderId: order.id, shipmentReference: 'CAT-SHIP' });
  assert.equal((await (await h.request('/api/pier/returns/lookup?code=INNER-BLUE')).json()).length, 1);
  const second = await h.command('order.create', { customerId: b.customer.id, warehouse: 'Dallas', promiseDate: '2026-11-01', lines: [{ itemId: blue.id, quantity: '1', price: '5' }] });
  await h.command('dispatch.create', { orderId: second.id, shipmentReference: 'CAT-SHIP', lines: [{ orderLineId: second.lines[0].id, quantity: '1' }] });
  const shared = await (await h.request('/api/pier/returns/lookup?code=CAT-SHIP')).json();
  assert.equal(shared.length, 2, 'one consolidated BOL is an alias for both dispatches');
  assert.deepEqual(new Set(shared.map(row => row.orderId)), new Set([order.id, second.id]));
  assert.equal(new Set(shared.map(row => row.shipmentId)).size, 2);
  const shipments = (await h.state()).shipments.filter(shipment => shipment.reference === 'CAT-SHIP');
  assert.equal(new Set(shipments.map(shipment => shipment.barcode)).size, 2);
  for (const shipment of shipments) {
    assert.match(shipment.barcode, /^PIER-SHIP-/);
    const selected = await (await h.request('/api/pier/returns/lookup?code=' + encodeURIComponent(shipment.barcode))).json();
    assert.deepEqual(selected.map(candidate => candidate.shipmentId), [shipment.id]);
  }
  await h.command('item.save', {sku:'synthetic-pier-barcode-collision',name:'Collision',unit:'each',packSize:'1',barcode:shipments[0].barcode}, {error:'DUPLICATE'});

  await h.command('item.save', { sku: 'BOL-COLLISION', name: 'Conflicting code', unit: 'each', packSize: '1', barcode: 'CAT-SHIP' }, { error: 'DUPLICATE' });
  const changed = catalogueCsv([{ sku: blue.sku, name: 'Blue stoneware mug revised', unit: 'each', packSize: '12' }]);
  const review = await h.preview(changed);
  assert.ok(review.rows[0].affectedDocuments.some(d => d.id === order.id));
  assert.equal(review.rows[0].item.barcodes[0].quantity, '4', 'omitted fields are retained');
  await h.command('item.save', { ...white, archived: true, imageUrl: 'https://catalogue.example.test/white-mug.jpg' });
  await h.command('catalogue.apply', { csv: changed, stateVersion: review.stateVersion }, { error: 'STALE' });
  const fresh = await h.preview(changed);
  await h.command('catalogue.apply', { csv: changed, stateVersion: fresh.stateVersion });
  const invalid = await h.preview(catalogueCsv([{ sku: blue.sku, name: blue.name, unit: 'kg', packSize: '12' }]));
  assert.equal(invalid.errors[0].code, 'HISTORY');
  await h.command('item.save', { ...(await h.state()).items.find(i => i.id === blue.id), barcodes: [{ code: 'INNER-BLUE', quantity: '6' }] }, { error: 'HISTORY' });
  const exported = await (await h.request('/api/pier/export')).json();
  const saved = exported.items.find(i => i.id === blue.id);
  assert.deepEqual(saved.references, blue.references);
  assert.deepEqual(saved.barcodes, blue.barcodes);
  assert.equal(saved.weight, '0.75');
  assert.equal(exported.items.find(i => i.id === white.id).imageUrl, 'https://catalogue.example.test/white-mug.jpg');
  assert.equal(exported.shipments.find(s => s.orderId === order.id).lines[0].quantity, '4.5');
  // One typed-field journey crosses all existing owner kinds and public doors.
  const current=await h.state();
  const owners=[['item',current.items.find(i=>i.id===blue.id),'text','finish','matte'],['customer',current.parties.find(p=>p.id===b.customer.id),'boolean','priority',false],['supplier',current.parties.find(p=>p.id===b.supplier.id),'number','minimum','1.250000'],['order',current.orders.find(o=>o.id===order.id),'date','delivery_day','2026-11-01']];
  for (const [ownerType,,type,key] of owners) await h.command('customField.define',{ownerType,type,key,label:key});
  const initial=await h.state();
  const rows=owners.map(([ownerType,record,,,value],index)=>({ownerType,recordId:record.id,version:record.version,values:{[owners[index][3]]:value}}));
  await h.command('customField.import',{stateVersion:initial.version,rows:[...rows.slice(0,3),{...rows[3],values:{delivery_day:'2026-02-30'}}]},{error:'CUSTOM_VALUE'});
  assert.equal((await h.state()).items.find(i=>i.id===blue.id).customFields,undefined,'a late invalid value refuses the entire import');
  await h.command('customField.import',{stateVersion:initial.version,rows:'invalid'},{error:'CUSTOM_IMPORT'});
  const imported=await h.command('customField.import',{stateVersion:initial.version,rows});
  for (const [index,[ownerType,record,,,value]] of owners.entries()) {
    const expected=index===2?'1.25':value;
    const filter=await(await h.request(`/api/pier/custom-fields?ownerType=${ownerType}&field=${owners[index][3]}&value=${encodeURIComponent(JSON.stringify(value))}`)).json();
    assert.deepEqual(filter.records.map(r=>r.id),[record.id]);assert.equal(filter.records[0].customFields[owners[index][3]],expected);
    assert.equal(imported.records[index].customFields[owners[index][3]],expected);
  }
  await h.command('customField.define',{ownerType:'item',type:'number',key:'finish',label:'Wrong reinterpretation'},{error:'CUSTOM_DEFINITION'});
  await h.command('customField.set',{ownerType:'item',recordId:blue.id,version:blue.version,values:{finish:'gloss'}},{error:'STALE'});
  const typedCsv='sku,name,unit,packSize,customFields\n'+[blue.sku,'Blue stoneware mug revised','each','12','{"finish":"satin"}'].map(v=>'"'+v.replaceAll('"','""')+'"').join(',')+'\n';
  const typedPreview=await h.preview(typedCsv);assert.deepEqual(typedPreview.errors,[]);await h.command('catalogue.apply',{csv:typedCsv,stateVersion:typedPreview.stateVersion});
  await h.command('business.save',{name:'Synthetic Pier Wholesale',address:'1 Synthetic Pier Road',shipTo:{}});
  const packed=(await h.state()).packs.find(p=>p.orderId===order.id);
  const document=await h.command('print.generate',{kind:'packing-slip',sourceId:packed.id});
  const {pdfText}=await import('./pdf-text.mjs');
  const printed=await pdfText(Buffer.from(document.pdf,'base64'));
  assert.match(printed,/Finish: satin/);assert.match(printed,/Delivery_day: 2026-11-01/);assert.match(printed,/Priority: false/);assert.match(printed,/Base quantity: 4.5 each/);
  const supplierDocument=await h.command('print.generate',{kind:'purchase-order',sourceId:po.id});assert.match(await pdfText(Buffer.from(supplierDocument.pdf,'base64')),/Minimum: 1.25/);
  const fieldsExport=await(await h.request('/api/pier/export')).json();
  assert.equal(fieldsExport.customFieldDefinitions.length,4);
  assert.equal(fieldsExport.items.find(i=>i.id===blue.id).customFields.finish,'satin');
  assert.equal(fieldsExport.orders.find(o=>o.id===order.id).customFields.delivery_day,'2026-11-01');
  const latestItem=(await h.state()).items.find(i=>i.id===blue.id);
  await h.command('customField.set',{ownerType:'item',recordId:blue.id,version:latestItem.version,values:{finish:'gloss'}});
  const retained=Buffer.from(await(await h.request(`/api/pier/sales-documents/${document.id}.pdf`)).arrayBuffer());assert.deepEqual(retained,Buffer.from(document.pdf,'base64'));
  await h.command('sales.taxTable',{state:'TX',rate:'0',reason:'Synthetic case-pack quote'});
  let caseQuote=await h.command('quote.create',{customerId:b.customer.id,warehouse:'Dallas',shipTo:{state:'TX',country:'US'},lines:[{itemId:blue.id,quantity:'1',unit:'case',price:'2'}]});
  caseQuote=await h.command('quote.approve',{orderId:caseQuote.id,version:caseQuote.version,reason:'Approve exactly one 12-unit case'});
  const caseQuotePdf=await h.command('print.generate',{kind:'quote',sourceId:caseQuote.id});assert.match(await pdfText(Buffer.from(caseQuotePdf.pdf,'base64')),/Base quantity: 12 each/);
  caseQuote=await h.command('quote.accept',{orderId:caseQuote.id,version:caseQuote.version});
  let caseWave=await h.command('wave.release',{carrierId:carrier.id,orderIds:[caseQuote.id]});
  caseWave=await h.command('pick.scan',{waveId:caseWave.id,lineId:caseWave.lines[0].id,binCode:'BIN-A14',itemCode:'10036000291459'});assert.equal(caseWave.lines[0].picked,'12');
  await h.command('pack.scan',{waveId:caseWave.id,orderId:caseQuote.id,code:'10036000291459'});
  await h.command('pack.measure',{waveId:caseWave.id,orderId:caseQuote.id,carton:1,weight:'10',length:'12',width:'8',height:'6'});
  const casePack=await h.command('pack.close',{waveId:caseWave.id,orderId:caseQuote.id});
  const caseLabel=await h.command('print.generate',{kind:'packing-slip',sourceId:casePack.id});assert.match(await pdfText(Buffer.from(caseLabel.pdf,'base64')),/Base quantity: 12 each/);
  const nativeSnapshot=await(await h.request('/api/pier/native-export')).json();assert.ok(nativeSnapshot.files.some(file=>file.kind==='customFieldDefinitions'));assert.ok(nativeSnapshot.files.find(file=>file.kind==='items').csv.includes('finish'));
  const privacy=await(await h.request('/api/pier/privacy?kind=customer&subjectId='+b.customer.id)).json();assert.equal(privacy.allowed,false);assert.ok(privacy.blockers.some(b=>b.kind==='customFieldDefinitions'));
  const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});
  const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  assert.equal((await h.request('/api/pier/native-export',{as:cookie})).status,403);
  const read=await(await h.request('/api/pier/state',{as:cookie})).json();assert.equal(read.customFieldDefinitions,undefined);assert.ok(read.items.every(i=>i.customFields===undefined));assert.ok(read.orders.every(o=>o.customFields===undefined));
  await h.command('customField.define',{ownerType:'item',type:'text',key:'forbidden',label:'Forbidden'},{as:cookie,error:'FORBIDDEN'});
  assert.equal((await h.request('/api/pier/custom-fields?ownerType=item&field=finish&value=%22gloss%22',{as:cookie})).status,403);

  for (const type of ['customField.set','customField.import']) await h.command(type, {ownerType:'item',recordId:blue.id,version:1,values:{finish:'denied'},rows:[]},{as:cookie,error:'FORBIDDEN'});
  for (const [type,payload] of [['print.generate',{kind:'packing-slip',sourceId:packed.id}]]) {
    const response=await h.request('/api/pier/commands',{method:'POST',as:cookie,body:{commandId:crypto.randomUUID(),type,payload}});
    assert.equal((await response.json()).ok,false,'non-owner field documents refuse');
  }
  assert.equal((await h.request('/api/pier/sales-documents/'+document.id+'.pdf',{as:cookie})).status,403);
  assert.equal((await h.request('/api/pier/export',{as:cookie})).status,403);
  const refusal=await h.command('privacy.eraseSubject',{kind:'customer',subjectId:b.customer.id,planHash:privacy.planHash,confirm:true},{error:'PRIVACY_DEPENDENCY'});
  assert.equal(refusal.error.message,privacy.refusal);assert.match(privacy.refusal,/Erasure refused: subject attribution and governed erasure/);
  const audit=await(await h.request('/api/pier/audit')).json();
  assert.ok(audit.some(e=>e.type==='privacy.eraseSubject'&&e.outcome==='refused'&&e.reason==='PRIVACY_DEPENDENCY'&&e.custody.classes.includes('customFieldDefinitions')));
  assert.ok(audit.some(e=>e.type==='customField.import'&&e.fieldOperation.count===4&&e.fieldOperation.fieldIds.length===4));
  assert.ok(!JSON.stringify(audit).includes('"gloss"'));assert.ok(!JSON.stringify(audit).includes('"satin"'));

  const staffActor=(await(await h.request('/api/pier/state',{as:cookie})).json()).actor;
  await h.command('role.set',{operatorId:staffActor.id,role:'owner'});
  const staffRecord=(await h.state()).items.find(r=>r.id===blue.id);
  const recoveredPayload={ownerType:'item',recordId:blue.id,version:staffRecord.version,values:{finish:'synthetic-pier-revoked'}}, recoveryId=crypto.randomUUID();
  await h.command('customField.set',recoveredPayload,{as:cookie,commandId:recoveryId});
  await h.command('role.set',{operatorId:staffActor.id,role:'viewer'});
  await h.command('customField.set',recoveredPayload,{as:cookie,commandId:recoveryId,error:'FORBIDDEN'});
  const afterRevocation=await(await h.request('/api/pier/state',{as:cookie})).json();
  assert.ok(!JSON.stringify(afterRevocation).includes('synthetic-pier-revoked'));
  await h.invariant();
});

test('paged catalogue and customer search returns every literal match with consistent continuation', async () => {
  const { searchScenario } = await import('./search-scenario.mjs');
  await searchScenario();
});
