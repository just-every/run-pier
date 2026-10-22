import { fail, fresh, requireRole, row, text, type Context, type Row, type State } from './model';

export function quoteApprovalPolicy(s: State) {
  const policy = s.salesPolicies.find(p => p.kind === 'quote-approval');
  return { role: policy?.role ?? 'owner', version: policy?.version ?? 0 };
}

export function saveQuoteApprovalPolicy(c: Context, p: any): Row {
  requireRole(c, []);
  // Only human commercial roles can approve. ACCESS may extend this list.
  if (!['owner', 'operator', 'buyer'].includes(p.role))
    fail('APPROVER_ROLE', 'Choose Owner, Sales operator or Buyer.');
  const old = c.s.salesPolicies.find(r => r.kind === 'quote-approval');
  if (old) fresh(old, p.version);
  else if (p.version !== 0) fail('STALE', 'Reload the current quote approval policy.');
  const history = old ? [...(old.history ?? []), structuredClone({
    role: old.role, version: old.version, approvedBy: old.approvedBy,
    at: old.at, reason: old.reason,
  })] : [];
  const data = { kind: 'quote-approval', role: p.role, reason: text(p.reason),
    approvedBy: c.actor.id, at: c.now, history };
  return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'salesPolicies', data);
}

/** Acceptance and outbound quote generation recheck current human authority. */
export function requireQuoteApproval(c: Context, q: Row) {
  const approval = q.quoteApproval, policy = quoteApprovalPolicy(c.s);
  if (!approval || approval.version !== q.version)
    fail('QUOTE_APPROVAL', 'Obtain approval of this exact quote version.');
  if ((approval.policyVersion ?? 0) !== policy.version)
    fail('QUOTE_APPROVAL', 'Quote approval policy changed. Obtain renewed approval.');
  const role = c.automationActors?.[approval.actorId];
  if (!role || role !== approval.role || !['owner', policy.role].includes(role))
    fail('APPROVER_REVOKED', 'Quote approval authority was revoked. Obtain renewed approval.');
  c.approver = { id: approval.actorId, role: role! };
}
