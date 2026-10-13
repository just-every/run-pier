import {
  available,
  decimal,
  fail,
  get,
  id,
  type Context,
  type Row,
} from "./model";

// Native exit snapshots carry the owner's actual allocation, including an
// explicit zero for backordered lines. CSV row order never decides priority.
export function applyReservationImport(
  c: Context,
  batch: Row,
  history: any[],
  posted: any[],
  links: Record<string, string>,
) {
  if (!batch.reservationPlan) return;
  const records = batch.source.records.filter(
    (r: any) => r.kind === "reservations",
  );
  const sourceLines = batch.source.records.filter(
    (r: any) => r.kind === "orders",
  );
  const prior = (kind: string, key: string) =>
    [...history, ...posted]
      .reverse()
      .find((r) => r.kind === kind && r.key === key);
  const targets = new Map<string, { order: Row; line: any }>();
  for (const source of sourceLines) {
    const mapped = prior("orders", source.sourceId);
    if (!mapped)
      fail("ORPHAN", "Reservation plan has an unresolved order line.");
    const order = get(c.s, "orders", mapped.id);
    const line = order.lines.find((l: any) => l.id === mapped.lineId);
    if (!line) fail("ORPHAN", "Reservation plan order line is missing.");
    targets.set(source.sourceId, { order, line });
    if (!records.some((r: any) => r.payload.orderLineKey === source.sourceId))
      fail(
        "RESERVATION_PLAN",
        "Every supplied open order line needs explicit reservation rows, including zero for backorder.",
      );
  }
  const orders = new Set([...targets.values()].map(({ order }) => order));
  const lineIds = new Set([...targets.values()].map(({ line }) => line.id));
  for (const order of orders)
    if (order.lines.some((line: any) => !lineIds.has(line.id)))
      fail(
        "RESERVATION_PLAN",
        "Supply every line of an order when replacing its reservation plan.",
      );
  let changed = posted.some((r) => r.kind === "orders");
  const seen = new Set<string>();
  for (const record of records) {
    const p = record.payload;
    if (!targets.has(p.orderLineKey))
      fail("ORPHAN", "Reservation rows must name a supplied order line.");
    const key = JSON.stringify([p.orderLineKey, p.locationKey]);
    if (seen.has(key))
      fail(
        "DUPLICATE",
        "Duplicate reservation rows for an order line and bin are ambiguous.",
      );
    seen.add(key);
    const old = prior("reservations", record.sourceId);
    if (old?.hash === record.payloadHash) {
      links["reservations:" + record.sourceId] = old.id;
      continue;
    }
    if (
      old &&
      !batch.reviewedRevisions.some(
        (r: any) => r.kind === "reservations" && r.key === record.sourceId,
      )
    )
      fail(
        "REVISION_REVIEW",
        "Changed reservation rows require explicit reviewed replacement.",
        { kind: "reservations", key: record.sourceId },
      );
    changed = true;
  }
  if (!changed) return;
  for (const order of orders)
    if (
      order.lines.some(
        (line: any) =>
          decimal(line.dispatched) > 0n || decimal(line.cancelled) > 0n,
      )
    )
      fail(
        "IMPORT_DEPENDENCY",
        "Dispatched or cancelled source orders cannot have their imported allocation replaced.",
      );
  c.s.reservations = c.s.reservations.filter(
    (r) => !lineIds.has(r.orderLineId),
  );
  const totals = new Map<string, bigint>();
  for (const record of records) {
    const p = record.payload;
    const { order, line } = targets.get(p.orderLineKey)!;
    if (get(c.s, "items", line.itemId).unit !== p.unit)
      fail("UNIT", "Reservation unit must match the order item's base unit.");
    const quantity = decimal(p.quantity);
    const peers = records.filter(
      (r: any) => r.payload.orderLineKey === p.orderLineKey,
    );
    if (quantity === 0n && (p.locationKey !== "" || peers.length !== 1))
      fail(
        "RESERVATION_PLAN",
        "A backorder uses one zero reservation row with an empty location key.",
      );
    const total = (totals.get(line.id) ?? 0n) + quantity;
    if (
      total >
      decimal(line.quantity) -
        decimal(line.dispatched) -
        decimal(line.cancelled)
    )
      fail("RESERVATION_PLAN", "Reserved quantity exceeds remaining demand.");
    totals.set(line.id, total);
    let reservationId = line.id;
    if (quantity > 0n) {
      const locationId =
        links["locations:" + p.locationKey] ??
        prior("locations", p.locationKey)?.id;
      if (!locationId) fail("ORPHAN", "Reservation bin is unresolved.");
      if (get(c.s, "locations", locationId).kind !== "bin")
        fail("BIN", "Reservations require a warehouse bin.");
      if (available(c.s, line.itemId, locationId) < quantity)
        fail(
          "RESERVATION_PLAN",
          "The reviewed allocation exceeds available sellable stock.",
        );
      reservationId = id();
      c.s.reservations.push({
        id: reservationId,
        orderId: order.id,
        orderLineId: line.id,
        itemId: line.itemId,
        locationId,
        quantity: quantity.toString(),
      });
    }
    links["reservations:" + record.sourceId] = reservationId;
    posted.push({
      kind: "reservations",
      key: record.sourceId,
      hash: record.payloadHash,
      id: reservationId,
      orderId: order.id,
      lineId: line.id,
      payload: p,
    });
  }
  for (const order of orders) order.version++;
}
