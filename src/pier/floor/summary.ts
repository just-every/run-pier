import { dispatchBoard, dispatchOrder, orderWarehouse } from "./dispatch-board";
import { decimal, format, fail, get, row, text, type Context, type Row, type State } from "../model";

// The day's dispatch summary in one warehouse time zone: what shipped, by
// carrier and by dock, against each pickup's cut-off, and every exception a
// lead needs before tomorrow (due orders that did not ship and why, short
// picks, late pickups, receipts that arrived over or short). Closing the day
// keeps the summary and sends it to the owner.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const localDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const localTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

const lineDone = (l: any) => decimal(l.dispatched) + decimal(l.cancelled) >= decimal(l.quantity);
const ref = (s: State, kind: "orders" | "purchaseOrders", id: string) => s[kind].find((r) => r.id === id)?.reference ?? "Removed document";

function notShipped(s: State, o: Row) {
  const inWaves = s.waves.filter((w) => w.orders.some((x: any) => x.orderId === o.id));
  const lines = inWaves.flatMap((w) => w.lines.filter((l: any) => l.orderId === o.id));
  const reserved = (lineId: string) => s.reservations.filter((r) => r.orderLineId === lineId).reduce((n, r) => n + BigInt(r.quantity), 0n);
  const backorder = o.lines.some((l: any) => decimal(l.quantity) - decimal(l.dispatched) - decimal(l.cancelled) - reserved(l.id) > 0n);
  if (lines.some((l: any) => l.short && l.short.unfilled !== "0")) return "short at the bin";
  if (backorder) return "backordered";
  if (!lines.length || lines.some((l: any) => l.status === "open")) return "unpicked";
  const pack = s.packs.filter((p) => p.orderId === o.id).at(-1);
  if (!pack || pack.status === "packing") return "unpacked";
  return "packed, not shipped";
}

