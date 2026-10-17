import { fail, fresh, get, requireRole, row, text, type Context, type Row } from './model';
import { email } from './purchasing-workflow';
import { reports } from './reports';
import { longDate, sender } from './business';
import { usdText } from './money';

const POLICY = 'slow-stock';
const activeRole = (c: Context, p: Row) => c.automationActors?.[p.approvedBy];
function notify(c: Context, exception: Row, policy: Row) {
  if (exception.messageId || !policy.enabled || !['owner', 'buyer'].includes(activeRole(c, policy) ?? '')) return;
  const profile = sender(c), item = get(c.s, 'items', exception.itemId), bin = get(c.s, 'locations', exception.locationId);
  const due = new Date(c.now), hour = due.getUTCHours();
  if (policy.quietStart !== policy.quietEnd && (policy.quietStart < policy.quietEnd ? hour >= policy.quietStart && hour < policy.quietEnd : hour >= policy.quietStart || hour < policy.quietEnd)) {
    if (hour >= policy.quietEnd) due.setUTCDate(due.getUTCDate() + 1);
    due.setUTCHours(policy.quietEnd, 0, 0, 0);
  }
  const message = row(c, 'correspondence', { kind: 'slow-stock', recordId: exception.id, recordVersion: exception.version,
    recipient: policy.recipient, subject: `${profile.name}: slow stock ${item.sku} at ${bin.warehouse} / ${bin.name}`,
    body: `${item.name} (${item.sku}) at ${bin.warehouse} / ${bin.name} needs a buyer decision.\nOwned stock: ${exception.quantity} ${item.unit}; value ${exception.value === null ? 'unknown' : usdText(exception.value)}.\nInactive since ${longDate(exception.inactiveSince.slice(0, 10))}; ${exception.inactiveDays} days without a sale shipment or transfer out.\n${exception.daysLeft > 0 ? `${exception.daysLeft} days left until the ${policy.deadDays}-day dead-stock threshold.` : `The ${policy.deadDays}-day dead-stock threshold has been reached.`}\nLast movement: ${exception.lastMovement ?? 'none recorded'}.\n${exception.flagReason ? `Buyer flagged early: ${exception.flagReason}\n` : ''}Next action: review demand, sell or transfer the stock, or record your decision in Pier Reports.\n${profile.name}`,
    approvedBy: policy.approvedBy, approvalRole: activeRole(c, policy), policyVersion: policy.version, dueAt: due.toISOString() });
  exception.messageId = message.id;
}
function open(c: Context, candidate: any, policy: Row, flagReason?: string) {
  let exception = c.s.slowStockExceptions.find(e => e.itemId === candidate.itemId && e.locationId === candidate.locationId && e.episode === candidate.episode);
  if (exception) return exception;
  exception = row(c, 'slowStockExceptions', { ...candidate, status: 'open', assigneeId: policy.approvedBy,
    dueAt: new Date(Date.parse(candidate.inactiveSince) + policy.deadDays * 86400000).toISOString(), daysLeft: Math.max(0, policy.deadDays - candidate.inactiveDays),
    nextAction: 'Review demand; sell or transfer the stock, or record a buyer decision.', policyVersion: policy.version,
    notificationEnabled: policy.enabled, flagReason: flagReason ?? null });
  return exception;
}

