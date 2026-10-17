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

/** Price the still-unpriced lines of an existing order (a channel order that
 * arrived without prices). Priced lines and dispatched history never change. */
export function priceUnpricedLines(
  c: Context,
  o: Row,
  prices: { orderLineId: string; price: unknown }[],
  source: string,
) {
  for (const { orderLineId, price } of prices) {
    const line = o.lines.find((l: any) => l.id === orderLineId);
    if (!line) fail("LINE", "Each price must belong to a line of this order.");
    if (line.price !== null && line.price !== undefined) continue;
    if (typeof price !== "string" || !price.trim())
      fail("PRICE", "Enter a unit price in USD for each unpriced line.");
    Object.assign(line, orderPrice(c, o.customerId, line.itemId, decimal(line.quantity), String(price).trim()));
    line.priceSnapshot.source = source;
  }
  const priced = o.lines.every((l: any) => typeof l.price === "string");
  o.pricingStatus = priced ? "priced" : "unpriced";
  o.total = priced
    ? money(o.lines.reduce((sum: bigint, l: any) => sum + decimal(l.quantity) * decimal(l.price), 0n))
    : null;
  o.version++;
  return o;
}
