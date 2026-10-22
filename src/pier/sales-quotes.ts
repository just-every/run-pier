import {
  decimal,
  fail,
  format,
  fresh,
  get,
  id,
  requireRole,
  row,
  SCALE,
  text,
  type Context,
  type Row,
} from "./model";
import { orderPrice } from "./pricing";
import { money, toCents } from "./money";
import { valuationLedger } from "./valuation-ledger";
import { kitDefinition } from "./kits";
import { quoteApprovalPolicy, saveQuoteApprovalPolicy } from './quote-approval';

export function isoDay(value: unknown, name: string): string {
  const day = text(value, name);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    fail("DATE", `${name} must be a valid YYYY-MM-DD date.`);
  return day;
}
export function quoteLines(c: Context, p: any) {
  if (get(c.s, "parties", p.customerId).kind !== "customer")
    fail("CUSTOMER", "Choose a customer.");
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 1000)
    fail("LINES", "Add between one and 1,000 lines.");
  return p.lines.map((line: any) => {
    const item = get(c.s, "items", line.itemId);
    if (item.archived) fail("ARCHIVED", "Archived items cannot enter a quote.");
    const packs = decimal(line.quantity, true),
      pack = line.unit === "case" ? decimal(item.packSize, true) : SCALE;
    if (line.unit && !["case", item.unit].includes(line.unit))
      fail("UNIT", "Choose the item base unit or case.");
    if ((packs * pack) % SCALE)
      fail("PRECISION", "Case quantity exceeds six base-unit decimal places.");
    const quantity = (packs * pack) / SCALE;
    const price = orderPrice(c, p.customerId, item.id, quantity, line.price);
    return {
      id: id(),
      itemId: item.id,
      quantity: format(quantity),
      dispatched: "0",
      cancelled: "0",
      ...price,
      commercialQuantity: format(packs),
      commercialUnit: line.unit ?? item.unit,
      packSize: item.packSize,
      unit: item.unit,
      ...(kitDefinition(c.s, item.id)
        ? { kit: structuredClone(kitDefinition(c.s, item.id)) }
        : {}),
    };
  });
}
export function quoteTerms(c: Context, p: any, lines: any[]) {
  const validUntil = isoDay(
    p.validUntil ??
      new Date(Date.parse(c.now) + 30 * 86400000).toISOString().slice(0, 10),
    "Quote valid through",
  );
  if (validUntil < c.now.slice(0, 10))
    fail("QUOTE_EXPIRED", "Choose a current or future expiry day.");
  const discount = decimal(p.discountPercent ?? "0");
  if (discount > 100n * SCALE)
    fail("DISCOUNT", "Discount must be between zero and 100 percent.");
  const before = lines.every((l) => l.price !== null)
    ? lines.reduce(
        (n: bigint, l: any) => n + decimal(l.quantity) * decimal(l.price),
        0n,
      )
    : null;
  for (const line of lines.filter((l) => l.price !== null)) {
    const product = decimal(line.price) * (100n * SCALE - discount);
    if (product % (100n * SCALE))
      fail(
        "PRICE_PRECISION",
        "Discounted unit price must fit six decimal places.",
      );
    line.listPrice = line.price;
    line.price = format(product / (100n * SCALE));
    line.lineTotal = money(decimal(line.quantity) * decimal(line.price));
  }
  const net =
    before === null
      ? null
      : lines.reduce(
          (n: bigint, l: any) => n + decimal(l.quantity) * decimal(l.price),
          0n,
        );
  const shipTo = p.shipTo ?? null;
  let tax: any = {
    status: "pending",
    source: "No owner tax table for this destination",
    amount: null,
  };
  const table = c.s.salesPolicies.find(
    (r) =>
      r.kind === "tax-table" &&
      r.state === shipTo?.state &&
      r.country === (shipTo?.country ?? "US"),
  );
  const customer = get(c.s, "parties", p.customerId),
    certificate = customer.resaleCertificates?.find(
      (r: any) => r.state === shipTo?.state,
    );
  if (table && net !== null) {
    if (certificate && certificate.expires < c.now.slice(0, 10))
      tax = {
        status: "review",
        source: "Expired exemption certificate",
        amount: null,
        certificate,
      };
    else {
      const rate = certificate ? 0n : decimal(table.rate);
      tax = {
        status: "estimate",
        source: "Owner-maintained jurisdiction table",
        table: structuredClone(table),
        certificate: certificate ?? null,
        rate: format(rate),
        amount: money(toCents((net * rate) / (100n * SCALE))),
      };
    }
  }
  return {
    validUntil,
    discountPercent: format(discount),
    subtotal: net === null ? null : money(net),
    tax,
    total:
      net === null || tax.amount === null
        ? null
        : money(net + BigInt(tax.amount.replace(".", ""))),
    pricingStatus: net === null ? "unpriced" : "priced",
    shipTo,
    quoteApproval: null,
    acceptedAt: null,
    acceptedBy: null,
  };
}
export function currentQuote(c: Context, quote: Row) {
  if (quote.validUntil && quote.validUntil < c.now.slice(0, 10))
    fail(
      "QUOTE_EXPIRED",
      "Quote pricing expired. Revise and obtain acceptance again.",
    );
  if (
    quote.tax?.table &&
    get(c.s, "salesPolicies", quote.tax.table.id).version !==
      quote.tax.table.version
  )
    fail("QUOTE_TAX", "Tax table changed. Revise the quote.");
  if (
    quote.tax?.certificate &&
    (quote.tax.certificate.expires < c.now.slice(0, 10) ||
      !get(c.s, "parties", quote.customerId).resaleCertificates?.some(
        (x: any) => JSON.stringify(x) === JSON.stringify(quote.tax.certificate),
      ))
  )
    fail("QUOTE_TAX", "Exemption changed or expired. Revise the quote.");
  for (const line of quote.lines) {
    const tier = line.priceSnapshot?.priceList;
    if (
      tier &&
      ((tier.validTo && tier.validTo < c.now.slice(0, 10)) ||
        get(c.s, "priceLists", tier.id).version !== tier.version)
    )
      fail(
        "QUOTE_PRICING",
        "Customer pricing changed or expired. Revise and obtain approval again.",
      );
  }
}
export function salesQuotes(c: Context, type: string, p: any): Row | undefined {
  if (type === 'sales.quoteApprovalPolicy') return saveQuoteApprovalPolicy(c, p);
  if (type === "sales.taxTable") {
    requireRole(c, []);
    const state = text(p.state, "State").toUpperCase(),
      rate = decimal(p.rate);
    if (!/^[A-Z]{2}$/.test(state) || rate > 100n * SCALE)
      fail(
        "TAX_TABLE",
        "Use a two-letter state and tax rate from zero to 100.",
      );
    const old = c.s.salesPolicies.find(
      (r) => r.kind === "tax-table" && r.state === state,
    );
    if (old) fresh(old, p.version);
    const data = {
      kind: "tax-table",
      state,
      country: "US",
      rate: format(rate),
      reason: text(p.reason),
      approvedBy: c.actor.id,
    };
    return old
      ? Object.assign(old, data, { version: old.version + 1 })
      : row(c, "salesPolicies", data);
  }
  if (type === "customer.resaleCertificate") {
    requireRole(c, []);
    const customer = get(c.s, "parties", p.customerId);
    fresh(customer, p.version);
    if (customer.kind !== "customer") fail("CUSTOMER", "Choose a customer.");
    const state = text(p.state).toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) fail("STATE", "Use a two-letter state.");
    const value = {
      state,
      number: text(p.number),
      reason: text(p.reason),
      document: text(p.document),
      expires: isoDay(p.expires, "Certificate expiry"),
      approvedBy: c.actor.id,
      at: c.now,
    };
    customer.resaleCertificates = [
      ...(customer.resaleCertificates ?? []).filter(
        (r: any) => r.state !== state,
      ),
      value,
    ];
    customer.version++;
    return customer;
  }
  if (type !== "quote.approve") return;
  const policy = quoteApprovalPolicy(c.s);
  requireRole(c, [policy.role]);
  const q = get(c.s, "orders", p.orderId);
  fresh(q, p.version);
  if (q.documentType !== "quote" || q.acceptedAt)
    fail("QUOTE_STATE", "Choose an open quote.");
  currentQuote(c, q);
  if (q.total === null || q.tax?.status !== "estimate")
    fail(
      "QUOTE_PRICE",
      "Price every line and review a jurisdiction tax estimate before approval.",
    );
  const ledger = valuationLedger(c.s, "9999");
  const costs = q.lines.map((l: any) => {
    const layers = ledger.positions
      .filter((pos) => pos.itemId === l.itemId && pos.status === "sellable")
      .flatMap((pos) => pos.layers);
    const quantity = layers.reduce((n, x) => n + x.quantity, 0n);
    return {
      itemId: l.itemId,
      unitCost:
        !quantity || layers.some((x) => x.value === null)
          ? null
          : money(
              (layers.reduce((n, x) => n + x.value!, 0n) * SCALE) / quantity,
            ),
    };
  });
  q.quoteApproval = {
    version: q.version + 1,
    actorId: c.actor.id,
    role: c.actor.role,
    policyVersion: policy.version,
    at: c.now,
    reason: text(p.reason, "Discount and margin approval reason"),
    discountPercent: q.discountPercent,
    costs,
  };
  q.version++;
  return q;
}
