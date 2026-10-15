import { operatorAuth, runtimeBindings, type Bindings } from "../auth.server";
import {
  collections,
  Problem,
  fail,
  positions,
  type Actor,
  type Context,
} from "./model";
import { load, saved, commit, authority } from "./storage";
import { nativeExport } from "./native-export";
import { catalogue } from "./catalogue";
import { orders, orderView } from "./orders";
import { purchasing } from "./purchasing";
import { warehouse, countView } from "./warehouse";
import { imports } from "./imports";
import { proposals, reorder } from "./proposals";
import { canonicalJson, sha256, publishImport } from "./import-kit";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
async function current(request: Request, env: Bindings): Promise<Actor> {
  const session = await operatorAuth(env).getSession(request);
  if (!session)
    throw new Problem(
      "AUTH",
      "Sign in with a current native session.",
      null,
      401,
    );
  const role = await env.DB.prepare(
    "SELECT data FROM pier_records WHERE kind='roles' AND id=?",
  )
    .bind(session.operator.id)
    .first<{
      data: string;
    }>();
  return {
    id: session.operator.id,
    name: session.operator.displayName,
    role: role
      ? JSON.parse(role.data).role
      : session.operator.role === "owner"
        ? "owner"
        : "viewer",
    sessionId: session.id,
    operatorVersion: session.operator.version,
  };
}
async function approver(env: Bindings, c: Context, type: string, p: any) {
  let record: any;
  if (type === "po.commit")
    record = c.s.purchaseOrders.find((r) => r.id === p.poId);
  if (type === "return.restock")
    record = c.s.returns.find((r) => r.id === p.returnId);
  if (type === "proposal.execute")
    record = c.s.proposals.find((r) => r.id === p.proposalId);
  if (!record?.approval) return;
  const a = await env.DB.prepare(
    "SELECT o.status,o.role,r.data FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=?",
  )
    .bind(record.approval.actorId)
    .first<any>();
  const role = a?.data
    ? JSON.parse(a.data).role
    : a?.role === "owner"
      ? "owner"
      : "viewer";
  const allowed =
    type === "po.commit"
      ? ["owner", "buyer"]
      : type === "return.restock"
        ? ["owner", "warehouse"]
        : record.kind === "migration"
          ? ["owner"]
          : record.kind === "replenishment"
            ? ["owner", "buyer"]
            : record.kind === "count-drift"
              ? ["owner", "warehouse"]
              : ["owner", "operator"];
  if (!a || a.status !== "active" || !allowed.includes(role))
    fail(
      "APPROVER_REVOKED",
      "The approving person no longer holds approval authority. Review again.",
    );
  c.approver = { id: record.approval.actorId, role };
}
/** One command through Pier's admission: the public endpoint's path, and the
 * demo seed's (src/demo.ts), which passes its own clock. */
