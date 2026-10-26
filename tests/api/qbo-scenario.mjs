import assert from 'node:assert/strict';
import { basics, buy, receive } from './harness.mjs';

/** Public authenticated business path, shared by the live sandbox journey. */
export async function qboScenario(h, mapping, options = {}) {
  const b = await basics(h);
  if(mapping.sku)b.item=await h.command('item.save',{...b.item,sku:mapping.sku});
  const po = await buy(h, b, '12');
  await receive(h, b, po, '12');
  await h.command('sales.taxTable', { state: 'CA', rate: '0', reason: 'Reviewed exempt wholesale cutover' });
  const date = options.date ?? '2026-10-26';
  let bill = await h.command('supplierBill.save', { poId: po.id, reference: 'synthetic-pier-1', date, quantityTolerancePercent: '0', priceTolerancePercent: '0', lines: [{ poLineId: po.lines[0].id, quantity: '12', unitPrice: '0.25' }] });
  bill = await h.command('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence });
  const order = await h.command('order.create', { customerId: b.customer.id, shipTo: { state: 'CA', country: 'US' }, lines: [{ itemId: b.item.id, quantity: '4', price: '10' }] });
  await h.command('invoice.policy', { orderId: order.id, mode: 'shipment', terms: { kind: 'net30' }, reason: 'Invoice each physical shipment' });
  const first = await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'synthetic-pier-2', lines: [{ orderLineId: order.lines[0].id, quantity: '2' }] });
  const authorize = async invoice => {
    invoice = await h.command('invoice.review', { invoiceId: invoice.id, version: invoice.version });
    return h.command('invoice.authorize', { invoiceId: invoice.id, version: invoice.version });
  };
  const invoice = await authorize(await h.command('invoice.draft', { orderId: order.id, shipmentId: first.id, invoiceDate: date, charges: [{ kind: 'freight', amount: '3', taxable: false }] }));
  assert.equal(invoice.total, '23.000000000000');
  const connection = { ...mapping, sandbox: true, consent: true, cutoverDate: date, itemMappings: [{ sourceId: b.item.id, remoteId: mapping.itemId }], partyMappings: [{ sourceId: b.customer.id, remoteId: mapping.customerId }, { sourceId: b.supplier.id, remoteId: mapping.supplierId }] };
  await h.command('book.qboConnect', { ...connection, consent: false }, { error: 'BOOK_CONSENT' });
  await h.command('book.qboConnect', connection);
  await h.command('book.sync', {});
  let state = await h.state();
  const posting = (sourceId, kind) => state.bookJobs.find(j => j.sourceId === sourceId && j.kind === kind);
  for (const [source, kind] of [[invoice.id, 'invoice'], [bill.id, 'bill']]) {
    const job = posting(source, kind); assert.ok(['posted', 'reconciled'].includes(job?.status), JSON.stringify(job)); assert.ok(job.remoteId);
  }
  const firstRemote = posting(invoice.id, 'invoice').remoteId;
  await h.command('book.sync', {}); state = await h.state(); assert.equal(posting(invoice.id, 'invoice').remoteId, firstRemote);
  const returned = await h.command('return.create', { shipmentId: first.id, shipmentLineId: first.lines[0].id, locationId: b.source.id, quantity: '1', reason: 'One returned invoiced unit' });
  let credit = await h.command('invoice.credit.draft', { invoiceId: invoice.id, kind: 'return', returnId: returned.id, reason: 'Retain linked customer credit', lines: [{ invoiceLineId: invoice.lines[0].id, quantity: '1' }] });
  credit = await h.command('invoice.credit.review', { creditId: credit.id, version: credit.version });
  credit = await h.command('invoice.credit.authorize', { creditId: credit.id, version: credit.version });
  await h.command('book.sync', {}); state = await h.state();
  const remoteCredit = posting(credit.id, 'credit'); assert.equal(remoteCredit?.status, 'posted', JSON.stringify(remoteCredit));
  assert.equal(state.customerBalances[b.customer.id].USD, '13.000000000000');
  if(options.externalPayment){
    await options.externalPayment(firstRemote,13);
    await h.command('book.sync',{});state=await h.state();
    assert.equal(state.customerBalances[b.customer.id].USD,'0.000000000000');
    assert.equal(state.invoicePayments.filter(p=>p.invoiceId===invoice.id&&p.status==='succeeded').length,1);
    await h.command('book.sync',{});state=await h.state();
    assert.equal(state.invoicePayments.filter(p=>p.invoiceId===invoice.id&&p.status==='succeeded').length,1);
    const paid=state.invoices.find(r=>r.id===invoice.id);
    await h.command('invoice.void',{invoiceId:paid.id,version:paid.version,reason:'Paid void refused'},{error:'INVOICE_PAID'});
  }
  const serialized = JSON.stringify(state);
  for (const value of [mapping.clientSecret,mapping.refreshToken]) assert.equal(serialized.includes(value), false, 'connection secrets stay outside state');
  return { b, po, bill, order, invoice, credit, firstRemote, creditRemote: remoteCredit.remoteId, state };
}
