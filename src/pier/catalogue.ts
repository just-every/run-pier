import {
  decimal,
  format,
  get,
  id,
  item,
  row,
  text,
  fresh,
  fail,
  requireRole,
  type Context,
  type Row,
} from "./model";
import { same } from "./floor/codes";
export function catalogue(c: Context, type: string, p: any): Row | undefined {
  if (type === "role.set") {
    requireRole(c, []);
    if (
      !["buyer", "operator", "warehouse", "viewer", "agent", "owner"].includes(
        p.role,
      )
    )
      fail("ROLE", "Unknown role");
    if (p.operatorId === c.actor.id)
      fail("ROLE", "Use native owner management to change your own authority.");
    const old = c.s.roles.find((r) => r.id === p.operatorId);
    if (old) {
      old.role = p.role;
      old.version++;
      return old;
    }
    return row(c, "roles", { id: text(p.operatorId), role: p.role });
  }
  if (
    !["item.save", "location.save", "party.save", "supplierItem.save"].includes(
      type,
    )
  )
    return;
  requireRole(c, ["operator", "buyer", "warehouse"]);
  const collection =
    type === "item.save"
      ? "items"
      : type === "location.save"
        ? "locations"
        : type === "party.save"
          ? "parties"
          : "supplierItems";
  const old = p.id ? get(c.s, collection, p.id) : undefined;
  if (old) fresh(old, p.version);
  let data: any;
  if (type === "item.save") {
    data = {
      sku: text(p.sku, "SKU"),
      name: text(p.name, "Name"),
      barcode: p.barcode ? text(p.barcode) : null,
      // A case barcode (GTIN-14/ITF-14) scans as one pack of packSize base units.
      caseBarcode: p.caseBarcode ? text(p.caseBarcode) : null,
      unit: text(p.unit, "Base unit"),
      packSize: format(decimal(p.packSize, true)),
      archived: p.archived === true,
    };
    const codes = [data.barcode, data.caseBarcode].filter(Boolean);
    if (
      (data.barcode && data.barcode === data.caseBarcode) ||
      c.s.items.some(
        (r) =>
          r.id !== old?.id &&
          (r.sku === data.sku ||
            codes.some((code) => same(code, r.barcode) || same(code, r.caseBarcode))),
      ) ||
      c.s.locations.some((l) => codes.some((code) => same(code, l.barcode)))
    )
      fail("DUPLICATE", "SKU and barcode must be unique.");
    if (
      old &&
      (c.s.movements.some((m) => m.itemId === old.id) ||
        c.s.supplierItems.some((terms) => terms.itemId === old.id) ||
        [...c.s.orders, ...c.s.purchaseOrders, ...c.s.counts].some((document) =>
          document.lines.some((line: any) => line.itemId === old.id),
        )) &&
      (old.unit !== data.unit || old.packSize !== data.packSize)
    )
      fail(
        "HISTORY",
        "An item referenced by stock, counts, supplier terms or orders cannot change its base unit or pack conversion. Create a new SKU.",
      );
  }
  if (type === "location.save") {
    data = {
      name: text(p.name),
      warehouse: text(p.warehouse),
      kind: p.kind,
      barcode: p.barcode ? text(p.barcode) : null,
    };
    if (
      data.barcode &&
      (c.s.locations.some((l) => l.id !== old?.id && same(data.barcode, l.barcode)) ||
        c.s.items.some((i) => same(data.barcode, i.barcode) || same(data.barcode, i.caseBarcode)))
    )
      fail("DUPLICATE", "A bin barcode must be unique and differ from every item barcode.");
    if (!["bin", "transit"].includes(p.kind))
      fail("LOCATION", "Choose bin or transit.");
    if (
      old &&
      old.kind !== p.kind &&
      (c.s.movements.some((m) => m.locationId === old.id) ||
        c.s.counts.some((count) => count.locationId === old.id))
    )
      fail("HISTORY", "Used location kind is immutable.");
  }
  if (type === "party.save") {
    data = { name: text(p.name), kind: p.kind };
    if (!["supplier", "customer"].includes(p.kind))
      fail("PARTY", "Choose supplier or customer.");
    if (old && old.kind !== p.kind) fail("HISTORY", "Party kind is immutable.");
  }
  if (type === "supplierItem.save") {
    item(c.s, p.itemId);
    if (get(c.s, "parties", p.supplierId).kind !== "supplier")
      fail("SUPPLIER", "Select a supplier.");
    data = {
      supplierId: p.supplierId,
      itemId: p.itemId,
      code: text(p.code),
      packSize: format(decimal(p.packSize, true)),
      price: format(decimal(p.price)),
      minimum: format(decimal(p.minimum)),
      leadDays: Number(p.leadDays),
    };
    if (
      c.s.supplierItems.some(
        (terms) =>
          terms.id !== old?.id &&
          terms.itemId === data.itemId &&
          terms.supplierId === data.supplierId,
      )
    )
      fail(
        "DUPLICATE",
        "This supplier already has terms for the item. Update the current version explicitly.",
      );
    if (
      !Number.isSafeInteger(data.leadDays) ||
      data.leadDays < 0 ||
      data.leadDays > 3650
    )
      fail("LEAD", "Lead days must be 0–3650.");
  }
  if (old) {
    Object.assign(old, data, { version: old.version + 1 });
    return old;
  }
  return row(c, collection, data);
}
