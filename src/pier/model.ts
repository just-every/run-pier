import { policyFor, traceAvailable, unavailableTraceQuantity } from './trace-core';
export class Problem extends Error {
  constructor(
    public code: string,
    message: string,
    public details: unknown = null,
    public status = 409,
  ) {
    super(message);
  }
}
export const fail = (
  code: string,
  message: string,
  details: unknown = null,
): never => {
  throw new Problem(code, message, details);
};
export const SCALE = 1000000n,
  MAX = 9000000000000000n;
export function decimal(v: unknown, positive = false): bigint {
  if (typeof v !== "string" || !/^\d{1,10}(\.\d{1,6})?$/.test(v))
    return fail(
      "DECIMAL",
      "Use a non-negative decimal string with at most 6 decimal places and 10 whole digits.",
    );
  const [a, b = ""] = v.split(".");
  const n = BigInt(a) * SCALE + BigInt(b.padEnd(6, "0"));
  if (n > MAX || (positive && n === 0n))
    return fail(
      "DECIMAL",
      "Quantity must be within the supported range and positive.",
    );
  return n;
}
export function format(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  n = n < 0n ? -n : n;
  return (
    sign +
    (n / SCALE).toString() +
    (n % SCALE
      ? "." + (n % SCALE).toString().padStart(6, "0").replace(/0+$/, "")
      : "")
  );
}
export const add = (a: string, b: string) => format(decimal(a) + decimal(b));
export const sub = (a: string, b: string) => format(decimal(a) - decimal(b));
export const movementFrontier = (s: State) => s.movements.at(-1)?.sequence ?? 0;
export const id = () => crypto.randomUUID();
export const text = (v: unknown, name = "value") =>
  typeof v === "string" && v.trim() && v.length <= 2000
    ? v.trim()
    : fail("INPUT", `${name} is required (maximum 2000 characters).`);
