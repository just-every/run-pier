import {
  decimal,
  format,
  get,
  id,
  fail,
  move,
  collections,
  type Context,
  type Row,
} from "./model";
import { catalogue } from "./catalogue";
import { orders, reserve } from "./orders";
import { purchasing } from "./purchasing";
import { applyReservationImport } from "./native-reservations";
import { inUsd, usdRate } from "./import-currency";
const kinds = [
  "items",
  "locations",
  "parties",
  "positions",
  "orders",
  "purchaseOrders",
  "reservations",
];
export function materialHash(c: Context) {
  return JSON.stringify({
    items: c.s.items,
    locations: c.s.locations,
    parties: c.s.parties,
    supplierItems: c.s.supplierItems,
    // Payment/credit readback is derived bookkeeping, not a cutover input.
    // Keep document versions, lines and reservations in the exact stock guard.
    orders: c.s.orders.map(({ books, ...order }) => order),
    purchaseOrders: c.s.purchaseOrders,
    movements: c.s.movements,
    reservations: c.s.reservations,
  });
}
/** A purchase line's USD price; a non-USD source keeps its amount, currency and rate. */
function linePrice(b: Row, p: any) {
  const rate = usdRate(b, p.currency);
  if (rate === null) return fail("CONVERSION_RATE", `Enter the reviewed USD rate for ${p.currency} before committing.`);
  const price = inUsd(format(decimal(p.price)), rate);
  return p.currency && p.currency !== "USD" ? { price, source: { price: format(decimal(p.price)), currency: p.currency, usdRate: format(rate) } } : { price };
}
export function applyImport(c: Context, b: Row) {
  const before = structuredClone(c.s),
    created: {
      kind: string;
      id: string;
    }[] = [],
    links: Record<string, string> = {},
    postedRows: any[] = [],
    groups = new Map<string, any>();
  const history = c.s.imports
    .filter((x) => x.status === "committed" && x.namespace === b.namespace)
    .sort((a, z) => a.committedVersion - z.committedVersion)
    .flatMap((x) => x.postedRows ?? []);
  const lookup = (kind: string, key: string) =>
    links[kind + ":" + key] ??
    [...history].reverse().find((x) => x.kind === kind && x.key === key)?.id ??
    fail("ORPHAN", "Unresolved source reference.", { kind, key });
  for (const r of [...b.source.records].sort(
    (a: any, z: any) => kinds.indexOf(a.kind) - kinds.indexOf(z.kind),
  )) {
    if (r.kind === "reservations") continue;
    const p = r.payload,
      prev = [...history]
        .reverse()
        .find((x) => x.kind === r.kind && x.key === r.sourceId);
    const unchanged = prev?.hash === r.payloadHash;
    if (unchanged && !["orders", "purchaseOrders"].includes(r.kind)) {
      links[r.kind + ":" + r.sourceId] = prev.id;
      continue;
    }
    if (
      prev &&
      !unchanged &&
      !b.reviewedRevisions?.some(
        (x: any) => x.kind === r.kind && x.key === r.sourceId,
      )
    )
      fail(
        "REVISION_REVIEW",
        "Changed source rows need an explicit reviewed replacement.",
        { kind: r.kind, key: r.sourceId, previous: prev, proposed: p },
      );
    let result: any;
    if (["items", "locations", "parties"].includes(r.kind)) {
      const old = prev ? get(c.s, r.kind, prev.id) : null;
      result = catalogue(
        c,
        (
          {
            items: "item.save",
            locations: "location.save",
            parties: "party.save",
          } as any
        )[r.kind],
        { ...p, ...(old ? { id: old.id, version: old.version } : {}) },
      );
    } else {
      const itemId = lookup("items", p.itemKey);
      if (get(c.s, "items", itemId).unit !== p.unit)
        fail("UNIT", "Explicit base unit does not match item.", r.location);
      if (r.kind === "positions") {
        const locationId = lookup("locations", p.locationKey);
        if (
          !["sellable", "quarantine"].includes(p.status) ||
          get(c.s, "locations", locationId).kind !== "bin"
        )
          fail(
            "POSITION",
            "Opening positions require a bin and sellable/quarantine status.",
          );
        if (prev) {
          const prior =
            c.s.movements.find((m) => m.id === prev.id) ??
            fail(
              "REVISION_REVIEW",
              "The original opening movement no longer exists; review its import history.",
            );
          if (
            prior.itemId !== itemId ||
            prior.locationId !== locationId ||
            prior.status !== p.status
          )
            fail(
              "REVISION_REVIEW",
              "Position identity cannot change in place. Undo the source row then use a new stable row key.",
            );
          const priorSequence = prior.sequence;
          const dependencies = c.s.movements.filter(
            (m) =>
              m.itemId === itemId &&
              m.sequence > priorSequence &&
              m.importId !== b.id,
          );
          if (dependencies.length)
            fail(
              "IMPORT_DEPENDENCY",
              "A changed opening quantity has downstream movements; use a reviewed count correction.",
              dependencies,
            );
        }
        const q = decimal(p.quantity) - decimal(prev?.payload.quantity ?? "0");
        result = move(c, {
          itemId,
          locationId,
          status: p.status,
          quantity: q.toString(),
          reason: prev
            ? "Reviewed opening revision"
            : "Reviewed opening inventory",
          documentId: b.id,
          importId: b.id,
          reversalId: prev?.id ?? null,
        });
        b.costEvidence ??= [];
        b.costEvidence.push({
          sourceKey: r.sourceId,
          itemId,
          locationId,
          quantity: p.quantity,
          cost: format(decimal(p.cost)),
          ...(p.currency ? { currency: p.currency } : {}),
        });
      } else {
        const documentKey = r.kind === "orders" ? p.orderKey : p.poKey;
        if (!documentKey)
          fail("DOCUMENT_KEY", "Open lines require a stable document key.");
        const groupKey = r.kind + ":" + documentKey,
          partyId = lookup(
            "parties",
            r.kind === "orders" ? p.customerKey : p.supplierKey,
          );
        if (prev && prev.documentKey !== documentKey)
          fail(
            "DOCUMENT_CONFLICT",
            "A source line cannot change its document key in place.",
          );
        let group = groups.get(groupKey);
        if (!group) {
          group = {
            kind: r.kind,
            key: documentKey,
            partyId,
            promiseDate: p.promiseDate,
            rows: [],
          };
          groups.set(groupKey, group);
        }
        if (group.partyId !== partyId || group.promiseDate !== p.promiseDate)
          fail(
            "DOCUMENT_CONFLICT",
            "Grouped document lines must agree on counterparty and promise date.",
          );
        group.rows.push({ r, p, prev, itemId, unchanged });
        continue;
      }
    }
    links[r.kind + ":" + r.sourceId] = result.id;
    postedRows.push({
      kind: r.kind,
      key: r.sourceId,
      hash: r.payloadHash,
      id: result.id,
      payload: p,
    });
    if (!prev && r.kind !== "positions")
      created.push({ kind: r.kind, id: result.id });
  }
  for (const group of groups.values()) {
    if (group.rows.every((x: any) => x.unchanged)) {
      for (const x of group.rows)
        links[x.r.kind + ":" + x.r.sourceId] = x.prev.id;
      continue;
    }
    const prior = [...history]
      .reverse()
      .find((x) => x.kind === group.kind && x.documentKey === group.key);
    let result: any;
    const party = get(c.s, "parties", group.partyId);
    if (party.kind !== (group.kind === "orders" ? "customer" : "supplier"))
      fail("COUNTERPARTY", "Document counterparty has the wrong kind.");
    if (prior) {
      result = get(c.s, group.kind, prior.id);
      if (group.rows.some((x: any) => x.prev && x.prev.id !== result.id))
        fail(
          "DOCUMENT_CONFLICT",
          "Changed rows cannot merge different existing documents.",
        );
      if (
        group.kind === "orders" &&
        result.lines.some(
          (l: any) => decimal(l.dispatched) > 0n || decimal(l.cancelled) > 0n,
        )
      )
        fail(
          "IMPORT_DEPENDENCY",
          "Dispatched/cancelled source orders cannot be replaced.",
        );
      if (
        group.kind === "purchaseOrders" &&
        result.lines.some((l: any) => decimal(l.received) > 0n)
      )
        fail(
          "IMPORT_DEPENDENCY",
          "Received source purchase orders cannot be replaced.",
        );
      c.s.reservations = c.s.reservations.filter(
        (r) => r.orderId !== result.id,
      );
      for (const x of group.rows) {
        const old = x.prev
          ? result.lines.find((l: any) => l.id === x.prev.lineId)
          : null;
        const line = {
          id: old?.id ?? id(),
          itemId: x.itemId,
          quantity: format(decimal(x.p.quantity, true)),
          ...(group.kind === "orders"
            ? { dispatched: "0", cancelled: "0" }
            : {
                ...linePrice(b, x.p),
                received: "0",
                terms: null,
              }),
        };
        if (old) Object.assign(old, line);
        else result.lines.push(line);
        x.lineId = line.id;
      }
      result.promiseDate = group.promiseDate;
      result.version++;
      if (group.kind === "orders") {
        result.customerId = group.partyId;
        reserve(c, result);
      } else {
        result.supplierId = group.partyId;
        result.supplierSnapshot = structuredClone(party);
        for (const line of result.lines) {
          const terms = c.s.supplierItems.find(
            (t) => t.itemId === line.itemId && t.supplierId === group.partyId,
          );
          if (terms && decimal(line.quantity) < decimal(terms.minimum))
            fail("MINIMUM", "Quantity is below supplier minimum.");
          line.terms = terms ? structuredClone(terms) : null;
        }
        result.status = "committed";
        result.approval = {
          actorId: c.actor.id,
          version: result.version,
          at: c.now,
          importId: b.id,
        };
      }
    } else {
      const lines = group.rows.map((x: any) => ({
        itemId: x.itemId,
        quantity: x.p.quantity,
        ...(group.kind === "orders" ? { price: x.p.price } : linePrice(b, x.p)),
      }));
      if (group.kind === "orders")
        result = orders(c, "order.create", {
          customerId: group.partyId,
          promiseDate: group.promiseDate,
          lines,
        });
      else {
        result = purchasing(c, "po.draft", {
          supplierId: group.partyId,
          promiseDate: group.promiseDate,
          reason: "Reviewed open commitment at migration cutoff",
          lines,
        });
        result.status = "committed";
        result.approval = {
          actorId: c.actor.id,
          version: result.version,
          at: c.now,
          importId: b.id,
        };
      }
      created.push({ kind: group.kind, id: result.id });
      group.rows.forEach((x: any, n: number) => {
        x.lineId = result.lines[n].id;
        if ((lines[n] as any).source) result.lines[n].source = (lines[n] as any).source;
      });
    }
    for (const x of group.rows) {
      links[x.r.kind + ":" + x.r.sourceId] = result.id;
      postedRows.push({
        kind: x.r.kind,
        key: x.r.sourceId,
        hash: x.r.payloadHash,
        id: result.id,
        lineId: x.lineId,
        documentKey: group.key,
        payload: x.p,
      });
    }
  }
  applyReservationImport(c, b, history, postedRows, links);
  b.links = Object.entries(links).map(([key, id]) => ({
    kind: key.split(":")[0],
    key: key.slice(key.indexOf(":") + 1),
    id,
    namespace: b.namespace,
  }));
  b.postedRows = postedRows;
  b.created = created;
  b.beforeRecords = collections
    .flatMap((kind) =>
      before[kind]
        .filter(
          (old) =>
            JSON.stringify(old) !==
            JSON.stringify(c.s[kind].find((x) => x.id === old.id)),
        )
        .map((data) => ({ kind, data })),
    )
    .filter((x) => x.kind !== "imports");
  b.beforeReservations = before.reservations.filter(
    (old) => !c.s.reservations.some((x) => x.id === old.id),
  );
  b.itemIds = [
    ...new Set(
      [
        ...c.s.movements.slice(before.movements.length),
        ...b.beforeReservations,
        ...c.s.reservations.filter(
          (r) => !before.reservations.some((old) => old.id === r.id),
        ),
      ].map((r) => r.itemId),
    ),
  ];
  b.reservationFrontier = structuredClone(
    c.s.reservations.filter((r) => b.itemIds.includes(r.itemId)),
  );
  return b;
}
