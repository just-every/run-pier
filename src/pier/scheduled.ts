import { runRecurringSchedule } from './recurring-schedule';
import type { Bindings } from '../auth.server';
import { syncBooks } from './books/sync';
import { syncChannels } from './channels/sync';
import { load, activeAutomationActors } from './storage';
import { execute } from './api';
import { deliverCorrespondence } from './correspondence-delivery';
import { forecast } from './replenishment';
import { backorderDates } from './backorders';

/** Bounded cron work, always tied to a still-active human's exact policy. */
export async function runReplenishmentSchedule(env: Bindings, scheduledTime = Date.now()) {
  await Promise.allSettled([syncChannels(env),syncBooks(env)]);
  const actors = await activeAutomationActors(env.DB), s = await load(env.DB);
  const now = new Date(scheduledTime).toISOString(), slot = Math.floor(Date.parse(now) / 900000);
  const context = { s, now, commandId: '', actor: { id: '', role: 'viewer', name: 'Scheduled planning', sessionId: '', operatorVersion: 0 } };
  const low = forecast(context);
  const pending = [
    ...s.slowStockPolicies.filter(p => p.enabled).map(p => ({ collection: 'slowStockPolicies' as const, id: p.id, version: p.version, approvedBy: p.approvedBy })),
    ...s.purchaseOrders.filter(po => po.sendPolicy?.enabled && !po.sendPolicy.messageId && po.sendPolicy.expiresAt > now).map(po => ({ collection: 'purchaseOrders' as const, id: po.id, version: po.sendPolicy.version, approvedBy: po.sendPolicy.approvedBy })),
    ...s.replenishmentPolicies.filter(p => p.autoDraft && low.some((r: any) => r.policyId === p.id && Number(r.remainingSuggestion ?? r.suggestedQuantity ?? r.suggested ?? 0) > 0)).map(p => ({ collection: 'replenishmentPolicies' as const, id: p.id, version: p.version, approvedBy: p.approvedBy })),
    ...backorderDates(context).filter(r => r.needsRepromise && s.orders.find(o => o.id === r.orderId)?.promisePolicy?.enabled).map(r => {
      const o = s.orders.find(o => o.id === r.orderId)!;
      return { collection: 'orders' as const, id: o.id, version: o.promisePolicy.version, approvedBy: o.promisePolicy.approvedBy };
    }),
  ].slice(0, 10);
  for (const policy of pending) {
    const role = actors[policy.approvedBy];
    if (!role || !['owner', 'buyer', ...(policy.collection === 'orders' ? ['operator'] : [])].includes(role)) continue;
    const operator = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(policy.approvedBy).first<any>();
    if (!operator) continue;
    await execute(env, { id: policy.approvedBy, role, name: operator.display_name, sessionId: 'scheduled-policy', operatorVersion: operator.version }, `schedule-${policy.id}-${policy.version}-${slot}`, 'automation.tick', {}, () => now, policy);
  }
  await runRecurringSchedule(env,scheduledTime);
  return deliverCorrespondence(env, now);
}
