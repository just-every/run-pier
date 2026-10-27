import { decimal, fail, fresh, get, movementFrontier, requireRole, row, text, type Context, type Row } from './model';
import { receiptBookViews } from './books/receipt-closure';

const policyId = 'operational-exceptions';
const currentOwner = (c: Context, id: string) => c.automationActors?.[id] === 'owner' &&
  (c.s.roles.find(role => role.id === id)?.role ?? 'owner') === 'owner';

function lateDelivery(order: Row, today: string) {
  if (order.status === 'cancelled' || order.documentType === 'quote' && !order.acceptedAt) return false;
  return order.lines.some((line: Row) => {
    const outstanding = decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled);
    const repromised = line.backorderPromiseDate ? decimal(line.backorderPromisedQuantity ?? '0') : 0n;
    return outstanding > 0n && (
      outstanding > repromised && order.promiseDate && order.promiseDate < today ||
      repromised > 0n && line.backorderPromiseDate < today);
  });
}
function owner(c: Context, value: unknown) {
  const id = text(value, 'Assigned owner');
  if (!currentOwner(c, id)) fail('EXCEPTION_OWNER', 'Choose a current unrestricted owner.');
  return id;
}
function due(value: unknown) {
  const at = text(value, 'Due date');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at) || !Number.isFinite(Date.parse(at))) fail('DATE', 'Choose a valid due date and time.');
  return new Date(at).toISOString();
}
function event(c: Context, record: Row, kind: string, detail: any = {}) {
  record.history.push({ kind, at: c.now, actorId: c.actor.id, commandId: c.commandId, ...detail });
  record.version++;
}

/** Current stock and completed readback must agree; a retained green result alone is insufficient. */
export function operationalEvidence(c: Context, record: Row) {
  const connection = c.s.bookConnections.find(r => r.enabled && !r.problem && currentOwner(c, r.approvedBy));
  const reconciliation = c.s.bookJobs.find(r => r.key === 'inventory-reconciliation');
  const policy = c.s.operationalExceptionPolicies[0];
  const policyAuthority = !!policy && currentOwner(c, policy.approvedBy);
  const ledger = policyAuthority && c.booksCredentialPresent === true && !!connection?.lastSync && reconciliation?.status === 'reconciled' &&
    reconciliation.connectionVersion === connection.version && reconciliation.movementSequence === movementFrontier(c.s) &&
    reconciliation.checkedAt <= connection.lastSync;
  const current = (jobs: Row[]) => jobs.length > 0 && jobs.every(job => job.remoteId && job.checkedAt && job.checkedAt <= connection?.lastSync && ['posted', 'reconciled'].includes(job.status));
  let ready = false, reason = '', source: any;
  if (record.kind === 'overdue-po-confirmation') {
    const po = c.s.purchaseOrders.find(r => r.id === record.sourceId);
    const receipts = c.s.receipts.filter(r => r.poId === po?.id && r.status === 'posted');
    const closures = receiptBookViews(c.s, !!connection).filter(r => receipts.some(receipt => receipt.id === r.id));
    const complete = !!po && !!po.approval && !po.pendingSupplierChange && po.status === 'committed' && po.lines.every((line: Row) => decimal(line.received) >= decimal(line.quantity));
    ready = complete && receipts.length > 0 && closures.length === receipts.length && closures.every(r => r.status === 'closed');
    const jobs = c.s.bookJobs.filter(job => closures.some(r => r.jobIds.includes(job.id)));
    ready &&= current(jobs);
    reason = !complete ? 'Complete the actual purchase receipt.' : !ready ? 'Reconcile every receipt and supplier payment in Pantry.' : '';
    source = { promise: record.promise, confirmation: po?.confirmation ?? null, receiptIds: receipts.map(r => r.id), receiptClosures: closures, jobIds: jobs.map(r => r.id) };
  } else {
    const order = c.s.orders.find(r => r.id === record.sourceId);
    const shipments = c.s.shipments.filter(r => r.orderId === order?.id);
    const jobs = c.s.bookJobs.filter(job => job.sourceKind === 'order' && job.sourceId === order?.id && job.kind === 'invoice' || job.kind === 'journal' && shipments.some(sh => job.key === `cogs:${sh.id}`));
    const complete = !!order && order.lines.every((line: Row) => decimal(line.dispatched) >= decimal(line.quantity));
    const returned = c.s.returns.some(r => shipments.some(sh => sh.id === r.shipmentId));
    ready = complete && shipments.length > 0 && !returned && current(jobs) && jobs.some(r => r.kind === 'invoice') && jobs.filter(r => r.kind === 'invoice').every(r => r.status === 'reconciled' && r.open === '0.00') && shipments.every(sh => jobs.some(j => j.kind === 'journal' && j.key === `cogs:${sh.id}`));
    reason = !complete ? 'Complete the actual customer shipment.' : returned ? 'Review the returned shipment and its ledger correction.' : !ready ? 'Reconcile the shipment, customer payment and cost journal in Pantry.' : '';
    source = { promise: record.promise, promiseHistory: order?.promiseHistory ?? [], shipmentIds: shipments.map(r => r.id), jobIds: jobs.map(r => r.id) };
  }
  if (!ledger) reason = 'Check Pantry: current inventory reconciliation and owner authority are required.';
  if (!policyAuthority) reason = 'A current owner must review and reapprove the case policy.';
  return { ready: ready && ledger, reason, ...source, reconciliation: reconciliation ? { id: reconciliation.id, status: reconciliation.status, checkedAt: reconciliation.checkedAt, movementSequence: reconciliation.movementSequence, connectionVersion: reconciliation.connectionVersion } : null, checkedAt: c.now };
}

