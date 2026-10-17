import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { installation } from './harness.mjs';

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
for (const provider of ['cin7-core', 'inflow', 'fishbowl']) test(`${provider} move-in: review source coverage, independent totals, atomic apply, replay and safe undo`, async t => {
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
