import type { Bindings } from '../auth.server';
import { fail, type State } from './model';
import { personalValues } from './privacy-state';
import { subjectPlan, type NativeSubject } from './privacy-plan';

type Plan = ReturnType<typeof subjectPlan>;
export const noPendingProvider = `NOT EXISTS(SELECT 1 FROM pier_audit a WHERE json_extract(a.data,'$.phase')='attempt' AND
  (EXISTS(SELECT 1 FROM json_each(a.data,'$.documentIds') d JOIN json_each(?) i ON i.value=d.value) OR (?='operator' AND a.actor_id=?))
  AND NOT EXISTS(SELECT 1 FROM pier_audit done WHERE json_extract(done.data,'$.phase')='outcome' AND json_extract(done.data,'$.attemptId')=json_extract(a.data,'$.attemptId')))`;
export const noPendingMail = `NOT EXISTS(SELECT 1 FROM pier_mail_deliveries WHERE correspondence_id IN (SELECT value FROM json_each(?)) AND phase IN ('sending','uncertain'))`;
// Door capture has independent cached outcomes, pending arguments and identity
// evidence. Native erasure cannot redact those stores or fence their replay yet.
export const noAgentCustody = `NOT EXISTS(SELECT 1 FROM agent_door_calls) AND NOT EXISTS(SELECT 1 FROM agent_door_audit) AND NOT EXISTS(SELECT 1 FROM agent_door_approvals) AND NOT EXISTS(SELECT 1 FROM agent_door_reviews)`;
const noActiveSync = `NOT EXISTS(SELECT 1 FROM pier_book_locks WHERE expires_at>?) AND NOT EXISTS(SELECT 1 FROM pier_channel_locks WHERE expires_at>?)`;
export async function nativeSubject(env: Bindings, kind: string, id: string) {
  if (kind !== 'operator') return undefined;
  return await env.DB.prepare('SELECT id,version,email,display_name,role,status FROM oa_operators WHERE id=?').bind(id).first<NativeSubject>() ?? fail('NOT_FOUND', 'Native operator not found.');
}
export async function inspectSubject(s: State, kind: string, id: string, env: Bindings) {
  const native = await nativeSubject(env, kind, id), plan = subjectPlan(s, kind, id, native), ids = JSON.stringify([...plan.ids]);
  const personal = [...personalValues(plan.target, native)].filter(value => value.length >= 3);
  for (const movement of s.movements.filter(movement => plan.ids.has(movement.documentId) || kind === 'operator' && movement.actorId === id)) if (personal.some(value => movement.reason.includes(value))) plan.blockers.push({ code:'PRIVACY_STOCK_CONTENT', kind:'movements', id:movement.id, reason:'This immutable stock reason contains personal subject text. A dedicated provenance-content redaction is required before erasure.' });
  const legacy = await env.DB.prepare("SELECT id,data FROM pier_audit WHERE actor_id=? OR EXISTS(SELECT 1 FROM json_each(data,'$.documentIds') d JOIN json_each(?) i ON i.value=d.value)").bind(kind === 'operator' ? id : '',ids).all<{id:string;data:string}>();
  for (const event of legacy.results) if (personal.some(value => event.data.includes(value))) plan.blockers.push({ code:'PRIVACY_AUDIT_CONTENT', kind:'audit', id:event.id, reason:'This append-only input event contains personal subject text. A dedicated audit-content redaction is required before erasure.' });
  const custody = await env.DB.prepare(`SELECT (${noAgentCustody}) AS clear`).first<{clear:number}>();
  if (!custody?.clear) plan.blockers.push({code:'PRIVACY_AGENT_CUSTODY',kind:'agent-door',id,reason:'Retained agent arguments, outcomes and identity evidence require governed custody redaction and replay fences before native subject erasure.'});
  const remote = await env.DB.prepare(`SELECT (${noPendingProvider}) AND (${noPendingMail}) AND (${noActiveSync}) AS clear`).bind(ids,kind,id,ids,Date.now(),Date.now()).first<{ clear:number }>();
  if (!remote?.clear) plan.blockers.push({ code:'PRIVACY_REMOTE', kind:'provider', id, reason:'Reconcile unfinished provider attempts and uncertain or sending mail, and wait for active accounting and channel syncs to finish before erasure.' });
  if (native?.role === 'owner' && native.status === 'active') {
    const other = await env.DB.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active' AND id!=? LIMIT 1").bind(id).first();
    if (!other) plan.blockers.push({ code:'PRIVACY_OWNER', kind:'operator', id, reason:'The last active native owner cannot be erased.' });
  }
  plan.preview.allowed = !plan.holds.length && !plan.blockers.length;
  return { plan, native };
}
export function remoteGuards(env: Bindings, plan: Plan, kind: string, id: string): D1PreparedStatement[] {
  const ids = JSON.stringify([...plan.ids]);
  return [env.DB.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN (${noPendingProvider}) AND (${noPendingMail}) AND (${noActiveSync}) AND (${noAgentCustody}) THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(),ids,kind,id,ids,Date.now(),Date.now()),
    env.DB.prepare("UPDATE pier_mail_deliveries SET phase='revoked',error=NULL WHERE correspondence_id IN (SELECT value FROM json_each(?)) AND phase IN ('unavailable','failed','revoked')").bind(ids)];
}
