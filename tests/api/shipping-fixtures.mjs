import { basics, buy, receive } from './harness.mjs';
export const destination = { name: 'North Cafe', street1: '417 Montgomery Street', city: 'San Francisco', state: 'CA', zip: '94104', country: 'US' };
export async function packedOrder(h) {
  const b = await basics(h), po = await buy(h, b, '4'); await receive(h, b, po, '4');
  const order = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '1', price: '2' }] });
  const carrier = await h.command('carrier.save', { name: 'Parcel pickup', warehouse: 'North', dock: 'Dock A', cutoff: '16:00', timeZone: 'America/Chicago' });
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: 'A1', itemCode: '10001', quantity: '1' });
  const payload = { waveId: wave.id, orderId: order.id };
  await h.command('pack.scan', { ...payload, code: '10001' });
  await h.command('pack.measure', { ...payload, carton: 1, weight: '2.5', length: '12', width: '8', height: '4' });
  const pack = await h.command('pack.close', payload);
  return { b, order, pack, payload };
}