export async function execute(
  env: Bindings,
  actor: Actor,
  commandId: string,
  type: string,
  payload: any,
  now = () => new Date().toISOString(),
): Promise<any> {
  const digest = sha256(canonicalJson({ type, payload }));
  const previous = await saved(env.DB, commandId, digest, actor);
  if (previous) return previous;
  // A losing optimistic admission is recomputed from current stock. This is
  // database concurrency handling, not a retry of an external effect or model.
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await load(env.DB),
      s = structuredClone(before),
      c: Context = { s, actor, commandId, now: now() };
    await approver(env, c, type, payload);
    let result: any;
    for (const handle of [
      catalogue,
      orders,
      purchasing,
      warehouse,
      imports,
      proposals,
    ]) {
      result = handle(c, type, payload);
      if (result !== undefined) break;
    }
    if (result === undefined) fail("COMMAND", "Unknown command type.");
    if (type === "import.commit" || type === "import.undo") {
      await publishImport(
        env,
        c,
        before,
        digest,
        result,
        type === "import.undo",
      );
      const outcome = await saved(env.DB, commandId, digest, actor);
      if (!outcome)
        fail(
          "IMPORT_PUBLICATION",
          "The reviewed import was not published. Resume the same command.",
        );
      return outcome;
    }
    try {
      return await commit(env, c, before, digest, result);
    } catch (error) {
      const replay = await saved(env.DB, commandId, digest, actor);
      if (replay) return replay;
      const latest = await load(env.DB);
      if (latest.version !== before.version) {
        if (attempt < 7) continue;
        fail(
          "BUSY",
          "Stock changed repeatedly. Retry the same command identity.",
        );
      }
      throw error;
    }
  }
  return null;
}
export async function pierResponse(
  request: Request,
  original: Bindings,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/pier")) return null;
  try {
    const env = runtimeBindings(original),
      actor = await current(request, env);
    if (request.method === "GET") {
      const s = await load(env.DB),
        c = { s, actor, commandId: "", now: new Date().toISOString() };
      const gate = authority(actor);
      if (
        !(
          await env.DB.prepare(
            "SELECT CASE WHEN (" + gate.sql + ") THEN 1 ELSE 0 END AS ok",
          )
            .bind(...gate.params)
            .first<any>()
        )?.ok
      )
        throw new Problem(
          "AUTH",
          "Session or role changed. Sign in again.",
          null,
          401,
        );
      if (url.pathname === "/api/pier/native-export")
        return json(nativeExport(s));
      if (url.pathname === "/api/pier/export") {
        const audit = await env.DB.batch([
          env.DB.prepare(
            "SELECT id,actor_id AS actorId,digest,result,created_at AS createdAt FROM pier_commands ORDER BY created_at,id",
          ),
          env.DB.prepare(
            "SELECT id,namespace,operation_key AS operationKey,state,checkpoint,total FROM ik_jobs ORDER BY id",
          ),
          env.DB.prepare(
            "SELECT job_id AS jobId,kind,original_key AS originalKey,name,sha256,size FROM ik_originals ORDER BY job_id,kind,original_key",
          ),
        ]);
        return json({
          format: "pier-business-v1",
          currency: "AUD",
          precision: 6,
          exportedAt: new Date().toISOString(),
          ...s,
          commands: audit[0].results.map((command: any) => ({
            ...command,
            result: JSON.parse(command.result),
          })),
          importJournal: {
            jobs: audit[1].results,
            originals: audit[2].results,
          },
        });
      }
      if (url.pathname !== "/api/pier/state")
        return json(
          {
            ok: false,
            error: { code: "NOT_FOUND", message: "Unknown endpoint." },
          },
          404,
        );
      const commands = (
        await env.DB.prepare(
          "SELECT id,actor_id AS actorId,created_at AS createdAt FROM pier_commands ORDER BY created_at DESC LIMIT 100",
        ).all()
      ).results;
      const operators =
        actor.role === "owner"
          ? (
              await env.DB.prepare(
                "SELECT id,email,display_name AS name,role,status FROM oa_operators",
              ).all()
            ).results
          : [];
      // Every signed-in role sees who recorded each change by name.
      const people = (
        await env.DB.prepare(
          "SELECT id,display_name AS name FROM oa_operators",
        ).all()
      ).results;
      return json({
        ...s,
        actor,
        people,
        orders: s.orders.map((o) => orderView(c, o)),
        counts: s.counts.map((count) => countView(c, count)),
        positions: positions(s),
        reorder: reorder(c),
        commands,
        operators,
      });
    }
    if (request.method !== "POST" || url.pathname !== "/api/pier/commands")
      return json(
        {
          ok: false,
          error: {
            code: "METHOD",
            message: "Use the public command endpoint.",
          },
        },
        405,
      );
    if (request.headers.get("origin") !== new URL(env.AUTH_ORIGIN).origin)
      throw new Problem(
        "ORIGIN",
        "Send commands from this installation origin.",
        null,
        403,
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new Problem("CONTENT_TYPE", "Use application/json.", null, 400);
    const raw = await request.text();
    if (raw.length > 2 * 1024 * 1024)
      throw new Problem("SIZE", "Command exceeds 2 MiB.", null, 400);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Problem("JSON", "Malformed JSON.", null, 400);
    }
    const { commandId, type, payload = {} } = body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Problem("INPUT", "Payload must be an object.", null, 400);
    if (
      typeof commandId !== "string" ||
      !/^[-a-zA-Z0-9_]{8,100}$/.test(commandId) ||
      typeof type !== "string"
    )
      throw new Problem(
        "COMMAND",
        "Supply a unique commandId and command type.",
        null,
        400,
      );
    if (type === "role.set") {
      const target = await env.DB.prepare(
        "SELECT role FROM oa_operators WHERE id=?",
      )
        .bind(payload.operatorId)
        .first<any>();
      if (!target) fail("OPERATOR", "Choose an existing native operator.");
      if (target.role === "owner" && payload.role !== "owner")
        fail(
          "OWNER_ROLE",
          "Native owners retain owner authority. Assign agent roles only to native members.",
        );
    }
    const outcome = await execute(env, actor, commandId, type, payload);
    if (outcome) return json(outcome);
    return json(
      {
        ok: false,
        error: { code: "BUSY", message: "Retry the same command identity." },
      },
      409,
    );
  } catch (error) {
    if (error instanceof Problem)
      return json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        error.status,
      );
    return json(
      {
        ok: false,
        error: {
          code: "TRANSACTION",
          message:
            "The command outcome is unconfirmed. Retry the identical command identity and payload to recover its durable outcome.",
        },
      },
      409,
    );
  }
}
