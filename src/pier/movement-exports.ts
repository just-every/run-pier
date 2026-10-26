import type { Bindings } from '../auth.server';
import { authority } from './storage';
import { commandText } from './documents/body';
import { Problem, type Actor } from './model';

const root = '/api/pier/movement-exports';
const movementColumns = 'id,sequence,item_id AS itemId,location_id AS locationId,status,CAST(quantity AS TEXT) AS quantity,actor_id AS actorId,command_id AS commandId,document_id AS documentId,reversal_id AS reversalId,import_id AS importId,reason,created_at AS createdAt';
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });
const denied = () => { throw new Problem('FORBIDDEN', 'Current owner authority is required for movement exports.', null, 403); };
type Job = { id: string; actor_id: string; session_id: string; operator_version: number; permission_version: number; source_version: number; frontier: number; total: number; processed: number; cursor: number; pages: number; status: string; created_at: string };
function jobActor(job: Job): Actor {
  return { id: job.actor_id, sessionId: job.session_id, operatorVersion: job.operator_version, permissionVersion: job.permission_version, role: 'owner', name: '' };
}
function valid(job: Job) {
  const gate = authority(jobActor(job));
  return { sql: `(${gate.sql}) AND (SELECT version FROM pier_meta WHERE id=1)=?`, params: [...gate.params, job.source_version] };
}
function progress(job: Job) {
  return { id: job.id, status: job.status, total: job.total, processed: job.processed, pages: job.pages, frontier: job.frontier, sourceVersion: job.source_version, createdAt: job.created_at,
    format: 'pier-movements-jsonl-v1', quantityUnit: 'millionths of base unit',
    message: job.status === 'stale' ? 'Source or owner authority changed. No partial download is available. Start a new export.' : job.status === 'complete' ? 'All movements are ready. Download every numbered page in order.' : 'Preparing all movements in the background. No rows are silently omitted.' };
}
async function get(db: D1Database, id: string) {
  const job = await db.prepare('SELECT * FROM pier_movement_exports WHERE id=?').bind(id).first<Job>();
  if (!job) throw new Problem('NOT_FOUND', 'Movement export not found.', null, 404);
  return job;
}
async function fresh(db: D1Database, job: Job) {
  const gate = valid(job);
  const ok = await db.prepare(`SELECT CASE WHEN ${gate.sql} THEN 1 ELSE 0 END AS ok`).bind(...gate.params).first<{ ok: number }>();
  if (!ok?.ok || job.status === 'stale') {
    await db.batch([
      db.prepare("UPDATE pier_movement_exports SET status='stale' WHERE id=?").bind(job.id),
      db.prepare('DELETE FROM pier_movement_export_parts WHERE job_id=?').bind(job.id),
    ]);
    job.status = 'stale';
    return false;
  }
  return true;
}

