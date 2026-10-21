import { policyFor } from '../trace-core';
import { receiptConfirmation } from '../supplier-performance';
import {
  decimal,
  format,
  fresh,
  get,
  id,
  move,
  row,
  text,
  fail,
  type Context,
  type Row,
} from "../model";
import { landReceipt } from "../landed-cost";
import { itemScan, resolve } from "./codes";

// Scan-to-receive against a committed purchase order. Each scan is its own
// durable command, so a dropped phone or a lost connection resumes the same
// tally. Nothing posts stock until the receiver posts the tally; then every
// line's over or short against what was still expected is kept on the receipt.

const remaining = (l: any) => decimal(l.quantity) - decimal(l.received);
const tallyOf = (r: Row, poLineId: string, locationId?: string) =>
  r.scans
    .filter((x: any) => x.poLineId === poLineId && (!locationId || x.locationId === locationId))
    .reduce((n: bigint, x: any) => n + decimal(x.quantity), 0n);

function bin(c: Context, locationId: string) {
  const l = get(c.s, "locations", locationId);
  if (l.kind !== "bin") fail("BIN", "Receive into a warehouse bin.");
  return l;
}

export function receiving(c: Context, type: string, p: any): Row | undefined {
  if (type === "receiving.start") {
    const po = get(c.s, "purchaseOrders", p.poId);
    if (po.status !== "committed")
      fail("PO_STATE", "Scan-to-receive needs a committed purchase order.");
    const open = c.s.receivings.find((r) => r.poId === po.id && r.status === "open");
    if (open) return open;
    return row(c, "receivings", {
      poId: po.id,
      locationId: bin(c, p.locationId).id,
      scans: [],
      status: "open",
      startedBy: c.actor.id,
    });
  }
  const r = get(c.s, "receivings", p.receivingId);
  if (r.status !== "open") fail("RECEIVING_STATE", "This receiving tally is already posted.");
  const po = get(c.s, "purchaseOrders", r.poId);
  if (type === "receiving.scan") {
    const scan = resolve(c.s, p.code, get(c.s, "locations", r.locationId).warehouse);
    // A bin label sets where the next scans are put away.
    if ("bin" in scan) {
      r.locationId = scan.bin.id;
      r.version++;
      return r;
    }
    const hit = itemScan(c.s, p.code, "receive it");
    const line = po.lines.find((l: any) => l.itemId === hit.item.id);
    if (!line)
      fail("NOT_ON_PO", `${hit.item.name} (${hit.item.sku}) is not on ${po.reference}. Nothing was received.`, { itemId: hit.item.id });
    // A typed count stands for that many scans of the same code ("24 × case").
    const times = p.count === undefined || p.count === "" ? 1 : Number(p.count);
    if (!Number.isSafeInteger(times) || times < 1 || times > 100000) fail("COUNT", "Use a whole number of scans from 1 to 100000.");
    const count = BigInt(times);
    const trace = {...(hit.trace??{}),...Object.fromEntries(Object.entries(p.trace??{}).filter(([,value])=>value!==''&&value!==undefined))};
    if(policyFor(c.s,hit.item.id)) {
      if(trace.expiry && trace.expiry<c.now.slice(0,10))fail('TRACE_EXPIRED','Expired lot/serial goods cannot be received as sellable stock.');
      if(policyFor(c.s,hit.item.id).mode==='serial' && (!trace.serial || hit.units*count!==1000000n))fail('TRACE_SERIAL','Scan or enter one unique serial for each received unit.');
      if(trace.serial && (c.s.traceIdentities.some(i=>i.serial?.toLowerCase()===trace.serial!.toLowerCase()) || r.scans.some((scan:any)=>scan.trace?.serial?.toLowerCase()===trace.serial!.toLowerCase())))fail('DUPLICATE_SERIAL','This serial is already recorded or on the receiving tally.');
    }
    r.scans.push({
      id: id(),
      code: String(p.code).trim(),
      kind: hit.kind,
      poLineId: line.id,
      itemId: hit.item.id,
      locationId: r.locationId,
      quantity: format(hit.units * count),
      ...(Object.keys(trace).length ? {trace} : {}),
      actorId: c.actor.id,
      at: c.now,
    });
    r.version++;
    return r;
  }
  if (type === "receiving.remove") {
    if (!r.scans.some((x: any) => x.id === p.scanId)) fail("SCAN", "That scan is not on this tally.");
    r.scans = r.scans.filter((x: any) => x.id !== p.scanId);
    r.version++;
    return r;
  }
  if (type === "receiving.post") {
    fresh(r, p.version);
    if (!r.scans.length) fail("LINES", "Scan at least one item before posting.");
    const variance = po.lines
      .map((l: any) => {
        const expected = remaining(l), received = tallyOf(r, l.id);
        return { poLineId: l.id, itemId: l.itemId, expected: format(expected), received: format(received), over: format(received > expected ? received - expected : 0n), short: format(received < expected ? expected - received : 0n) };
      })
      .filter((v: any) => v.received !== "0" || v.expected !== "0");
    const over = variance.filter((v: any) => v.over !== "0");
    const overReason = typeof p.overReason === "string" ? p.overReason.trim() : "";
    if (over.length && !overReason)
      fail("OVER_RECEIPT", "More arrived than the purchase order still expects. Give the reason to accept the over-receipt, or remove the extra scans.", over);
    const receipt = row(c, "receipts", {
      poId: po.id,
      supplierReference: text(p.supplierReference, "Supplier delivery reference"),
      supplierConfirmation: receiptConfirmation(po),
      lines: [],
      status: "posted",
      receivingId: r.id,
      variance,
      overReason: over.length ? overReason : null,
    });
    const places = new Set<string>(r.scans.map((x: any) => `${x.poLineId}|${x.locationId}`));
    for (const key of places) {
      const [poLineId, locationId] = key.split("|");
      const l = po.lines.find((x: any) => x.id === poLineId), q = tallyOf(r, poLineId, locationId), cost = decimal(l.price);
      bin(c, locationId);
      const m = move(c, {
        itemId: l.itemId,
        locationId,
        status: "sellable",
        quantity: q.toString(),
        reason: "PO receipt " + receipt.supplierReference,
        documentId: receipt.id,
      });
      receipt.lines.push({
        id: id(),
        poLineId,
        itemId: l.itemId,
        locationId,
        quantity: format(q),
        cost: format(cost),
        costTotal: ((q * cost) / 1000000000000n).toString() + "." + ((q * cost) % 1000000000000n).toString().padStart(12, "0"),
        costTotalScale: 12,
        movementId: m.id,
        trace: r.scans.filter((scan:any)=>scan.poLineId===poLineId&&scan.locationId===locationId&&scan.trace).map((scan:any)=>({...scan.trace,quantity:scan.quantity})),
      });
    }
    for (const l of po.lines) l.received = format(decimal(l.received) + tallyOf(r, l.id));
    // Freight and duty on the delivery value the receipt, as on the desk receipt.
    landReceipt(receipt, p.landedCost);
    po.version++;
    r.status = "posted";
    r.receiptId = receipt.id;
    r.version++;
    return receipt;
  }
  return fail("COMMAND", "Unknown receiving command.");
}
