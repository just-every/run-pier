import { checkSql } from "../modules/import-kit/src/d1/budget";
import { checkGraphValues, importGraph } from "./native-graph-sql";
import {
  fail,
  movementFrontier,
  type Context,
  type State,
  type Row,
} from "./model";

function admitted(check: () => void) {
  try {
    check();
  } catch (error) {
    if ((error as Error).message !== "IMPORT_D1_VALUE_LIMIT") throw error;
    fail(
      "IMPORT_SIZE",
      "The retained import record or command result exceeds D1's 2,000,000-byte SQL value budget after source, review and provenance are included. Split the source into smaller separately reconciled batches; no stock has been posted.",
    );
  }
}
export function checkImportRecord(c: Context, result: Row) {
  admitted(() => {
    checkSql({
      sql: "INSERT INTO pier_records VALUES(?,?,?,?)",
      params: ["imports", result.id, result.version, JSON.stringify(result)],
    });
    checkSql({
      sql: "INSERT INTO pier_commands VALUES(?,?,?,?,?)",
      // SHA-256 digests occupy exactly 64 bytes for every command payload.
      params: [
        c.commandId,
        c.actor.id,
        "0".repeat(64),
        JSON.stringify({ ok: true, result, version: c.s.version + 1 }),
        c.now,
      ],
    });
  });
}

// The shared adapter's actual SQL admission is also the capacity check shown
// during reconciliation. It is not an arbitrary source-file threshold.
export function checkImportCapacity(c: Context, after: State, batch: Row) {
  const projected = structuredClone(after);
  const result = projected.imports.find((r) => r.id === batch.id)!;
  Object.assign(result, {
    reconciliation: batch.reconciliation,
    materialHash: batch.materialHash,
    status: "committed",
    committedVersion: c.s.version + 1,
    frontier: movementFrontier(projected),
    approval: { actorId: c.actor.id, version: batch.version, at: c.now },
    version: batch.version + 1,
  });
  admitted(() => {
    checkGraphValues(importGraph(c.s, projected));
    checkImportRecord(c, result);
  });
}
