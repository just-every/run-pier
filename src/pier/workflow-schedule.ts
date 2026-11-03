import type { Bindings } from '../auth.server';
import { execute } from './api';
import { activeAutomationActors, load } from './storage';

export async function runWorkflowRules(env: Bindings, scheduledTime: number) {
  const state = await load(env.DB), actors = await activeAutomationActors(env.DB), now = new Date(scheduledTime).toISOString();
  for (const rule of state.workflowRules.filter(r => r.enabled && !r.killed && actors[r.approvedBy] === 'owner').slice(0, 10)) {
    const op = await env.DB.prepare(`SELECT version,display_name FROM oa_operators WHERE id=? AND status='active'`).bind(rule.approvedBy).first<any>();
    if (!op) continue;
    const actor = { id: rule.approvedBy, role: 'owner', name: op.display_name, operatorVersion: op.version, sessionId: 'workflow-policy' };
    const policy = { collection: 'workflowRules' as const, id: rule.id, version: rule.version };
    const run = (type: string, payload: object) => execute(env, actor, 'workflow-' + crypto.randomUUID(), type, { ruleId: rule.id, ...payload }, () => now, policy);
    await run('workflow.recover', {});
    let job = (await run('workflow.enqueue', {})).result;
    if (job.status !== 'pending') continue;
    job = (await run('workflow.claim', { jobId: job.id, version: job.version })).result;
    if (job.status === 'running') await run('workflow.finish', { jobId: job.id, version: job.version });
  }
}
