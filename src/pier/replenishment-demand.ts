import { componentQuantity } from './kits';
import { decimal, format, SCALE, type Context } from './model';
import { ceilDivide, signedQuantity, supplyPosition } from './replenishment-position';

const DAY = 86_400_000;
export function sellThrough(c: Context, itemId: string, warehouse: string, selectedWindow: number, after?: string) {
  const now = Date.parse(c.now);
  const warehouses = new Map(c.s.locations.map(l => [l.id, l.warehouse]));
  // Channel quantities are dated at native capture, never at an invented provider date.
  const channelOrders = new Map(c.s.channelOrders.filter(source => source.orderId).map(source => [source.orderId, source]));
  const channelObservations = c.s.orders.filter(order => channelOrders.has(order.id) && order.fulfilment !== 'dropship')
    .flatMap(order => {
      const source = channelOrders.get(order.id)!;
      const destination = order.warehouse ?? c.s.channels.find(channel => channel.id === source.channelId)?.warehouse;
      if (destination !== warehouse) return [];
      const quantity = order.lines.reduce((total: bigint, line: any) => {
        const active = decimal(line.quantity) - decimal(line.cancelled);
        const component = line.kit?.components.find((part: any) => part.itemId === itemId);
        return total + (line.itemId === itemId ? active : component ? componentQuantity(active, component.quantity) : 0n);
      }, 0n);
      return [{ at: Date.parse(source.createdAt), quantity, channelOrderId: source.id }];
    });
  // A linked channel order contributes once, including after partial or full dispatch.
  const observations = c.s.shipments.filter(shipment => !channelOrders.has(shipment.orderId)).flatMap(shipment => shipment.lines
    .filter((line: any) => line.itemId === itemId || line.components?.some((part:any)=>part.itemId===itemId))
    .map((line: any) => ({
      at: Date.parse(shipment.createdAt),
      quantity: (line.reservations as { locationId: string; quantity: string }[])
        .filter(link => warehouses.get(link.locationId) === warehouse && (!('itemId' in link) || link.itemId === itemId))
        .reduce((n, link) => n + decimal(link.quantity), 0n),
      shipmentId: shipment.id,
    })));
  return [...new Set([30, 90, 365, selectedWindow])].sort((a, b) => a - b).map(days => {
    const rows = observations.filter(o => o.at > Math.max(now - days * DAY, after ? Date.parse(after) : -Infinity) && o.at <= now && o.quantity > 0n);
    const channelRows = channelObservations.filter(o => o.at > Math.max(now - days * DAY, after ? Date.parse(after) : -Infinity) && o.at <= now && o.quantity > 0n);
    const nativeShipped = rows.reduce((n, o) => n + o.quantity, 0n);
    const channelOrdered = channelRows.reduce((n, o) => n + o.quantity, 0n);
    const sold = nativeShipped + channelOrdered;
    return { days, sold: format(sold), soldPerDay: format(sold / BigInt(days)),
      nativeShippedQuantity: format(nativeShipped), channelOrderedQuantity: format(channelOrdered),
      channelOrderIds: channelRows.map(o => o.channelOrderId),
      hasHistory: sold > 0n, shipmentIds: [...new Set(rows.map(o => o.shipmentId))],
      from: new Date(now - days * DAY).toISOString(), through: c.now };
  });
}

export function learnedParameters(sold: string, windowDays: number, leadDays: number, reviewDays: number, safetyStock: string, unit?: string) {
  const q = signedQuantity(sold), divisor = BigInt(windowDays);
  const whole = (quantity: bigint) => ['each', 'ea', 'ea.'].includes(unit?.trim().toLowerCase() ?? '') ? ceilDivide(quantity, SCALE) * SCALE : quantity;
  const leadDemand = whole(ceilDivide(q * BigInt(leadDays), divisor));
  const reviewDemand = whole(ceilDivide(q * BigInt(reviewDays), divisor));
  const point = whole(leadDemand + decimal(safetyStock));
  return { leadDemand: format(leadDemand), reviewDemand: format(reviewDemand),
    reorderPoint: format(point), reorderQuantity: format(reviewDemand), maximum: format(point + reviewDemand) };
}

/** Dated committed receipts are expectations; undated transit stays separate. */
export function stockProjection(c: Context, position: ReturnType<typeof supplyPosition>, sold: string, windowDays: number) {
  const observed = signedQuantity(sold);
  const availableNow = signedQuantity(position.onHand) - signedQuantity(position.openDemand) - signedQuantity(position.outboundTransfers);
  if (observed === 0n) return { daysOfCover: null, projectedStockoutDate: availableNow < 0n ? c.now.slice(0, 10) : null,
    projectionBasis: 'No observed demand in the selected window; no future demand is invented.' };
  const cover = availableNow > 0n ? availableNow * BigInt(windowDays) * SCALE / observed : 0n;
  let cursor = Date.parse(c.now), stockout: number | null = null;
  const receipts = position.receipts.map(receipt => ({
    at: Date.parse(`${receipt.promiseDate.slice(0, 10)}T00:00:00Z`), quantity: decimal(receipt.quantity),
  })).filter(receipt => Number.isFinite(receipt.at) && receipt.at >= cursor).sort((a, b) => a.at - b.at);
  // Work in quantity-milliseconds * windowDays to retain exact demand between receipts.
  let balance = availableNow * BigInt(windowDays) * BigInt(DAY);
  for (const receipt of receipts) {
    const demand = observed * BigInt(receipt.at - cursor);
    if (balance < demand) { stockout = cursor + Number(balance > 0n ? balance / observed : 0n); break; }
    balance += receipt.quantity * BigInt(windowDays) * BigInt(DAY) - demand;
    cursor = receipt.at;
  }
  if (stockout === null) stockout = cursor + Number(balance > 0n ? balance / observed : 0n);
  return { daysOfCover: format(cover), projectedStockoutDate: stockout <= 8_640_000_000_000_000 ? new Date(stockout).toISOString().slice(0, 10) : null,
    projectionEstimated: position.receipts.some(receipt => !receipt.confirmed),
    projectionBasis: 'Selected-window observed demand rate; open demand deducted now; dated committed receipts included as expected supply. Supplier confirmation status is retained per receipt. Overdue receipts and undated inbound transit are not assumed to have arrived.' };
}
