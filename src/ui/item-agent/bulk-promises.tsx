import { useState } from 'react'
import { records, type PierState, type RecordData, type RunCommand } from '../api'
import { Field } from '../controls'
import { BulkPlan } from './bulk-plan'

type Selection = { selected: boolean; recipient: string; lineIds: string[] }
export function BulkPromises({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [choices, setChoices] = useState<Record<string, Selection>>({}), [reason, setReason] = useState(''), [consent, setConsent] = useState(false)
  if (!['owner', 'buyer', 'operator', 'agent'].includes(state.actor.role)) return null
  const orders = records(state, 'orders').filter(order => order.backorderPlan?.lines.some((line: any) => line.backorder !== '0' && line.expectedDate))
  const plans = records(state, 'proposals').filter(plan => plan.kind === 'bulk-review' && plan.rows.some((entry: any) => entry.type === 'order.repromise')).slice().reverse()
  const waiting = (order: RecordData) => order.backorderPlan.lines.filter((line: any) => line.backorder !== '0' && line.expectedDate)
  const choice = (order: RecordData): Selection => choices[order.id] ?? { selected: false, recipient: order.promisePolicy?.recipient || state.parties.find((p: any) => p.id === order.customerId)?.email || '', lineIds: waiting(order).map((line: any) => line.orderLineId) }
  const update = (order: RecordData, change: Partial<Selection>) => setChoices(old => ({ ...old, [order.id]: { ...choice(order), ...change } }))
  const rows = (selected: RecordData[]) => selected.map(order => ({ type: 'order.repromise', payload: { orderId: order.id, version: order.version, fingerprint: order.backorderPlan.fingerprint, orderLineIds: choice(order).lineIds, recipient: choice(order).recipient, confirm: consent } }))
  const selected = orders.filter(order => choice(order).selected)
  const valid = consent && reason.trim() && selected.length > 0 && selected.every(order => choice(order).recipient.trim() && choice(order).lineIds.length > 0)
  return <section className="panel"><h2>Review customer promises</h2><p>Select exact backordered lines and recipients. Approval queues each reviewed customer message; reserved stock keeps its original promise.</p>
    {orders.map(order => <fieldset key={order.id}><legend>{order.reference}</legend>
      <label className="check"><input type="checkbox" aria-label={`Select promise ${order.reference}`} checked={choice(order).selected} onChange={e => update(order, { selected: e.target.checked })} />Review this order</label>
      {choice(order).selected && <><Field label={`Recipient for ${order.reference}`} type="email" value={choice(order).recipient} onChange={recipient => update(order, { recipient })} />
        {waiting(order).map((line: any) => <label className="check" key={line.orderLineId}><input type="checkbox" aria-label={`Promise line ${line.orderLineId}`} checked={choice(order).lineIds.includes(line.orderLineId)} onChange={e => update(order, { lineIds: e.target.checked ? [...choice(order).lineIds, line.orderLineId] : choice(order).lineIds.filter(id => id !== line.orderLineId) })} />{state.items.find((item: any) => item.id === line.itemId)?.name} · {line.backorder} · {line.promiseDate ?? 'Not set'} → {line.expectedDate}{line.estimated ? ' · Estimate' : ' · Confirmed supply'}</label>)}
      </>}
    </fieldset>)}
    <Field label="Promise review reason" value={reason} onChange={setReason} />
    <label className="check"><input type="checkbox" aria-label="Approve exact customer recipients and calculated dates" checked={consent} onChange={e => setConsent(e.target.checked)} />Approve exact customer recipients and calculated dates</label>
    <button disabled={busy || !valid} onClick={() => void run('itemAgent.bulkPreview', { rows: rows(selected) })}>Preview customer promises</button>
    {plans.map(plan => <section key={plan.id}><h3>Customer promise plan · version {plan.version}</h3>
      <BulkPlan state={state} plan={plan} run={run} busy={busy} reason={reason} />
      {plan.rows.every((entry: any) => entry.status === 'prepared') && <button disabled={busy || !consent || !reason.trim() || plan.rows.some((entry: any) => !orders.some(order => order.id === entry.targetId))} onClick={() => void run('itemAgent.bulkEdit', { proposalId: plan.id, version: plan.version, rows: rows(plan.rows.map((entry: any) => orders.find(order => order.id === entry.targetId)!)) })}>Update promise plan</button>}
    </section>)}
  </section>
}
