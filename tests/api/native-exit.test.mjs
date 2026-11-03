import test from "node:test";
import assert from "node:assert/strict";
import { installation, basics, buy, receive } from "./harness.mjs";

async function cutover(h, input) {
  let batch = await h.command("import.stage", input);
  assert.deepEqual(batch.errors, []);
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    batch = await h.command("import.review", {
      batchId: batch.id,
      version: batch.version,
      stage,
      reason: "Reconcile exact exported allocation before cutover",
    });
  return h.command("import.commit", {
    batchId: batch.id,
    version: batch.version,
  });
}
function allocation(state) {
  return state.orders
    .flatMap((order) =>
      order.lines.map((line) => ({
        customer: state.parties.find((party) => party.id === order.customerId)
          .name,
        sku: state.items.find((item) => item.id === line.itemId).sku,
        reserved: line.reserved,
        backorder: line.backorder,
        bins: state.reservations
          .filter((r) => r.orderLineId === line.id)
          .map((r) => ({
            bin: state.locations.find((l) => l.id === r.locationId).name,
            quantity: r.quantity,
          }))
          .sort((a, b) => a.bin.localeCompare(b.bin)),
      })),
    )
    .sort((a, b) => a.customer.localeCompare(b.customer));
}

test("native exit preserves approved allocation and explicit backorders across a fresh cutover", async () => {
  let h = await installation();
  try {
    const b = await basics(h),
      po = await buy(h, b, "1");
    await receive(h, b, po, "1");
    const second = await h.command("party.save", {
      name: "Priority customer",
      kind: "customer",
    });
    const firstOrder = await h.command("order.create", {
      customerId: b.customer.id,
      promiseDate: "2026-11-01",
      lines: [{ itemId: b.item.id, quantity: "1" }],
    });
    const secondOrder = await h.command("order.create", {
      customerId: second.id,
      promiseDate: "2026-11-01",
      lines: [{ itemId: b.item.id, quantity: "1" }],
    });
    const proposal = await h.command("proposal.prepare", {
      kind: "reallocation",
      assumptions: "Owner gives the second customer priority",
      evidence: [firstOrder.id, secondOrder.id],
      plan: {
        fromOrderId: firstOrder.id,
        toOrderId: secondOrder.id,
        itemId: b.item.id,
        quantity: "1",
      },
    });
    await h.command("proposal.approve", {
      proposalId: proposal.id,
      version: proposal.version,
    });
    await h.command("proposal.execute", {
      proposalId: proposal.id,
      version: proposal.version,
    });
    const typedOwners=[['item',b.item.id],['customer',b.customer.id],['supplier',b.supplier.id],['order',firstOrder.id]];
    for(const [ownerType,recordId] of typedOwners){
      await h.command('customField.define',{ownerType,key:'cutover_value',label:'Cutover value',type:'text'});
      const state=await h.state(),record=(ownerType==='item'?state.items:ownerType==='order'?state.orders:state.parties).find(r=>r.id===recordId);
      await h.command('customField.set',{ownerType,recordId,version:record.version,values:{cutover_value:ownerType+' retained'}});
    }
    const catalogueItem=(await h.state()).items.find(i=>i.id===b.item.id);
    await h.command('item.save',{...catalogueItem,caseBarcode:'synthetic-pier-case',variantFamily:'Cutover family',category:'Fasteners',imageUrl:'https://catalogue.example.test/synthetic-pier.png',barcodes:[{code:'synthetic-pier-inner',quantity:'0.25',label:'Inner'}],weight:'1.25',dimensions:{length:'2',width:'3',height:'4',unit:'in'},references:[{partyId:b.supplier.id,code:'synthetic-pier-reference'}]});
    const expected = allocation(await h.invariant());
    const snapshot = await (await h.request("/api/pier/native-export")).json();
    await h.close();
    h = null;
    h = await installation();
    const malformed = structuredClone(snapshot);
    malformed.files.find((file) => file.kind === "reservations").csv =
      "key,orderLineKey,locationKey,quantity,unit\n";
    const invalidMetadata=structuredClone(snapshot);invalidMetadata.files.find(file=>file.kind==='items').csv=invalidMetadata.files.find(file=>file.kind==='items').csv.replaceAll('caseBarcode','unsupportedMetadata');
    const rejectedMetadata=await h.command('import.stage',invalidMetadata);assert.ok(rejectedMetadata.errors.some(error=>error.code==='NATIVE_METADATA'));assert.equal((await h.state()).customFieldDefinitions.length,0,'invalid metadata cannot leak definitions out of preview');
    const incomplete = await h.command("import.stage", malformed);
    assert.ok(
      incomplete.errors.some((error) => error.code === "RESERVATION_PLAN"),
    );
    assert.equal((await h.state()).movements.length, 0);
    const imported = await cutover(h, snapshot);
    assert.deepEqual(allocation(await h.invariant()), expected);
    const retainedFile = snapshot.files.find(file => file.kind === 'items');
    const retainedArtifact = imported.source.artifacts.find(artifact => artifact.name === retainedFile.name);
    const originalPath = '/api/pier/imports/' + imported.id + '/originals/' + retainedArtifact.sha256;
    const exactOriginal = Buffer.from(retainedFile.csv, 'utf8');
    const download = await h.request(originalPath);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), exactOriginal);
    const cutoverState=await h.state();assert.equal(cutoverState.customFieldDefinitions.length,4);
    for(const [ownerType] of typedOwners){const record=(ownerType==='item'?cutoverState.items:ownerType==='order'?cutoverState.orders:cutoverState.parties.filter(p=>p.kind===ownerType)).find(r=>r.customFields?.cutover_value===ownerType+' retained');assert.ok(record,ownerType+' field survived cutover');}
    const mappedItem=cutoverState.items.find(i=>i.variantFamily==='Cutover family');assert.deepEqual(mappedItem.dimensions,catalogueItem.dimensions??{length:'2',width:'3',height:'4',unit:'in'});assert.equal(mappedItem.caseBarcode,'synthetic-pier-case');assert.equal(mappedItem.weight,'1.25');assert.equal(mappedItem.category,'Fasteners');assert.deepEqual(mappedItem.barcodes,[{code:'synthetic-pier-inner',quantity:'0.25',label:'Inner'}]);assert.equal(mappedItem.imageUrl,'https://catalogue.example.test/synthetic-pier.png');
    assert.equal(mappedItem.references[0].partyId,cutoverState.parties.find(p=>p.kind==='supplier').id,'party references remap to target IDs');
    const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');const privateRead=await(await h.request('/api/pier/state',{as:cookie})).json();assert.equal(privateRead.imports,undefined,'private native CSV originals do not leak through staff state');
    assert.equal((await h.request(originalPath, {as:cookie})).status, 403);
    const before = await h.state();
    const replayed = await cutover(h, snapshot);
    const unchanged = await h.invariant();
    assert.deepEqual(unchanged.reservations, before.reservations);
    assert.deepEqual(unchanged.movements, before.movements);
    assert.equal(
      imported.source.records.filter((r) => r.kind === "reservations").length,
      2,
    );
    let external=await h.command('party.save',{name:'Unrelated typed customer',kind:'customer'});
    external=await h.command('customField.set',{ownerType:'customer',recordId:external.id,version:external.version,values:{cutover_value:'A later dependency'}});
    await h.command('import.undo',{batchId:imported.id,version:imported.version,reason:'Cannot remove a definition used later'},{error:'IMPORT_DEPENDENCY'});
    await h.command('party.save',{...external,customFields:{}});
    await h.command('import.undo',{batchId:replayed.id,version:replayed.version,reason:'Undo the later no-op review first'});
    await h.command('import.undo',{batchId:imported.id,version:imported.version,reason:'Undo unused cutover with typed definitions'});
    const undone=await h.state();assert.equal(undone.customFieldDefinitions.length,0);assert.equal(undone.items.length,0);assert.ok(undone.parties.some(p=>p.id===external.id));
    const staffAfterUndo=await(await h.request('/api/pier/state',{as:cookie})).json();assert.equal(staffAfterUndo.imports,undefined,'undo cannot expose retained private CSV originals after removing live definitions');assert.equal((await h.request('/api/pier/native-export',{as:cookie})).status,403);
    const privacyAfterUndo=await(await h.request('/api/pier/privacy?kind=customer&subjectId='+external.id)).json();assert.equal(privacyAfterUndo.allowed,false);assert.ok(privacyAfterUndo.blockers.some(b=>b.reason.includes('Retained typed-field CSV originals')));
    for (const restart of [false,true]) {
      if(restart) await h.restartWithFreshSigningKey();
      const original = await h.request(originalPath);
      assert.equal(original.status, 200);
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), exactOriginal, 'undo and restart retain the exact original bytes without live definitions');
      if (!restart) assert.equal((await h.request(originalPath, {as:cookie})).status, 403);
      const plan=await(await h.request('/api/pier/privacy?kind=customer&subjectId='+external.id)).json();
      const refused=await h.command('privacy.eraseSubject',{kind:'customer',subjectId:external.id,planHash:plan.planHash,confirm:true},{error:'PRIVACY_DEPENDENCY'});
      assert.equal(refused.error.message,plan.refusal);assert.match(plan.refusal,/No content was deleted/);
      assert.deepEqual((await h.state()).imports,undone.imports);
    }

  } finally {
    await h?.close();
  }
});
