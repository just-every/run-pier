import { parse856 } from '../edi/x12';
import { codeOwners } from '../catalogue-fields';
import { same } from './codes';
import { catalogue } from '../catalogue';
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
    if(po.dropshipId)fail('DROPSHIP','Direct supplier shipments cannot be received into a Pier warehouse.');
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
  if (type === 'receiving.notice') {
    fresh(r, p.version);
    let notice: ReturnType<typeof parse856>;
    try { notice = parse856(p.x12); } catch (error) { return fail('ASN', error instanceof Error ? error.message : 'Invalid supplier notice.'); }
    if (notice.senderId !== text(p.senderId, 'Supplier sender ID') || notice.receiverId !== text(p.receiverId, 'Pier receiver ID')) fail('ASN_IDS', 'The notice envelope differs from the reviewed supplier and receiver.');
    const cartons = notice.cartons.map(carton => {
      if (codeOwners(c.s, carton.sscc).length) fail('DUPLICATE', 'This SSCC already belongs to another stock code or notice.');
      return {...carton, lines: carton.lines.map(line => {
        if (line.poNumber !== po.reference) fail('ASN_PO', 'The notice order reference differs from this purchase order.');
        const matches = po.lines.filter((candidate: any) => {
          const item = get(c.s, 'items', candidate.itemId);
          return line.identifiers.every(identifier => identifier.qualifier === 'SK' ? same(identifier.value, item.sku) : identifier.qualifier === 'UP' ? same(identifier.value, item.barcode) : false);
        });
        if (matches.length !== 1 || line.unit !== 'EA' || get(c.s, 'items', matches[0].itemId).unit !== 'each') fail('ASN_MAPPING', 'Resolve every item identifier and unit before receiving this notice. Only exact each-unit notices are supported.');
        return {...line, poLineId: matches[0].id, itemId: matches[0].itemId};
      })};
    });
    (r.notices ??= []).push({...notice, cartons, x12: p.x12, registeredBy: c.actor.id, registeredAt: c.now, consumedLines: []});
    r.version++; return r;
  }
  if (type === "receiving.link") {
    const item = get(c.s, 'items', p.itemId);
    fresh(item, p.version);
    if (item.archived || !po.lines.some((line: any) => line.itemId === item.id)) fail('NOT_ON_PO', 'Choose an active item on this purchase order.');
    const reason = text(p.reason, 'Barcode linking reason');
    const code = text(p.code, 'Unknown supplier barcode');
    const quantity = format(decimal(p.quantity, true));
    const linked = catalogue(c, 'item.save', { ...item, barcodes: [...(item.barcodes ?? []), { code, quantity, label: reason }] })!;
    return linked;
  }
  if (type === "receiving.scan") {
    const sscc = typeof p.code === 'string' ? p.code.replace(/^\]C1/, '').replace(/^\(00\)/, '').replace(/^00(?=\d{18}$)/, '').trim() : '';
    const notice = (r.notices ?? []).find((notice: any) => notice.cartons.some((carton: any) => carton.sscc === sscc));
    if (notice) {
      const carton = notice.cartons.find((carton: any) => carton.sscc === sscc);
      if (p.confirmSscc !== true) fail('SSCC_CONFIRM', 'Review the advance notice quantities and confirm this pallet receipt before scanning again.');
      if (r.scans.length) fail('SSCC_TALLY', 'Post or remove existing loose scans before receiving an entire pallet.');
      if (carton.lines.some((line: any) => notice.consumedLines.includes(line.sourceLine))) fail('SSCC_RECEIVED', 'This pallet or an overlapping carton has already been received.');
      for (const line of carton.lines) {
        const poLine = po.lines.find((candidate: any) => candidate.id === line.poLineId);
        if (!poLine || decimal(line.quantity, true) > remaining(poLine)) fail('OVER_RECEIPT', 'The notice exceeds the remaining purchase quantity. Review it before receipt.');
        if (policyFor(c.s, line.itemId)) fail('ASN_TRACE', 'Tracked goods require individual lot and serial intake; this notice has no mapped identities.');
        r.scans.push({id:id(),code:sscc,kind:'sscc',poLineId:line.poLineId,itemId:line.itemId,locationId:r.locationId,quantity:line.quantity,actorId:c.actor.id,at:c.now});
      }
      // Aggregate before posting so repeated SKU lines cannot exceed remaining supply.
      if (po.lines.some((line: any) => tallyOf(r, line.id) > remaining(line))) fail('OVER_RECEIPT', 'The pallet total exceeds this purchase order.');
      notice.consumedLines.push(...carton.lines.map((line: any) => line.sourceLine));
      const receipt = receiving(c, 'receiving.post', {receivingId:r.id,version:r.version,supplierReference:notice.shipmentReference})!;
      if (r.notices.some((retained: any) => retained.cartons.some((container: any) => container.lines.some((line: any) => !retained.consumedLines.includes(line.sourceLine))))) { r.status = 'open'; r.scans = []; }
      receipt.sscc = sscc; receipt.advanceNotice = {senderId:notice.senderId,receiverId:notice.receiverId,interchangeControl:notice.interchangeControl,transactionControl:notice.transactionControl};
      return receipt;
    }
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
