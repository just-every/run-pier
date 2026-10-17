import {
  decimal,
  format,
  fresh,
  get,
  item,
  fail,
  requireRole,
  row,
  type Context,
  type Row,
} from "./model";
import { money } from "./money";

function date(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T00:00:00.000Z")) ||
    new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) !== value
  )
    fail("DATE", `${name} must be a valid ISO date (YYYY-MM-DD).`);
  return value as string;
}

export function pricing(c: Context, type: string, p: any): Row | undefined {
  if (type !== "priceList.save") return;
  requireRole(c, ["buyer", "operator"]);
  const old = p.id ? get(c.s, "priceLists", p.id) : undefined;
  if (old) fresh(old, p.version);
  if (get(c.s, "parties", p.customerId).kind !== "customer")
    fail("CUSTOMER", "Choose a customer.");
  item(c.s, p.itemId);
  if (p.currency !== undefined && p.currency !== "USD")
    fail("CURRENCY", "Customer prices use USD.");
  const data = {
    customerId: p.customerId,
    itemId: p.itemId,
    minimumQuantity: format(decimal(p.minimumQuantity ?? "0")),
    price: format(decimal(p.price)),
    currency: "USD",
    validFrom: date(p.validFrom, "Valid from"),
    validTo: date(p.validTo, "Valid to"),
  };
  if (data.validFrom && data.validTo && data.validFrom > data.validTo)
    fail("DATE", "Valid to must be on or after valid from.");
  if (
    c.s.priceLists.some(
      (r) =>
        r.id !== old?.id &&
        r.customerId === data.customerId &&
        r.itemId === data.itemId &&
        r.minimumQuantity === data.minimumQuantity &&
        r.validFrom === data.validFrom &&
        r.validTo === data.validTo,
    )
  )
    fail(
      "DUPLICATE",
      "This customer already has this item pricing tier and date range. Update its current version explicitly.",
    );
  if (old) {
    Object.assign(old, data, { version: old.version + 1 });
    return old;
  }
  return row(c, "priceLists", data);
}

/** Resolve once at order creation; later price-list edits never reprice history. */
export function orderPrice(
  c: Context,
  customerId: string,
  itemId: string,
  quantity: bigint,
  suppliedPrice: unknown,
) {
  const today = c.now.slice(0, 10);
  const tier =
    suppliedPrice === undefined
      ? c.s.priceLists
        .filter(
          (r) =>
            r.customerId === customerId &&
            r.itemId === itemId &&
            decimal(r.minimumQuantity) <= quantity &&
            (!r.validFrom || r.validFrom <= today) &&
            (!r.validTo || r.validTo >= today),
        )
        .sort((a, b) => {
          const difference =
            decimal(b.minimumQuantity) - decimal(a.minimumQuantity);
          if (difference !== 0n) return difference > 0n ? 1 : -1;
          // A newer effective price supersedes an overlapping older schedule.
          return (
            (b.validFrom ?? "").localeCompare(a.validFrom ?? "") ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id)
          );
        })[0]
      : undefined;
  if (suppliedPrice === undefined && !tier)
    return {
      price: null,
      lineTotal: null,
      pricingStatus: "unpriced",
      priceSnapshot: null,
    };
  const price = format(
    decimal(suppliedPrice === undefined ? tier!.price : suppliedPrice),
  );
  return {
    price,
    lineTotal: money(quantity * decimal(price)),
    pricingStatus: "priced",
    priceSnapshot: {
      source: tier ? "priceList" : "supplied",
      price,
      currency: "USD",
      priceList: tier ? structuredClone(tier) : null,
      actorId: c.actor.id,
      commandId: c.commandId,
      at: c.now,
    },
  };
}
