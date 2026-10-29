import type { Actor } from '../model';

/** Native effect fence for an admitted company agent. No person session is minted. */
export function agentAuthority(actor: Actor) {
  const agent = actor.agent!;
  return {
    sql: `NOT EXISTS(SELECT 1 FROM pier_strong_policy WHERE id=1 AND required=1)
      AND EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id
        WHERE o.id=? AND o.version=? AND o.status='active'
        AND CASE WHEN r.data IS NOT NULL THEN json_extract(r.data,'$.role') WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END=?
        AND COALESCE(r.version,0)=?
        AND (json_extract(r.data,'$.permissions.expiresAt') IS NULL OR json_extract(r.data,'$.permissions.expiresAt')>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      AND EXISTS(SELECT 1 FROM agent_door_state WHERE id=1 AND envelope=? AND local_revision=? AND local_paused=0
        AND COALESCE(json_extract(envelope,'$.paused'),1)=0 AND json_extract(envelope,'$.exp')>unixepoch()
        AND NOT EXISTS(SELECT 1 FROM json_each(envelope,'$.revoked.agents') WHERE value=?)
        AND NOT EXISTS(SELECT 1 FROM json_each(envelope,'$.revoked.consents') WHERE value=?))
      AND NOT EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND revoked=1)
      AND EXISTS(SELECT 1 FROM bs_settings WHERE singleton=1 AND stopped=0 AND (owner_id IS NOT NULL AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner')
        OR EXISTS(SELECT 1 FROM bs_team WHERE operator_id=? AND business_id IS NOT NULL AND state='active')))`,
    params: [actor.id, actor.operatorVersion, actor.role, actor.permissionVersion ?? 0,
      agent.envelope, agent.localRevision, agent.id, agent.consent, agent.id, actor.id, actor.id],
  };
}
