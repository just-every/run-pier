import {
  available,
  decimal,
  format,
  fresh,
  get,
  id,
  min,
  row,
  text,
  fail,
  type Context,
  type Row,
} from "../model";
import { warehouse } from "../warehouse";
import { binMatches, itemScan, pickSequence } from "./codes";
import { onOtherLines, reservedFor, unwaved } from "./wave-coverage";

// Pick waves: open orders for one carrier pickup (its dock door and cut-off)
// released together and picked in one bin-sequenced walk. Every line confirms
// only after its bin and its item are scanned; a picker who finds the bin empty
// or short is sent to the next bin holding unreserved stock of the same item.
// Picking records who picked what; stock leaves the bin when the order ships.

const CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/;
function zone(value: unknown) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text(value, "Time zone") });
    return String(value).trim();
  } catch {
    return fail("TIME_ZONE", "Choose a time zone such as America/Chicago.");
  }
}

const open = (l: any) => decimal(l.quantity) - decimal(l.picked);
const openWave = (c: Context, orderId: string) =>
  c.s.waves.find((w) => w.status !== "picked" && w.orders.some((o: any) => o.orderId === orderId));

/** A wave as the floor reads it: per-line state and the overall picked tally. */
export function waveView(c: Context, w: Row) {
  const picked = w.orders.filter((o: any) =>
    w.lines.filter((l: any) => l.orderId === o.orderId).every((l: any) => l.status !== "open"),
  );
  return { ...w, ordersPicked: picked.length, linesOpen: w.lines.filter((l: any) => l.status === "open").length };
}

