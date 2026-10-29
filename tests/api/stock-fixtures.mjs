import { basics } from './harness.mjs';

export async function stockJourney(h) {
  const b = await basics(h);
  const north2 = await h.command('location.save', { name: 'A2', warehouse: 'North', kind: 'bin' });
  const south2 = await h.command('location.save', { name: 'B2', warehouse: 'South', kind: 'bin' });
  await h.command('item.save', { sku: 'EMPTY', name: 'Unstocked steel washer', barcode: '10002', unit: 'each', packSize: '1' });
  const purchase = async (warehouse, quantity, received, location, item = b.item) => {
    let po = await h.command('po.draft', { supplierId: b.supplier.id, ...(warehouse ? { destinationWarehouse: warehouse } : {}), promiseDate: '2026-11-01', reason: 'Warehouse restock', lines: [{ itemId: item.id, quantity, price: '0.25' }] });
    await h.command('po.approve', { poId: po.id, version: po.version });
    po = await h.command('po.commit', { poId: po.id, version: po.version });
    if (received !== '0') await h.command('receipt.create', { poId: po.id, supplierReference: `${warehouse ?? 'Unassigned'} delivery`, lines: [{ poLineId: po.lines[0].id, locationId: location.id, quantity: received, cost: '0.25' }] });
    return po;
  };
  await purchase('North', '20', '10', b.source);
  await purchase('North', '2', '2', north2);
  await purchase('South', '12', '6', b.destination);
  await purchase('South', '3', '3', south2);
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '4' }] });
  const shipment = await h.command('dispatch.create', { orderId: order.id, shipmentReference: 'Workshop collection', lines: [{ orderLineId: order.lines[0].id, quantity: '1' }] });
  await h.command('return.create', { shipmentId: shipment.id, reason: 'Inspection pending', shipmentLineId: shipment.lines[0].id, quantity: '0.5', locationId: b.source.id });
  await h.command('transfer.send', { itemId: b.item.id, fromLocationId: north2.id, toLocationId: south2.id, transitLocationId: b.transit.id, quantity: '0.5', reason: 'South overflow' });
  await purchase('South', '7', '0', b.destination);
  await h.command('channel.hold', { itemId: b.item.id, warehouse: 'North', quantity: '0.5', reason: 'Protected channel stock' });
  const heldItem = await h.command('item.save', { sku: 'synthetic-pier-8610', name: 'Protected brass pins', barcode: 'synthetic-pier-8611', unit: 'each', packSize: '1' });
  await purchase('North', '3.5', '3.5', north2, heldItem);
  const hold = await h.command('channel.hold', { itemId: heldItem.id, warehouse: 'North', quantity: '3.5', reason: 'Protect every available pin' });
  const heldOrder = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: heldItem.id, quantity: '5' }] });
  const legacyPo = await purchase(undefined, '9.25', '2', b.source);
  return { ...b, north2, heldItem, hold, heldOrder, legacyPo };
}
