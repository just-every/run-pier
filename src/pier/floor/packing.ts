import { tracePack } from '../trace';
import { componentQuantity } from '../kits';
import { SCALE, min } from '../model';
import {
  decimal,
  format,
  get,
  text,
  fail,
  row,
  type Context,
  type Row,
} from "../model";
import { orders } from "../orders";
import { itemScan } from "./codes";
import { reservedFor } from "./wave-coverage";
import { zoneGroups } from './zone-picks';

// The pack step: units picked in a wave are scanned into numbered cartons, each
// carton is weighed and measured by hand, and the order is marked packed. Only
// a packed order's packed units ship, through the same dispatch that consumes
// the order's own reservations.

const sum = (rows: any[], key = "quantity") => rows.reduce((n: bigint, x: any) => n + decimal(x[key]), 0n);
const DIMENSION = /^\d{1,4}(\.\d{1,2})?$/;

/** Units of an order line picked in a wave, and how many of them are packed. */
export function pickedFor(w: Row, orderLineId: string, itemId?: string) {
  return sum(w.lines.filter((l: any) => l.orderLineId === orderLineId && (!itemId || l.itemId === itemId)), "picked");
}
const packedFor = (pack: Row, orderLineId: string, itemId?: string) =>
  sum(pack.cartons.flatMap((carton: any) => carton.lines.filter((l: any) => l.orderLineId === orderLineId && (!itemId || l.itemId === itemId))));

function packOf(c: Context, p: any, create: boolean) {
  const w = get(c.s, "waves", p.waveId);
  if (!w.orders.some((o: any) => o.orderId === p.orderId)) fail("ORDER", "That order is not on this wave.");
  let pack = c.s.packs.find((x) => x.waveId === w.id && x.orderId === p.orderId);
  if (!pack) {
    if (!create) fail("PACK", "Scan an item into a carton first.");
    pack = row(c, "packs", { waveId: w.id, orderId: p.orderId, tote: w.orders.find((o: any) => o.orderId === p.orderId).tote, cartons: [{ number: 1, lines: [], weight: null, length: null, width: null, height: null }], status: "packing", packedAt: null, shipmentId: null });
  }
  return { w, pack: pack as Row };
}

