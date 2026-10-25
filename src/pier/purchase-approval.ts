import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type Row } from './model';
import { expectedLandedCost } from './purchasing-workflow';
import { amount, money } from './money';

function human(c: Context, id: unknown): string {
  const value = text(id, 'Named approver');
  if (!['owner', 'buyer'].includes(c.automationActors?.[value] ?? ''))
    fail('APPROVER', 'Choose an active owner or buyer with unrestricted purchasing authority.');
  return value;
}

export const purchaseSpend = (po: Row) => money(amount(expectedLandedCost(po).total) + decimal(po.tax ?? '0') * 1000000n);

/** Owner policy assigns human review; it never approves or sends a purchase. */
export function purchaseApproval(c: Context, type: string, p: any): Row | undefined {
  if (type === 'purchaseApproval.save') {
    requireRole(c, []);
    const old = c.s.purchaseApprovalPolicies[0];
    if (old) fresh(old, p.version);
    if (!Array.isArray(p.limits) || !p.limits.length || p.limits.length > 100)
      fail('APPROVAL_POLICY', 'Provide between one and 100 approval limits.');
    const limits = p.limits.map((limit: any) => {
      const supplierId = limit.supplierId == null ? null : get(c.s, 'parties', limit.supplierId).id;
      if (supplierId && get(c.s, 'parties', supplierId).kind !== 'supplier') fail('SUPPLIER', 'Choose a supplier.');
      if (!['standard', 'minimum-order', 'any'].includes(limit.exceptionType)) fail('APPROVAL_POLICY', 'Choose standard, minimum-order or any exception type.');
      const approverId = human(c, limit.approverId), escalationId = human(c, limit.escalationId);
      if (limit.delegates !== undefined && (!Array.isArray(limit.delegates) || limit.delegates.length > 20)) fail('APPROVAL_POLICY', 'Provide at most 20 named delegates.');
      const delegates = (limit.delegates ?? []).map((delegate: any) => {
        const actorId = human(c, delegate.actorId);
        const expiresAt = typeof delegate.expiresAt === 'string' ? Date.parse(delegate.expiresAt) : NaN;
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.parse(c.now)) fail('APPROVAL_POLICY', 'Delegation requires a future expiry.');
        return { actorId, expiresAt: new Date(expiresAt).toISOString() };
      });
      return { supplierId, exceptionType: limit.exceptionType, maxSpend: format(decimal(limit.maxSpend)), approverId, escalationId, delegates };
    });
    const keys = limits.map((limit: any) => JSON.stringify([limit.supplierId, limit.exceptionType, limit.maxSpend]));
    if (new Set(keys).size !== keys.length) fail('APPROVAL_POLICY', 'Each scope and spend ceiling must have one named approver.');
    const value = { limits, approvedBy: c.actor.id, at: c.now };
    // Every policy revision removes approvals, including committed send grants.
    for (const po of c.s.purchaseOrders) {
      po.approval = null;
      po.purchaseApprovalVersion = (old?.version ?? 0) + 1;
      po.approvalEscalation = null;
      if (po.sendPolicy) po.sendPolicy.enabled = false;
      po.version++;
    }
    return old ? Object.assign(old, value, { version: old.version + 1 }) : row(c, 'purchaseApprovalPolicies', value);
  }
  if (!['po.routeApproval', 'po.escalateApproval'].includes(type)) return;
  requireRole(c, ['buyer', 'agent']);
  const po = get(c.s, 'purchaseOrders', p.poId);
  fresh(po, p.version);
  if (!['draft', 'committed'].includes(po.status)) fail('PO_STATE', 'Route an open purchase order.');
  const route = purchaseApprovalRoute(c, po);
  if (type === 'po.escalateApproval') {
    requireRole(c, []);
    if (!route) fail('APPROVAL_POLICY', 'Configure approval limits before escalating.');
    po.approvalEscalation = { policyVersion: route.policyVersion, approverId: route.escalationId, reason: text(p.reason), at: c.now, by: c.actor.id };
    po.approval = null;
    po.version++;
  }
  po.approvalRoute = purchaseApprovalRoute(c, po);
  return po;
}

export function purchaseApprovalRoute(c: Context, po: Row): any {
  const policy = c.s.purchaseApprovalPolicies[0];
  if (!policy) return null;
  if (po.pendingSupplierChange) {
    const lines = po.pendingSupplierChange.lines;
    po = { ...po, lines, minimumOrderValueUnmet: lines.reduce((sum: bigint, line: Row) => sum + decimal(line.quantity) * decimal(line.price), 0n) < decimal(po.minimumOrderValue ?? '0') * 1000000n };
  }
  const exceptionType = po.minimumOrderValueUnmet ? 'minimum-order' : 'standard';
  const total = amount(purchaseSpend(po));
  const matches = policy.limits.filter((limit: any) =>
    (limit.supplierId === null || limit.supplierId === po.supplierId) &&
    (limit.exceptionType === 'any' || limit.exceptionType === exceptionType));
  // The most specific scope governs even when its limits cannot cover spend.
  const specificity = (limit: any) => (limit.supplierId ? 2 : 0) + (limit.exceptionType === 'any' ? 0 : 1);
  const rank = Math.max(-1, ...matches.map(specificity));
  const limit = matches.filter((limit: any) => specificity(limit) === rank && total <= decimal(limit.maxSpend) * 1000000n)
    .sort((a: any, b: any) => decimal(a.maxSpend) < decimal(b.maxSpend) ? -1 : decimal(a.maxSpend) > decimal(b.maxSpend) ? 1 : 0)[0];
  if (!limit) fail('SPEND_LIMIT', 'No owner approval limit covers this supplier, exception and landed spend.');
  const escalated = po.approvalEscalation?.policyVersion === policy.version;
  return { policyVersion: policy.version, total: purchaseSpend(po), exceptionType,
    maxSpend: limit.maxSpend, approverId: escalated ? limit.escalationId : limit.approverId,
    escalationId: limit.escalationId, delegates: escalated ? [] : limit.delegates };
}

export function assertPurchaseApproval(c: Context, po: Row, actorId: string) {
  if (po.pendingSupplierChange) fail('SUPPLIER_CHANGE', 'Review the retained supplier change before approval or sending.');
  const route = purchaseApprovalRoute(c, po);
  if (!route) return;
  const permitted = actorId === route.approverId || route.delegates.some((delegate: any) => delegate.actorId === actorId && delegate.expiresAt > c.now);
  if (!permitted || !['owner', 'buyer'].includes(c.automationActors?.[actorId] ?? ''))
    fail('APPROVAL_ROUTE', 'This purchase requires its named current approver or an unexpired owner-named delegate.', route);
  po.approvalRoute = route;
}