export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export type Row = {
  id: string;
  version: number;
  [key: string]: any;
};
export const collections = [
  "customFieldDefinitions",
  "purchaseApprovalPolicies",
  "savedReports",
  "reportSnapshots",
  "workflowRules",
  "workflowJobs",
  "privacyHolds",
  "privacyPolicies",
  "privacyReceipts",
  "businessTemplates",
  "printMailEvents",
  "invoices",
  "invoiceCredits",
  "paymentConnections",
  "invoicePayLinks",
  "invoicePaymentSessions",
  "invoicePayments",
  "evidenceDocuments",
  "documentSettings",
  "documentExtractions",
  "documentInbox",
  "customerCredits",
  "recurringOrders",
  "dropships",
  "salesPolicies",
  "salesDocuments",
  "salesImports",
  "routingRules",
  "items",
  "locations",
  "parties",
  "supplierItems",
  "orders",
  "purchaseOrders",
  "receipts",
  "supplierReturns",
  "transfers",
  "shipments",
  "returns",
  "counts",
  "stocktakes",
  "salesReps",
  "backorderPolicies",
  "backorderReleases",
  "proposals",
  "imports",
  "roles",
  "priceLists",
  "costingMethods",
  "receivings",
  "carriers",
  "waves",
  "packs",
  "dispatchDays",
  "replenishmentPolicies",
  "replenishmentSettings",
  "replenishmentExceptions",
  "correspondence",
  "channels",
  "channelListings",
  "channelOrders",
  "channelHolds",
  "bookConnections",
  "bookJobs",
  "supplierBills",
  "aiSettings",
  "shippingSettings",
  "shippingJobs",
  "ediPartners",
  "ediMappings",
  "ediOrders",
  "ediDocuments",
  "ediLabelEvents",
  "businessProfile",
  "operationalExceptionPolicies",
  "operationalExceptions",
  "slowStockPolicies",
  "slowStockExceptions",
  "slottingPlans",
  "kitDefinitions",
  "kittingTasks",
  "traceIdentities",
  "traceEvents",
  "traceReservations",
  "traceQuarantines",
] as const;
export type Collection = (typeof collections)[number];
export type Movement = {
  id: string;
  itemId: string;
  locationId: string;
  status: string;
  quantity: string;
  actorId: string;
  reason: string;
  commandId: string;
  documentId: string;
  reversalId: string | null;
  importId: string | null;
  createdAt: string;
  sequence: number;
};
export type Reservation = {
  id: string;
  orderId: string;
  orderLineId: string;
  itemId: string;
  locationId: string;
  quantity: string;
};
export type State = Record<Collection, Row[]> & {
  version: number;
  movements: Movement[];
  reservations: Reservation[];
};
export type Actor = {
  id: string;
  name: string;
  role: string;
  sessionId: string;
  operatorVersion: number;
  permissionVersion?: number;
  permissions?: import("./permissions").Permissions;
  visibility?: import("./role-visibility").Visibility;
};
export type Context = {
  s: State;
  actor: Actor;
  commandId: string;
  now: string;
  backgroundPolicy?: { collection: "replenishmentPolicies" | "orders" | "recurringOrders" | "channels" | "bookConnections" | "shippingSettings" | "purchaseOrders" | "slowStockPolicies" | "operationalExceptionPolicies" | "paymentConnections" | "workflowRules"; id: string; version: number };
  privacyStatements?: D1PreparedStatement[];
  channelSecrets?: { channelId: string; secret: string }[];
  automationActors?: Record<string, string>;
  installationScope?: string;
  purchaseSendAuthority?: { poId: string; policyVersion: number; actorId: string; role: string };
  delegates?: { actorId: string; role: string; orderId: string; policyVersion: number }[];
  audit?: ReturnType<typeof import("./audit").auditEvent>;
  approver?: {
    id: string;
    role: string;
  };
};
export function get(s: State, c: Collection, key: string): Row {
  return (
    s[c].find((r) => r.id === key) ??
    fail("NOT_FOUND", `${c} record not found.`, { id: key })
  );
}
export function fresh(row: Row, version: unknown) {
  if (row.version !== version)
    fail("STALE", "The record changed. Reload and review this version.", {
      currentVersion: row.version,
    });
}
export function requireRole(c: Context, roles: string[]) {
  const role = c.actor.role === 'sales' ? 'operator' : c.actor.role;
  if (!roles.includes(role) && !roles.includes(c.actor.role) && c.actor.role !== "owner")
    (() => {
      throw new Problem(
        "FORBIDDEN",
        "Your current role cannot perform this command.",
        null,
        403,
      );
    })();
}
export function item(s: State, key: string) {
  const r = get(s, "items", key);
  if (r.archived)
    fail(
      "ARCHIVED",
      "Archived items retain history but cannot enter new transactions.",
    );
  return r;
}
export function balance(
  s: State,
  itemId: string,
  locationId: string,
  status = "sellable",
): bigint {
  return s.movements
    .filter(
      (m) =>
        m.itemId === itemId &&
        m.locationId === locationId &&
        m.status === status,
    )
    .reduce((n, m) => n + BigInt(m.quantity), 0n);
}
export function reserved(s: State, itemId: string, locationId: string): bigint {
  return s.reservations
    .filter((r) => r.itemId === itemId && r.locationId === locationId)
    .reduce((n, r) => n + BigInt(r.quantity), 0n);
}
export function held(s: State, itemId: string, locationId: string): bigint {
  return (s.channelHolds ?? []).filter(h => !h.releasedAt && h.itemId === itemId).reduce((sum, h) => sum + h.allocations.filter((a: any) => a.locationId === locationId).reduce((n: bigint, a: any) => n + BigInt(a.quantity), 0n), 0n);
}
export function available(
  s: State,
  itemId: string,
  locationId: string,
): bigint {
  const free=balance(s, itemId, locationId) - reserved(s, itemId, locationId) - held(s, itemId, locationId);
  const tracked=policyFor(s,itemId)?traceAvailable(s,itemId,locationId)-held(s,itemId,locationId):free;
  return min(free,tracked>0n?tracked:0n);
}
export function move(
  c: Context,
  x: Omit<
    Movement,
    | "id"
    | "actorId"
    | "commandId"
    | "createdAt"
    | "sequence"
    | "reversalId"
    | "importId"
  > &
    Partial<Pick<Movement, "reversalId" | "importId">>,
) {
  get(c.s, "locations", x.locationId);
  get(c.s, "items", x.itemId);
  const q = BigInt(x.quantity);
  const next = balance(c.s, x.itemId, x.locationId, x.status) + q;
  if (
    next < 0n ||
    next > MAX ||
    (x.status === "sellable" && next < reserved(c.s, x.itemId, x.locationId) + held(c.s, x.itemId, x.locationId))
  )
    fail(
      "DEPENDENCY",
      "Movement would make stock negative or invalidate reservations. Reverse downstream work first.",
      {
        itemId: x.itemId,
        locationId: x.locationId,
        reservations: c.s.reservations.filter(
          (r) => r.itemId === x.itemId && r.locationId === x.locationId,
        ),
      },
    );
  const m = {
    ...x,
    id: id(),
    actorId: c.actor.id,
    commandId: c.commandId,
    createdAt: c.now,
    sequence: movementFrontier(c.s) + 1,
    reversalId: x.reversalId ?? null,
    importId: x.importId ?? null,
  };
  c.s.movements.push(m);
  return m;
}
export function positions(s: State) {
  const keys = new Set(
    s.movements.map((m) => JSON.stringify([m.itemId, m.locationId, m.status])),
  );
  return [...keys].map((k) => {
    const [itemId, locationId, status] = JSON.parse(k),
      q = balance(s, itemId, locationId, status),
      r = status === "sellable" ? reserved(s, itemId, locationId) : 0n;
    return {
      itemId,
      locationId,
      status,
      quantity: format(q),
      reserved: format(r),
      held: format(status === "sellable" ? held(s, itemId, locationId) : 0n),
      available: format(status === "sellable" ? available(s, itemId, locationId) : 0n),
      expiredOrBlocked: format(status === "sellable" ? unavailableTraceQuantity(s,itemId,locationId) : 0n),
      traceUnavailable: format(status === "sellable" ? q-r-held(s,itemId,locationId)-available(s,itemId,locationId) : 0n),
    };
  });
}
// A document's human reference, set once when it is created: SO-0001, PO-0001.
export function nextReference(rows: Row[], prefix: string) {
  const used = rows.map((r) =>
    Number(new RegExp(`^${prefix}-(\\d+)$`).exec(r.reference ?? "")?.[1] ?? 0),
  );
  return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(4, "0")}`;
}
export function row(
  c: Context,
  collection: Collection,
  data: Record<string, any>,
): Row {
  const r = { ...data, id: data.id ?? id(), version: 1, createdAt: c.now };
  c.s[collection].push(r);
  return r;
}