export function waves(c: Context, type: string, p: any): Row | undefined {
  if (type === "carrier.save") {
    const old = p.id ? get(c.s, "carriers", p.id) : undefined;
    if (old) fresh(old, p.version);
    const cutoff = text(p.cutoff, "Pickup cut-off");
    if (!CUTOFF.test(cutoff)) fail("CUTOFF", "Give the pickup cut-off as 24-hour HH:MM, for example 16:00.");
    const data = { name: text(p.name, "Carrier and service"), warehouse: text(p.warehouse, "Warehouse"), dock: text(p.dock, "Dock door"), cutoff, timeZone: zone(p.timeZone) };
    if (c.s.carriers.some((r) => r.id !== old?.id && r.name === data.name && r.warehouse === data.warehouse))
      fail("DUPLICATE", "This warehouse already has a pickup with that name.");
    if (old) {
      Object.assign(old, data, { version: old.version + 1 });
      return old;
    }
    return row(c, "carriers", data);
  }
  if (type === "order.carrier") {
    const o = get(c.s, "orders", p.orderId), carrier = get(c.s, "carriers", p.carrierId);
    if (openWave(c, o.id)) fail("IN_WAVE", "This order is in a wave being picked. Finish or short the wave first.");
    o.carrierId = carrier.id;
    o.version++;
    return o;
  }
  if (type === "wave.release") {
    const carrier = get(c.s, "carriers", p.carrierId);
    if (!Array.isArray(p.orderIds) || !p.orderIds.length) fail("ORDERS", "Choose the orders for this wave.");
    const sequence = pickSequence(c.s, carrier.warehouse).map((l) => l.id);
    const lines: any[] = [], orders: any[] = [];
    for (const orderId of p.orderIds) {
      const o = get(c.s, "orders", orderId);
      if (orders.some((x) => x.orderId === o.id)) fail("ORDERS", "Each order joins a wave once.");
      if (openWave(c, o.id)) fail("IN_WAVE", `${o.reference} is already in a wave being picked.`);
      if (!c.s.reservations.some((r) => r.orderId === o.id && sequence.includes(r.locationId)))
        fail("NOTHING_TO_PICK", `${o.reference} has no stock reserved in ${carrier.warehouse}. Reserve it or leave it for a later wave.`);
      // Only reserved units no earlier wave has picked or holds join a new pick list.
      const own = unwaved(c.s, o.id).filter((u) => sequence.includes(u.reservation.locationId));
      if (!own.length) fail("ALREADY_PICKED", `${o.reference} is already picked on an earlier wave. Pack and dispatch it from Pack; there is nothing new to pick.`);
      orders.push({ orderId: o.id, tote: orders.length + 1 });
      o.carrierId = carrier.id;
      o.version++;
      for (const { reservation: r, quantity } of own)
        lines.push({ id: id(), orderId: o.id, orderLineId: r.orderLineId, itemId: r.itemId, locationId: r.locationId, quantity: format(quantity), picked: "0", status: "open", scans: [] });
    }
    lines.sort((a, b) => sequence.indexOf(a.locationId) - sequence.indexOf(b.locationId) || orders.findIndex((o) => o.orderId === a.orderId) - orders.findIndex((o) => o.orderId === b.orderId));
    const number = Math.max(0, ...c.s.waves.map((w) => w.number)) + 1;
    return row(c, "waves", { number, carrierId: carrier.id, dock: carrier.dock, warehouse: carrier.warehouse, orders, lines, status: "picking", releasedBy: c.actor.id, pickedAt: null });
  }
  if (type !== "pick.scan" && type !== "pick.short") return fail("COMMAND", "Unknown wave command.");
  const w = get(c.s, "waves", p.waveId);
  if (w.status === "picked") fail("WAVE_STATE", `Wave ${w.number} is already picked.`);
  const line = w.lines.find((l: any) => l.id === p.lineId);
  if (!line) fail("LINE", "That pick line is not on this wave.");
  if (line.status !== "open") fail("LINE_STATE", "That pick line is already done.");
  const binRow = get(c.s, "locations", line.locationId), itemRow = get(c.s, "items", line.itemId);
  if (type === "pick.scan") {
    if (!binMatches(binRow, p.binCode))
      fail("WRONG_BIN", `Wrong bin: scanned ${String(p.binCode ?? "").trim() || "nothing"}, this line picks from ${binRow.name}. Nothing was picked.`, { expected: binRow.name });
    const hit = itemScan(c.s, p.itemCode, "pick it");
    if (hit.item.id !== itemRow.id)
      fail("WRONG_ITEM", `Wrong item: scanned ${hit.item.name} (${hit.item.sku}), this line picks ${itemRow.name} (${itemRow.sku}). Nothing was picked.`, { scanned: hit.item.sku, expected: itemRow.sku });
    const units = p.quantity === undefined || p.quantity === "" ? hit.units : decimal(p.quantity, true);
    // A line copied onto a second wave must not send the floor after units
    // another wave already picked or that have already shipped.
    const pickable = reservedFor(c.s, line.orderLineId) - onOtherLines(c.s, line.orderLineId, line.id) - decimal(line.picked);
    if (units > pickable)
      fail("ALREADY_PICKED", `${get(c.s, "orders", line.orderId).reference} has ${format(pickable > 0n ? pickable : 0n)} ${itemRow.unit} of ${itemRow.sku} left to pick; the rest were already picked on another wave or shipped. Nothing was picked.`);
    if (units > open(line))
      fail("OVER_PICK", `That scan picks ${format(units)} ${itemRow.unit}; only ${format(open(line))} ${itemRow.unit} are left on this line. Nothing was picked.`);
    line.picked = format(decimal(line.picked) + units);
    line.scans.push({ actorId: c.actor.id, at: c.now, kind: hit.kind, quantity: format(units) });
    if (open(line) === 0n) {
      line.status = "picked";
      line.pickedAt = c.now;
      line.pickedBy = c.actor.id;
    }
  } else {
    // The reported bin is empty or short: take the rest from the next bin in
    // pick sequence holding unreserved sellable stock of the same item, moving
    // only this line's reservation, and count the reported bin.
    const rest = open(line), sequence = pickSequence(c.s, w.warehouse), at = sequence.findIndex((l) => l.id === binRow.id);
    const overflow = [...sequence.slice(at + 1), ...sequence.slice(0, at)].find((l) => available(c.s, line.itemId, l.id) > 0n);
    let release = rest;
    for (const r of c.s.reservations.filter((r) => r.orderLineId === line.orderLineId && r.locationId === binRow.id)) {
      const take = min(release, BigInt(r.quantity));
      r.quantity = (BigInt(r.quantity) - take).toString();
      release -= take;
    }
    c.s.reservations = c.s.reservations.filter((r) => BigInt(r.quantity) > 0n);
    const moved = overflow ? min(rest, available(c.s, line.itemId, overflow.id)) : 0n;
    if (overflow && moved > 0n) {
      c.s.reservations.push({ id: id(), orderId: line.orderId, orderLineId: line.orderLineId, itemId: line.itemId, locationId: overflow.id, quantity: moved.toString() });
      w.lines.splice(w.lines.indexOf(line) + 1, 0, { id: id(), orderId: line.orderId, orderLineId: line.orderLineId, itemId: line.itemId, locationId: overflow.id, quantity: format(moved), picked: "0", status: "open", scans: [], overflowFrom: binRow.id });
      // The overflow line joins the walk at its bin's place (a stable sort keeps the rest in order).
      const order = sequence.map((l) => l.id);
      w.lines.sort((a: any, b: any) => order.indexOf(a.locationId) - order.indexOf(b.locationId));
    }
    const count = warehouse(c, "count.capture", { locationId: binRow.id })!;
    line.status = "short";
    line.short = { reported: format(rest), reason: typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : "Bin empty or short", overflowLocationId: moved > 0n ? overflow!.id : null, moved: format(moved), unfilled: format(rest - moved), countId: count.id, actorId: c.actor.id, at: c.now };
  }
  if (w.lines.every((l: any) => l.status !== "open")) {
    w.status = "picked";
    w.pickedAt = c.now;
  }
  w.version++;
  return waveView(c, w);
}
