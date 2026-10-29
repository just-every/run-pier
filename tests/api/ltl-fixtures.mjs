import { basics, buy, receive } from './harness.mjs';

export async function packedFreight(h) {
  const b = await basics(h);
  await receive(h, b, await buy(h, b, '8'), '8');
  await h.command('business.save', { name: 'Synthetic Pier Freight', address: '10 North Dock', shipTo: {} });
  const order = await h.command('order.create', { customerId: b.customer.id, warehouse: 'North', lines: [{ itemId: b.item.id, quantity: '4' }] });
  const carrier = await h.command('carrier.save', { name: 'Manual freight pickup', warehouse: 'North', dock: 'Dock A', cutoff: '23:59', timeZone: 'America/Chicago' });
  let wave = await h.command('wave.release', { carrierId: carrier.id, orderIds: [order.id] });
  wave = await h.command('pick.scan', { waveId: wave.id, lineId: wave.lines[0].id, binCode: b.source.name, itemCode: b.item.barcode, quantity: '4' });
  const payload = { waveId: wave.id, orderId: order.id };
  let pack;
  for (let carton = 1; carton <= 2; carton++) {
    if (carton === 2) await h.command('pack.carton', payload);
    for (let unit = 0; unit < 2; unit++) pack = await h.command('pack.scan', { ...payload, code: b.item.barcode });
    await h.command('pack.measure', { ...payload, carton, weight: String(carton + 2), length: '12', width: '8', height: '6' });
  }
  pack = await h.command('pack.close', payload);
  return { b, order, wave, pack, payload };
}
export function manifestInput(pack) {
  return { packId: pack.id, packVersion: pack.version, reference: 'synthetic-pier-ltl-1', shipFrom: '10 North Dock', shipTo: '20 South Dock', commodity: 'Synthetic brass fittings', accessorials: ['liftgate'], pallets: [
    { cartons: [1], weight: '10', length: '48', width: '40', height: '36', nmfc: '12345', freightClass: '70' },
    { cartons: [2], weight: '12', length: '48', width: '40', height: '42', nmfc: '12346', freightClass: '85' },
  ] };
}
export const manualQuote = { carrier: 'Synthetic Freight Lines', scac: 'SYNT', quoteReference: 'synthetic-pier-quote-1', amount: '125.50', freightTerms: 'Prepaid', evidence: 'Operator retained the carrier phone quote including liftgate' };
export const pickupReview = { proNumber: 'synthetic-pier-pro-1', pickupDate: '2026-11-02', reason: 'Owner reviewed the exact quote, cartons, accessorials and operator pickup details' };