/** No correspondence is created here. Existing exact human message approvals remain separate. */
export function refreshOperationalExceptions(c: Context, check = false) {
  const policy = c.s.operationalExceptionPolicies[0];
  if (check && policy?.enabled && currentOwner(c, policy.approvedBy)) {
    const today = c.now.slice(0, 10);
    const candidates = [
      ...c.s.purchaseOrders.filter(po => po.status === 'committed' && !po.confirmation && po.promiseDate < today && po.lines.some((line: Row) => decimal(line.received) < decimal(line.quantity))).map(po => ({ kind: 'overdue-po-confirmation', source: po })),
      ...c.s.orders.filter(order => lateDelivery(order, today)).map(order => ({ kind: 'late-customer-delivery', source: order })),
    ];
    for (const { kind, source } of candidates) {
      if (c.s.operationalExceptions.some(r => r.kind === kind && r.sourceId === source.id)) continue;
      row(c, 'operationalExceptions', { kind, sourceId: source.id, reference: source.reference, status: 'open',
        promise: { date: source.promiseDate, approval: source.approval ?? null, history: structuredClone(source.promiseHistory ?? []) },
        assigneeId: currentOwner(c, policy.assigneeId) ? policy.assigneeId : null, dueAt: new Date(Date.parse(c.now) + policy.dueHours * 3_600_000).toISOString(),
        escalationOwnerId: currentOwner(c, policy.escalationOwnerId) ? policy.escalationOwnerId : null,
        assignmentProblem: currentOwner(c, policy.assigneeId) && currentOwner(c, policy.escalationOwnerId) ? null : 'A configured owner no longer has authority. Assign this work and review case settings.',
        nextAction: kind === 'overdue-po-confirmation' ? 'Obtain supplier confirmation, receive the goods and reconcile Pantry.' : 'Review the customer promise, ship the goods and reconcile Pantry.',
        policyVersion: policy.version, history: [{ kind: 'opened', at: c.now, actorId: c.actor.id, commandId: c.commandId }] });
    }
  }
  for (const record of c.s.operationalExceptions) {
    if (record.status === 'cancelled') continue;
    const evidence = operationalEvidence(c, record);
    if (record.status === 'closed' && !evidence.ready) {
      record.status = 'open'; record.reopenedAt = c.now; record.reopenReason = evidence.reason;
      event(c, record, 'reopened', { reason: evidence.reason, previousClosure: record.closure });
    } else if (record.status === 'open' && evidence.ready) {
      record.status = 'closed'; record.closedAt = c.now; record.closure = evidence;
      event(c, record, 'closed', { evidence });
    }
    if (record.status === 'open' && record.dueAt <= c.now && !record.escalatedAt) {
      record.escalatedAt = c.now;
      record.escalatedTo = currentOwner(c, record.escalationOwnerId) ? record.escalationOwnerId : null;
      record.escalationReason = record.escalatedTo ? 'Task unanswered by its due date.' : 'Task unanswered; the escalation owner no longer has authority. Current owner review is required.';
      event(c, record, 'escalated', { to: record.escalatedTo, reason: record.escalationReason });
    }
  }
}

export function operationalExceptions(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('exception.')) return;
  requireRole(c, ['owner']);
  const policy = c.s.operationalExceptionPolicies[0];
  if (type === 'exception.policy') {
    if (policy) fresh(policy, p.version); else if (p.version !== 0) fail('STALE', 'Reload case settings.');
    const dueHours = Number(p.dueHours);
    if (!Number.isInteger(dueHours) || dueHours < 1 || dueHours > 720) fail('POLICY', 'Choose 1 to 720 hours before escalation.');
    const values = { enabled: p.enabled === true, assigneeId: owner(c, p.assigneeId), escalationOwnerId: owner(c, p.escalationOwnerId), dueHours, approvedBy: c.actor.id };
    return policy ? Object.assign(policy, values, { version: policy.version + 1 }) : row(c, 'operationalExceptionPolicies', { ...values, id: policyId });
  }
  if (type === 'exception.check') { refreshOperationalExceptions(c, true); return { id: policyId, version: policy?.version ?? 0, count: c.s.operationalExceptions.length }; }
  const record = get(c.s, 'operationalExceptions', p.exceptionId); fresh(record, p.version);
  if (record.status !== 'open') fail('EXCEPTION_STATE', 'Only an open case can be changed.');
  if (type === 'exception.assign') {
    Object.assign(record, { assigneeId: owner(c, p.assigneeId), dueAt: due(p.dueAt), nextAction: text(p.nextAction, 'Next action'), assignmentProblem: null, escalatedAt: null, escalatedTo: null });
    event(c, record, 'assigned', { assigneeId: record.assigneeId, dueAt: record.dueAt, nextAction: record.nextAction }); return record;
  }
  if (type === 'exception.cancel') {
    if (p.confirm !== true) fail('APPROVAL', 'Explicitly confirm cancellation of this case.');
    record.status = 'cancelled'; record.closedAt = c.now; record.cancellation = { reason: text(p.reason, 'Cancellation reason'), actorId: c.actor.id, at: c.now };
    event(c, record, 'cancelled', record.cancellation); return record;
  }
  if (type === 'exception.resolve') {
    const evidence = operationalEvidence(c, record);
    if (!evidence.ready) fail('EXCEPTION_EVIDENCE', evidence.reason);
    record.status = 'closed'; record.closedAt = c.now; record.closure = evidence;
    event(c, record, 'closed', { evidence }); return record;
  }
  fail('COMMAND', 'Unknown exception command.');
}
