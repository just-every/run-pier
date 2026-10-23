import { auditEvent } from './audit';
import {
  planD1Import,
  createD1ImportJob,
  applyD1ImportBatches,
  undoD1Import,
  canonicalJson,
  sha256,
  type D1TargetAdapter,
  type D1ImportContext,
  type SourceBundle,
  type TargetRow,
  type D1Sql,
} from "../modules/import-kit/src/d1/index";
import { authority, load } from "./storage";
import {
  importRecordDependencies,
  importReservationDependencies,
} from "./native-dependencies";
import {
  collections,
  fail,
  movementFrontier,
  type Context,
  type State,
  type Row,
} from "./model";
import type { Bindings } from "../auth.server";
import {
  graphMatches,
  importGraph,
  writeGraph,
  restoreGraphRecords,
  type Graph,
} from "./native-graph-sql";
const sql = (sql: string, ...params: any[]): D1Sql => ({ sql, params });
function commandSQL(
  c: Context,
  before: State,
  digest: string,
  result: Row,
): D1Sql[] {
  const a = authority(c.actor);
  // Undo restores retained before-images in SQL rather than in c.s. Build the
  // audit projection from those same retained graph entries, without mutating
  // the command state or exposing source originals.
  let auditContext = c;
  if (result.status === 'undone') {
    const s = structuredClone(c.s);
    for (const entry of result.created ?? []) {
      const kind = entry.kind as (typeof collections)[number];
      s[kind] = s[kind].filter(record => record.id !== entry.id);
    }
    for (const entry of result.beforeRecords ?? []) {
      const kind = entry.kind as (typeof collections)[number];
      s[kind] = [...s[kind].filter(record => record.id !== entry.data.id), entry.data];
    }
    s.imports = s.imports.map(batch => batch.id === result.id ? result : batch);
    auditContext = { ...c, s };
  }
  const event = auditEvent(auditContext, before, result.status === 'undone' ? 'import.undo' : 'import.commit', { batchId: result.id }, result);
  return [
    sql('INSERT INTO pier_audit(id,at,actor_id,command_id,event_type,outcome,data) VALUES(?,?,?,?,?,?,?)', event.id, event.at, event.actorId, event.commandId, event.type, event.outcome, JSON.stringify(event)),
    sql(
      `INSERT INTO pier_guard VALUES(?,CASE WHEN (${a.sql}) AND (SELECT version FROM pier_meta WHERE id=1)=? THEN 1 ELSE 0 END)`,
      crypto.randomUUID(),
      ...a.params,
      before.version,
    ),
    sql("UPDATE pier_meta SET version=version+1 WHERE id=1"),
    sql(
      "INSERT INTO pier_commands VALUES(?,?,?,?,?)",
      c.commandId,
      c.actor.id,
      digest,
      JSON.stringify({ ok: true, result, version: before.version + 1 }),
      c.now,
    ),
  ];
}
export async function publishImport(
  env: Bindings,
  c: Context,
  before: State,
  digest: string,
  batch: Row,
  undo = false,
) {
  const db = env.DB;
  const g = importGraph(before, c.s);
  g.publication = {
    commandId: c.commandId,
    actorId: c.actor.id,
    digest,
    at: c.now,
    beforeVersion: before.version,
  };
  // Membership holds only graph keys/revisions and the exact before-images required
  // for undo. The target read always reconstructs actual business rows and movements.
  const targets: D1TargetAdapter = {
    async read(database, d, k, key) {
      const membership = await database
        .prepare(
          "SELECT revision,descriptor FROM pier_import_graphs WHERE id=?",
        )
        .bind(key)
        .first<any>();
      if (!membership) return;
      const descriptor = JSON.parse(membership.descriptor),
        state = await load(database as D1Database),
        value: Graph = {
          publication: descriptor.publication,
          records: [],
          movements: [],
          reservations: [],
          removedReservationIds: descriptor.removedReservationIds ?? [],
          dependencies: [],
        };
      for (const entry of descriptor.records) {
        const data = state[entry.kind as (typeof collections)[number]].find(
          (r) => r.id === entry.id,
        );
        if (data) value.records.push({ kind: entry.kind, data });
      }
      value.movements = descriptor.movements.flatMap((id: string) =>
        state.movements.filter((m) => m.id === id),
      );
      value.reservations = descriptor.reservations.flatMap((id: string) =>
        state.reservations.filter((r) => r.id === id),
      );
      const imported = state.imports.find((batch) => batch.id === key);
      const itemIds = new Set(imported?.itemIds ?? []);
      value.dependencies = state.movements.filter(
        (m) => m.sequence > descriptor.frontier && itemIds.has(m.itemId),
      );
      if (imported)
        value.dependencies.push(
          ...importReservationDependencies(state, imported),
          ...importRecordDependencies(state, imported),
        );
      return {
        destination: d,
        targetKind: k,
        targetId: key,
        revision: membership.revision,
        value: value as any,
      };
    },
    matches(r, d, k, key) {
      const parts = targets.matchesParts!(r, d, k, key);
      return {
        sql: parts.map((part) => `(${part.sql})`).join(" AND "),
        params: parts.flatMap((part) => part.params ?? []),
      };
    },
    matchesParts(r, d, k, key) {
      if (!r)
        return [
          sql("NOT EXISTS(SELECT 1 FROM pier_import_graphs WHERE id=?)", key),
        ];
      const value = r.value as unknown as Graph;
      return [
        sql(
          "EXISTS(SELECT 1 FROM pier_import_graphs WHERE id=? AND revision=?)",
          key,
          r.revision,
        ),
        ...graphMatches(value),
        sql(
          "(SELECT version FROM pier_meta WHERE id=1)=?+CASE WHEN EXISTS(SELECT 1 FROM pier_commands WHERE id=?) THEN 1 ELSE 0 END",
          before.version,
          c.commandId,
        ),
      ];
    },
    write(target) {
      const value = target.value as unknown as Graph;
      const publication =
        value.publication ??
        fail("IMPORT_JOB", "Import publication is incomplete.");
      if (
        publication.commandId !== c.commandId ||
        publication.actorId !== c.actor.id ||
        publication.digest !== digest
      )
        fail(
          "IDEMPOTENCY",
          "Resume this import with its original command identity, payload and actor.",
        );
      if (publication.beforeVersion !== before.version)
        fail(
          "STALE_IMPORT",
          "The installation changed after import publication began. Reconcile a fresh batch.",
        );
      const publishedBatch =
        value.records.find(
          (record) => record.kind === "imports" && record.data.id === batch.id,
        )?.data ?? fail("IMPORT_JOB", "Import publication is incomplete.");
      const out = writeGraph(value);
      const descriptor = {
        publication,
        records: value.records.map((x) => ({ kind: x.kind, id: x.data.id })),
        movements: value.movements.map((m) => m.id),
        reservations: value.reservations.map((r) => r.id),
        frontier: movementFrontier(c.s),
        removedReservationIds: value.removedReservationIds,
      };
      out.push(
        sql(
          "INSERT INTO pier_import_graphs VALUES(?,?,?)",
          target.targetId,
          target.revision,
          JSON.stringify(descriptor),
        ),
      );
      out.push(
        ...commandSQL(
          { ...c, now: publication.at },
          before,
          digest,
          publishedBatch,
        ),
        sql("DELETE FROM pier_guard"),
      );
      return out;
    },
    remove(d, k, key) {
      const out = commandSQL(c, before, digest, {
        ...batch,
        status: "undone",
        version: batch.version + 1,
      });
      out.push(sql("INSERT INTO pier_guard VALUES(?,1)", "import-undo:" + key));
      const current = before.imports.find((b) => b.id === key)!;
      out.push(
        sql(
          "DELETE FROM pier_reservations WHERE id IN (SELECT value FROM json_each((SELECT descriptor FROM pier_import_graphs WHERE id=?),'$.reservations'))",
          key,
        ),
      );
      out.push(sql("DELETE FROM pier_movements WHERE import_id=?", key));
      out.push(...restoreGraphRecords(current));
      const undone = {
        ...current,
        status: "undone",
        version: current.version + 1,
        undo: { actorId: c.actor.id, at: c.now, reason: batch.undoReason },
      };
      out.push(
        sql(
          "UPDATE pier_records SET version=?,data=? WHERE kind='imports' AND id=?",
          undone.version,
          JSON.stringify(undone),
          key,
        ),
        sql("DELETE FROM pier_import_graphs WHERE id=?", key),
        sql("DELETE FROM pier_guard"),
      );
      return out;
    },
    async list(database, d) {
      const ids = (
        await database.prepare("SELECT id FROM pier_import_graphs").all<any>()
      ).results;
      const result: TargetRow[] = [];
      for (const r of ids) {
        const value = await targets.read(database, d, "batch", r.id);
        if (value) result.push(value);
      }
      return result;
    },
    matchesCount(n) {
      return sql("(SELECT COUNT(*) FROM pier_import_graphs)=?", n);
    },
  };
  const context: D1ImportContext = {
    destination: "inventory-pier",
    namespace: batch.namespace,
    mappingVersion: batch.mappingRevision,
    operationKey: "pier:" + batch.id,
    batchSize: 1000,
    storage: { database: db, targets },
    authorization: {
      principalId: "role:owner",
      predicate: () => authority(c.actor),
    },
  };
  if (undo) {
    const job = await db
      .prepare("SELECT id FROM ik_jobs WHERE operation_key=?")
      .bind("pier:" + batch.id)
      .first<any>();
    if (!job) fail("IMPORT_JOB", "Import journal is missing.");
    const undone = await undoD1Import(job.id, context);
    if (undone.state !== "undone")
      fail(
        "IMPORT_PUBLICATION",
        "Import undo has not completed; resume the same command.",
      );
    return undone;
  }
  // A prepared job owns its exact native graph, identities and command result.
  // Replanning after a lost response would generate different row IDs and a
  // conflicting fingerprint for the same reviewed cutover.
  const pending = await db
    .prepare("SELECT id FROM ik_jobs WHERE operation_key=?")
    .bind(context.operationKey)
    .first<{ id: string }>();
  if (pending) {
    const completed = await applyD1ImportBatches(pending.id, context);
    if (completed.state !== "completed")
      fail("IMPORT_PUBLICATION", "Resume the original import command.");
    return completed;
  }
  const source: SourceBundle = structuredClone(batch.source),
    artifact = source.artifacts[0];
  // One cohesive source entry publishes every native row, the durable command
  // outcome and the completed kit journal together. All original artifacts and
  // per-row source identities/hash/location/native links remain retained.
  const payload = {
    batchId: batch.id,
    rowLinks: batch.links,
    rows: source.records.map((record) => {
      const location: Record<string, string | number> = {
        artifact: record.location.artifact,
      };
      if (record.location.row !== undefined) location.row = record.location.row;
      if (record.location.page !== undefined)
        location.page = record.location.page;
      if (record.location.pointer !== undefined)
        location.pointer = record.location.pointer;
      return {
        namespace: record.namespace,
        kind: record.kind,
        sourceId: record.sourceId,
        payloadHash: record.payloadHash,
        artifactHash: record.artifactHash,
        location,
      };
    }),
  };
  source.records = [
    {
      namespace: batch.namespace,
      kind: "pier-batch",
      sourceId: batch.id,
      payload,
      payloadHash: sha256(canonicalJson(payload)),
      artifactHash: artifact.sha256,
      location: { artifact: artifact.name, row: 1 },
    },
  ];
  const plan = await planD1Import(
    source,
    {
      version: batch.mappingRevision,
      map: () => ({
        effects: [{ targetKind: "batch", targetId: batch.id, value: g as any }],
      }),
    },
    context,
  );
  context.reviewedFingerprint = plan.fingerprint;
  const job = await createD1ImportJob(plan, context);
  const completed = await applyD1ImportBatches(job.id, context);
  if (completed.state !== "completed")
    fail(
      "IMPORT_PUBLICATION",
      "Import publication has not completed; resume the same command.",
    );
  return completed;
}
export { canonicalJson, sha256 };
export type { SourceBundle };
