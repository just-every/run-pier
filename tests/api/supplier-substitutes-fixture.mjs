import { basics } from './harness.mjs';

export async function substituteScenario(h, tag = 'synthetic-pier') {
  const b = await basics(h);
  const alternative = await h.command('item.save', { sku: tag + '-alternative', name: 'Exact alternative', unit: 'each', packSize: '1' });
  const missing = await h.command('item.save', { sku: tag + '-unmapped', name: 'Unmapped item', unit: 'each', packSize: '1' });
  const incompatible = await h.command('item.save', { sku: tag + '-incompatible', name: 'Different base unit', unit: 'kg', packSize: '1' });
  async function purchase(lines) {
    let po = await h.command('po.draft', { supplierId: b.supplier.id, promiseDate: '2099-01-01', reason: tag + '-1', lines });
    await h.command('po.approve', { poId: po.id, version: po.version });
    return h.command('po.commit', { poId: po.id, version: po.version });
  }
  const stock = await purchase([{ itemId: alternative.id, quantity: '14', price: '7.37' }]);
  for (const [locationId, quantity] of [[b.source.id, '10'], [b.destination.id, '4']])
    await h.command('receipt.create', { poId: stock.id, supplierReference: tag + '-2', lines: [{ poLineId: stock.lines[0].id, locationId, quantity, cost: '7.37' }] });
  const foreign = await h.command('order.create', { customerId: b.customer.id, promiseDate: '2099-01-01', lines: [{ itemId: alternative.id, quantity: '3', price: '19.97' }] });
  const hold = await h.command('channel.hold', { itemId: alternative.id, warehouse: 'North', quantity: '2', reason: tag + '-protected' });
  const first = await h.command('order.create', { customerId: b.customer.id, promiseDate: '2099-01-01', lines: [{ itemId: b.item.id, quantity: '8' }, { itemId: missing.id, quantity: '2' }] });
  const second = await h.command('order.create', { customerId: b.customer.id, promiseDate: '2099-01-01', lines: [{ itemId: b.item.id, quantity: '4' }] });
  let po = await purchase([{ itemId: b.item.id, quantity: '12', price: '31.79' }, { itemId: missing.id, quantity: '2', price: '2.79' }]);
  po = await h.command('po.confirm', { poId: po.id, version: po.version, promiseDate: '2099-02-01', source: tag + '-supplier-confirmation', body: 'Manual supplier evidence: delivery delayed until February.', confirm: true });
  return { ...b, alternative, missing, incompatible, foreign, hold, first, second, po, stock };
}
