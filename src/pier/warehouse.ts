import {
  decimal,
  format,
  get,
  row,
  text,
  fresh,
  fail,
  requireRole,
  move,
  balance,
  available,
  positions,
  type Context,
  type Row,
} from "./model";
import {
  sha256,
  canonicalJson,
} from "../modules/import-kit/src/provenance/identity";
const binMovements = (c: Context, locationId: string) =>
  c.s.movements.filter((movement) => movement.locationId === locationId);
const binFrontier = (c: Context, locationId: string) =>
  sha256(canonicalJson(binMovements(c, locationId)));
export function countView(c: Context, count: Row) {
  const current = binMovements(c, count.locationId);
  return {
    ...count,
    stale: binFrontier(c, count.locationId) !== count.frontier,
    interveningMovements: current.filter(
      (movement) => !count.movementIds.includes(movement.id),
    ),
    removedMovementIds: count.movementIds.filter(
      (id: string) => !current.some((movement) => movement.id === id),
    ),
  };
}
export function warehouse(c: Context, type: string, p: any): Row | undefined {
  if (
    ![
      "transfer.send",
      "transfer.receive",
      "count.capture",
      "count.record",
      "count.approve",
      "count.recount",
    ].includes(type)
  )
    return;
  requireRole(c, ["warehouse"]);
  if (type === "transfer.send") {
    const q = decimal(p.quantity, true);
    const from = get(c.s, "locations", p.fromLocationId),
      to = get(c.s, "locations", p.toLocationId),
      transit = get(c.s, "locations", p.transitLocationId);
    if (
      from.kind !== "bin" ||
      to.kind !== "bin" ||
      from.id === to.id ||
      transit.kind !== "transit"
    )
      fail(
        "TRANSFER",
        "Use different source/destination bins and a real transit location.",
      );
    if (available(c.s, p.itemId, from.id) < q)
      fail("AVAILABLE", "Transfer exceeds unreserved sellable stock.");
    const t = row(c, "transfers", {
      itemId: p.itemId,
      fromLocationId: from.id,
      toLocationId: to.id,
      transitLocationId: transit.id,
      quantity: format(q),
      reason: text(p.reason),
      status: "transit",
    });
    move(c, {
      itemId: t.itemId,
      locationId: from.id,
      status: "sellable",
      quantity: (-q).toString(),
      reason: t.reason,
      documentId: t.id,
    });
    move(c, {
      itemId: t.itemId,
      locationId: transit.id,
      status: "transit",
      quantity: q.toString(),
      reason: t.reason,
      documentId: t.id,
    });
    return t;
  }
  if (type === "transfer.receive") {
    const t = get(c.s, "transfers", p.transferId);
    if (t.status !== "transit")
      fail("TRANSFER_STATE", "Transfer already received.");
    move(c, {
      itemId: t.itemId,
      locationId: t.transitLocationId,
      status: "transit",
      quantity: (-decimal(t.quantity)).toString(),
      reason: "Destination receipt",
      documentId: t.id,
    });
    move(c, {
      itemId: t.itemId,
      locationId: t.toLocationId,
      status: "sellable",
      quantity: decimal(t.quantity).toString(),
      reason: "Destination receipt",
      documentId: t.id,
    });
    t.status = "received";
    t.version++;
    return t;
  }
  if (type === "count.capture" || type === "count.recount") {
    const locationId =
      type === "count.recount"
        ? get(c.s, "counts", p.countId).locationId
        : p.locationId;
    get(c.s, "locations", locationId);
    const lines = positions(c.s)
      .filter((x) => x.locationId === locationId)
      .map((x) => ({
        itemId: x.itemId,
        status: x.status,
        expected: x.quantity,
        quantity: x.quantity,
      }));
    return row(c, "counts", {
      locationId,
      frontier: binFrontier(c, locationId),
      frontierCount: binMovements(c, locationId).length,
      movementIds: binMovements(c, locationId).map((movement) => movement.id),
      lines,
      status: "captured",
      reason: "",
      supersedes: p.countId ?? null,
    });
  }
  const count = get(c.s, "counts", p.countId);
  fresh(count, p.version);
  if (count.status === "posted") fail("COUNT_STATE", "Count already posted.");
  if (type === "count.record") {
    if (!Array.isArray(p.lines))
      fail("LINES", "Physical count lines are required.");
    const seen = new Set();
    count.lines = p.lines.map((l: any) => {
      get(c.s, "items", l.itemId);
      if (
        !["sellable", "quarantine", "transit"].includes(l.status) ||
        seen.has(l.itemId + ":" + l.status)
      )
        fail("COUNT_LINE", "Count positions must be unique with valid status.");
      seen.add(l.itemId + ":" + l.status);
      if (
        (get(c.s, "locations", count.locationId).kind === "transit") !==
        (l.status === "transit")
      )
        fail("COUNT_LINE", "Position status must match location kind.");
      return {
        itemId: l.itemId,
        status: l.status,
        expected:
          count.lines.find(
            (old: any) => old.itemId === l.itemId && old.status === l.status,
          )?.expected ?? "0",
        quantity: format(decimal(l.quantity)),
      };
    });
    count.reason = text(p.reason);
    count.status = "review";
    count.version++;
    return count;
  }
  if (count.status !== "review")
    fail("COUNT_STATE", "Record physical quantities and reason first.");
  const currentCount = countView(c, count);
  if (currentCount.stale)
    fail(
      "COUNT_FRONTIER",
      "Movements changed this bin. Recount before approving.",
      {
        movements: currentCount.interveningMovements,
        removedMovementIds: currentCount.removedMovementIds,
      },
    );
  for (const l of count.lines) {
    const delta =
      decimal(l.quantity) - balance(c.s, l.itemId, count.locationId, l.status);
    if (delta)
      move(c, {
        itemId: l.itemId,
        locationId: count.locationId,
        status: l.status,
        quantity: delta.toString(),
        reason: count.reason,
        documentId: count.id,
        reversalId: count.sourceReceiptId
          ? (c.s.receipts
              .find((r) => r.id === count.sourceReceiptId)
              ?.lines.find(
                (r: any) =>
                  r.itemId === l.itemId && r.locationId === count.locationId,
              )?.movementId ?? null)
          : null,
      });
  }
  count.approval = { actorId: c.actor.id, version: count.version, at: c.now };
  count.status = "posted";
  count.version++;
  return count;
}
