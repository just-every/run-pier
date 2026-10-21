import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, basics, buy, receive } from './harness.mjs';

test('BUY-004: retained invoice/BOL units and packs gate exact approval without rewriting receipt stock', async () => {
  const h = await installation();
  try {
    const b = await basics(h), po = await buy(h, b, '12');
    const receipt = await receive(h, b, po, '11');
    const before = await h.state();
    const documents = {
      invoice: { reference: 'M-7731', original: '  Invoice M-7731: 24 half-unit packs = 12 each at USD 0.25\n', lines: [{ poLineId: po.lines[0].id, quantity: '24', packSize: '3', unit: 'cartons' }] },
      bol: { reference: 'BOL-42', original: 'BOL-42: 22 half-unit packs = 11 each', lines: [{ poLineId: po.lines[0].id, quantity: '22', packSize: '0.5', unit: 'each' }] },
    };
    const payload = { poId: po.id, reference: 'M-7731', date: '2026-10-21', quantityTolerancePercent: '10', priceTolerancePercent: '0', documents, lines: [{ poLineId: po.lines[0].id, quantity: '12', unitPrice: '0.25' }] };
    let bill = await h.command('supplierBill.save', payload);
    assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('base unit')));
    assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('pack 3')));
    assert.ok(bill.match.differences.some(d => d.kind === 'bolDocument'));
    await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
    documents.invoice.lines[0].unit = 'each'; documents.invoice.lines[0].packSize = '0.5';
    bill = await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version });
    // A quantity tolerance cannot excuse a source transcription/conversion mismatch.
    await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
    documents.bol.original = 'Corrected BOL-42: 24 half-unit packs = 12 each'; documents.bol.lines[0].quantity = '24';
    bill = await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version });
    assert.equal(bill.documents.invoice.lines[0].baseQuantity, '12');
    assert.equal(bill.documents.invoice.original, documents.invoice.original);
    assert.equal(bill.documentHistory.length, 2);
    assert.equal(bill.documentHistory[1].documents.bol.original, 'BOL-42: 22 half-unit packs = 11 each');
    await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: 'stale' }, { error: 'SUPPLIER_BILL_STALE' });
    bill = await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
    assert.equal(bill.status, 'approved');
    assert.equal(bill.total, '3.000000000000');
    await h.command('supplierBill.save', { ...payload, id: bill.id, version: bill.version }, { error: 'SUPPLIER_BILL_APPROVED' });
    const after = await h.invariant();
    assert.deepEqual(after.movements, before.movements);
    assert.deepEqual(after.receipts.find(r => r.id === receipt.id), before.receipts.find(r => r.id === receipt.id));
    const exported = await (await h.request('/api/pier/export')).json();
    assert.ok(JSON.stringify(exported).includes(documents.bol.original));
    // Exact conversion refuses sub-micro base units atomically.
    documents.invoice.lines[0].quantity = '0.000001'; documents.invoice.lines[0].packSize = '0.5';
    await h.command('supplierBill.save', { ...payload, reference: 'M-BAD' }, { error: 'SUPPLIER_DOCUMENT' });
    assert.equal((await h.state()).supplierBills.length, 1);
  } finally { await h.close(); }
});

test('BUY-004: invoice and BOL freight and tax are matched to the PO across partial receipts before approval', async () => {
  const h = await installation();
  try {
    const b = await basics(h);
    let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2026-11-01', reason: 'Freight journey', freight: '5', tax: '0.40', lines: [{ itemId: b.item.id, quantity: '24', price: '0.25' }] });
    await h.command('po.approve', { poId: po.id, version: po.version });
    po = await h.command('po.commit', { poId: po.id, version: po.version });
    await receive(h, b, po, '11');
    const line = po.lines[0].id;
    const sources = (freight, bolFreight) => ({
      invoice: { reference: 'M-9001', original: 'Invoice M-9001: 24 half-unit packs, freight and tax shown', freight, tax: '0.40', lines: [{ poLineId: line, quantity: '24', packSize: '0.5', unit: 'each' }] },
      bol: { reference: 'BOL-9001', original: 'BOL-9001: 22 half-unit packs', freight: bolFreight, lines: [{ poLineId: line, quantity: '24', packSize: '0.5', unit: 'each' }] },
    });
    const payload = (freight, bolFreight, extra = {}) => ({ poId: po.id, reference: 'M-9001', date: '2026-10-21', quantityTolerancePercent: '10', priceTolerancePercent: '0', freight, tax: '0.40', documents: sources(freight, bolFreight), lines: [{ poLineId: line, quantity: '12', unitPrice: '0.25' }], ...extra });
    await h.command('supplierBill.save', payload('5.005', '5'), { error: 'SUPPLIER_CHARGE' });
    await h.command('supplierBill.save', { ...payload('5', '5'), tax: '-1' }, { error: 'DECIMAL' });
    // The invoice charges more freight than the PO promised and the BOL states yet another amount.
    let bill = await h.command('supplierBill.save', payload('6.5', '5'));
    assert.equal(bill.total, '9.900000000000');
    assert.ok(bill.match.differences.some(d => d.kind === 'freightPurchaseOrder' && !d.withinTolerance));
    assert.ok(bill.match.differences.some(d => d.kind === 'bolDocument' && d.message.includes('freight 5')));
    await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
    // The invoice text says 6.50 but the retained record says otherwise: a transcription mismatch is never excused.
    bill = await h.command('supplierBill.save', { ...payload('5', '5'), id: bill.id, version: bill.version, documents: { ...sources('5', '5'), invoice: { ...sources('5', '5').invoice, freight: '6.5' } } });
    assert.ok(bill.match.differences.some(d => d.kind === 'invoiceDocument' && d.message.includes('freight 6.5')));
    bill = await h.command('supplierBill.save', { ...payload('5', '5'), id: bill.id, version: bill.version });
    assert.deepEqual(bill.match.charges.freight, { billed: '5', purchaseOrder: '5', priorApproved: '0' });
    assert.equal(bill.total, '8.400000000000');
    bill = await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
    assert.equal(bill.status, 'approved');
    // A second invoice for the same PO counts the freight already approved.
    await receive(h, b, po, '13');
    let second = await h.command('supplierBill.save', { ...payload('1', null), reference: 'M-9002', tax: '0', documents: null });
    assert.deepEqual(second.match.charges.freight, { billed: '1', purchaseOrder: '5', priorApproved: '5' });
    assert.ok(second.match.differences.some(d => d.kind === 'freightPurchaseOrder' && !d.withinTolerance));
    await h.command('supplierBill.approve', { id: second.id, version: second.version, receiptEvidence: second.match.receiptEvidence }, { error: 'SUPPLIER_BILL_MATCH' });
    // The buyer's explicit tolerance decides a small overage: 1 over a 5 expectation is 20 percent.
    second = await h.command('supplierBill.save', { ...payload('1', null), reference: 'M-9002', tax: '0', documents: null, priceTolerancePercent: '25', id: second.id, version: second.version });
    assert.ok(second.match.differences.some(d => d.kind === 'freightPurchaseOrder' && d.withinTolerance));
    second = await h.command('supplierBill.approve', { id: second.id, version: second.version, receiptEvidence: second.match.receiptEvidence });
    assert.equal(second.total, '4.000000000000');
    const exported = await (await h.request('/api/pier/export')).json();
    assert.deepEqual(exported.supplierBills.map(x => [x.freight, x.tax]).sort(), [['1', '0'], ['5', '0.4']]);
    await h.invariant();
  } finally { await h.close(); }
});
