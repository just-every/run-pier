import type { Actor } from './model';

/** Recovery can identify one's own command without reading any saved result. */
export async function commandIdentities(db: D1Database, actor: Actor, commandId: string | null) {
  const owner = actor.role === 'owner';
  const scope = "actor_id=? AND json_extract(result,'$.admission.role')=? AND json_extract(result,'$.admission.permissionVersion')=?";
  const params = [actor.id, actor.role, actor.permissionVersion ?? 0];
  const rows = (await db.prepare(`SELECT id,actor_id AS actorId,created_at AS createdAt FROM pier_commands ${owner ? '' : 'WHERE ' + scope} ORDER BY created_at DESC LIMIT 100`)
    .bind(...(owner ? [] : params)).all()).results;
  if (commandId && !rows.some(command => command.id === commandId)) {
    const own = await db.prepare(`SELECT id,actor_id AS actorId,created_at AS createdAt FROM pier_commands WHERE id=? AND ${owner ? 'actor_id=?' : scope}`).bind(commandId, ...(owner ? [actor.id] : params)).first();
    if (own) rows.push(own);
  }
  return rows;
}