/** Ten bounded pages per invocation. A cursor compare makes concurrent retries harmless. */
export async function advanceMovementExport(db: D1Database, id: string) {
  for (let n = 0; n < 10; n++) {
    const job = await get(db, id);
    if (!await fresh(db, job) || job.status !== 'pending') return;
    const rows = (await db.prepare(`SELECT sequence FROM pier_movements WHERE sequence>? AND sequence<=? ORDER BY sequence LIMIT 100`).bind(job.cursor, job.frontier).all()).results;
    const cursor = Number(rows.at(-1)?.sequence ?? job.cursor), processed = job.processed + rows.length;
    const complete = processed === job.total;
    if (!rows.length && !complete) {
      await db.batch([db.prepare("UPDATE pier_movement_exports SET status='stale' WHERE id=?").bind(id), db.prepare('DELETE FROM pier_movement_export_parts WHERE job_id=?').bind(id)]);
      return;
    }
    const gate = valid(job), token = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN ${gate.sql} AND EXISTS(SELECT 1 FROM pier_movement_exports WHERE id=? AND cursor=? AND pages=? AND status='pending') THEN 1 ELSE 0 END)`).bind(token, ...gate.params, id, job.cursor, job.pages),
        ...(rows.length ? [db.prepare('INSERT INTO pier_movement_export_parts(job_id,page,first_sequence,last_sequence,row_count) VALUES(?,?,?,?,?)').bind(id, job.pages, rows[0].sequence, cursor, rows.length)] : []),
        db.prepare('UPDATE pier_movement_exports SET cursor=?,processed=?,pages=?,status=? WHERE id=?').bind(cursor, processed, job.pages + (rows.length ? 1 : 0), complete ? 'complete' : 'pending', id),
        db.prepare('DELETE FROM pier_guard WHERE id=?').bind(token),
      ]);
    } catch (error) {
      // Another worker advanced this exact cursor, or source authority changed.
      const latest = await get(db, id);
      if (!await fresh(db, latest) || latest.pages !== job.pages || latest.status !== 'pending') return;
      throw error;
    }
    if (complete) return;
  }
}

export async function runMovementExports(env: Bindings) {
  const jobs = (await env.DB.prepare("SELECT id FROM pier_movement_exports WHERE status='pending' ORDER BY created_at,id LIMIT 5").all<{ id: string }>()).results;
  for (const job of jobs) await advanceMovementExport(env.DB, job.id);
}

export async function movementExportResponse(request: Request, env: Bindings, actor: Actor, execution?: { waitUntil(promise: Promise<unknown>): void }) {
  const url = new URL(request.url);
  if (url.pathname !== root && !url.pathname.startsWith(root + '/')) return null;
  if (actor.role !== 'owner') return denied();
  const gate = authority(actor);
  if (!(await env.DB.prepare(`SELECT CASE WHEN ${gate.sql} THEN 1 ELSE 0 END AS ok`).bind(...gate.params).first<{ ok: number }>())?.ok) return denied();
  const match = /^\/api\/pier\/movement-exports\/([-a-zA-Z0-9_]{8,100})(?:\/pages\/(0|[1-9][0-9]*))?$/.exec(url.pathname);
  if (request.method === 'POST' && url.pathname === root) {
    if (request.headers.get('origin') !== new URL(env.AUTH_ORIGIN).origin || !request.headers.get('content-type')?.includes('application/json')) throw new Problem('ORIGIN', 'Use same-origin JSON to request an export.', null, 403);
    let body: any;
    try { body = JSON.parse(await commandText(request)); } catch (error) {
      if (error instanceof Problem) throw error;
      throw new Problem('JSON', 'Malformed JSON.', null, 400);
    }
    const id = body?.commandId;
    if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{8,100}$/.test(id)) throw new Problem('INPUT', 'Supply a unique commandId of 8 to 100 letters, digits, underscores or hyphens.', null, 400);
    await env.DB.prepare(`INSERT INTO pier_movement_exports(id,actor_id,session_id,operator_version,permission_version,source_version,frontier,total,status,created_at) SELECT ?,?,?,?,?,(SELECT version FROM pier_meta WHERE id=1),COALESCE(MAX(sequence),0),COUNT(*),'pending',? FROM pier_movements HAVING (${gate.sql}) ON CONFLICT(id) DO NOTHING`).bind(id, actor.id, actor.sessionId, actor.operatorVersion, actor.permissionVersion ?? 0, new Date().toISOString(), ...gate.params).run();
    const job = await get(env.DB, id);
    if (job.actor_id !== actor.id) return denied();
    await fresh(env.DB, job);
    if (job.status === 'pending' && execution) execution.waitUntil(advanceMovementExport(env.DB, id));
    return json(progress(job), job.status === 'stale' ? 409 : 202);
  }
  if (request.method !== 'GET' || !match) throw new Problem('METHOD', 'Request an export with POST; read progress and numbered pages with GET.', null, 405);
  const job = await get(env.DB, match[1]);
  if (job.actor_id !== actor.id) return denied();
  if (!await fresh(env.DB, job)) return json(progress(job), 409);
  if (match[2] === undefined) return json(progress(job));
  if (job.status !== 'complete') return json(progress(job), 409);
  const page = Number(match[2]);
  if (!Number.isSafeInteger(page) || page >= job.pages) throw new Problem('NOT_FOUND', 'Export page not found. Read the manifest page count.', null, 404);
  const snapshot = valid(job);
  const rows = (await env.DB.prepare(`SELECT ${movementColumns} FROM pier_movements WHERE sequence BETWEEN (SELECT first_sequence FROM pier_movement_export_parts WHERE job_id=? AND page=?) AND (SELECT last_sequence FROM pier_movement_export_parts WHERE job_id=? AND page=?) AND ${snapshot.sql} AND (${gate.sql}) ORDER BY sequence LIMIT 100`).bind(job.id, page, job.id, page, ...snapshot.params, ...gate.params).all()).results;
  if (rows.length !== Math.min(100, job.total - page * 100)) return json({ ...progress(job), status: 'stale', message: 'Source or owner authority changed. Start a new export.' }, 409);
  return new Response(rows.map(row => JSON.stringify(row)+'\n').join(''), { headers: { ...headers, 'content-type': 'application/x-ndjson', 'content-disposition': `attachment; filename="pier-movements-${page}.jsonl"`, 'x-pier-export-pages': String(job.pages), 'x-pier-export-total': String(job.total) } });
}
