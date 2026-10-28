import test from 'node:test';
import { phase, checkpoint } from './journey-resources.mjs';

// Related public-door scenarios retain their own disposable D1 installations.
// A failure stops this business journey; cleanup runs before its next scenario.
test("Review source migrations, cut over once, retain allocations and safely undo", async () => {

  // movein: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { readFile } = await import("node:fs/promises");
    const { randomUUID } = await import("node:crypto");
    const { installation } = await import("./harness.mjs");


    async function fixture(provider) {
      const root = new URL(`../fixtures/movein/${provider}/`, import.meta.url);
      const map = JSON.parse(await readFile(new URL('mapping.json', root), 'utf8'));
      return { provider, namespace: `${provider}:synthetic-company`, sourceVersion: 'documented-export-layout', mappingRevision: 'reviewed-1', exportedAt: '2026-10-17T00:00:00Z', cutoffTimezone: 'America/Chicago', currency: 'USD', filters: 'Active ordinary stock, wholly unreceived POs; independent controls from separately reviewed stock report', files: await Promise.all(map.map(async file => ({ ...file, csv: await readFile(new URL(file.name, root), 'utf8') }))) };
    }

    async function freeze(h, batch) {
      assert.deepEqual(batch.errors, []);
      for (const stage of ['mapped', 'reconciled', 'shadow', 'frozen']) batch = await h.command('import.review', { batchId: batch.id, version: batch.version, stage, reason: 'Compared retained source rows, unsupported columns, location/unit controls and open receipts.' });
      return batch;
    }

    for (const provider of ['cin7-core', 'inflow', 'fishbowl']) await phase(`${provider} move-in: review source coverage, independent totals, atomic apply, replay and safe undo`, async t => {
      const h = await installation(); t.after(() => h.close());
      const input = await fixture(provider);
      if (provider === 'inflow') {
        // Keep originals intact while explicitly naming a bin for blank sublocations,
        // reading local source times and subtracting evidenced fulfilled quantities.
        const normalized = structuredClone(input), stockFile = normalized.files.find(f => f.kind === 'positions');
        stockFile.csv = stockFile.csv.replaceAll(',East,A1,', ',East,,'); stockFile.blankBin = 'Main stock';
        normalized.files.find(f => f.kind === 'controls').csv = normalized.files.find(f => f.kind === 'controls').csv.replaceAll('A1', 'Main stock');
        const purchase = normalized.files.find(f => f.kind === 'purchaseOrders');
        purchase.csv = purchase.csv.trim().split(/\r?\n/).map((line, index) => `${line}${index === 0 ? ',ReceivedUnits' : index === 1 ? ',1' : ',0.5'}`).join('\n').replaceAll('11/1/2026', '11/1/2026 14:18');
        purchase.columns.fulfilled = 'ReceivedUnits'; purchase.quantityMeaning = 'ordered-less-fulfilled';
        const normalizedBatch = await h.command('import.stage', normalized);
        assert.deepEqual(normalizedBatch.errors, []);
        assert.deepEqual(normalizedBatch.reconciliation.expectedReceipts[0].lines.map(l => l.quantity), ['2', '1']);
        assert.equal(normalizedBatch.reconciliation.expectedReceipts[0].promiseDate, '2026-11-01');
        assert.ok(Object.values(normalizedBatch.reconciliation.names).includes('Main stock'));
        const units = structuredClone(normalized); units.files.find(f => f.kind === 'purchaseOrders').csv = purchase.csv.replace(',ea,', ',case,');
        const unitBatch = await h.command('import.stage', units);
        assert.ok(unitBatch.errors.some(e => e.code === 'UNIT' && e.location.artifact === purchase.name && e.location.row === 2));
        const missingSku = structuredClone(input); missingSku.files.find(f => f.kind === 'items').csv = missingSku.files.find(f => f.kind === 'items').csv.replace(',CAP-B,', ',,');
        const skuBatch = await h.command('import.stage', missingSku);
        assert.ok(skuBatch.errors.some(e => e.code === 'INPUT' && /SKU/.test(e.message) && e.location.row === 2 && e.location.artifact === input.files.find(f => f.kind === 'items').name));
        const partial = structuredClone(normalized), completed = partial.files.find(f => f.kind === 'purchaseOrders');
        completed.csv = completed.csv.replace('PO-101,Unfulfilled', 'PO-101,Fulfilled').replace(',ea,1.4,1', ',ea,1.4,3');
        const completeBatch = await h.command('import.stage', partial);
        assert.ok(completeBatch.errors.some(e => e.code === 'OPEN_DOCUMENT' && e.location.row === 2));
        completed.excludedRows = { '2': 'Already received in full before cutoff; retained as source history only.' };
        const retained = await h.command('import.stage', partial);
        assert.deepEqual(retained.errors, []);
        assert.equal(retained.moveIn.excluded[0].location.row, 2);
        assert.equal(retained.source.records.find(r => r.kind === 'purchaseOrders').sourceId, 'PO-101:line:2');
        assert.equal(Buffer.from(retained.source.artifacts.find(a => a.name === purchase.name).original.base64, 'base64').toString('utf8'), completed.csv);
        assert.deepEqual((await h.state()).positions, []);
      }
      const bad = structuredClone(input);
      bad.files.find(f => f.kind === 'controls').csv = bad.files.find(f => f.kind === 'controls').csv.replace('15.75', '15.76');
      let batch = await h.command('import.stage', bad);
      assert.ok(batch.errors.some(e => e.code === 'CONTROL_MISMATCH'));
      await h.command('import.review', { batchId: batch.id, version: batch.version, stage: 'mapped', reason: 'Must refuse mismatched valuation' }, { error: 'IMPORT_ERRORS' });
      assert.deepEqual((await h.state()).positions, []);
      const unknown = structuredClone(input);
      unknown.files[0].columns.sku = 'No such column';
      const unknownBatch = await h.command('import.stage', unknown);
      assert.ok(unknownBatch.errors.some(e => e.code === 'MISSING_COLUMN' && e.field === 'No such column'));
      assert.ok(unknownBatch.errors.some(e => e.location.artifact === input.files[0].name));
      const duplicate = structuredClone(input), stock = duplicate.files.find(f => f.kind === 'positions');
      stock.csv += stock.csv.split(/\r?\n/)[1] + '\n';
      const dup = await h.command('import.stage', duplicate);
      assert.ok(dup.errors.some(e => e.code === 'DUPLICATE' && e.location.row > 1));
      const orphan = structuredClone(input), orphanStock = orphan.files.find(f => f.kind === 'positions');
      orphanStock.csv = orphanStock.csv.replace(provider === 'inflow' ? 'cap-blue' : 'CAP-B', 'ORPHAN');
      const orphanBatch = await h.command('import.stage', orphan);
      assert.ok(orphanBatch.errors.some(e => e.code === 'ORPHAN' || e.code === 'REQUIRED'));
      batch = await freeze(h, await h.command('import.stage', input));
      assert.equal(batch.moveIn.controls.every(control => control.matched), true);
      assert.equal(batch.moveIn.controls.length, 3);
      assert.ok(batch.moveIn.coverage.some(column => column.disposition === 'retained only' && column.reason));
      assert.equal(batch.reconciliation.distinctSkus, 2);
      assert.equal(batch.reconciliation.expectedReceipts.length, 1);
      assert.deepEqual(batch.reconciliation.expectedReceipts[0].lines.map(l => l.quantity), ['3', '1.5']);
      for (const original of batch.source.artifacts) {
        const submitted = input.files.find(f => f.name === original.name);
        assert.equal(Buffer.from(original.original.base64, 'base64').toString('utf8'), submitted.csv);
      }
      const commandId = randomUUID(), payload = { batchId: batch.id, version: batch.version };
      if (provider === 'cin7-core') {
        await h.db.prepare("CREATE TRIGGER stop_movein BEFORE INSERT ON pier_import_graphs BEGIN SELECT RAISE(ABORT,'interrupted move-in'); END").run();
        await h.command('import.commit', payload, { commandId, error: 'TRANSACTION' });
        const interrupted = await h.state();
        assert.equal(interrupted.items.length, 0); assert.equal(interrupted.locations.length, 0);
        assert.equal(interrupted.purchaseOrders.length, 0); assert.deepEqual(interrupted.positions, []);
        await h.db.prepare('DROP TRIGGER stop_movein').run();
      }
      const posted = await h.command('import.commit', payload, { commandId });
      assert.deepEqual(await h.command('import.commit', payload, { commandId }), posted);
      const beforeReplay = await h.invariant();
      assert.equal(beforeReplay.items.length, 2); assert.equal(beforeReplay.locations.length, 2);
      assert.equal(beforeReplay.positions.length, 3); assert.equal(beforeReplay.parties.length, 2);
      assert.deepEqual(beforeReplay.positions.map(p => p.quantity).sort(), ['0.5', '10.5', '2.5']);
      const replay = await freeze(h, await h.command('import.stage', input));
      const replayed = await h.command('import.commit', { batchId: replay.id, version: replay.version });
      const afterReplay = await h.state();
      assert.deepEqual(afterReplay.positions, beforeReplay.positions); assert.deepEqual(afterReplay.movements, beforeReplay.movements);
      assert.deepEqual(afterReplay.purchaseOrders, beforeReplay.purchaseOrders);
      await h.command('import.undo', { batchId: replayed.id, version: replayed.version, reason: 'Undo no-op replay first' });
      await h.command('import.undo', { batchId: posted.id, version: posted.version, reason: 'Withdraw untouched move-in' });
      const undone = await h.invariant();
      assert.equal(undone.items.length, 0); assert.equal(undone.locations.length, 0); assert.equal(undone.parties.length, 0);
      assert.equal(undone.purchaseOrders.length, 0); assert.deepEqual(undone.positions, []);
      assert.ok(undone.imports.find(b => b.id === posted.id).source.artifacts.every(a => a.original.base64));
    });
  }

  // native-exit: the complete public lifecycle, including refused and uncertain outcomes.
  {

    const { default: assert } = await import("node:assert/strict");
    const { installation, basics, buy, receive } = await import("./harness.mjs");


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


    await phase("native exit preserves approved allocation and explicit backorders across a fresh cutover", async () => {
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
        const cutoverState=await h.state();assert.equal(cutoverState.customFieldDefinitions.length,4);
        for(const [ownerType] of typedOwners){const record=(ownerType==='item'?cutoverState.items:ownerType==='order'?cutoverState.orders:cutoverState.parties.filter(p=>p.kind===ownerType)).find(r=>r.customFields?.cutover_value===ownerType+' retained');assert.ok(record,ownerType+' field survived cutover');}
        const mappedItem=cutoverState.items.find(i=>i.variantFamily==='Cutover family');assert.deepEqual(mappedItem.dimensions,catalogueItem.dimensions??{length:'2',width:'3',height:'4',unit:'in'});assert.equal(mappedItem.caseBarcode,'synthetic-pier-case');assert.equal(mappedItem.weight,'1.25');assert.equal(mappedItem.category,'Fasteners');assert.deepEqual(mappedItem.barcodes,[{code:'synthetic-pier-inner',quantity:'0.25',label:'Inner'}]);assert.equal(mappedItem.imageUrl,'https://catalogue.example.test/synthetic-pier.png');
        assert.equal(mappedItem.references[0].partyId,cutoverState.parties.find(p=>p.kind==='supplier').id,'party references remap to target IDs');
        const entered=await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});const cookie=entered.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');const privateRead=await(await h.request('/api/pier/state',{as:cookie})).json();assert.equal(privateRead.imports,undefined,'private native CSV originals do not leak through staff state');
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
          const plan=await(await h.request('/api/pier/privacy?kind=customer&subjectId='+external.id)).json();
          const refused=await h.command('privacy.eraseSubject',{kind:'customer',subjectId:external.id,planHash:plan.planHash,confirm:true},{error:'PRIVACY_DEPENDENCY'});
          assert.equal(refused.error.message,plan.refusal);assert.match(plan.refusal,/No content was deleted/);
          assert.deepEqual((await h.state()).imports,undone.imports);
        }

      } finally {
        await h?.close();
      }
    });
  }
});
