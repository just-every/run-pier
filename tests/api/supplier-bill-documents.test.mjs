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
