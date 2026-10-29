import { records, type PierState, type RunCommand } from '../api';
import { Field, Form, text } from '../controls';

export function approvalPolicy(state: PierState) {
  return records(state, 'salesPolicies').find(p => p.kind === 'quote-approval');
}

export function QuoteApprovalSettings({ state, run, busy }: {
  state: PierState; run: RunCommand; busy: boolean;
}) {
  const policy = approvalPolicy(state);
  return <Form key={`quote-authority-${policy?.version ?? 0}`}
    title="Quote approval authority" submit="Save quote approval role" busy={busy}
    disabled={state.actor.role !== 'owner'}
    note="Owner is the default approver. Changing this role requires renewed approval of open quotes. Email recipient consent remains owner-only."
    onSubmit={d => run('sales.quoteApprovalPolicy', {
      role: text(d, 'role'), version: policy?.version ?? 0, reason: text(d, 'reason'),
    })}>
    <label className="field"><span>Quote approver role</span>
      <select name="role" aria-label="Quote approver role" defaultValue={policy?.role ?? 'owner'}>
        <option value="owner">Owner</option><option value="operator">Sales operator</option><option value="buyer">Buyer</option>
      </select>
    </label>
    {policy && <p>Current designation reason: {policy.reason}</p>}
    <Field label="Quote authority change reason" name="reason" />
  </Form>;
}
