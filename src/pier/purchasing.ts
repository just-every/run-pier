import {
  decimal,
  format,
  get,
  id,
  item,
  nextReference,
  row,
  text,
  fresh,
  fail,
  requireRole,
  move,
  type Context,
  type Row,
} from "./model";
import { warehouse } from "./warehouse";
import { landReceipt } from "./landed-cost";
function lines(c: Context, p: any) {
  if (!Array.isArray(p.lines) || !p.lines.length)
    fail("LINES", "Add purchase lines.");
  return p.lines.map((l: any) => {
    const i = item(c.s, l.itemId),
      terms = c.s.supplierItems.find(
        (t) => t.itemId === i.id && t.supplierId === p.supplierId,
      );
    const q = decimal(l.quantity, true);
    if (terms && q < decimal(terms.minimum))
      fail("MINIMUM", "Quantity is below supplier minimum.");
    return {
      id: id(),
      itemId: i.id,
      quantity: format(q),
      price: format(decimal(l.price)),
      received: "0",
      terms: terms ? structuredClone(terms) : null,
    };
  });
}
function approveTerms(c: Context, po: Row) {
  if (
    get(c.s, "parties", po.supplierId).version !== po.supplierSnapshot.version
  )
    fail("SUPPLIER_CHANGED", "Supplier changed. Revise and approve again.");
  for (const l of po.lines)
    if (
      l.terms &&
      get(c.s, "supplierItems", l.terms.id).version !== l.terms.version
    )
      fail(
        "TERMS_CHANGED",
        "Supplier terms changed. Revise the draft and review it again.",
      );
}
export function purchasing(c: Context, type: string, p: any): Row | undefined {
  if (
    ![
      "po.draft",
      "po.revise",
      "po.approve",
      "po.commit",
      "receipt.create",
      "receipt.reverse",
      "receipt.correct",
    ].includes(type)
  )
    return;
  requireRole(
    c,
    type === "po.draft" || type === "po.revise"
      ? ["buyer", "agent"]
      : type.startsWith("receipt.")
        ? ["warehouse"]
        : ["buyer"],
  );
  if (type === "po.draft" || type === "po.revise") {
    if (get(c.s, "parties", p.supplierId).kind !== "supplier")
      fail("SUPPLIER", "Choose a supplier.");
    const d = {
      supplierId: p.supplierId,
      supplierSnapshot: structuredClone(get(c.s, "parties", p.supplierId)),
      promiseDate: text(p.promiseDate, "Promise date"),
      reason: text(p.reason),
      lines: lines(c, p),
      status: "draft",
      approval: null,
    };
    if (type === "po.draft")
      return row(c, "purchaseOrders", {
        reference: nextReference(c.s.purchaseOrders, "PO"),
        ...d,
      });
    const po = get(c.s, "purchaseOrders", p.poId);
    fresh(po, p.version);
    if (po.status === "committed")
      fail(
        "COMMITTED",
        "Committed purchase orders cannot be silently amended. Reverse unreceived commitment in a new reviewed document.",
      );
    Object.assign(po, d, { version: po.version + 1 });
    return po;
  }
  if (type === "po.approve" || type === "po.commit") {
    const po = get(c.s, "purchaseOrders", p.poId);
    fresh(po, p.version);
    if (po.status !== "draft")
      fail("PO_STATE", "Only a draft can be committed.");
    approveTerms(c, po);
    if (type === "po.approve") {
      po.approval = { actorId: c.actor.id, version: po.version, at: c.now };
      return po;
    }
    if (po.approval?.version !== po.version)
      fail(
        "APPROVAL",
        "Approve the exact supplier, quantity, price and promise date first.",
      );
    po.status = "committed";
    po.version++;
    return po;
  }
  if (type === "receipt.create") {
    if (p.currency !== undefined && p.currency !== 'USD') fail('CURRENCY', 'Receipts require reviewed USD costs. Foreign-currency conversion is not available yet.');
    const po = get(c.s, "purchaseOrders", p.poId);
    if (po.status !== "committed")
      fail("PO_STATE", "Receipts require a committed purchase order.");
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add receipt lines.");
    const receipt = row(c, "receipts", {
      poId: po.id,
      supplierReference: text(p.supplierReference),
      lines: [],
      status: "posted",
    });
    for (const x of p.lines) {
      const l = po.lines.find((l: any) => l.id === x.poLineId);
      if (!l) fail("LINE", "Receipt line must belong to this PO.");
      const q = decimal(x.quantity, true),
        cost = decimal(x.cost);
      if (q + decimal(l.received) > decimal(l.quantity))
        fail("RECEIPT_LIMIT", "Receipt exceeds expected quantity.");
      if (get(c.s, "locations", x.locationId).kind !== "bin")
        fail("BIN", "Receive to a bin.");
      const m = move(c, {
        itemId: l.itemId,
        locationId: x.locationId,
        status: "sellable",
        quantity: q.toString(),
        reason: "PO receipt " + receipt.supplierReference,
        documentId: receipt.id,
      });
      receipt.lines.push({
        id: id(),
        poLineId: l.id,
        itemId: l.itemId,
        locationId: x.locationId,
        quantity: format(q),
        cost: format(cost),
        costTotal:
          ((q * cost) / 1000000000000n).toString() +
          "." +
          ((q * cost) % 1000000000000n).toString().padStart(12, "0"),
        costTotalScale: 12,
        movementId: m.id,
      });
      l.received = format(decimal(l.received) + q);
    }
    po.version++;
    return landReceipt(receipt, p.landedCost);
  }
  const receipt = get(c.s, "receipts", p.receiptId);
  if (type === "receipt.correct") {
    const count = get(c.s, "counts", p.countId);
    fresh(count, p.version);
    if (!receipt.lines.some((l: any) => l.locationId === count.locationId))
      fail(
        "CORRECTION_BIN",
        "Choose a physical count of a bin on this receipt.",
      );
    count.sourceReceiptId = receipt.id;
    count.reason =
      text(p.reason) + "; physical-count correction of receipt " + receipt.id;
    const corrected = warehouse(c, "count.approve", {
      countId: count.id,
      version: count.version,
    })!;
    receipt.corrections ??= [];
    receipt.corrections.push({
      countId: count.id,
      actorId: c.actor.id,
      reason: p.reason,
      at: c.now,
    });
    receipt.version++;
    return corrected;
  }
  if (receipt.status !== "posted")
    fail("REVERSED", "Receipt is already reversed.");
  const dependencies = c.s.movements.filter(
    (m) =>
      receipt.lines.some(
        (l: any) => l.itemId === m.itemId && l.locationId === m.locationId,
      ) &&
      m.documentId !== receipt.id &&
      m.sequence >
        Math.min(
          ...receipt.lines.map(
            (l: any) =>
              c.s.movements.find((m) => m.id === l.movementId)!.sequence,
          ),
        ) &&
      BigInt(m.quantity) < 0n,
  );
  if (dependencies.length)
    fail(
      "DEPENDENCY",
      "Receipt has downstream movements. Use a captured physical count and receipt.correct for an evidence-linked compensating adjustment. History cannot be erased.",
      dependencies,
    );
  for (const l of receipt.lines) {
    move(c, {
      itemId: l.itemId,
      locationId: l.locationId,
      status: "sellable",
      quantity: (-decimal(l.quantity)).toString(),
      reason: text(p.reason),
      documentId: receipt.id,
      reversalId: l.movementId,
    });
    const poLine = get(c.s, "purchaseOrders", receipt.poId).lines.find(
      (x: any) => x.id === l.poLineId,
    );
    poLine.received = format(decimal(poLine.received) - decimal(l.quantity));
  }
  receipt.status = "reversed";
  receipt.version++;
  get(c.s, "purchaseOrders", receipt.poId).version++;
  return receipt;
}
