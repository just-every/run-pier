import { positions, Problem, type Actor, type State } from './model';
import { physicalState } from './permissions';
import { authority } from './storage';

// Committed absolute positions let a consumer upsert by stable event identity.
// Missing positions become explicit zeroes, including reviewed import undo.
function eventInsert(events: any[], baseline = false) {
  return {sql:`INSERT INTO pier_stock_events(id,item_id,location_id,at,data) SELECT json_extract(value,'$.id'),json_extract(value,'$.itemId'),json_extract(value,'$.locationId'),json_extract(value,'$.at'),json_extract(value,'$.data') FROM json_each(?) ${baseline ? 'WHERE NOT EXISTS(SELECT 1 FROM pier_stock_feed_bootstrap)' : ''} ORDER BY CAST(key AS INTEGER)`,params:[JSON.stringify(events)]};
}
const event = (data: any, at: string) => ({id:crypto.randomUUID(),itemId:data.itemId,locationId:data.locationId,at,data:JSON.stringify(data)});
export function stockBootstrap(state: State, at: string) {
  return [eventInsert(positions(state).map(p=>event(p,at)),true),
    {sql:'INSERT INTO pier_stock_feed_bootstrap(id) VALUES(1) ON CONFLICT(id) DO NOTHING',params:[]},
  ];
}
export function stockEvents(before: State, after: State, at: string) {
  const index = (s: State) => new Map(positions(s).map(p => [JSON.stringify([p.itemId,p.locationId,p.status]), p]));
  const old = index(before), next = index(after);
  const changes = [...new Set([...old.keys(), ...next.keys()])].sort().flatMap(key => {
    const a = old.get(key), b = next.get(key);
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    const [itemId,locationId,status] = JSON.parse(key);
    const data = b ?? {itemId,locationId,status,quantity:'0',reserved:'0',held:'0',available:'0',expiredOrBlocked:'0',traceUnavailable:'0'};
    return [event(data,at)];
  });
  return [...stockBootstrap(before,at), ...(changes.length ? [eventInsert(changes)] : [])];
}
const checkpointError = () => { throw new Problem('CHECKPOINT','Checkpoint is stale, foreign or not acknowledged.',null,409); };
export async function stockFeed(request: Request, db: D1Database, actor: Actor, state: State): Promise<Response> {
  const url = new URL(request.url), ack = url.pathname.endsWith('/ack');
  if (request.method !== (ack ? 'POST' : 'GET')) throw new Problem('METHOD','Use GET for pages and POST for acknowledgement.',null,405);
  const body = ack ? await request.json() as any : null;
  const consumer = ack ? body?.consumer : url.searchParams.get('consumer');
  if (typeof consumer !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(consumer)) throw new Problem('CONSUMER','Supply a consumer name of 1 to 80 letters, digits, underscores or hyphens.',null,400);
  const pageSize = url.searchParams.get('limit') ?? '100';
  if (!ack && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(pageSize)) throw new Problem('PAGE_SIZE','Page size must be an integer from 1 to 100.',null,400);
  // Consumer names are scoped to the authenticated native actor, never supplied user IDs.
  const visible = physicalState(state,actor), locationIds = visible.locations.map(l=>l.id);
  const scope = actor.permissions && actor.role !== 'owner' ? JSON.stringify(locationIds.slice().sort()) : '*';
  const id = JSON.stringify([actor.id,consumer]), gate = authority(actor);
  const guard = () => db.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN (${gate.sql}) AND (SELECT version FROM pier_meta WHERE id=1)=? THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(),...gate.params,state.version);
  const respond = (data: unknown) => new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':'no-store'}});
  await db.batch([guard(),...stockBootstrap(state,new Date().toISOString()).map(q=>db.prepare(q.sql).bind(...q.params)),db.prepare('INSERT INTO pier_stock_consumers(id,actor_id,grant_version,scope) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,actor.id,actor.permissionVersion ?? 0,scope),db.prepare('DELETE FROM pier_guard')]);
  const row = await db.prepare('SELECT * FROM pier_stock_consumers WHERE id=?').bind(id).first<any>();
  if (row.grant_version !== (actor.permissionVersion ?? 0) || row.scope !== scope) return checkpointError();
  const pending = row.pending ? JSON.parse(row.pending) : null;
  const token = ack ? body?.checkpoint : url.searchParams.get('checkpoint');
  if (ack) {
    if (typeof token !== 'string') return checkpointError();
    if (token === row.checkpoint) return respond({ok:true,checkpoint:token,acknowledgedSequence:row.acknowledged});
    if (!pending || token !== pending.token) return checkpointError();
    await db.batch([guard(),db.prepare('UPDATE pier_stock_consumers SET acknowledged=?,checkpoint=?,pending=NULL WHERE id=? AND pending=?').bind(pending.end,token,id,row.pending),db.prepare('INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(crypto.randomUUID()),db.prepare('DELETE FROM pier_guard')]);
    return respond({ok:true,checkpoint:token,acknowledgedSequence:pending.end});
  }
  // A fetched page is only a replay handle. It can never advance the resume frontier.
  if (token && token !== row.checkpoint && token !== pending?.token) return checkpointError();
  if (pending) return respond(pending.response);
  const rows = (await db.prepare('SELECT * FROM pier_stock_events WHERE sequence>? AND (?=1 OR location_id IN (SELECT value FROM json_each(?))) ORDER BY sequence LIMIT ?').bind(row.acknowledged,scope==='*'?1:0,JSON.stringify(locationIds),Number(pageSize)).all<any>()).results;
  const high = await db.prepare('SELECT COALESCE(MAX(sequence),0) AS value FROM pier_stock_events').first<any>();
  const now = new Date().toISOString(), end = rows.at(-1)?.sequence ?? high.value;
  const pageToken = crypto.randomUUID();
  const events = rows.map(r=>({eventId:r.id,sequence:r.sequence,at:r.at,...JSON.parse(r.data)}));
  const response = {consumer,checkpoint:row.checkpoint,acknowledgedSequence:row.acknowledged,pageToken,events,hasMore:end<high.value,observedAt:now,latestEventAt:rows.at(-1)?.at ?? null,lagSeconds:rows.length ? Math.max(0,(Date.parse(now)-Date.parse(rows.at(-1)!.at))/1000) : 0};
  const saved = JSON.stringify({token:pageToken,end,response});
  await db.batch([guard(),db.prepare('UPDATE pier_stock_consumers SET pending=? WHERE id=? AND pending IS NULL AND acknowledged=? AND checkpoint IS ?').bind(saved,id,row.acknowledged,row.checkpoint),db.prepare('INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(crypto.randomUUID()),db.prepare('DELETE FROM pier_guard')]);
  return respond(response);
}