export function packing(c: Context, type: string, p: any): Row | undefined {
  const { w, pack } = packOf(c, p, type === "pack.scan");
  if (type !== "pack.dispatch" && pack.status !== "packing") fail("PACK_STATE", "This order is already packed.");
  if (type === "pack.scan") {
    const hit = itemScan(c.s, p.code, "pack it");
    const lines = w.lines.filter((l: any) => l.orderId === pack.orderId && l.itemId === hit.item.id);
    if (!lines.length) fail("NOT_ON_ORDER", `${hit.item.name} (${hit.item.sku}) was not picked for this order. Nothing was packed.`);
    const orderLineId = (lines.find((line: any) => pickedFor(w, line.orderLineId, hit.item.id) > packedFor(pack, line.orderLineId, hit.item.id)) ?? lines[0]).orderLineId, picked = pickedFor(w, orderLineId, hit.item.id), packed = packedFor(pack, orderLineId, hit.item.id);
    if (packed + hit.units > picked)
      fail("OVER_PACK", `${format(picked)} ${hit.item.unit} of ${hit.item.sku} were picked and ${format(packed)} are packed; this ${hit.kind === "case" ? "case " : ""}scan would pack ${format(hit.units)}. Nothing was packed.`);
    // Units already in another unshipped carton for this line (an earlier
    // wave's pack) are not reserved twice; shipped units are no longer reserved.
    const elsewhere = sum(c.s.packs.filter(x => x.id !== pack.id && x.status !== 'shipped').flatMap(x => x.cartons.flatMap((carton: any) => carton.lines.filter((l: any) => l.orderLineId === orderLineId && l.itemId === hit.item.id))));
    if (elsewhere + packed + hit.units > reservedFor(c.s, orderLineId, hit.item.id))
      fail("ALREADY_PACKED", `${get(c.s, "orders", pack.orderId).reference}'s ${hit.item.sku} units are already packed on another wave or have shipped. Nothing was packed.`);
    const trace=tracePack(c,w,pack,orderLineId,hit.item.id,hit.trace??p.trace,hit.units);
    const carton = pack.cartons.at(-1);
    const line = carton.lines.find((l: any) => l.orderLineId === orderLineId && l.itemId === hit.item.id);
    if (line) { line.quantity = format(decimal(line.quantity) + hit.units); if(trace)line.trace=[...(line.trace??[]),...trace]; }
    else carton.lines.push({ orderLineId, itemId: hit.item.id, quantity: format(hit.units), ...(trace?{trace}:{}) });
  } else if (type === "pack.carton") {
    if (!pack.cartons.at(-1).lines.length) fail("CARTON_EMPTY", "Scan items into the open carton before starting another.");
    pack.cartons.push({ number: pack.cartons.length + 1, lines: [], weight: null, length: null, width: null, height: null });
  } else if (type === "pack.measure") {
    const carton = pack.cartons.find((x: any) => x.number === Number(p.carton));
    if (!carton) fail("CARTON", "Choose a carton on this order.");
    for (const key of ["weight", "length", "width", "height"]) {
      const value = String(p[key] ?? "").trim();
      if (!DIMENSION.test(value) || Number(value) <= 0) fail("MEASURE", "Enter weight in pounds and length, width and height in inches, each above zero with up to two decimals.");
      carton[key] = value;
    }
  } else if (type === "pack.close") {
    const contributions = zoneGroups(w as any, pack.orderId);
    const unfinished = contributions.filter(zone => zone.linesOpen);
    if (unfinished.length) fail('ZONE_INCOMPLETE', `Finish zone picks for this order before merging tote ${pack.tote}: ${unfinished.map(zone => zone.name).join(', ')}.`);
    for (const l of w.lines.filter((l: any) => l.orderId === pack.orderId)) {
      const picked = pickedFor(w, l.orderLineId, l.itemId), packed = packedFor(pack, l.orderLineId, l.itemId);
      if (packed !== picked) fail("UNPACKED", `${format(picked - packed)} picked ${get(c.s, "items", l.itemId).sku} are not in a carton yet.`);
    }
    pack.cartons = pack.cartons.filter((x: any) => x.lines.length);
    if (!pack.cartons.length) fail("CARTON_EMPTY", "Nothing was picked for this order to pack.");
    const unmeasured = pack.cartons.find((x: any) => !x.weight);
    if (unmeasured) fail("MEASURE", `Weigh and measure carton ${unmeasured.number} before marking the order packed.`);
    pack.status = "packed";
    pack.packedAt = c.now;
    pack.packedBy = c.actor.id;
    if (contributions.length) pack.mergedZones = contributions.map(zone => zone.name);
  } else if (type === "pack.dispatch") {
    if (pack.status !== "packed") fail("PACK_STATE", pack.status === "shipped" ? "This pack already shipped." : "Mark the order packed first.");
    const quantities = new Map<string, bigint>();
    for (const carton of pack.cartons) for (const l of carton.lines) quantities.set(l.orderLineId, (quantities.get(l.orderLineId) ?? 0n) + decimal(l.quantity));
    const order = get(c.s, 'orders', pack.orderId);
    for (const line of order.lines.filter((line: any) => line.kit)) {
      const packed = pack.cartons.flatMap((carton: any) => carton.lines.filter((part: any) => part.orderLineId === line.id));
      const q = (itemId: string) => sum(packed.filter((part: any) => part.itemId === itemId));
      const physical = q(line.itemId);
      const virtual = line.kit.components.map((part: any) => q(part.itemId) * SCALE / decimal(part.quantity)).reduce((a: bigint,b: bigint) => min(a,b));
      if (line.kit.components.some((part: any) => q(part.itemId) !== componentQuantity(virtual, part.quantity))) fail('KIT_PACK', 'Pack complete component sets before dispatching a kit.');
      quantities.set(line.id, physical + virtual);
    }
    const shipment = orders(c, "dispatch.create", {
      warehouse:w.warehouse,
      orderId: pack.orderId,
      shipmentReference: text(p.shipmentReference, "Shipment reference"),
      lines: [...quantities].map(([orderLineId, q]) => ({ orderLineId, quantity: format(q) })),
    })!;
    const labels = c.s.shippingJobs.filter(j => j.packId === pack.id);
    if (labels.length && (labels.length !== pack.cartons.length || labels.some(j => !['labelled','delivered'].includes(j.status)))) fail('LABELS', 'Buy or reconcile every carton label before dispatching this carrier shipment.');
    if (labels.length) {
      shipment.tracking = labels.map(j => ({ carton: j.carton, trackingCode: j.trackingCode, trackingUrl: j.trackingUrl, providerShipmentId: j.providerShipmentId }));
      shipment.deliveryStatus = labels.every(j => j.status === 'delivered') ? 'delivered' : 'in_transit';
      for (const label of labels) { label.shipmentId = shipment.id; label.version++; }
    }
    shipment.packId = pack.id;
    shipment.waveId = w.id;
    shipment.carrierId = w.carrierId;
    shipment.cartons = pack.cartons.length;
    pack.status = "shipped";
    pack.shipmentId = shipment.id;
  } else return fail("COMMAND", "Unknown pack command.");
  pack.version++;
  return pack;
}
