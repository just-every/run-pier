import { records, type PierState, type RunCommand } from './api'
import { Badge, Empty, Evidence, Facts, Field, Form, Select, text } from './controls'
import { person, when, words } from './display'

export function OperationalExceptions({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  if (state.actor.role !== 'owner') return null
  const policy = records(state, 'operationalExceptionPolicies')[0], cases = records(state, 'operationalExceptions')
  const owners = records(state, 'operators').filter(o => o.status === 'active' && (records(state, 'roles').find(r => r.id === o.id)?.role ?? (o.role === 'owner' ? 'owner' : 'viewer')) === 'owner')
  return <section className="panel" aria-label="Operational cases"><h2>Overdue operational cases</h2><p>Keep supplier confirmations and late customer deliveries assigned until the actual goods and current Pantry evidence agree.</p>
    <button disabled={busy || !policy?.enabled} onClick={() => run('exception.check', {})}>Check overdue work</button>
    <details><summary>Case settings</summary><Form title="Overdue case settings" submit="Save case settings" busy={busy} onSubmit={data => run('exception.policy', { version: policy?.version ?? 0, enabled: data.get('enabled') === 'on', assigneeId: text(data, 'assigneeId'), escalationOwnerId: text(data, 'escalationOwnerId'), dueHours: text(data, 'dueHours') })}>
      <Select label="Default assigned owner" name="assigneeId" rows={owners} defaultValue={policy?.assigneeId ?? state.actor.id} /><Select label="Escalation owner" name="escalationOwnerId" rows={owners} defaultValue={policy?.escalationOwnerId ?? state.actor.id} /><Field label="Hours before escalation" name="dueHours" type="number" min="1" max="720" defaultValue={policy?.dueHours ?? 24} /><label><input name="enabled" type="checkbox" defaultChecked={policy?.enabled} /> Check overdue work every minute</label>
    </Form><p>These settings create internal tasks. Supplier and customer messages keep their separate exact approvals, destinations and delivery controls.</p></details>
    {!cases.length && <Empty>No overdue cases recorded.</Empty>}
    {cases.map(record => <details key={record.id} data-case-id={record.id}><summary>{record.reference} · {words(record.kind)} · <Badge>{words(record.status)}</Badge></summary>
      <Facts values={[{ label: 'Assigned owner', value: person(state, record.assigneeId) }, { label: 'Due', value: when(record.dueAt) }, { label: 'Next action', value: record.nextAction }, { label: 'Escalation', value: record.escalatedAt ? `${record.escalationReason} ${record.escalatedTo ? person(state, record.escalatedTo) : ''}` : 'Not escalated' }]} />
      <a href={record.kind === 'overdue-po-confirmation' ? `#purchasing/${record.sourceId}` : `#sales/${record.sourceId}`}>Open source document</a>
      {record.reopenReason && <p>Reopened: {record.reopenReason}</p>}
      {record.status === 'open' && <><p>{record.evidence?.reason}</p><Form title="Assign next action" submit="Save next action" busy={busy} onSubmit={data => run('exception.assign', { exceptionId: record.id, version: record.version, assigneeId: text(data, 'assigneeId'), dueAt: new Date(text(data, 'dueAt')).toISOString(), nextAction: text(data, 'nextAction') })}>
        <Select label="Assigned owner" name="assigneeId" rows={owners} defaultValue={record.assigneeId} /><Field label="Due date and time" name="dueAt" type="datetime-local" defaultValue={new Date(Date.parse(record.dueAt) - new Date(record.dueAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} /><Field label="Next action" name="nextAction" defaultValue={record.nextAction} />
      </Form><button disabled={busy} onClick={() => run('exception.resolve', { exceptionId: record.id, version: record.version })}>Check closure evidence</button>
      <details><summary>Cancel this case</summary><Form title="Document case cancellation" submit="Cancel case" secondary busy={busy} note="This closes only the case. The purchase or customer order keeps its existing obligations." onSubmit={data => run('exception.cancel', { exceptionId: record.id, version: record.version, reason: text(data, 'reason'), confirm: data.get('confirm') === 'on' })}><Field label="Cancellation reason" name="reason" /><label><input name="confirm" type="checkbox" required /> I authorize this documented case cancellation</label></Form></details></>}
      <details><summary>Closure and case history</summary><Evidence value={{ closure: record.closure, cancellation: record.cancellation, history: record.history }} /></details>
    </details>)}
  </section>
}
