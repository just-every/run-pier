import type { Bindings } from '../auth.server';
import { Problem } from '../pier/model';
// Re-evaluated inside the stock transaction as well as before private reads.
export const assuranceSql = (session = '?', operator = '?') => `(NOT EXISTS(SELECT 1 FROM pier_strong_policy WHERE id=1 AND required=1) OR EXISTS(SELECT 1 FROM pier_strong_proofs p JOIN pier_strong_users u ON u.operator_id=p.operator_id JOIN pier_strong_factors f ON f.operator_id=u.operator_id WHERE p.session_id=${session} AND p.operator_id=${operator} AND p.generation=u.generation AND f.generation=u.generation AND f.confirmed=1 AND u.restore_paused=0))`;
export async function assured(env: Bindings, sessionId: string, operatorId: string) {
  return !!(await env.DB.prepare(`SELECT CASE WHEN ${assuranceSql()} THEN 1 ELSE 0 END AS ok`).bind(sessionId, operatorId).first<{ok: number}>())?.ok;
}
export async function requireAssurance(env: Bindings, sessionId: string, operatorId: string) {
  if (!await assured(env, sessionId, operatorId)) throw new Problem('FACTOR_REQUIRED', 'Verify your authenticator on the Security page before opening private records.', null, 403);
}
