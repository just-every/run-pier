import type { Bindings } from '../auth.server';
import { sha256 } from './import-kit';
import { fail, type Context } from './model';
import type { NativeSubject } from './privacy-plan';

export function eraseNativeIdentity(c: Context, env: Bindings, target: NativeSubject): D1PreparedStatement[] {
  if (target.id === c.actor.id) fail('PRIVACY_OWNER', 'An owner cannot erase their own current identity. Another owner must review and confirm it.');
  const db = env.DB, id = target.id;
  const affectedSessions = `SELECT id FROM oa_sessions WHERE operator_id=? OR source_token_id IN (SELECT id FROM oa_tokens WHERE issuer_id=?)`;
  const statements = [db.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND email=? AND display_name=? AND role=? AND status=?) AND
    (?!='owner' OR ?!='active' OR EXISTS(SELECT 1 FROM oa_operators WHERE id!=? AND role='owner' AND status='active')) THEN 1 ELSE 0 END)`)
    .bind(crypto.randomUUID(),id,target.version,target.email,target.display_name,target.role,target.status,target.role,target.status,id)];
  for (const table of ['oa_provider_sessions','oa_provider_session_pins','oa_step_up_challenges']) statements.push(db.prepare(`DELETE FROM ${table} WHERE session_id IN (${affectedSessions})`).bind(id,id));
  statements.push(db.prepare("DELETE FROM oa_dev_credentials WHERE (credential='oa_sessions' AND id IN (" + affectedSessions + ")) OR (credential='oa_tokens' AND id IN (SELECT id FROM oa_tokens WHERE operator_id=? OR issuer_id=?)) OR (credential='oa_credentials' AND id IN (SELECT id FROM oa_credentials WHERE operator_id=?))").bind(id,id,id,id,id));
  statements.push(db.prepare(`DELETE FROM oa_sessions WHERE operator_id=? OR source_token_id IN (SELECT id FROM oa_tokens WHERE issuer_id=?)`).bind(id,id),
    db.prepare('DELETE FROM oa_tokens WHERE operator_id=? OR issuer_id=?').bind(id,id),
    db.prepare('DELETE FROM oa_step_up_challenges WHERE operator_id=?').bind(id),
    db.prepare('DELETE FROM oa_owner_signins WHERE operator_id=?').bind(id),
    db.prepare('DELETE FROM oa_credentials WHERE operator_id=?').bind(id),
    db.prepare("UPDATE oc_idp_grants SET subject=? WHERE EXISTS(SELECT 1 FROM oa_external_identities identity WHERE identity.operator_id=? AND identity.issuer=oc_idp_grants.issuer AND identity.subject=oc_idp_grants.subject)").bind(`erased-${sha256(id)}`,id),
    db.prepare('DELETE FROM oa_external_identities WHERE operator_id=?').bind(id),
    db.prepare('UPDATE oc_owner_claims SET email=? WHERE operator_id=?').bind(`erased-${sha256(id)}@anonymous.invalid`,id),
    db.prepare('DELETE FROM oa_setup_links WHERE owner_id=?').bind(id),
    // Native operator and cancellation identities remain opaque provenance.
    db.prepare("UPDATE oa_operators SET email=?,display_name='Anonymous operator',status='inactive',role='member',version=version+1 WHERE id=?")
      .bind(`erased-${sha256(id)}@anonymous.invalid`,id));
  return statements;
}