/** Called inside ordinary admission, so a sale and closure cannot separate. */
export function refreshSlowStock(c: Context, check = false) {
  const policy = c.s.slowStockPolicies[0];
  if (!policy || (!check && !c.s.slowStockExceptions.some(e => e.status === 'open'))) return;
  const recent = reports(c.s, new URLSearchParams(), c.now).inactivity;
  const current = new Map(recent.map(r => [`${r.itemId}:${r.locationId}`, r]));
  for (const exception of c.s.slowStockExceptions.filter(e => e.status === 'open')) {
    const latest = current.get(`${exception.itemId}:${exception.locationId}`);
    if (!latest || latest.episode !== exception.episode) {
      Object.assign(exception, { status: 'closed', closedAt: c.now, closure: latest?.lastOutId ? 'Stock sold or transferred' : 'No owned stock remains', closureMovementId: latest?.lastOutId ?? c.s.movements.filter(m => m.itemId === exception.itemId && m.locationId === exception.locationId).at(-1)?.id, notificationEnabled: false });
      exception.version++;
      continue;
    }
    const values = { quantity: latest.quantity, value: latest.value, inactiveDays: latest.inactiveDays, lastMovement: latest.lastMovement,
      daysLeft: Math.max(0, policy.deadDays - latest.inactiveDays), notificationEnabled: policy.enabled && exception.policyVersion === policy.version };
    if (Object.entries(values).some(([key, value]) => exception[key] !== value)) { Object.assign(exception, values); exception.version++; }
  }
  if (check && policy.enabled && ['owner', 'buyer'].includes(activeRole(c, policy) ?? '')) {
    for (const candidate of recent.filter(r => r.inactiveDays >= policy.warningDays && !c.s.slowStockExceptions.some(e => e.itemId === r.itemId && e.locationId === r.locationId && e.episode === r.episode)).slice(0, 25)) open(c, candidate, policy);
    for (const exception of c.s.slowStockExceptions.filter(e => e.status === 'open' && e.policyVersion === policy.version && !e.messageId).slice(0, 10)) notify(c, exception, policy);
  }
}

export function slowStock(c: Context, type: string, p: any): Row | undefined {
  if (!['slowStock.save', 'slowStock.check', 'slowStock.decide', 'slowStock.flag'].includes(type)) return;
  requireRole(c, ['buyer']);
  const policy = c.s.slowStockPolicies[0];
  if (type === 'slowStock.save') {
    if (policy) fresh(policy, p.version);
    else if (p.version !== 0) fail('STALE', 'Reload the current slow-stock settings.');
    const warningDays = Number(p.warningDays), deadDays = Number(p.deadDays), quietStart = Number(p.quietStart), quietEnd = Number(p.quietEnd);
    if (![warningDays, deadDays].every(n => Number.isInteger(n) && n >= 1 && n <= 36500) || warningDays >= deadDays) fail('POLICY', 'Choose whole warning days before the dead-stock threshold.');
    if (![quietStart, quietEnd].every(n => Number.isInteger(n) && n >= 0 && n <= 23)) fail('POLICY', 'Choose quiet-hour boundaries from 0 to 23 UTC; equal hours disable quiet time.');
    if (p.confirm !== true) fail('APPROVAL', 'Approve the destination, warning content and schedule.');
    sender(c);
    const data = { enabled: p.enabled === true, warningDays, deadDays, quietStart, quietEnd, recipient: email(p.recipient), approvedBy: c.actor.id, at: c.now };
    return policy ? Object.assign(policy, data, { version: policy.version + 1 }) : row(c, 'slowStockPolicies', { ...data, id: POLICY });
  }
  if (!policy) fail('POLICY', 'Save a slow-stock warning policy first.');
  if (type === 'slowStock.check') { refreshSlowStock(c, true); return policy; }
  if (type === 'slowStock.decide') {
    const exception = get(c.s, 'slowStockExceptions', p.exceptionId); fresh(exception, p.version);
    if (exception.status !== 'open') fail('EXCEPTION', 'This warning already has a closure.');
    Object.assign(exception, { status: 'closed', closedAt: c.now, closure: 'Buyer decision', decision: text(p.reason, 'Decision and next action'), decidedBy: c.actor.id, notificationEnabled: false });
    exception.version++; return exception;
  }
  if (!policy.enabled) fail('POLICY', 'Enable an approved warning policy before flagging stock.');
  const candidate = reports(c.s, new URLSearchParams(), c.now).inactivity.find(r => r.itemId === p.itemId && r.locationId === p.locationId);
  if (!candidate) fail('STOCK', 'Only an owned bin position can be flagged.');
  const exception = open(c, candidate, policy, text(p.reason, 'Why this stock needs early review'));
  notify(c, exception, policy);
  return exception;
}
