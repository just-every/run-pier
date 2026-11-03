import type { Actor, Row, State } from './model';

/** Operational projections are positive field lists, never commercial copies. */
export const pickFields = (row: Row, keys: string[]) => Object.fromEntries(
  ['id', 'version', 'createdAt', ...keys].filter(key => Object.hasOwn(row, key)).map(key => [key, structuredClone(row[key])]),
) as Row;

export function physicalDocuments(s: State, actor: Actor, locations: Row[]) {
  const ids = new Set(locations.map(location => location.id));
  const warehouseAllowed = (warehouse: string) => locations.some(location => location.warehouse === warehouse);
  const completeWarehouse = (warehouse: string) => warehouseAllowed(warehouse) && s.locations.filter(location => location.warehouse === warehouse && location.kind === 'bin').every(location => ids.has(location.id));
  const orderAllowed = (order: Row) => {
    if (!warehouseAllowed(order.warehouse) || order.routing?.reserveWarehouses?.some((warehouse: string) => warehouse !== order.warehouse)) return false;
    const allocations = s.reservations.filter(reservation => reservation.orderId === order.id);
    const shipped = s.shipments.filter(shipment => shipment.orderId === order.id).flatMap(shipment => shipment.lines.flatMap((line: any) => line.reservations ?? []));
    return allocations.every(reservation => ids.has(reservation.locationId)) && shipped.every((link: any) => ids.has(link.locationId)) &&
      (allocations.length + shipped.length > 0 || completeWarehouse(order.warehouse));
  };
  const orders = s.orders.filter(orderAllowed).map(order => ({ ...pickFields(order, ['reference', 'warehouse', 'documentType', 'acceptedAt', 'promiseDate', 'carrierId', 'shipByDate']),
    lines: order.lines.map((line: Row) => pickFields(line, ['itemId', 'quantity', 'dispatched', 'cancelled', 'kit'])) }));
  const orderIds = new Set(orders.map(order => order.id));
  const purchaseOrders = s.purchaseOrders.filter(po => po.status === 'committed' && !po.dropshipId &&
    (!actor.permissions || warehouseAllowed(po.destinationWarehouse))).map(po => ({ ...pickFields(po, ['reference', 'destinationWarehouse', 'status', 'promiseDate']),
    lines: po.lines.map((line: Row) => pickFields(line, ['itemId', 'quantity', 'received'])) }));
  const poIds = new Set(purchaseOrders.map(po => po.id));
  const receivings = s.receivings.filter(receiving => poIds.has(receiving.poId) && ids.has(receiving.locationId) && receiving.scans.every((scan: any) => ids.has(scan.locationId)))
    .map(receiving => ({ ...pickFields(receiving, ['poId', 'locationId', 'status', 'receiptId']), scans: receiving.scans.map((scan: Row) => pickFields(scan, ['code', 'kind', 'poLineId', 'itemId', 'locationId', 'quantity', 'trace', 'at'])) }));
  const receivingIds = new Set(receivings.map(receiving => receiving.id));
  const receipts = s.receipts.filter(receipt => poIds.has(receipt.poId) && receipt.lines.every((line: any) => ids.has(line.locationId)))
    .map(receipt => ({ ...pickFields(receipt, ['poId', 'supplierReference', 'status', 'receivingId', 'variance', 'overReason']),
      lines: receipt.lines.map((line: Row) => pickFields(line, ['poLineId', 'itemId', 'locationId', 'quantity', 'movementId', 'trace'])) }));
  const waves = s.waves.filter(wave => warehouseAllowed(wave.warehouse) && wave.orders.every((entry: any) => orderIds.has(entry.orderId)) && wave.lines.every((line: any) => ids.has(line.locationId)))
    .map(wave => ({ ...pickFields(wave, ['number', 'pickMode', 'carrierId', 'dock', 'warehouse', 'orders', 'status', 'pickedAt']),
      lines: wave.lines.map((line: Row) => ({ ...pickFields(line, ['orderId', 'orderLineId', 'itemId', 'locationId', 'zone', 'quantity', 'picked', 'status', 'short']), scans: (line.scans ?? []).map((scan: Row) => pickFields(scan, ['at', 'kind', 'quantity', 'trace'])) })) }));
  const waveIds = new Set(waves.map(wave => wave.id));
  const packs = s.packs.filter(pack => orderIds.has(pack.orderId) && waveIds.has(pack.waveId))
    .map(pack => pickFields(pack, ['waveId', 'orderId', 'tote', 'cartons', 'status', 'packedAt', 'shipmentId', 'mergedZones']));
  const shipments = s.shipments.filter(shipment => orderIds.has(shipment.orderId) && shipment.lines.every((line: any) => (line.reservations ?? []).every((link: any) => ids.has(link.locationId))))
    .map(shipment => pickFields(shipment, ['orderId', 'barcode', 'warehouse', 'reference', 'lines', 'waveId', 'packId']));
  return { orders, purchaseOrders, receivings, receipts, waves, packs, shipments,
    carriers: s.carriers.filter(carrier => warehouseAllowed(carrier.warehouse)).map(carrier => pickFields(carrier, ['name', 'warehouse', 'dock', 'cutoff', 'timeZone'])),
    receivingIds, orderIds, waveIds };
}
