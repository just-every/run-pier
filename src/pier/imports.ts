import { parseCSV } from "./import-csv";
import { incumbentSource } from "./import-incumbent";
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
  positions,
  movementFrontier,
  Problem,
  type Actor,
  type State,
  type Context,
  type Row,
} from "./model";
import { catalogue } from "./catalogue";
import { orders } from "./orders";
import { purchasing } from "./purchasing";
import { applyImport, materialHash } from "./native-mapping";
import {
  importRecordDependencies,
  importReservationDependencies,
} from "./native-dependencies";
import { checkImportCapacity, checkImportRecord } from "./native-capacity";
import { sha256, canonicalJson, type SourceBundle } from "./import-kit";
import { conversionRates, currencyCode } from "./import-currency";
export const headers: Record<string, string[]> = {
  customFieldDefinitions: ["key", "ownerType", "fieldKey", "label", "type", "options"],
  items: ["key", "sku", "name", "barcode", "unit", "packSize"],
  locations: ["key", "name", "warehouse", "kind"],
  parties: ["key", "name", "kind"],
  positions: [
    "key",
    "itemKey",
    "locationKey",
    "status",
    "quantity",
    "unit",
    "cost",
  ],
  orders: [
    "key",
    "orderKey",
    "customerKey",
    "itemKey",
    "quantity",
    "unit",
    "promiseDate",
  ],
  purchaseOrders: [
    "key",
    "poKey",
    "supplierKey",
    "itemKey",
    "quantity",
    "unit",
    "price",
    "promiseDate",
  ],
  reservations: ["key", "orderLineKey", "locationKey", "quantity", "unit"],
};
export { parseCSV } from "./import-csv";
// Kinds whose rows carry an amount may add a trailing currency column.
const priced = ["positions", "purchaseOrders"];
export function sourceFor(p: any): SourceBundle {
  const batchCurrency = p.provider ? "USD" : currencyCode(p.currency ?? "USD", "The batch");
  if (!Array.isArray(p.files) || !p.files.length || p.files.length > 20)
    fail("FILES", "Supply 1–20 UTF-8 native CSV files.");
  const source: SourceBundle = { records: [], artifacts: [], diagnostics: [] };
  const seen = new Set();
  const positions = new Set();
  for (const file of p.files) {
    const base = headers[file.kind];
    if (!base) fail("CSV_KIND", "Unsupported native CSV kind.");
    if (
      typeof file.csv !== "string" ||
      new TextEncoder().encode(file.csv).length > 1024 * 1024
    )
      fail("CSV_SIZE", "Each native file must be at most 1 MiB.");
    const bytes = new TextEncoder().encode(file.csv),
      hash = sha256(bytes),
      name = text(file.name),
      rows = parseCSV(file.csv);
    const header = rows.shift()?.join(","),
      expected = [base, ...(priced.includes(file.kind) ? [[...base,"currency"]] : []), ...(["items","parties","orders"].includes(file.kind) ? [[...base,"metadata"]] : [])].find(columns=>header===columns.join(",")) ?? base;
    if (header !== expected.join(","))
      fail("CSV_HEADERS", "Use the exact native CSV headers.", {
        kind: file.kind,
        headers: base,
        ...(priced.includes(file.kind) ? { optional: ["currency"] } : {}),
      });
    source.artifacts.push({
      name,
      sha256: hash,
      size: bytes.length,
      original: {
        status: "available",
        base64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")),
      },
    });
    if (rows.length > 1000)
      fail("CSV_ROWS", "At most 1000 rows per native file.");
    for (const [n, cells] of rows.entries()) {
      if (cells.length !== expected.length)
        fail("CSV_COLUMNS", "Row has a different number of cells.", {
          file: name,
          row: n + 2,
        });
      const payload = Object.fromEntries(expected.map((k, i) => [k, cells[i]]));
      // A row with no currency is read as the batch currency, USD unless the batch names another.
      if (priced.includes(file.kind))
        payload.currency = payload.currency?.trim() ? currencyCode(payload.currency, `Row ${n + 2} of ${name}`) : batchCurrency;
      const key = file.kind + ":" + text(payload.key, "Stable source key");
      if (seen.has(key))
        source.diagnostics.push({
          severity: "error",
          code: "DUPLICATE",
          message: "Ambiguous duplicate source key.",
          kind: file.kind,
          sourceId: payload.key,
          location: { artifact: name, row: n + 2 },
        });
      seen.add(key);
      if (file.kind === "positions") {
        const position = JSON.stringify([
          payload.itemKey,
          payload.locationKey,
          payload.status,
        ]);
        if (positions.has(position))
          source.diagnostics.push({
            severity: "error",
            code: "DUPLICATE",
            message:
              "Multiple opening rows name the same item, location and status. Reconcile one opening quantity.",
            kind: file.kind,
            sourceId: payload.key,
            location: { artifact: name, row: n + 2 },
          });
        positions.add(position);
      }
      source.records.push({
        namespace: text(p.namespace),
        kind: file.kind,
        sourceId: payload.key,
        payload,
        payloadHash: sha256(canonicalJson(payload)),
        artifactHash: hash,
        location: { artifact: name, row: n + 2 },
      });
    }
  }
  return source;
}
function preview(c: Context, b: Row) {
  b.errors = [...b.source.diagnostics];
  for (const r of b.source.records)
    if (r.payload.currency && r.payload.currency !== "USD" && !b.conversionRates?.[r.payload.currency])
      b.errors.push({ severity: "error", code: "CONVERSION_RATE", message: `Row ${r.location.row} of ${r.location.artifact} is in ${r.payload.currency}. Enter the USD rate for ${r.payload.currency} you have reviewed, then stage the files again.`, sourceId: r.sourceId, location: r.location });
  const scratch = structuredClone(c.s),
    candidate = scratch.imports.find((x) => x.id === b.id)!;
  try {
    applyImport({ ...c, s: scratch }, candidate);
    // Names for the ids this review shows: items, bins and parties staged here
    // exist only in the preview, so the review carries what people read.
    const named = new Map<string, string>([
      ...scratch.items.map((i) => [i.id, `${i.name} · ${i.sku}`] as const),
      ...scratch.locations.map((l) => [l.id, String(l.name)] as const),
      ...scratch.parties.map((party) => [party.id, String(party.name)] as const),
    ]);
    const shownPositions = positions(scratch),
      costEvidence = candidate.costEvidence ?? [];
    const shownIds = new Set<string>([
      ...shownPositions.flatMap((x) => [x.itemId, x.locationId]),
      ...scratch.purchaseOrders.flatMap((po) => [
        po.supplierId,
        ...po.lines.map((l: any) => l.itemId),
      ]),
      ...costEvidence.flatMap((x: any) => [x.itemId, x.locationId]),
    ]);
    b.reconciliation = {
      names: Object.fromEntries(
        [...shownIds].filter((x) => named.has(x)).map((x) => [x, named.get(x)]),
      ),
      units: Object.fromEntries(
        scratch.items.filter((i) => shownIds.has(i.id)).map((i) => [i.id, i.unit]),
      ),
      entityCounts: Object.fromEntries(
        Object.keys(headers).map((k) => [
          k,
          b.source.records.filter((r: any) => r.kind === k).length,
        ]),
      ),
      distinctSkus: new Set(scratch.items.map((i) => i.sku)).size,
      positions: shownPositions,
      remainingOrders: scratch.orders,
      expectedReceipts: scratch.purchaseOrders,
      costEvidence,
      created: candidate.created,
      unchangedRows: b.source.records.length - candidate.postedRows.length,
    };
    b.materialHash = sha256(materialHash(c));
    checkImportCapacity(c, scratch, b);
  } catch (e) {
    const detail = (e as any).details;
    const field = ({ items: "itemKey", locations: "locationKey", parties: "supplierKey" } as Record<string, string>)[detail?.kind];
    const offending = detail?.key ? b.source.records.find((r: any) =>
      (r.kind === detail.kind && r.sourceId === detail.key) ||
      (field && r.payload[field] === detail.key) ||
      (detail.kind === "parties" && r.payload.customerKey === detail.key),
    ) : undefined;
    b.errors.push({
      severity: "error",
      code: (e as any).code ?? "IMPORT",
      message: (e as Error).message,
      details: detail,
      ...(offending ? { sourceId: offending.sourceId, location: offending.location } : detail?.artifact && Number.isInteger(detail.row) ? { location: detail } : {}),
    });
  }
  b.materialHash = sha256(materialHash(c));
  checkImportRecord(c, b);
  return b;
}
export function imports(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith("import.")) return;
  requireRole(c, []);
  if (type === "import.stage") {
    if (p.provider && p.currency !== "USD")
      fail("CURRENCY", "Incumbent move-in uses explicit USD costs.");
    const currency = p.provider ? "USD" : currencyCode(p.currency ?? "USD", "The batch");
    const rates = p.provider ? {} : conversionRates(p.conversionRates, c.actor.id, c.now);
    text(p.sourceVersion);
    text(p.exportedAt);
    text(p.cutoffTimezone);
    text(p.mappingRevision);
    try {
      new Intl.DateTimeFormat("en", { timeZone: p.cutoffTimezone });
    } catch {
      fail("TIMEZONE", "Provide a valid IANA cutoff timezone.");
    }
    const prepared = p.provider ? incumbentSource(p) : undefined;
    const source = prepared?.source ?? sourceFor(p);
    const b = row(c, "imports", {
      namespace: text(p.namespace),
      sourceVersion: p.sourceVersion,
      exportedAt: p.exportedAt,
      filters: p.filters ?? "",
      cutoffTimezone: p.cutoffTimezone,
      currency,
      conversionRates: rates,
      mappingRevision: p.mappingRevision,
      capturedVersion: c.s.version + 1,
      ...(prepared ? { moveIn: prepared.review, provider: p.provider } : {}),
      source,
      reservationPlan: p.files.some(
        (file: any) => file.kind === "reservations",
      ),
      status: "captured",
      errors: [],
      review: [],
      reviewedRevisions: [],
      links: [],
      postedRows: [],
    });
    return preview(c, b);
  }
  const b = get(c.s, "imports", p.batchId);
  fresh(b, p.version);
  if (type === "import.revise") {
    if (
      !["captured", "mapped", "reconciled", "shadow", "frozen"].includes(
        b.status,
      )
    )
      fail("IMPORT_STATE", "Revise only a staged batch.");
    if (!Array.isArray(p.decisions) || !p.decisions.length)
      fail(
        "REVISION_REVIEW",
        "Select changed rows and approve replacement explicitly.",
      );
    for (const x of p.decisions) {
      if (
        x.action !== "replace" ||
        !b.source.records.some(
          (r: any) => r.kind === x.kind && r.sourceId === x.key,
        )
      )
        fail(
          "REVISION_REVIEW",
          "Each decision must reference a supplied row and replace action.",
        );
      b.reviewedRevisions.push({
        kind: x.kind,
        key: x.key,
        actorId: c.actor.id,
        reason: text(p.reason),
        at: c.now,
      });
    }
    b.status = "captured";
    b.review = [];
    b.version++;
    return preview(c, b);
  }
  if (type === "import.review") {
    const stages = ["captured", "mapped", "reconciled", "shadow", "frozen"];
    if (stages.indexOf(p.stage) !== stages.indexOf(b.status) + 1)
      fail(
        "IMPORT_STAGE",
        "Review capture → map → reconcile → shadow → freeze in order.",
      );
    if (b.errors.length)
      fail("IMPORT_ERRORS", "Resolve source errors before review.", b.errors);
    if (b.materialHash !== sha256(materialHash(c)))
      fail(
        "STALE_IMPORT",
        "Stock or documents changed after preview. Stage a fresh reconciliation.",
      );
    b.review.push({
      stage: p.stage,
      actorId: c.actor.id,
      reason: text(p.reason),
      at: c.now,
    });
    b.status = p.stage;
    b.version++;
    const scratch = structuredClone(c.s);
    applyImport(
      { ...c, s: scratch },
      scratch.imports.find((r) => r.id === b.id)!,
    );
    checkImportCapacity(c, scratch, b);
    return b;
  }
  if (type === "import.commit") {
    if (b.status !== "frozen" || b.errors.length)
      fail("IMPORT_REVIEW", "Freeze a fully reconciled batch first.");
    if (b.materialHash !== sha256(materialHash(c)))
      fail(
        "STALE_IMPORT",
        "Material input changed after reconciliation. Stage a fresh preview.",
      );
    applyImport(c, b);
    b.status = "committed";
    b.committedVersion = c.s.version + 1;
    b.frontier = movementFrontier(c.s);
    b.approval = { actorId: c.actor.id, version: b.version, at: c.now };
    b.version++;
    checkImportRecord(c, b);
    return b;
  }
  if (type === "import.undo") {
    if (b.status !== "committed")
      fail("IMPORT_STATE", "Only committed batches can be undone.");
    const itemIds = b.itemIds ?? [];
    const dependencies = c.s.movements.filter(
      (m) => m.sequence > b.frontier && itemIds.includes(m.itemId),
    );
    const reservations = importReservationDependencies(c.s, b);
    const records = importRecordDependencies(c.s, b);
    if (dependencies.length || reservations.length || records.length)
      fail(
        "IMPORT_DEPENDENCY",
        "Downstream movements or linked records prevent snapshot rollback. Preserve their history and use an approved count correction; the dependency list identifies affected records.",
        { movements: dependencies, reservations, records },
      );
    b.undoReason = text(p.reason);
    return b;
  }
  fail("COMMAND", "Unknown import command.");
}

/** Retained native bytes stay behind the current authenticated owner door. */
export function importOriginal(path: string, actor: Actor, state: State): Response | null {
  const match = /^\/api\/pier\/imports\/([^/]+)\/originals\/([a-f0-9]{64})$/.exec(path);
  if (!match) return null;
  if (actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Only the current owner can download retained native originals.', null, 403);
  const batch = get(state, 'imports', decodeURIComponent(match[1]));
  const artifact = batch.source?.artifacts?.find((entry: any) => entry.sha256 === match[2]);
  if (!artifact || artifact.original?.status !== 'available') fail('NOT_FOUND', 'Retained original not found.');
  return new Response(Uint8Array.from(atob(artifact.original.base64), char => char.charCodeAt(0)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pier-original.csv"; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
