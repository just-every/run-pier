import type { Bindings } from '../auth.server';
import { Problem, type Actor } from './model';
import { authority } from './storage';
import { sha256 } from './import-kit';

/** A bounded read door: historical movements and unrelated records are never loaded. */
export async function searchResponse(request: Request, env: Bindings, actor: Actor) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/pier/search') return null;
  if (actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Current owner authority is required for catalogue and customer search.', null, 403);
  if (request.method !== 'GET') throw new Problem('METHOD', 'Use GET for search.', null, 405);
  const kind = url.searchParams.get('kind') ?? 'items', query = (url.searchParams.get('q') ?? '').trim();
  if (!['items', 'customers'].includes(kind) || !query || query.length > 200) throw new Problem('SEARCH', 'Choose items or customers and supply 1 to 200 search characters.', null, 400);
  const rawLimit = url.searchParams.get('limit') ?? '50';
  if (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(rawLimit)) throw new Problem('PAGE_SIZE', 'Use a page size from 1 to 100.', null, 400);
  const limit = Number(rawLimit), fingerprint = sha256(JSON.stringify([kind, query]));
  let cursor: { after: string; version: number; query: string } | null = null;
  if (url.searchParams.has('cursor')) {
    try {
      cursor = JSON.parse(atob(url.searchParams.get('cursor')!));
      if (!cursor || typeof cursor.after !== 'string' || cursor.after.length > 200 || !Number.isSafeInteger(cursor.version) || cursor.version < 0 || cursor.query !== fingerprint) throw Error();
    } catch { throw new Problem('SEARCH_CURSOR', 'Search continuation is invalid or belongs to another query. Start again.', null, 409); }
  }
  const predicate = kind === 'customers'
    ? "kind='parties' AND json_extract(data,'$.kind')='customer' AND instr(lower(json_extract(data,'$.name')),lower(?))>0"
    : `kind='items' AND (EXISTS(SELECT 1 FROM json_each(json_array(json_extract(data,'$.sku'),json_extract(data,'$.name'),json_extract(data,'$.barcode'),json_extract(data,'$.caseBarcode'))) WHERE instr(lower(value),lower(?))>0) OR EXISTS(SELECT 1 FROM json_each(pier_records.data,'$.barcodes') WHERE instr(lower(json_extract(value,'$.code')),lower(?))>0) OR EXISTS(SELECT 1 FROM json_each(pier_records.data,'$.references') WHERE instr(lower(json_extract(value,'$.code')),lower(?))>0))`;
  const matches = kind === 'customers' ? [query] : [query, query, query];
  const gate = authority(actor);
  const results = await env.DB.batch<any>([
    env.DB.prepare(`SELECT version FROM pier_meta WHERE id=1 AND (${gate.sql})`).bind(...gate.params),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM pier_records WHERE (${predicate}) AND (${gate.sql})`).bind(...matches, ...gate.params),
    env.DB.prepare(`SELECT id,data FROM pier_records WHERE (${predicate}) AND id>? AND (${gate.sql}) ORDER BY id LIMIT ?`).bind(...matches, cursor?.after ?? '', ...gate.params, limit + 1),
  ]);
  const version = results[0].results[0]?.version;
  if (version === undefined) throw new Problem('AUTH', 'Session or role changed. Sign in again.', null, 401);
  if (cursor && cursor.version !== version) throw new Problem('SEARCH_CURSOR', 'Business records changed. Start the search again for a consistent result set.', null, 409);
  const hasMore = results[2].results.length > limit, rows = results[2].results.slice(0, limit);
  const nextCursor = hasMore ? btoa(JSON.stringify({ after: rows.at(-1).id, version, query: fingerprint })) : null;
  return new Response(JSON.stringify({ kind, query, sourceVersion: version, total: results[1].results[0].total, rows: rows.map((row: any) => JSON.parse(row.data)), hasMore, nextCursor,
    notice: hasMore ? 'More matching records are available. Continue with nextCursor.' : 'All matching records have been returned.' }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
