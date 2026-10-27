import type { Bindings } from '../auth.server';
import type { Session } from '../modules/operator-auth/index.mjs';
import { Problem } from '../pier/model';
export const nativeSession = (session: Session) => ['native', 'password', 'dev'].includes(session.kind);
export const factorProofSql = `EXISTS(SELECT 1 FROM pier_strong_proofs p JOIN pier_strong_users u ON u.operator_id=p.operator_id JOIN pier_strong_factors f ON f.operator_id=u.operator_id WHERE p.session_id=? AND p.operator_id=? AND p.generation=u.generation AND f.generation=u.generation AND f.confirmed=1 AND u.restore_paused=0)`;
// A business agent or owner cannot become a delegated administrator or target.
export const boundedHumanSql = (operator: string) => `EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=${operator} AND o.status='active' AND o.role IN ('admin','member') AND NOT EXISTS(SELECT 1 FROM pier_records r WHERE r.kind='roles' AND r.id=o.id AND json_extract(r.data,'$.role') IN ('owner','agent')))`;
export const grantSql = `EXISTS(SELECT 1 FROM pier_security_grants g JOIN oa_operators issuer ON issuer.id=g.issuer_id JOIN oa_operators delegate ON delegate.id=g.delegate_id WHERE g.id=? AND g.delegate_id=? AND g.target_id=? AND g.revoked_at IS NULL AND g.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND issuer.role='owner' AND issuer.status='active' AND issuer.version=g.issuer_version AND delegate.version=g.delegate_version AND ${boundedHumanSql('g.delegate_id')} AND ${boundedHumanSql('g.target_id')} AND g.delegate_id!=g.target_id)`;
export async function grantOperation(env: Bindings, session: Session, action: string, input: Record<string,string>, statements: D1PreparedStatement[]) {
  const db=env.DB, now=Date.now();
  if(action==='grant') {
    const delegate=await db.prepare("SELECT id,version FROM oa_operators WHERE id=?").bind(input.delegateId ?? '').first<{id:string;version:number}>();
    const target=String(input.operatorId ?? ''), duration=Number(input.minutes);
    if(!delegate || !Number.isInteger(duration) || duration<1 || duration>1440) throw new Problem('GRANT','Choose a named human administrator, target and duration from 1 to 1440 minutes.',null,400);
    statements.push(db.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN ${boundedHumanSql('?')} AND ${boundedHumanSql('?')} AND ?!=? THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(),delegate.id,target,delegate.id,target));
    statements.push(db.prepare('INSERT INTO pier_security_grants VALUES(?,?,?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(),session.operator.id,session.operator.version,delegate.id,delegate.version,target,now+duration*60000,now));
    return target;
  }
  const grant=await db.prepare('SELECT target_id FROM pier_security_grants WHERE id=?').bind(input.grantId ?? '').first<{target_id:string}>();
  if(!grant) throw new Problem('GRANT','Choose an existing security grant.',null,404);
  statements.push(db.prepare('UPDATE pier_security_grants SET revoked_at=? WHERE id=?').bind(now,input.grantId));
  return grant.target_id;
}