export function dispatchSummary(s: State, date: string, timeZone: string, warehouse: string | null = null, now = new Date().toISOString()) {
  if (!DATE.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail("DATE", "Choose the day as YYYY-MM-DD.");
  try { localDate(new Date().toISOString(), timeZone); } catch { fail("TIME_ZONE", "Choose a time zone such as America/Chicago."); }
  const board = dispatchBoard(s, date, warehouse, now, localDate, localTime);
  const inWarehouse = (id: string) => !warehouse || orderWarehouse(s, s.orders.find(o => o.id === id)!) === warehouse;
  const shipments = s.shipments.filter((x) => localDate(x.createdAt, timeZone) === date && inWarehouse(x.orderId));
  const carrierOf = (x: Row) => s.carriers.find((c) => c.id === (x.carrierId ?? s.orders.find((o) => o.id === x.orderId)?.carrierId));
  const groups = new Map<string, any>();
  for (const x of shipments) {
    const carrier = carrierOf(x), key = carrier?.id ?? "none", at = localTime(x.createdAt, timeZone);
    const g = groups.get(key) ?? { carrierId: carrier?.id ?? null, carrier: carrier?.name ?? "No carrier pickup", dock: carrier?.dock ?? "—", cutoff: carrier?.cutoff ?? null, orders: new Set<string>(), shipments: 0, cartons: 0, units: 0n, late: 0, lastAt: "" };
    g.orders.add(x.orderId);
    g.shipments++;
    g.cartons += x.cartons ?? 0;
    g.units += x.lines.reduce((n: bigint, l: any) => n + decimal(l.quantity), 0n);
    if (carrier && g.cutoff && localTime(x.createdAt, carrier.timeZone) > g.cutoff) g.late++;
    if (at > g.lastAt) g.lastAt = at;
    groups.set(key, g);
  }
  const byCarrier = [...groups.values()].map((g) => ({ ...g, orders: g.orders.size, units: format(g.units) }));
  const docks = new Map<string, any>();
  for (const g of byCarrier) {
    const d = docks.get(g.dock) ?? { dock: g.dock, orders: 0, shipments: 0, units: 0n };
    d.orders += g.orders; d.shipments += g.shipments; d.units += decimal(g.units);
    docks.set(g.dock, d);
  }
  const shippedOrders = new Set(shipments.map((x) => x.orderId));
  const due = s.orders.filter(o => board.orders.some(v => v.orderId === o.id));
  const exceptions: any[] = [];
  for (const o of due)
    if (!o.lines.every(lineDone)) {
      // An order with some units out is partly shipped, not "did not ship".
      const shipped = o.lines.reduce((n: bigint, l: any) => n + decimal(l.dispatched), 0n);
      const ordered = o.lines.reduce((n: bigint, l: any) => n + decimal(l.quantity) - decimal(l.cancelled), 0n);
      exceptions.push({ kind: shipped > 0n ? "partly shipped" : "not shipped", orderId: o.id, order: o.reference, shipped: format(shipped), ordered: format(ordered), reason: notShipped(s, o), boardReason: dispatchOrder(s, o).reason });
    }
  for (const w of s.waves)
    for (const l of w.lines)
      if (inWarehouse(l.orderId) && l.short && localDate(l.short.at, timeZone) === date) {
        const bin = (id: string | null) => (id ? s.locations.find((x) => x.id === id)?.name ?? "Removed bin" : null);
        exceptions.push({ kind: "short pick", wave: w.number, orderId: l.orderId, order: ref(s, "orders", l.orderId), itemId: l.itemId, bin: bin(l.locationId), overflow: bin(l.short.overflowLocationId), moved: l.short.moved, unfilled: l.short.unfilled, reason: l.short.reason });
      }
  for (const x of shipments) {
    const carrier = carrierOf(x), at = localTime(x.createdAt, timeZone);
    if (carrier && localTime(x.createdAt, carrier.timeZone) > carrier.cutoff) exceptions.push({ kind: "late", orderId: x.orderId, order: ref(s, "orders", x.orderId), carrier: carrier.name, at, cutoff: carrier.cutoff });
  }
  for (const r of s.receipts)
    if ((!warehouse || s.locations.find(l => l.id === r.locationId)?.warehouse === warehouse) && r.variance && localDate(r.createdAt, timeZone) === date)
      for (const v of r.variance)
        if (v.over !== "0" || v.short !== "0") exceptions.push({ kind: v.over !== "0" ? "received over" : "received short", purchaseOrder: ref(s, "purchaseOrders", r.poId), itemId: v.itemId, expected: v.expected, received: v.received, over: v.over, short: v.short });
  const lastAt = byCarrier.reduce((t, g) => (g.lastAt > t ? g.lastAt : t), "");
  const cutoffs = byCarrier.map((g) => g.cutoff).filter(Boolean).sort();
  return {
    ...board,
    date,
    timeZone,
    ordersShipped: shippedOrders.size,
    shipments: shipments.length,
    units: format(shipments.reduce((n, x) => n + x.lines.reduce((m: bigint, l: any) => m + decimal(l.quantity), 0n), 0n)),
    lastShipmentAt: lastAt || null,
    latestCutoff: cutoffs.at(-1) ?? null,
    allOut: shippedOrders.size > 0 && !exceptions.some((e) => ["not shipped", "partly shipped", "late"].includes(e.kind)),
    due: due.length,
    byCarrier,
    byDock: [...docks.values()].map((d) => ({ ...d, units: format(d.units) })),
    exceptions,
  };
}

/** Closing the day keeps its summary; the owner's copy is sent after the record commits. */
export function dayClose(c: Context, type: string, p: any): Row | undefined {
  if (type === "dispatch.close") {
    const date = text(p.date, "Day"), timeZone = text(p.timeZone, "Time zone");
    const warehouse = p.warehouse ? text(p.warehouse, "Warehouse") : null;
    const summary = dispatchSummary(c.s, date, timeZone, warehouse, c.now);
    const delivery = { status: "sending", to: "owner", detail: null, at: c.now };
    const old = c.s.dispatchDays.find((d) => d.date === date && d.timeZone === timeZone && (d.warehouse ?? null) === warehouse);
    if (old) {
      old.revisions = [...(old.revisions ?? []), { summary: old.summary, closedBy: old.closedBy, closedAt: old.closedAt, version: old.version }];
      Object.assign(old, { summary, delivery, closedBy: c.actor.id, closedAt: c.now, version: old.version + 1 });
      return old;
    }
    return row(c, "dispatchDays", { date, timeZone, warehouse, summary, delivery, closedBy: c.actor.id, closedAt: c.now });
  }
  // dispatch.delivered is written only by Pier itself after the send (src/pier/api.ts).
  const day = get(c.s, "dispatchDays", p.dayId);
  if (day.version !== p.version) return day;
  day.delivery = { status: text(p.status), to: "owner", detail: p.detail ?? null, at: c.now };
  day.version++;
  return day;
}
