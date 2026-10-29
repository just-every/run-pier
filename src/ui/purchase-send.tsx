import { type PierState, type RecordData, type RunCommand } from './api'
import { Amount, Facts, Field, Form, text } from './controls'
import { person, when } from './display'

export function PurchaseSend({ state, po, run, busy }: { state: PierState; po: RecordData; run: RunCommand; busy: boolean }) {
  const policy = po.sendPolicy, authorized = ['owner', 'buyer'].includes(state.actor.role)
  const supplier = state.parties.find((p: any) => p.id === po.supplierId)
  const sent = state.correspondence.some((m: any) => m.kind === 'purchase-order' && m.recordId === po.id)
  return <section className="panel"><h3>Let the inventory agent send this PO</h3>
    <p>Authorize this committed purchase only. The agent sends at the next scheduled check, or when you run it below. Changes to demand, supplier terms, planning policy or destination require a new review.</p>
    {policy && <><Facts values={[{ label: 'Authority', value: !policy.enabled ? 'Stopped' : policy.messageId ? 'Send queued — see delivery below' : policy.expiresAt <= new Date().toISOString() ? 'Expired' : 'Waiting for agent' }, { label: 'Approved by', value: person(state, policy.approvedBy) }, { label: 'Recipient', value: policy.recipient }, { label: 'Maximum landed spend USD', value: <Amount value={policy.maxSpend} /> }, { label: 'Expires', value: when(policy.expiresAt) }]} />{policy.stoppedReason && <p role="status">{policy.stoppedReason}</p>}
      {policy.enabled && <div className="actions">{!policy.messageId && <button disabled={busy || !['owner', 'buyer', 'agent'].includes(state.actor.role)} onClick={() => run('po.sendApproved', { poId: po.id, version: po.version })}>Run approved agent send</button>}<button disabled={busy || !authorized} onClick={() => run('po.pauseSend', { poId: po.id, version: po.version })}>Stop delegated send and chases</button></div>}</>}
    {!sent && authorized && <Form key={`${po.id}-${po.version}`} title="Approve one agent send" submit="Authorize exact PO for agent" busy={busy} note="The landed spend limit includes goods, freight, duty and supplier tax. This authority cannot purchase, change this PO or change the recipient." onSubmit={data => run('po.authorizeSend', { poId: po.id, version: po.version, recipient: text(data, 'recipient'), maxSpend: text(data, 'maxSpend'), expiresAt: new Date(text(data, 'expiresAt')).toISOString(), chaseEveryDays: text(data, 'chaseEveryDays'), maxChases: text(data, 'maxChases'), confirm: data.get('confirm') === 'on' })}>
      <Field label="Agent send recipient" name="recipient" type="email" defaultValue={supplier?.email || policy?.recipient} />
      <Field label="Maximum landed spend (USD)" name="maxSpend" inputMode="decimal" defaultValue={po.expectedLandedCost?.total.replace(/0+$/, '').replace(/\.$/, '')} />
      <Field label="Send authority expires (your local time)" name="expiresAt" type="datetime-local" />
      <Field label="Agent chase interval (days)" name="chaseEveryDays" type="number" min="1" max="30" defaultValue="3" />
      <Field label="Agent maximum chases" name="maxChases" type="number" min="0" max="5" defaultValue="2" />
      <label className="check"><input name="confirm" type="checkbox" required />Approve this exact PO, recipient, spend limit and expiry</label>
    </Form>}
  </section>
}
