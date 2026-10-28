import { assertPurchaseApproval, purchaseSpend } from './purchase-approval';
import { decimal, fail, fresh, get, requireRole, type Context, type Row } from './model';
import { email, expectedLandedCost, queuePurchase } from './purchasing-workflow';
import { poMaterial } from './correspondence-delivery-eligibility';
import { amount } from './money';
import { canonicalJson, sha256 } from './import-kit';

function inputs(c: Context, po: Row) {
  const items = new Set(po.lines.map((l: any) => l.itemId));
  return sha256(canonicalJson({ material: poMaterial(po), business: c.s.businessProfile,
    supplier: c.s.parties.find(p => p.id === po.supplierId),
    terms: c.s.supplierItems.filter(t => t.supplierId === po.supplierId && items.has(t.itemId)),
    policies: c.s.replenishmentPolicies.filter(p => items.has(p.itemId)),
    planningScope: c.s.replenishmentSettings,
    workflowRule: po.workflow ? c.s.workflowRules.find(rule => rule.id === po.workflow.ruleId) ?? null : null,
    demand: c.s.orders.filter(o => o.lines.some((l: any) => items.has(l.itemId))).map(o => ({ id: o.id, version: o.version })) }));
}

export function invalidatePurchaseSends(c: Context) {
  for (const po of c.s.purchaseOrders) {
    const policy = po.sendPolicy;
    if (policy?.enabled && policy.inputs !== inputs(c, po)) {
      policy.enabled = false;
      policy.stoppedReason = 'Purchase, demand, supplier terms, planning scope, workflow budget, planning policy or business destination changed. Review a new authority.';
      po.version++;
    }
  }
}

/** Delegation is for one exact committed purchase, never authority to buy. */
export function purchaseSend(c: Context, type: string, p: any): Row | undefined {
  if (!['po.authorizeSend', 'po.pauseSend', 'po.sendApproved'].includes(type)) return;
  requireRole(c, type === 'po.sendApproved' ? ['buyer', 'agent'] : ['buyer']);
  const po = get(c.s, 'purchaseOrders', p.poId);
  fresh(po, p.version);
  if (po.status !== 'committed') fail('PO_STATE', 'Commit the exact buyer-approved purchase order first.');
  if (type === 'po.pauseSend') {
    if (!po.sendPolicy) fail('POLICY', 'This purchase has no delegated send.');
    po.sendPolicy.enabled = false;
    po.version++;
    return po;
  }
  if (type === 'po.authorizeSend') {
    assertPurchaseApproval(c, po, c.actor.id);
    if (p.confirm !== true) fail('APPROVAL', 'Approve this exact purchase, recipient, spend limit and expiry.');
    const recipient = email(p.recipient), maximum = decimal(p.maxSpend);
    if (amount(purchaseSpend(po)) > maximum * 1000000n) fail('SPEND_LIMIT', 'The landed purchase total exceeds this send limit.');
    const parsed = typeof p.expiresAt === 'string' ? Date.parse(p.expiresAt) : NaN;
    const expiresAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
    if (!expiresAt || expiresAt <= c.now) fail('POLICY', 'Choose a future expiry for this one-purchase authority.');
    const everyDays = Number(p.chaseEveryDays ?? 3), maxChases = Number(p.maxChases ?? 2);
    if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 30 || !Number.isInteger(maxChases) || maxChases < 0 || maxChases > 5) fail('POLICY', 'Choose 1–30 days between chases and at most five chases.');
    const material = poMaterial(po);
    if (c.s.correspondence.some(m => m.kind === 'purchase-order' && m.recordId === po.id && m.approvedMaterial === material)) fail('ALREADY_SENT', 'This purchase already has a send. Inspect its delivery outcome.');
    po.sendPolicy = { version: (po.sendPolicy?.version ?? 0) + 1, enabled: true, approvedBy: c.actor.id,
      approvalRole: c.actor.role, approvedMaterial: material, recipient, maxSpend: p.maxSpend,
      expiresAt, everyDays, maxChases, inputs: inputs(c, po), at: c.now };
    po.version++;
    return po;
  }
  const policy = po.sendPolicy, role = policy && c.automationActors?.[policy.approvedBy];
  if (!policy?.enabled || policy.messageId || policy.expiresAt <= c.now || policy.inputs !== inputs(c, po) || policy.approvedMaterial !== poMaterial(po) ||
      !role || !['owner', 'buyer'].includes(role)) fail('SEND_AUTHORITY', 'This send authority expired, changed or was revoked. Ask a buyer to review it again.');
  if (amount(purchaseSpend(po)) > decimal(policy.maxSpend) * 1000000n) fail('SPEND_LIMIT', 'This purchase exceeds the approved landed spend.');
  c.purchaseSendAuthority = { poId: po.id, policyVersion: policy.version, actorId: policy.approvedBy, role };
  const result = queuePurchase(c, po, { recipient: policy.recipient, chaseEveryDays: policy.everyDays, maxChases: policy.maxChases },
    { approvedBy: policy.approvedBy, approvalRole: role, sendPolicyVersion: policy.version, requestedBy: c.actor.id, executor: c.backgroundPolicy ? 'Scheduled inventory agent' : c.actor.name });
  result.policyDecision = { classes: ['money', 'external'], outcome: 'approved',
    facts: { expectedLandedCost: purchaseSpend(po), currency: 'USD', recipient: policy.recipient,
      terms: JSON.parse(poMaterial(po)), maxSpend: policy.maxSpend },
    policy: { kind: 'exact-human-send', version: policy.version, purchaseApprovalVersion: po.approvalRoute?.policyVersion ?? null,
      approvedBy: policy.approvedBy, executorId: c.actor.id, inputs: policy.inputs, at: c.now } };
  policy.messageId = result.id;
  policy.executedAt = c.now;
  po.version++;
  return result;
}
