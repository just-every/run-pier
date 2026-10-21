import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installation, basics, parse } from './harness.mjs';

test('BUY-004: supplier fill and on-time quantities reconcile to exported PO/receipt sources without rewriting past confirmations', async t => {
  const h = await installation();
  t.after(() => h.close());
  const read = async path => {
    const response = await h.request(path);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await h.request('/api/pier/supplier-performance', { as: '' })).status, 401);
  assert.deepEqual((await read('/api/pier/supplier-performance')).suppliers, []);
  const b = await basics(h);
  const powder = await h.command('item.save', { sku: 'POWDER', name: 'Bulk powder', unit: 'kg', packSize: '0.25' });
  const empty = await h.command('party.save', { kind: 'supplier', name: 'No deliveries yet' });
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const purchase = async (item, quantity, price = '0.25') => {
    let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: today, reason: 'Supplier performance journey', lines: [{ itemId: item.id, quantity, price }] });
    await h.command('po.approve', { poId: po.id, version: po.version });
    return h.command('po.commit', { poId: po.id, version: po.version });
  };
  const confirm = async (poId, date, opts) => {
    const po = (await h.state()).purchaseOrders.find(p => p.id === poId);
    return h.command('po.confirm', { poId, version: po.version, promiseDate: date, source: 'Supplier reply ' + date, body: 'Delivery date confirmed', confirm: true }, opts);
  };
  const po = await purchase(b.item, '4');
  const { exportedAt: _beforeTime, ...before } = await read('/api/pier/export');
  await confirm(po.id, '2026-02-30', { error: 'DATE' });
  const { exportedAt: _afterTime, ...after } = await read('/api/pier/export');
  assert.deepEqual(after, before, 'invalid confirmation posts neither a reply nor changed business/command evidence');
  await confirm(po.id, today);
  const payload = { poId: po.id, supplierReference: 'PARTIAL-ON-TIME', lines: [{ poLineId: po.lines[0].id, locationId: b.source.id, quantity: '1.25', cost: '0.30' }] };
  const commandId = randomUUID();
  const first = await h.command('receipt.create', payload, { commandId });
  assert.deepEqual(await h.command('receipt.create', payload, { commandId }), first);
  assert.equal(first.supplierConfirmation.promiseDate, today);
  assert.equal(first.supplierConfirmation.reply.source, 'Supplier reply ' + today);
  await confirm(po.id, yesterday);
  let tally = await h.command('receiving.start', { poId: po.id, locationId: b.source.id });
  tally = await h.command('receiving.scan', { receivingId: tally.id, code: b.item.barcode, count: 2 });
  const late = await h.command('receiving.post', { receivingId: tally.id, version: tally.version, supplierReference: 'LATE-SCANNED' });
  assert.equal(late.supplierConfirmation.promiseDate, yesterday);
  // A later promise cannot retroactively make this late receipt on-time.
  await confirm(po.id, today);
  const unconfirmed = await purchase(b.item, '3');
  await h.command('receipt.create', { poId: unconfirmed.id, supplierReference: 'NO-SUPPLIER-CONFIRMATION', lines: [{ poLineId: unconfirmed.lines[0].id, locationId: b.source.id, quantity: '1', cost: '0.20' }] });
  await confirm(unconfirmed.id, today); // Confirmation after receipt cannot fill missing historical evidence.
  // Same supplier, unlike units: never sum kg and each into a supplier quantity.
  const powderPo = await purchase(powder, '0.75', '2');
  // A draft is not committed supply and must not inflate the denominator.
  await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: today, reason: 'Uncommitted', lines: [{ itemId: b.item.id, quantity: '100', price: '1' }] });

  const reconcile = async () => {
    const source = await read('/api/pier/export');
    const version = source.version;
    const report = await read('/api/pier/supplier-performance');
    assert.equal(report.timezone, 'UTC');
    assert.deepEqual(report.suppliers.find(s => s.supplierId === empty.id).items, []);
    const supplier = report.suppliers.find(s => s.supplierId === b.supplier.id);
    assert.equal(supplier.defects, null);
    assert.match(supplier.defectsUnavailable, /not recorded/);
    assert.equal(supplier.items.length, 2);
    for (const row of supplier.items) {
      const orders = source.purchaseOrders.filter(p => p.supplierId === supplier.supplierId && p.status === 'committed');
      const lines = orders.flatMap(p => p.lines.filter(l => l.itemId === row.itemId));
      const receipts = source.receipts.filter(r => orders.some(p => p.id === r.poId) && r.status === 'posted');
      const entries = receipts.flatMap(r => r.lines.filter(l => l.itemId === row.itemId).map(l => ({ receipt: r, line: l })));
      const total = entries.reduce((sum, e) => sum + parse(e.line.quantity), 0n);
      const ordered = lines.reduce((sum, l) => sum + parse(l.quantity), 0n);
      const known = entries.filter(e => e.receipt.supplierConfirmation);
      const timed = known.reduce((sum, e) => sum + parse(e.line.quantity), 0n);
      const timely = known.filter(e => e.receipt.createdAt.slice(0, 10) <= e.receipt.supplierConfirmation.promiseDate).reduce((sum, e) => sum + parse(e.line.quantity), 0n);
      assert.equal(parse(row.orderedQuantity), ordered);
      assert.equal(parse(row.receivedQuantity), total);
      assert.equal(parse(row.onTimeQuantity), timely);
      assert.equal(parse(row.lateQuantity), timed - timely);
      assert.equal(parse(row.unknownTimingQuantity), total - timed);
      assert.equal(parse(row.outstandingQuantity), ordered > total ? ordered - total : 0n);
      assert.equal(parse(row.excessQuantity), total > ordered ? total - ordered : 0n);
      assert.equal(parse(row.fillPercent), total * 100000000n / ordered);
      assert.equal(row.onTimePercent === null ? null : parse(row.onTimePercent), timed ? timely * 100000000n / timed : null);
      for (const evidence of row.receipts) {
        const original = source.receipts.find(r => r.id === evidence.receiptId);
        const line = original.lines.find(l => l.id === evidence.receiptLineId);
        const orderLine = lines.find(l => l.id === evidence.poLineId);
        assert.equal(evidence.quantity, line.quantity);
        assert.equal(evidence.supplierReference, original.supplierReference);
        assert.deepEqual(evidence.confirmation, original.supplierConfirmation);
        assert.equal(parse(evidence.priceDifference.replace('-', '')), (parse(line.cost) - parse(orderLine.price)) * (evidence.priceDifference.startsWith('-') ? -1n : 1n));
      }
    }
    assert.equal((await h.state()).version, version, 'reading a scorecard writes no business record');
    return supplier.items.find(row => row.itemId === b.item.id);
  };
  let row = await reconcile();
  assert.deepEqual([row.orderedQuantity, row.receivedQuantity, row.fillPercent, row.onTimeQuantity, row.lateQuantity, row.unknownTimingQuantity, row.onTimePercent], ['7', '4.25', '60.714285', '1.25', '2', '1', '38.461538']);
  assert.equal(row.receipts.find(r => r.receiptId === first.id).timing, 'on-time');
  assert.equal(row.receipts.find(r => r.receiptId === late.id).timing, 'late');
  assert.match(row.receipts.find(r => r.timing === 'unknown').exclusion, /No supplier confirmation/);
  // Reversing a receipt removes its contribution but keeps its cited exclusion.
  await h.command('receipt.reverse', { receiptId: late.id, reason: 'Duplicate warehouse tally' });
  row = await reconcile();
  assert.equal(row.receivedQuantity, '2.25');
  assert.equal(row.onTimePercent, '100');
  assert.equal(row.receipts.find(r => r.receiptId === late.id).timing, 'excluded');
  assert.match(row.receipts.find(r => r.receiptId === late.id).exclusion, /reversed/);
  // Scan over-receipts remain visible rather than creating negative outstanding quantities.
  await h.command('item.save', { ...powder, version: powder.version, barcode: '10002' });
  let extra = await h.command('receiving.start', { poId: powderPo.id, locationId: b.source.id });
  extra = await h.command('receiving.scan', { receivingId: extra.id, code: '10002' });
  await h.command('receiving.post', { receivingId: extra.id, version: extra.version, supplierReference: 'EXTRA-POWDER', overReason: 'Supplier shipped a full bag' });
  await reconcile();
  const over = (await read('/api/pier/supplier-performance')).suppliers.find(s => s.supplierId === b.supplier.id).items.find(i => i.itemId === powder.id);
  assert.deepEqual([over.fillPercent, over.outstandingQuantity, over.excessQuantity, over.onTimePercent], ['133.333333', '0', '0.25', null]);
  await h.invariant();
});
