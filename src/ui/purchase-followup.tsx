import { ReplenishmentFollowThrough } from './replenishment-comparison';
import { type PierState, type RecordData, type RunCommand } from './api'
import { Amount, Facts, Field, Form, text } from './controls'
import { day, when } from './display'
import { PurchaseSend } from './purchase-send'
import { Correspondence } from './correspondence'

export function PurchaseFollowup({ state, po, run, busy }: { state: PierState; po: RecordData; run: RunCommand; busy: boolean }) {
  const supplier = state.parties.find((p: any) => p.id === po.supplierId)
  const cost = po.expectedLandedCost
  const authorized = ['owner', 'buyer'].includes(state.actor.role)
  return <><ReplenishmentFollowThrough state={state} po={po} run={run} busy={busy} /><Facts values={[{ label: 'Receiving warehouse', value: po.destinationWarehouse || 'Any receiving warehouse' }, { label: 'Expected landed total USD', value: <Amount value={cost?.total} unknown={state.actor.role === 'agent' ? 'Hidden by your role' : 'Unvalued'} /> }, { label: 'Freight / duty estimate USD', value: state.actor.role === 'agent' ? 'Hidden by your role' : `${cost?.freight || '0'} / ${cost?.duty || '0'}` }, { label: 'Supplier confirmation', value: po.confirmation ? day(po.confirmation.promiseDate) : 'Awaiting confirmation' }]} />
    {po.status === 'draft' && <button disabled={busy || !authorized} onClick={() => run('po.delete', { poId: po.id, version: po.version })}>Delete uncommitted draft</button>}
    {po.status === 'committed' && <>
      <PurchaseSend state={state} po={po} run={run} busy={busy} />
      <Form key={`send-${po.id}-${po.version}`} title="Send purchase order to supplier" submit="Approve recipient and send PO" busy={busy} disabled={!authorized} note="Review this exact purchase order and landed-cost estimate above. Approve the recipient and bounded confirmation reminders." onSubmit={data => run('po.send', { poId: po.id, version: po.version, recipient: text(data, 'recipient'), chaseEveryDays: text(data, 'chaseEveryDays'), maxChases: text(data, 'maxChases'), confirm: data.get('confirm') === 'on' })}>
        <Field label="Supplier email" name="recipient" type="email" defaultValue={supplier?.email || po.chasePolicy?.recipient} />
        <Field label="Chase every (days)" name="chaseEveryDays" type="number" min="1" max="30" defaultValue="3" />
        <Field label="Maximum confirmation chases" name="maxChases" type="number" min="0" max="5" defaultValue="2" />
        <label className="check"><input name="confirm" type="checkbox" required />Approve this exact PO, recipient and scheduled messages</label>
      </Form>
      {po.chasePolicy && <button disabled={busy || !authorized || po.chasePolicy.enabled === false} onClick={() => run('po.pauseChases', { poId: po.id, version: po.version })}>Stop supplier chases</button>}
      <Form key={`confirm-${po.id}-${po.version}`} title="Record supplier confirmation or new date" submit="Approve confirmed date" busy={busy} disabled={!authorized} note="Paste the supplier’s actual reply and its message reference. This approves the date change; customers with an authorized promise policy are updated." onSubmit={data => run('po.confirm', { poId: po.id, version: po.version, promiseDate: text(data, 'promiseDate'), source: text(data, 'source'), body: text(data, 'body'), confirm: data.get('confirm') === 'on' })}>
        <Field label="Confirmed delivery date" name="promiseDate" type="date" defaultValue={po.promiseDate} />
        <Field label="Supplier message reference" name="source" hint="For example, the message ID or a reference to the supplier email." />
        <label className="field"><span>Supplier reply</span><textarea aria-label="Supplier reply" name="body" required maxLength={2000} rows={4} /></label>
        <label className="check"><input name="confirm" type="checkbox" required />Approve this supplier date and authorized customer updates</label>
      </Form>
      <Form title="Record supplier reply" submit="Save correspondence" busy={busy} disabled={!authorized} onSubmit={data => run('po.reply', { poId: po.id, version: po.version, source: text(data, 'source'), body: text(data, 'body') })}><Field label="Reply message reference" name="source" /><Field label="Reply text" name="body" /></Form>
    </>}
    {po.supplierReplies?.length > 0 && <section className="panel"><h3>Supplier replies</h3>{po.supplierReplies.map((r: any) => <div className="record" key={r.id}><strong>{r.source}</strong><small>{when(r.at)}</small><p>{r.body}</p></div>)}</section>}
    <Correspondence state={state} recordId={po.id} run={run} busy={busy} />
  </>
}
