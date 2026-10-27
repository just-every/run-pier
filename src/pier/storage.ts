import { assuranceSql } from '../strong-auth/assurance';
import { stockEvents } from './stock-feed';
import { auditStatement } from './audit';
import {
  collections,
  fail,
  Problem,
  type State,
  type Actor,
  type Context,
} from "./model";
import type { Bindings } from "../auth.server";
export const authority = (a: Actor) => ({
  sql: `${assuranceSql()} AND EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.version=? AND s.operator_version=o.version AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>?) AND (CASE WHEN EXISTS(SELECT 1 FROM pier_records WHERE kind='roles' AND id=?) THEN (SELECT json_extract(data,'$.role') FROM pier_records WHERE kind='roles' AND id=?) ELSE (SELECT CASE WHEN role='owner' THEN 'owner' ELSE 'viewer' END FROM oa_operators WHERE id=?) END)=? AND COALESCE((SELECT version FROM pier_records WHERE kind='roles' AND id=?),0)=? AND NOT EXISTS(SELECT 1 FROM pier_records WHERE kind='roles' AND id=? AND json_extract(data,'$.role')!='owner' AND json_extract(data,'$.permissions.expiresAt')<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  params: [
    a.sessionId,
    a.id,
    a.sessionId,
    a.id,
    a.operatorVersion,
    Date.now(),
    a.id,
    a.id,
    a.id,
    a.role,
    a.id,
    a.permissionVersion ?? 0,
    a.id,
  ],
});
const effectiveRole = `CASE WHEN r.data IS NOT NULL THEN json_extract(r.data,'$.role') WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END`;
const delegationScope = `(json_type(r.data,'$.permissions') IS NULL OR ${effectiveRole}='owner') AND NOT (${effectiveRole}='buyer' AND COALESCE(json_extract(r.data,'$.visibility.costs'),1)=0) AND NOT (${effectiveRole} IN ('operator','sales') AND COALESCE(json_extract(r.data,'$.visibility.prices'),1)=0)`;
export async function activeAutomationActors(db: D1Database): Promise<Record<string, string>> {
  const rows = await db.prepare(`SELECT o.id,CASE WHEN ${delegationScope} THEN ${effectiveRole} ELSE 'viewer' END AS role FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.status='active'`).all<any>();
  return Object.fromEntries(rows.results.map(r => [r.id, r.role]));
}
export function policyAuthority(c: Pick<Context, "actor" | "backgroundPolicy">) {
  const p = c.backgroundPolicy!;
  const path = p.collection === 'purchaseOrders' ? '$.sendPolicy.version' : p.collection === 'orders' ? '$.promisePolicy.version' : '$.version';
  const approver = p.collection === 'purchaseOrders' ? '$.sendPolicy.approvedBy' : p.collection === 'orders' ? '$.promisePolicy.approvedBy' : '$.approvedBy';
  const enabled = p.collection === 'purchaseOrders' ? '$.sendPolicy.enabled' : p.collection === 'orders' ? '$.promisePolicy.enabled' : ['channels','bookConnections','shippingSettings','operationalExceptionPolicies','slowStockPolicies','recurringOrders','paymentConnections','workflowRules'].includes(p.collection) ? '$.enabled' : '$.autoDraft';
  return { sql: `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND ${delegationScope} AND ${effectiveRole}=? AND ${effectiveRole} IN ('owner','buyer','operator')) AND EXISTS(SELECT 1 FROM pier_records WHERE kind=? AND id=? AND json_extract(data,?)=? AND json_extract(data,?)=? AND json_extract(data,?)=1)`,
    params: [c.actor.id, c.actor.role, p.collection, p.id, path, p.version, approver, c.actor.id, enabled] };
}
export async function load(db: D1Database): Promise<State> {
  const statements = [
    db.prepare("SELECT version FROM pier_meta WHERE id=1"),
    db.prepare("SELECT kind,data FROM pier_records ORDER BY kind,json_extract(data,'$.createdAt'),id"),
    db.prepare("SELECT * FROM pier_movements ORDER BY sequence"),
    db.prepare("SELECT * FROM pier_reservations ORDER BY id"),
  ];
  const out = await db.batch<any>(statements);
  const s = {
    version: out[0].results[0].version,
    movements: [],
    reservations: [],
  } as unknown as State;
  for (const k of collections) s[k] = [];
  for (const r of out[1].results) {
    if (collections.includes(r.kind))
      s[r.kind as (typeof collections)[number]].push(JSON.parse(r.data));
  }
  s.movements = out[2].results.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    itemId: r.item_id,
    locationId: r.location_id,
    status: r.status,
    quantity: String(r.quantity),
    actorId: r.actor_id,
    commandId: r.command_id,
    documentId: r.document_id,
    reversalId: r.reversal_id,
    importId: r.import_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));
  s.reservations = out[3].results.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    orderLineId: r.order_line_id,
    itemId: r.item_id,
    locationId: r.location_id,
    quantity: String(r.quantity),
  }));
  return s;
}
export async function saved(
  db: D1Database,
  commandId: string,
  digest: string,
  actor: Actor,
  backgroundPolicy?: Context["backgroundPolicy"],
) {
  const gate = backgroundPolicy ? policyAuthority({actor,backgroundPolicy}) : authority(actor);
  const r = await db
    .prepare(`SELECT *,(${gate.sql}) AS admitted FROM pier_commands WHERE id=?`)
    .bind(...gate.params,commandId)
    .first<any>();
  if (!r) return null;
  if (!r.admitted) throw new Problem('AUTH','Current authority is required to recover this result.',null,401);
  if (r.digest !== digest || r.actor_id !== actor.id)
    fail(
      "IDEMPOTENCY",
      "This command identity was already used with different content or actor.",
    );
  const { admission, ...response } = JSON.parse(r.result);
  if (actor.role !== 'owner' && (!admission || admission.role !== actor.role || admission.permissionVersion !== (actor.permissionVersion ?? 0)))
    throw new Problem('FORBIDDEN', 'Your authority changed after this result was recorded. Ask an owner to reconcile the original command.', null, 403);
  return response;
}
export async function commit(
  env: Bindings,
  c: Context,
  before: State,
  digest: string,
  result: unknown,
) {
  const db = env.DB,
    a = c.backgroundPolicy ? policyAuthority(c) : authority(c.actor),
    statements: D1PreparedStatement[] = [];
  const guard = (sql: string, params: unknown[]) =>
    statements.push(
      db
        .prepare(
          `INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN (${sql}) THEN 1 ELSE 0 END)`,
        )
        .bind(crypto.randomUUID(), ...params),
    );
  guard(`(${a.sql}) AND (SELECT version FROM pier_meta WHERE id=1)=?`, [
    ...a.params,
    before.version,
  ]);
  if (c.s.operationalExceptions.some(record => record.status === 'closed' && before.operationalExceptions.find(old => old.id === record.id)?.status !== 'closed')) {
    const connection = c.s.bookConnections.find(connection => connection.enabled && !connection.problem) ?? fail('EXCEPTION_EVIDENCE', 'Current Pantry authority is required.');
    const policy = c.s.operationalExceptionPolicies[0] ?? fail('EXCEPTION_EVIDENCE', 'Current case policy authority is required.');
    for (const id of new Set([connection.approvedBy, policy.approvedBy]))
      guard(`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND ${effectiveRole}='owner')`, [id]);
  }
  if (c.approver) {
    guard(
      `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND ${delegationScope} AND CASE WHEN r.data IS NOT NULL THEN json_extract(r.data,'$.role') WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END=?)`,
      [c.approver.id, c.approver.role],
    );
  }
  if (c.purchaseSendAuthority) {
    const d = c.purchaseSendAuthority;
    guard(`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND ${delegationScope} AND ${effectiveRole}=? AND ${effectiveRole} IN ('owner','buyer')) AND EXISTS(SELECT 1 FROM pier_records WHERE kind='purchaseOrders' AND id=? AND json_extract(data,'$.sendPolicy.version')=? AND json_extract(data,'$.sendPolicy.enabled')=1 AND json_extract(data,'$.sendPolicy.approvedBy')=?)`, [d.actorId, d.role, d.poId, d.policyVersion, d.actorId]);
  }
  for (const d of c.delegates ?? []) {
    const oldPolicy = before.orders.find(o => o.id === d.orderId)?.promisePolicy;
    // A policy explicitly saved in this command is covered by the session guard.
    if (oldPolicy?.version !== d.policyVersion && d.actorId === c.actor.id) continue;
    guard(`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND ${delegationScope} AND ${effectiveRole}=?) AND EXISTS(SELECT 1 FROM pier_records WHERE kind='orders' AND id=? AND json_extract(data,'$.promisePolicy.version')=? AND json_extract(data,'$.promisePolicy.enabled')=1 AND json_extract(data,'$.promisePolicy.approvedBy')=?)`, [d.actorId,d.role,d.orderId,d.policyVersion,d.actorId]);
  }
  for (const secret of c.channelSecrets ?? []) statements.push(db.prepare("INSERT INTO pier_channel_secrets(channel_id,secret) VALUES(?,?) ON CONFLICT(channel_id) DO UPDATE SET secret=excluded.secret").bind(secret.channelId, secret.secret));
  for (const kind of collections) {
    const old = new Map(before[kind].map((r) => [r.id, JSON.stringify(r)])),
      next = new Set(c.s[kind].map((r) => r.id));
    for (const r of c.s[kind])
      if (old.get(r.id) !== JSON.stringify(r))
        statements.push(
          db
            .prepare(
              "INSERT INTO pier_records(kind,id,version,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET version=excluded.version,data=excluded.data",
            )
            .bind(kind, r.id, r.version, JSON.stringify(r)),
        );
    for (const r of before[kind])
      if (!next.has(r.id))
        statements.push(
          db
            .prepare("DELETE FROM pier_records WHERE kind=? AND id=?")
            .bind(kind, r.id),
        );
  }
  const oldReservations = new Map(
      before.reservations.map((r) => [r.id, JSON.stringify(r)]),
    ),
    nextReservations = new Set(c.s.reservations.map((r) => r.id));
  for (const r of c.s.reservations)
    if (oldReservations.get(r.id) !== JSON.stringify(r))
      statements.push(
        db
          .prepare(
            "INSERT INTO pier_reservations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET order_id=excluded.order_id,order_line_id=excluded.order_line_id,quantity=excluded.quantity",
          )
          .bind(
            r.id,
            r.orderId,
            r.orderLineId,
            r.itemId,
            r.locationId,
            Number(r.quantity),
          ),
      );
  for (const r of before.reservations)
    if (!nextReservations.has(r.id))
      statements.push(
        db.prepare("DELETE FROM pier_reservations WHERE id=?").bind(r.id),
      );
  for (const m of c.s.movements.slice(before.movements.length))
    statements.push(
      db
        .prepare("INSERT INTO pier_movements VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(
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
        ),
    );
  statements.push(...stockEvents(before, c.s, c.now).map(q => db.prepare(q.sql).bind(...q.params)));
  // Assertion is a CHECK inside this same atomic D1 batch: zero admitted rows cannot leak dependent writes.
  statements.push(
    db
      .prepare(
        "UPDATE pier_meta SET version=version+1 WHERE id=1 AND version=?",
      )
      .bind(before.version),
  );
  guard("changes()=1", []);
  statements.push(...c.privacyStatements ?? []);
  if (c.audit) statements.push(auditStatement(db, c.audit));
  const response = { ok: true, result, version: before.version + 1 };
  statements.push(
    db
      .prepare("INSERT INTO pier_commands VALUES(?,?,?,?,?)")
      .bind(c.commandId, c.actor.id, digest, JSON.stringify({ ...response, admission: { role: c.actor.role, permissionVersion: c.actor.permissionVersion ?? 0 } }), c.now),
  );
  statements.push(db.prepare("DELETE FROM pier_guard"));
  await db.batch(statements);
  return response;
}
