import { nativeSession, factorProofSql, grantSql, boundedHumanSql, grantOperation } from './delegation';
import { operatorAuth, type Bindings } from '../auth.server';
import type { Session } from '../modules/operator-auth/index.mjs';
import { Problem } from '../pier/model';
import { newSecret, matchingStep, open, seal } from './totp';
import { securityPage } from './screen';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
const reject = (code: string, message: string, status = 403): never => { throw new Problem(code, message, null, status); };
const sessionSql = `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.version=? AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>? AND o.status='active')`;
export async function securityState(env: Bindings, session: Session) {
  const required = !!(await env.DB.prepare('SELECT required FROM pier_strong_policy WHERE id=1').first<{required: number}>())?.required;
  const user = await env.DB.prepare('SELECT restore_paused FROM pier_strong_users WHERE operator_id=?').bind(session.operator.id).first<{restore_paused: number}>();
  const factor = await env.DB.prepare('SELECT confirmed FROM pier_strong_factors WHERE operator_id=?').bind(session.operator.id).first<{confirmed: number}>();
  const verified = !!(await env.DB.prepare('SELECT 1 AS ok FROM pier_strong_proofs p JOIN pier_strong_users u ON u.operator_id=p.operator_id JOIN pier_strong_factors f ON f.operator_id=u.operator_id WHERE p.session_id=? AND p.operator_id=? AND p.generation=u.generation AND f.generation=u.generation AND f.confirmed=1 AND u.restore_paused=0').bind(session.id, session.operator.id).first());
  const owner = session.operator.role === 'owner' && nativeSession(session);
  const grants = nativeSession(session) && verified ? (await env.DB.prepare("SELECT g.*,d.display_name AS delegate_name,t.display_name AS target_name FROM pier_security_grants g JOIN oa_operators d ON d.id=g.delegate_id JOIN oa_operators t ON t.id=g.target_id WHERE g.revoked_at IS NULL AND g.expires_at>? AND (?=1 OR g.delegate_id=?) ORDER BY g.created_at DESC").bind(Date.now(),owner ? 1 : 0,session.operator.id).all()).results : [];
  const manageable = owner && verified;
  const sessions = manageable ? (await env.DB.prepare("SELECT s.id,s.operator_id,s.kind,s.created_at,o.display_name FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.revoked_at IS NULL AND s.expires_at>? AND o.status='active' AND s.operator_version=o.version ORDER BY s.created_at DESC").bind(Date.now()).all()).results : [];
  const operators = manageable ? (await env.DB.prepare("SELECT id,display_name,status,role FROM oa_operators ORDER BY created_at").all()).results : [];
  const audit = manageable ? (await env.DB.prepare('SELECT * FROM pier_strong_audit ORDER BY created_at DESC,id DESC LIMIT 100').all()).results : [];
  return { grants, delegated: !owner && nativeSession(session) && verified && grants.length>0, operatorId: session.operator.id, required, enrolled: !!factor?.confirmed, verified, owner, manageable, restorePaused: !!user?.restore_paused, sessions, operators, audit };
}
async function perform(env: Bindings, session: Session, action: string, input: Record<string, string>) {
  const db = env.DB, id = session.operator.id, now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const guard = (sql: string, params: unknown[] = []) => statements.push(db.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN (${sql}) THEN 1 ELSE 0 END)`).bind(crypto.randomUUID(), ...params));
  guard(sessionSql, [session.id, id, session.operator.version, now]);
  const audit = (target: string, verb: string, reason = '') => statements.push(db.prepare('INSERT INTO pier_strong_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), id, target, verb, reason, now));
  let secret: string | undefined;
  if (action === 'enroll') {
    const existing = await db.prepare('SELECT confirmed FROM pier_strong_factors WHERE operator_id=?').bind(id).first<{confirmed: number}>();
    if (existing?.confirmed) reject('ENROLLED', 'An owner must authorize recovery before replacing an enrolled factor.');
    const user = await db.prepare('SELECT restore_paused FROM pier_strong_users WHERE operator_id=?').bind(id).first<{restore_paused: number}>();
    if (user?.restore_paused) reject('RESTORE_RECOVERY', 'Fresh native owner recovery is required after restore.');
    secret = newSecret();
    statements.push(db.prepare('INSERT INTO pier_strong_users(operator_id) VALUES(?) ON CONFLICT DO NOTHING').bind(id));
    guard('NOT EXISTS(SELECT 1 FROM pier_strong_factors WHERE operator_id=? AND confirmed=1) AND NOT EXISTS(SELECT 1 FROM pier_strong_users WHERE operator_id=? AND restore_paused=1)', [id,id]);
    statements.push(db.prepare('INSERT INTO pier_strong_factors(operator_id,secret,generation,enrollment_session,expires_at) SELECT ?,?,generation,?,? FROM pier_strong_users WHERE operator_id=? ON CONFLICT(operator_id) DO UPDATE SET secret=excluded.secret,generation=excluded.generation,enrollment_session=excluded.enrollment_session,expires_at=excluded.expires_at,used_step=-1').bind(id, await seal(env,id,secret), session.id, now+600000,id));
    audit(id,'factor.enrollment-started');
  } else if (action === 'verify') {
    // The account-wide attempt counter is durable across sessions and restarts.
    const window = Math.floor(now / 300000);
    const attempt = await db.prepare('INSERT INTO pier_strong_attempts VALUES(?,?,1) ON CONFLICT(operator_id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END RETURNING attempts').bind(id,window).first<{attempts: number}>();
    if (!attempt || attempt.attempts > 5) reject('RATE_LIMIT', 'Too many codes. Wait five minutes before trying again.',429);
    const factor = await db.prepare('SELECT * FROM pier_strong_factors WHERE operator_id=?').bind(id).first<any>();
    if (!factor || !factor.confirmed && (factor.enrollment_session !== session.id || factor.expires_at <= now)) reject('ENROLLMENT', 'Start enrollment again in this session.',409);
    let step: number | null = null;
    try { step = await matchingStep(await open(env,id,factor.secret), input.code ?? '',now); } catch { reject('FACTOR_UNAVAILABLE','The factor is unavailable. Ask a native owner for recovery.'); }
    if (step === null || step <= factor.used_step) {
      audit(id,'factor.verification-refused');
      statements.push(db.prepare('DELETE FROM pier_guard')); await db.batch(statements);
      reject('FACTOR_CODE','The code is invalid or has already been used. Wait for a new code.',409);
    }
    statements.push(db.prepare('UPDATE pier_strong_factors SET confirmed=1,used_step=? WHERE operator_id=? AND secret=? AND generation=? AND used_step<? AND EXISTS(SELECT 1 FROM pier_strong_users WHERE operator_id=? AND generation=? AND restore_paused=0)').bind(step,id,factor.secret,factor.generation,step,id,factor.generation));
    guard('changes()=1');
    statements.push(db.prepare('INSERT INTO pier_strong_proofs VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET generation=excluded.generation,verified_at=excluded.verified_at').bind(session.id,id,factor.generation,now));
    audit(id,'factor.verified');
  } else {
    const owner = session.operator.role === 'owner' && nativeSession(session);
    const delegated = !owner && nativeSession(session) && ['recover','revoke','deactivate'].includes(action);
    if (!owner && !delegated) reject('OWNER','A current native owner must authorize this action.');
    if (delegated && !await db.prepare('SELECT 1 FROM pier_security_grants WHERE id=? AND delegate_id=? AND target_id=?').bind(input.grantId ?? '',id,input.operatorId ?? '').first()) reject('GRANT','A named human security grant is required for this target.');
    const restoredSelf = owner && action === 'recover' && input.operatorId === id && !!(await db.prepare('SELECT 1 FROM pier_strong_users WHERE operator_id=? AND restore_paused=1').bind(id).first());
    // Restore recovery is the explicit fresh-owner door; it grants no stock access.
    if (restoredSelf) guard("EXISTS(SELECT 1 FROM pier_strong_users WHERE operator_id=? AND restore_paused=1)",[id]);
    else guard(factorProofSql,[session.id,id]);
    if (owner) guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[id]);
    else {
      if(input.operatorId===id) reject('SELF','A security grant cannot authorize live self-recovery or self-administration.');
      guard(grantSql,[input.grantId ?? '',id,input.operatorId ?? '']);
    }
    if (action === 'require') {
      statements.push(db.prepare('UPDATE pier_strong_policy SET required=1 WHERE id=1')); audit(id,'factor.required');
    } else if (action === 'prepare-owner') {
      const target=String(input.operatorId ?? '');
      if(input.confirm!=='yes') reject('CONFIRM','Confirm full native owner authority for this person.',400);
      guard(boundedHumanSql('?'),[target]);
      statements.push(db.prepare("UPDATE oa_operators SET role='owner' WHERE id=?").bind(target));
      statements.push(db.prepare('DELETE FROM pier_strong_proofs WHERE operator_id=?').bind(target));
      audit(target,'owner.prepared');
    } else if (action === 'grant' || action === 'ungrant') {
      const target = await grantOperation(env,session,action,input,statements);
      audit(target,'security.'+action);
    } else {
      const target = String(input.operatorId ?? '');
      const operator = await db.prepare('SELECT id,role,status FROM oa_operators WHERE id=?').bind(target).first<any>();
      if (!operator) reject('TARGET','Choose a current operator.',404);
      if (delegated) guard(boundedHumanSql('?'),[target]);
      const reason = String(input.reason ?? '').trim();
      if (reason.length < 8 || reason.length > 300 || /[\x00-\x1f]/.test(reason)) reject('REASON','Give a recovery or revocation reason of 8 to 300 characters.',400);
      if (action === 'recover') {
        if (target === id && !restoredSelf) reject('RECOVERY_OWNER','Another assured native owner must recover your lost factor.');
        statements.push(db.prepare('INSERT INTO pier_strong_users(operator_id,generation) VALUES(?,1) ON CONFLICT(operator_id) DO UPDATE SET generation=generation+1,restore_paused=0').bind(target));
        statements.push(db.prepare('DELETE FROM pier_strong_factors WHERE operator_id=?').bind(target),db.prepare('DELETE FROM pier_strong_proofs WHERE operator_id=?').bind(target));
        statements.push(db.prepare('DELETE FROM pier_strong_attempts WHERE operator_id=?').bind(target));
      } else if (action === 'reactivate') {
        statements.push(db.prepare("UPDATE oa_operators SET status='active' WHERE id=? AND status='inactive'").bind(target));
        guard('changes()=1');
      } else if (action === 'deactivate') {
        if (target === id) reject('SELF','A different native owner must deprovision this identity.');
        statements.push(db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(target));
      } else if (action !== 'revoke') reject('ACTION','Unknown security action.',400);
      if (action === 'revoke' && input.sessionId) {
        guard('EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND operator_id=?)',[input.sessionId,target]);
        statements.push(db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=? AND operator_id=?').bind(now,input.sessionId,target));
      } else {
        statements.push(db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE operator_id=? AND id!=?').bind(now,target,restoredSelf ? session.id : ''));
        statements.push(db.prepare('UPDATE oa_tokens SET revoked_at=? WHERE operator_id=?').bind(now,target),db.prepare('UPDATE oa_credentials SET revoked_at=? WHERE operator_id=?').bind(now,target));
      }
      audit(target, 'factor.'+action,reason);
    }
  }
  statements.push(db.prepare('DELETE FROM pier_guard'));
  try { await db.batch(statements); } catch { reject('AUTH_CHANGED','Current authority changed. Reload Security before trying again.',409); }
  return secret;
}
export async function strongAuthResponse(request: Request, env: Bindings): Promise<Response | null> {
  const url = new URL(request.url), page = url.pathname === '/security';
  const legacyRevoke=url.pathname==='/auth/session/revoke', legacyStatus=url.pathname==='/auth/operator/status';
  if (!page && !legacyRevoke && !legacyStatus && !url.pathname.startsWith('/auth/strong-auth/')) return null;
  const session = await operatorAuth(env).getSession(request);
  if (!session) return page ? new Response(null,{status:303,headers:{location:'/signin'}}) : json({error:'AUTH'},401);
  let secret: string | undefined, notice = '', error = '', status = 200;
  try {
    if (!['GET','POST'].includes(request.method)) reject('METHOD','Use a Security form.',405);
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== new URL(env.AUTH_ORIGIN).origin) reject('ORIGIN','Use this installation’s Security page.');
      const raw = await request.text(); if (raw.length > 8192) reject('INPUT','Security request is too large.',413);
      const input = request.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      if(legacyRevoke){const target=await env.DB.prepare('SELECT operator_id FROM oa_sessions WHERE id=?').bind(input.sessionId ?? '').first<{operator_id:string}>();input.operatorId=target?.operator_id ?? '';input.reason=input.reason ?? 'Native session revocation requested';}
      if(legacyStatus){if(!['active','inactive'].includes(input.status)) reject('STATUS','Choose an active or inactive status.',400);input.reason=input.reason ?? 'Native operator status change requested';}
      secret = await perform(env, session, legacyRevoke ? 'revoke' : legacyStatus ? input.status==='active' ? 'reactivate' : 'deactivate' : page ? input.action : url.pathname.split('/').pop()!,input);
      notice = secret ? 'Add this secret to your authenticator, then verify its current code.' : 'Security change saved.';
    } else if (!page && url.pathname !== '/auth/strong-auth/status') reject('METHOD','Submit this action with POST.',405);
  } catch (failure) {
    status = failure instanceof Problem ? failure.status : 400;
    if (!page) return json({error: failure instanceof Problem ? failure.code : 'INPUT', message: failure instanceof Problem ? failure.message : 'Check your Security request.'},status);
    error = failure instanceof Problem ? failure.message : 'Check your Security request.';
  }
  const state = await securityState(env,session);
  return page ? securityPage(state,{secret,notice,error,status}) : json({...state,...(secret ? {secret} : {})},status);
}
