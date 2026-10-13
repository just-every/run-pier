import type { D1Sql } from "../modules/import-kit/src/d1/index";
import { checkSql } from "../modules/import-kit/src/d1/budget";
import { Buffer } from "node:buffer";
import { collections, type Row, type State } from "./model";

export type Graph = {
  publication?: {
    commandId: string;
    actorId: string;
    digest: string;
    at: string;
    beforeVersion: number;
  };
  records: { kind: string; data: Row }[];
  movements: any[];
  reservations: any[];
  removedReservationIds: string[];
  dependencies: any[];
};
const sql = (sql: string, ...params: any[]): D1Sql => ({ sql, params });
export function importGraph(before: State, after: State): Graph {
  return {
    records: collections.flatMap((kind) =>
      after[kind]
        .filter(
          (r) =>
            JSON.stringify(r) !==
            JSON.stringify(before[kind].find((x) => x.id === r.id)),
        )
        .map((data) => ({ kind, data })),
    ),
    movements: after.movements.slice(before.movements.length),
    reservations: after.reservations.filter(
      (r) => !before.reservations.some((x) => x.id === r.id),
    ),
    removedReservationIds: before.reservations
      .filter((r) => !after.reservations.some((x) => x.id === r.id))
      .map((r) => r.id),
    dependencies: [],
  };
}
const tables = [
  {
    name: "pier_records",
    columns: ["kind", "id", "version", "data"],
    rows: (g: Graph) =>
      g.records.map((x) => [
        x.kind,
        x.data.id,
        x.data.version,
        JSON.stringify(x.data),
      ]),
  },
  {
    name: "pier_movements",
    columns: [
      "id",
      "sequence",
      "item_id",
      "location_id",
      "status",
      "quantity",
      "actor_id",
      "command_id",
      "document_id",
      "reversal_id",
      "import_id",
      "reason",
      "created_at",
    ],
    rows: (g: Graph) =>
      g.movements.map((m) => [
        m.id,
        m.sequence,
        m.itemId,
        m.locationId,
        m.status,
        Number(m.quantity),
        m.actorId,
        m.commandId,
        m.documentId,
        m.reversalId,
        m.importId,
        m.reason,
        m.createdAt,
      ]),
  },
  {
    name: "pier_reservations",
    columns: [
      "id",
      "order_id",
      "order_line_id",
      "item_id",
      "location_id",
      "quantity",
    ],
    rows: (g: Graph) =>
      g.reservations.map((r) => [
        r.id,
        r.orderId,
        r.orderLineId,
        r.itemId,
        r.locationId,
        Number(r.quantity),
      ]),
  },
] as const;
const extracted = (index: number) =>
  `json_extract(expected.value,'$[${index}]')`;

// Bound every SQL value by bytes. A large individual row uses ordinary column
// bindings, avoiding the extra JSON escaping of a nested record's data string.
function rowGroups(rows: unknown[][]) {
  const groups: { rows: unknown[][]; direct: boolean }[] = [];
  let group: unknown[][] = [],
    bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (group.length && bytes + size > 128 * 1024) {
      groups.push({ rows: group, direct: false });
      group = [];
      bytes = 2;
    }
    if (size > 128 * 1024) groups.push({ rows: [row], direct: true });
    else {
      group.push(row);
      bytes += size;
    }
  }
  if (group.length) groups.push({ rows: group, direct: false });
  return groups;
}
export function graphMatches(graph: Graph): D1Sql[] {
  return tables.flatMap((table) =>
    rowGroups(table.rows(graph)).map(({ rows, direct }) =>
      direct
        ? sql(
            `EXISTS(SELECT 1 FROM ${table.name} actual WHERE ${table.columns.map((column) => `actual.${column} IS ?`).join(" AND ")})`,
            ...rows[0],
          )
        : sql(
            `NOT EXISTS(SELECT 1 FROM json_each(?) expected WHERE NOT EXISTS(SELECT 1 FROM ${table.name} actual WHERE ${table.columns.map((column, index) => `actual.${column} IS ${extracted(index)}`).join(" AND ")}))`,
            JSON.stringify(rows),
          ),
    ),
  );
}

export function writeGraph(graph: Graph): D1Sql[] {
  return [
    sql(
      "DELETE FROM pier_reservations WHERE id IN(SELECT value FROM json_each(?))",
      JSON.stringify(graph.removedReservationIds),
    ),
    ...tables.flatMap((table) =>
      rowGroups(table.rows(graph)).map(({ rows, direct }) =>
        sql(
          `INSERT INTO ${table.name}(${table.columns.join(",")}) ${direct ? `VALUES(${table.columns.map(() => "?").join(",")})` : `SELECT ${table.columns.map((_, index) => extracted(index)).join(",")} FROM json_each(?) expected WHERE true`}${table.name === "pier_records" ? " ON CONFLICT(kind,id) DO UPDATE SET version=excluded.version,data=excluded.data" : ""}`,
          ...(direct ? rows[0] : [JSON.stringify(rows)]),
        ),
      ),
    ),
  ];
}

export function checkGraphValues(graph: Graph) {
  for (const query of [...writeGraph(graph), ...graphMatches(graph)])
    checkSql(query);
}

export function restoreGraphRecords(batch: Row): D1Sql[] {
  const graph: Graph = {
    records: batch.beforeRecords ?? [],
    reservations: batch.beforeReservations ?? [],
    movements: [],
    removedReservationIds: [],
    dependencies: [],
  };
  return [
    sql(
      "DELETE FROM pier_records WHERE EXISTS(SELECT 1 FROM json_each(?) removed WHERE pier_records.kind=json_extract(removed.value,'$.kind') AND pier_records.id=json_extract(removed.value,'$.id'))",
      JSON.stringify(batch.created ?? []),
    ),
    ...writeGraph(graph),
  ];
}
