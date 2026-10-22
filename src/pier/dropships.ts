import { codeOwners } from "./catalogue-fields";
import {
  decimal,
  fail,
  format,
  fresh,
  get,
  id,
  requireRole,
  row,
  text,
  type Context,
  type Row,
} from "./model";
import { orders } from "./orders";
import { purchasing } from "./purchasing";
import { isoDay } from "./sales-quotes";
import { money } from "./money";
export function dropships(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith("dropship.")) return;
  requireRole(c, []);
  if (type === "dropship.create") {
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add dropship lines.");
    const shipTo = text(p.shipTo, "Direct customer shipping address"),
      date = isoDay(p.promiseDate, "Requested supplier date");
    const order = orders(c, "order.create", {
      customerId: p.customerId,
      channel: "dropship",
      fulfilment: "dropship",
      promiseDate: date,
      lines: p.lines,
    })!;
    if (order.lines.some((l: any) => l.kit && decimal(l.quantity) % 1000000n))
      fail(
        "DROPSHIP_QUANTITY",
        "Direct supplier kits require whole commercial kit quantities.",
      );
    if (order.lines.some((l: any) => l.price === null))
      fail("PRICE", "Price every dropship sales line.");
    const po = purchasing(c, "po.draft", {
      supplierId: p.supplierId,
      promiseDate: date,
      reason: text(p.reason),
      lines: p.lines.map((l: any) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        price: l.cost,
      })),
    })!;
    const drop = row(c, "dropships", {
      orderId: order.id,
      poId: po.id,
      shipTo,
      lines: order.lines.map((l: any, i: number) => ({
        itemId: l.itemId,
        orderLineId: l.id,
        kit: l.kit ?? null,
        poLineId: po.lines[i].id,
        quantity: l.quantity,
        price: l.price,
        cost: po.lines[i].price,
      })),
      status: "awaiting-supplier",
      confirmation: null,
      shipments: [],
      credits: [],
      createdBy: c.actor.id,
    });
    Object.assign(get(c.s, "orders", order.id), {
      dropshipId: drop.id,
      shipTo: { address1: shipTo },
    });
    Object.assign(get(c.s, "purchaseOrders", po.id), {
      dropshipId: drop.id,
      directToCustomer: shipTo,
    });
    return drop;
  }
  const drop = get(c.s, "dropships", p.dropshipId);
  fresh(drop, p.version);
  const po = get(c.s, "purchaseOrders", drop.poId),
    order = get(c.s, "orders", drop.orderId);
  if (drop.status === "cancelled")
    fail("DROPSHIP_STATE", "This dropship demand was cancelled.");
  if (type === "dropship.cancel") {
    if (drop.shipments.length)
      fail(
        "DROPSHIP_STATE",
        "A shipped dropship requires an exact customer credit.",
      );
    drop.cancellation = {
      reference: text(
        p.supplierReference,
        "Supplier cancellation confirmation",
      ),
      reason: text(p.reason),
      actorId: c.actor.id,
      at: c.now,
    };
    drop.status = "cancelled";
    po.status = "cancelled";
    po.version++;
    for (const line of order.lines) line.cancelled = line.quantity;
    order.version++;
    drop.version++;
    return drop;
  }
  if (po.status !== "committed")
    fail(
      "DROPSHIP_PO",
      "Approve and commit the exact supplier PO before confirming or shipping.",
    );
  if (type === "dropship.confirm") {
    if (drop.confirmation)
      fail("DROPSHIP_STATE", "Supplier confirmation is already retained.");
    drop.confirmation = {
      reference: text(p.supplierReference),
      shipDate: isoDay(p.shipDate, "Supplier ship date"),
      actorId: c.actor.id,
      at: c.now,
      poVersion: po.version,
    };
    drop.status = "confirmed";
    drop.version++;
    return drop;
  }
  if (type === "dropship.ship") {
    if (!drop.confirmation)
      fail("DROPSHIP_STATE", "Record the supplier confirmation first.");
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Name the exact shipped lines.");
    const shipDate = isoDay(p.shipDate, "Actual supplier ship day");
    if (shipDate > c.now.slice(0, 10))
      fail("DATE", "An actual supplier ship day cannot be in the future.");
    const reference = text(p.supplierReference, "Supplier shipment reference");
    const owners = codeOwners(c.s, reference);
    if (owners.some((owner) => owner.kind !== "shipment"))
      fail(
        "DUPLICATE",
        "The supplier shipment alias collides with an item, bin or trace/carton code.",
        { owners },
      );
    if (drop.shipments.some((s: any) => s.reference === reference))
      fail("DUPLICATE", "This supplier shipment is already retained.");
    const seen = new Set();
    const lines = p.lines.map((x: any) => {
      const line = drop.lines.find((l: any) => l.orderLineId === x.orderLineId);
      if (!line || seen.has(line.orderLineId))
        fail("LINE", "Use distinct linked dropship lines.");
      seen.add(line.orderLineId);
      const native = order.lines.find((l: any) => l.id === line.orderLineId),
        q = decimal(x.quantity, true);
      if (
        q + decimal(native.dispatched) >
        decimal(native.quantity) - decimal(native.cancelled)
      )
        fail(
          "DROPSHIP_QUANTITY",
          "Supplier shipment exceeds remaining demand.",
        );
      native.dispatched = format(decimal(native.dispatched) + q);
      return {
        ...line,
        quantity: format(q),
        costTotal: money(q * decimal(line.cost)),
        salesTotal: money(q * decimal(line.price)),
      };
    });
    drop.shipments.push({
      id: id(),
      reference,
      tracking: text(p.tracking, "Supplier tracking"),
      carrier: text(p.carrier, "Supplier carrier"),
      shipDate,
      lines,
      actorId: c.actor.id,
      at: c.now,
    });
    drop.status = order.lines.every((l: any) => l.dispatched === l.quantity)
      ? "shipped"
      : "part-shipped";
    order.version++;
    drop.version++;
    return drop;
  }
  if (type === "dropship.credit") {
    const shipment = drop.shipments.find((s: any) => s.id === p.shipmentId),
      line = shipment?.lines.find((l: any) => l.orderLineId === p.orderLineId);
    if (!line) fail("LINE", "Credit an actual direct supplier shipment line.");
    const q = decimal(p.quantity, true),
      credited = drop.credits
        .filter(
          (cr: any) =>
            cr.shipmentId === shipment.id &&
            cr.orderLineId === line.orderLineId,
        )
        .reduce((n: bigint, cr: any) => n + decimal(cr.quantity), 0n);
    if (credited + q > decimal(line.quantity))
      fail("CREDIT_LIMIT", "Cumulative credit exceeds the shipped quantity.");
    const reference = text(p.reference, "Customer credit reference");
    if (
      c.s.customerCredits.some(
        (cr) =>
          cr.customerId === order.customerId && cr.reference === reference,
      )
    )
      fail("DUPLICATE", "This customer credit reference already exists.");
    const credit = row(c, "customerCredits", {
      customerId: order.customerId,
      reference,
      dropshipId: drop.id,
      orderId: order.id,
      shipmentId: shipment.id,
      orderLineId: line.orderLineId,
      quantity: format(q),
      currency: "USD",
      amount: money(q * decimal(line.price)),
      reason: text(p.reason),
      authorizedBy: c.actor.id,
      authorizedAt: c.now,
      posting: "not-posted",
      physicalEffect: "none",
    });
    drop.credits.push(credit);
    drop.version++;
    return drop;
  }
  fail("COMMAND", "Unknown dropship command.");
}
