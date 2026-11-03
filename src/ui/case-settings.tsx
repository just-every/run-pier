import { records, type PierState, type RunCommand } from './api'
import { Field, Form, Select, text } from './controls'

export function CaseSettings({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  if (state.actor.role !== 'owner') return null
  const policy = records(state, 'operationalExceptionPolicies')[0]
  const owners = records(state, 'operators').filter(o => o.status === 'active' && (records(state, 'roles').find(r => r.id === o.id)?.role ?? (o.role === 'owner' ? 'owner' : 'viewer')) === 'owner')
  return <details className="operational-cases"><summary>Case settings</summary><Form key={policy?.version ?? 0} title="Overdue case settings" submit="Save case settings" busy={busy} onSubmit={data => run('exception.policy', { version: policy?.version ?? 0, enabled: data.get('enabled') === 'on', assigneeId: text(data, 'assigneeId'), escalationOwnerId: text(data, 'escalationOwnerId'), dueHours: text(data, 'dueHours') })}>
    <Select label="Default assigned owner" name="assigneeId" rows={owners} defaultValue={policy?.assigneeId ?? state.actor.id} /><Select label="Escalation owner" name="escalationOwnerId" rows={owners} defaultValue={policy?.escalationOwnerId ?? state.actor.id} /><Field label="Hours before escalation" name="dueHours" type="number" min="1" max="720" defaultValue={policy?.dueHours ?? 24} /><label><input name="enabled" type="checkbox" defaultChecked={policy?.enabled} /> Check overdue work every minute</label>
  </Form><p>These settings create internal tasks. Supplier and customer messages keep their separate exact approvals, destinations and delivery controls.</p></details>
}
