import {
  decimal,
  format,
  get,
  id,
  item,
  nextReference,
  row,
  text,
  fail,
  requireRole,
  min,
  available,
  move,
  type Context,
  type Row,
} from "./model";
import { orderPrice } from "./pricing";
import { money } from "./money";
export function reserve(c: Context, o: Row) {
  for (const l of o.lines) {
    let need =
      decimal(l.quantity) -
      decimal(l.dispatched) -
      decimal(l.cancelled) -
      c.s.reservations
        .filter((r) => r.orderLineId === l.id)
        .reduce((n, r) => n + BigInt(r.quantity), 0n);
    for (const loc of c.s.locations.filter((l) => l.kind === "bin" && (!o.warehouse || l.warehouse === o.warehouse))) {
      const q = min(need, available(c.s, l.itemId, loc.id));
      if (q > 0n) {
        c.s.reservations.push({
          id: id(),
          orderId: o.id,
          orderLineId: l.id,
          itemId: l.itemId,
          locationId: loc.id,
          quantity: q.toString(),
        });
        need -= q;
      }
    }
  }
  o.version++;
  return o;
}
export function orderView(c: Context, o: Row) {
  return {
    ...o,
    lines: o.lines.map((l: any) => {
      const q = c.s.reservations
        .filter((r) => r.orderLineId === l.id)
        .reduce((n, r) => n + BigInt(r.quantity), 0n);
      return {
        ...l,
        reserved: format(q),
        backorder: format(
          decimal(l.quantity) -
            decimal(l.dispatched) -
            decimal(l.cancelled) -
            q,
        ),
      };
    }),
  };
}
export function orders(c: Context, type: string, p: any): Row | undefined {
  if (
    ![
      "order.create",
      "order.reserve",
      "order.cancel",
      "dispatch.create",
      "return.create",
      "return.approve",
      "return.restock",
    ].includes(type)
  )
    return;
  requireRole(c, type.startsWith("order.") ? ["operator"] : ["warehouse"]);
  if (type === "order.create") {
    if (p.currency !== undefined && p.currency !== 'USD') fail('CURRENCY', 'Sales orders use USD. Foreign-currency conversion is not available yet.');
    if (get(c.s, "parties", p.customerId).kind !== "customer")
      fail("CUSTOMER", "Choose a customer.");
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add at least one order line.");
    if (p.currency !== undefined && p.currency !== "USD")
      fail("CURRENCY", "Sales orders use USD.");
    const lines = p.lines.map((l: any) => {
      const i = item(c.s, l.itemId),
        quantity = decimal(l.quantity, true);
      return {
        id: id(),
        itemId: i.id,
        quantity: format(quantity),
        dispatched: "0",
        cancelled: "0",
        ...orderPrice(c, p.customerId, i.id, quantity, l.price),
      };
    });
    if (p.warehouse && !c.s.locations.some(l => l.kind === "bin" && l.warehouse === p.warehouse)) fail("WAREHOUSE", "Choose an existing warehouse.");
    const priced = lines.every((l: any) => l.price !== null);
    const o = row(c, "orders", {
      reference: nextReference(c.s.orders, "SO"),
      customerId: p.customerId,
      warehouse: p.warehouse ? text(p.warehouse, "Warehouse") : null,
      promiseDate: p.promiseDate ?? null,
      channel: text(p.channel ?? "manual", "Order channel"),
      currency: "USD",
      pricingStatus: priced ? "priced" : "unpriced",
      total: priced
        ? money(
            lines.reduce(
              (sum: bigint, l: any) =>
                sum + decimal(l.quantity) * decimal(l.price),
              0n,
            ),
          )
        : null,
      lines,
    });
    reserve(c, o);
    return orderView(c, o);
  }
  if (type === "order.reserve") {
    const o = get(c.s, "orders", p.orderId);
    reserve(c, o);
    return orderView(c, o);
  }
  if (type === "order.cancel") {
    const o = get(c.s, "orders", p.orderId);
    o.cancelReason = text(p.reason);
    for (const l of o.lines)
      l.cancelled = format(decimal(l.quantity) - decimal(l.dispatched));
    c.s.reservations = c.s.reservations.filter((r) => r.orderId !== o.id);
    o.version++;
    return orderView(c, o);
  }
  if (type === "dispatch.create") {
    const o = get(c.s, "orders", p.orderId);
    const shipment = row(c, "shipments", {
      orderId: o.id,
      reference: text(p.shipmentReference),
      lines: [],
    });
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add dispatch lines.");
    for (const x of p.lines) {
      const l = o.lines.find((l: any) => l.id === x.orderLineId);
      if (!l) fail("LINE", "Dispatch line must belong to this order.");
      let q = decimal(x.quantity, true);
      const own = c.s.reservations.filter((r) => r.orderLineId === l.id);
      if (own.reduce((n, r) => n + BigInt(r.quantity), 0n) < q)
        fail(
          "RESERVATION",
          "Dispatch requires this order’s active reservation.",
        );
      const links = [];
      for (const r of own) {
        const take = min(q, BigInt(r.quantity));
        if (take === 0n) continue;
        r.quantity = (BigInt(r.quantity) - take).toString();
        move(c, {
          itemId: l.itemId,
          locationId: r.locationId,
          status: "sellable",
          quantity: (-take).toString(),
          reason: "Dispatch " + shipment.reference,
          documentId: shipment.id,
        });
        links.push({
          reservationId: r.id,
          locationId: r.locationId,
          quantity: format(take),
        });
        q -= take;
      }
      shipment.lines.push({
        id: id(),
        orderLineId: l.id,
        itemId: l.itemId,
        quantity: format(decimal(x.quantity)),
        reservations: links,
      });
      l.dispatched = format(decimal(l.dispatched) + decimal(x.quantity));
    }
    c.s.reservations = c.s.reservations.filter((r) => BigInt(r.quantity) > 0n);
    o.version++;
    return shipment;
  }
  if (type === "return.create") {
    const sh = get(c.s, "shipments", p.shipmentId),
      line = sh.lines.find((l: any) => l.id === p.shipmentLineId);
    if (!line) fail("LINE", "Return must reference an actual dispatch line.");
    const q = decimal(p.quantity, true),
      returned = c.s.returns
        .filter((r) => r.shipmentLineId === line.id)
        .reduce((n, r) => n + decimal(r.quantity), 0n);
    if (returned + q > decimal(line.quantity))
      fail("RETURN_LIMIT", "Cumulative return exceeds dispatched quantity.");
    if (get(c.s, "locations", p.locationId).kind !== "bin")
      fail("BIN", "Returns require a warehouse bin.");
    const r = row(c, "returns", {
      shipmentId: sh.id,
      shipmentLineId: line.id,
      itemId: line.itemId,
      locationId: p.locationId,
      quantity: format(q),
      reason: text(p.reason),
      status: "quarantine",
    });
    move(c, {
      itemId: r.itemId,
      locationId: r.locationId,
      status: "quarantine",
      quantity: q.toString(),
      reason: r.reason,
      documentId: r.id,
    });
    return r;
  }
  const r = get(c.s, "returns", p.returnId);
  if (r.version !== p.version) fail("STALE", "Return version changed.");
  if (r.status !== "quarantine")
    fail("RETURN_STATE", "Only quarantined returns may be reviewed.");
  if (type === "return.approve") {
    r.approval = { actorId: c.actor.id, version: r.version, at: c.now };
    return r;
  }
  if (!r.approval || r.approval.version !== r.version)
    fail("APPROVAL", "Review this exact return before restocking.");
  move(c, {
    itemId: r.itemId,
    locationId: r.locationId,
    status: "quarantine",
    quantity: (-decimal(r.quantity)).toString(),
    reason: "Reviewed restock",
    documentId: r.id,
  });
  move(c, {
    itemId: r.itemId,
    locationId: r.locationId,
    status: "sellable",
    quantity: decimal(r.quantity).toString(),
    reason: "Reviewed restock",
    documentId: r.id,
  });
  r.status = "restocked";
  r.version++;
  return r;
}
