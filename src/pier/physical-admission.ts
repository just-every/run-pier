import { Problem, type Actor, type State } from './model';
import { physicalDocuments } from './physical-documents';
import { resolve } from './floor/codes';

const denied = () => { throw new Problem('SCOPE', 'Your current warehouse grant does not authorize this operation.', null, 403); };
export function admitPhysicalCommand(s: State, actor: Actor, locations: State['locations'], type: string, p: any) {
  const ids = new Set(locations.map(location => location.id));
  if (['count.capture', 'count.record', 'count.approve', 'count.recount'].includes(type)) {
    const locationId = type === 'count.capture' ? p.locationId : s.counts.find(count => count.id === p.countId)?.locationId;
    if (!ids.has(locationId)) denied();
    return;
  }
  const documents = physicalDocuments(s, actor, locations);
  if (type === 'receiving.start') {
    if (!documents.purchaseOrders.some(po => po.id === p.poId) || !ids.has(p.locationId)) denied();
    const po = s.purchaseOrders.find(po => po.id === p.poId)!;
    if (s.locations.find(location => location.id === p.locationId)?.warehouse !== po.destinationWarehouse) denied();
    const open = s.receivings.find(receiving => receiving.poId === p.poId && receiving.status === 'open');
    if (open && !documents.receivingIds.has(open.id)) denied();
    return;
  }
  if (['receiving.scan', 'receiving.remove', 'receiving.post'].includes(type)) {
    if (!documents.receivingIds.has(p.receivingId)) denied();
    if (type === 'receiving.scan') {
      // A bin scan retargets the tally. Resolve it before any task or stock write.
      // Raw supplier notices can contain unreviewed commercial or private text.
      const receiving = s.receivings.find(row => row.id === p.receivingId)!;
      const warehouse = s.locations.find(location => location.id === receiving.locationId)?.warehouse;
      const scan = resolve(s, p.code, warehouse);
      if ('bin' in scan && (!ids.has(scan.bin.id) || scan.bin.warehouse !== warehouse)) denied();
      if (receiving.notices?.length) denied();
    }
    if (p.landedCost !== undefined) denied();
    return;
  }
  if (type === 'dispatch.create') {
    if (!documents.orderIds.has(p.orderId)) denied();
    return;
  }
  if (type === 'wave.release') {
    if (!documents.carriers.some(carrier => carrier.id === p.carrierId) || !Array.isArray(p.orderIds) || !p.orderIds.every((id: string) => documents.orderIds.has(id))) denied();
    // Pick sequencing and short-pick routing can inspect every bin in the wave.
    const warehouse = s.carriers.find(carrier => carrier.id === p.carrierId)?.warehouse;
    if (s.locations.some(location => location.warehouse === warehouse && location.kind === 'bin' && !ids.has(location.id))) denied();
    return;
  }
  if (['pick.scan', 'pick.short', 'pack.scan', 'pack.carton', 'pack.measure', 'pack.close', 'pack.dispatch'].includes(type)) {
    if (!documents.waveIds.has(p.waveId) || type.startsWith('pack.') && !documents.orderIds.has(p.orderId)) denied();
    return;
  }
  return denied();
}

/** Check computed effects too: a short pick must never route to a foreign bin. */
export function admitPhysicalEffects(before: State, after: State, locations: State['locations']) {
  const ids = new Set(locations.map(location => location.id));
  if (after.movements.slice(before.movements.length).some(movement => !ids.has(movement.locationId))) denied();
  for (const reservation of [...before.reservations, ...after.reservations]) {
    const old = before.reservations.find(row => row.id === reservation.id), next = after.reservations.find(row => row.id === reservation.id);
    if (JSON.stringify(old) !== JSON.stringify(next) && !ids.has(reservation.locationId)) denied();
  }
  for (const receiving of after.receivings) {
    if (JSON.stringify(receiving) === JSON.stringify(before.receivings.find(row => row.id === receiving.id))) continue;
    if (!ids.has(receiving.locationId) || receiving.scans.some((scan: any) => !ids.has(scan.locationId))) denied();
  }
}
