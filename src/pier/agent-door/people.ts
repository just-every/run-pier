import { operatorAuthPeople, ToolRefusal, type Person, type PeopleAdapter, type ToolContext } from '../../modules/agent-door/index.ts';
import { operatorAuth, authConfig, type Bindings } from '../../auth.server';
import { requireAssurance } from '../../strong-auth/assurance';
import type { Actor } from '../model';
import { authority } from '../storage';

export async function nativeActor(env: Bindings, person: Person, ctx?: ToolContext): Promise<Actor> {
  const native = await env.DB.prepare(`SELECT o.version, o.role AS operatorRole, r.data FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active'`).bind(person.id).first<{version:number;operatorRole:string;data:string|null}>();
  if (!native || !person.active) throw new ToolRefusal('sponsor_inactive');
  const role = native.data ? JSON.parse(native.data) : null;
  const actor: Actor = { id: person.id, name: ctx?.actor.label ?? person.name, sessionId: '', operatorVersion: native.version,
    role: role?.role ?? (native.operatorRole === 'owner' ? 'owner' : 'viewer'), permissionVersion: role?.version ?? 0, permissions: role?.permissions, visibility: role?.visibility };
  if (ctx) {
    if (!ctx.consent) throw new ToolRefusal('consent_required');
    const state = await env.DB.prepare('SELECT envelope,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string;local_revision:number}>();
    if (!state?.envelope) throw new ToolRefusal('policy_unset');
    actor.agent = { id: ctx.agent.id, name: ctx.agent.name, sponsorName: person.name, consent: ctx.consent, envelope: state.envelope, localRevision: state.local_revision };
    const gate = authority(actor);
    if (!(await env.DB.prepare(`SELECT (${gate.sql}) AS ok`).bind(...gate.params).first<{ok:number}>())?.ok) throw new ToolRefusal('native_authority_required');
  }
  return actor;
}

export function pierPeople(env: Bindings): PeopleAdapter {
  const base = operatorAuthPeople({db:env.DB, allowList:authConfig(env).allowList, session: request => operatorAuth(env).getSession(request)});
  const policyRoles = new Map<string,'owner'|'editor'|null>();
  async function policyRole(person: Person) {
    const member = await base.businessMember!(person);
    const paired = !!env.RER_OWNER_CLAIM_PUBLIC_KEYS;
    policyRoles.set(person.id, member?.role ?? (!paired && person.role === 'owner' ? 'owner' : null));
  }
  async function project(person: Person | null) {
    if (!person) return null;
    if (!person.active) return person;
    await policyRole(person);
    const actor = await nativeActor(env, person);
    const required = await env.DB.prepare('SELECT required FROM pier_strong_policy WHERE id=1').first<{required:number}>();
    return { ...person, role: actor.role, active: person.active && !required?.required && (!actor.permissions?.expiresAt || actor.permissions.expiresAt > new Date().toISOString()) };
  }
  return {
    businessRole: person => policyRoles.get(person.id) ?? null,
    sponsor: async claims => project(await base.sponsor(claims)),
    person: async id => project(await base.person(id)),
    businessMember: person => base.businessMember!(person),
    async session(request) {
      const session = await operatorAuth(env).getSession(request);
      if (!session) return null;
      try { await requireAssurance(env, session.id, session.operator.id); } catch { return null; }
      const person = await base.person(session.operator.id);
      if (!person?.active) return null;
      await policyRole(person);
      const actor = await nativeActor(env, person);
      return { ...person, role: actor.role };
    },
  };
}
