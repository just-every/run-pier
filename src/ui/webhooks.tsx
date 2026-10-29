import { useState } from 'react'
import { records, type PierState, type RunCommand, type RecordData } from './api'
import { Field, Form, Select, text, Facts, Empty } from './controls'

export function Webhooks({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [selected, setSelected] = useState(''), [fields, setFields] = useState(['status', 'lines'])
  const subscriptions = records(state, 'webhookSubscriptions')
  const subscription = subscriptions.find(row => row.id === selected)
  if (state.actor.role !== 'owner') return <p>Only a current owner can configure or inspect outbound webhooks.</p>
  return <div className="webhooks-page"><div className="page-title"><div><h1>Order webhooks</h1><p>Settings · Signed notifications, without subscriber actions</p></div><a href="#activity">Back to Activity</a></div>
    <p>Approve an exact public HTTPS destination and order fields. Customer details, prices and custom fields are excluded. Keep the signing secret at your receiver; it is never returned by Pier.</p>
    <Select label="Subscription" rows={subscriptions} value={selected} onChange={value => { setSelected(value); setFields(subscriptions.find(row => row.id === value)?.fields ?? ['status', 'lines']) }} required={false} />
    <button disabled={busy} onClick={() => { setSelected(''); setFields(['status', 'lines']) }}>New subscription</button>
    <Form key={`${selected}:${subscription?.scopeVersion ?? 0}`} title={subscription ? 'Replace subscription scope' : 'New order subscription'} submit="Save draft subscription" busy={busy}
      onSubmit={data => run('webhook.save', { ...(subscription ? { subscriptionId: subscription.id, version: subscription.version } : {}), name: text(data, 'name'), destination: text(data, 'destination'), fields, secret: text(data, 'secret') }, { onResult: value => setSelected(value.id) })}>
      <Field label="Subscription name" name="name" defaultValue={subscription?.name ?? ''} />
      <Field label="HTTPS destination" name="destination" type="url" defaultValue={subscription?.destination ?? ''} />
      <Field label="Signing secret" name="secret" type="password" minLength={32} maxLength={256} autoComplete="new-password" />
      <fieldset><legend>Allowed order fields</legend>{['status','lines'].map(field => <label key={field}><input type="checkbox" checked={fields.includes(field)} onChange={event => setFields(current => event.target.checked ? [...current, field] : current.filter(value => value !== field))} /> {field === 'status' ? 'Order status' : 'Line quantities'}</label>)}</fieldset>
    </Form>
    {subscription && <Subscription key={subscription.id} subscription={subscription} state={state} run={run} busy={busy} />}
    {!subscriptions.length && <Empty>No destination is authorized yet. Save a draft, preview a real order, then approve the exact scope.</Empty>}
  </div>
}
function Subscription({ subscription: s, state, run, busy }: { subscription: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  const [checked, setChecked] = useState(false)
  const args = { subscriptionId: s.id, version: s.version }
  const deliveries = records(state, 'webhookDeliveries').filter(row => row.subscriptionId === s.id).slice().reverse()
  return <>
    <section className="panel" aria-label="Current subscription"><h2>{s.name}</h2><Facts values={[
      { label: 'Status', value: s.enabled ? 'Approved' : s.revokedAt ? 'Revoked' : 'Draft' }, { label: 'Destination', value: s.destination },
      { label: 'Fields', value: s.fields.join(', ') }, { label: 'Signing key version', value: s.secretVersion },
    ]} /><p>Every notification retains its event identity, source order version and command identity. It cannot approve purchases, post stock or record receipts.</p></section>
    {!s.enabled && <Form title="Preview exact payload" submit="Preview order payload" busy={busy} onSubmit={data => run('webhook.preview', { ...args, orderId: text(data, 'orderId') })}>
      <Select label="Preview order" name="orderId" rows={records(state, 'orders').filter(row => row.documentType !== 'quote').map(row => ({ ...row, name: row.reference }))} />
    </Form>}
    {s.preview && <section className="panel" aria-label="Payload preview"><h2>Payload preview</h2><p>Exact destination: {s.preview.destination}</p><pre className="webhook-payload">{JSON.stringify(s.preview.payload, null, 2)}</pre>
      {!s.enabled && <><label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> I approve this destination and these fields for future order events.</label><button className="primary" disabled={busy || !checked} onClick={() => void run('webhook.approve', { ...args, destination: s.destination, fields: s.fields, previewDigest: s.preview.digest, confirm: checked })}>Approve exact destination</button></>}
    </section>}
    {s.enabled && <>
      <Form title="Rotate signing secret" submit="Rotate signing secret" busy={busy} onSubmit={data => run('webhook.rotate', { ...args, secret: text(data, 'secret'), confirm: data.get('confirm') === 'on' })}>
        <Field label="New signing secret" name="secret" type="password" minLength={32} maxLength={256} autoComplete="new-password" />
        <label><input name="confirm" type="checkbox" required /> My receiver is ready for the new secret immediately.</label>
      </Form>
      <section className="panel"><h2>Revoke connection</h2><p>Stops queued deliveries and removes the signing credential. Historical outcomes remain inspectable.</p><button disabled={busy} onClick={() => void run('webhook.revoke', args)}>Revoke subscription</button></section>
    </>}
    <section className="panel"><h2>Delivery outcomes</h2><p>A delivered result means an HTTP acceptance, not a shipment, stock change or accounting result. Failed, uncertain and interrupted attempts never resend automatically.</p>
      <button disabled={busy || !s.enabled} onClick={() => void run('webhook.process', {})}>Process approved deliveries</button>
      {!deliveries.length ? <Empty>No order changes have been queued since approval.</Empty> : deliveries.map(delivery => <Delivery key={delivery.id} delivery={delivery} enabled={s.enabled} run={run} busy={busy} />)}
    </section>
  </>
}
function Delivery({ delivery: d, enabled, run, busy }: { delivery: RecordData; enabled: boolean; run: RunCommand; busy: boolean }) {
  return <article className="panel webhook-delivery" aria-label={`Delivery ${d.eventId}`}><h3>{d.status}</h3><p><a href={`#sales/${d.orderId}`}>Source order</a> · version {d.orderVersion}</p><p>Event <code>{d.eventId}</code></p><p>{d.problem}</p>
    <details><summary>Retained payload and attempts</summary><pre className="webhook-payload">{d.body}</pre>{d.attempts.map((attempt: any) => <p key={attempt.id}>{attempt.status} · key {attempt.secretVersion} · {attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : 'No confirmed response'} · attempt {attempt.id}</p>)}{d.reviews?.map((review: any, index: number) => <p key={index}>{review.resolution} · {review.reason}</p>)}</details>
    {enabled && ['failed','uncertain','sending','blocked'].includes(d.status) && <Form title="Reviewed delivery recovery" submit="Record receiver review" busy={busy} onSubmit={data => run('webhook.recover', { deliveryId: d.id, version: d.version, resolution: text(data, 'resolution'), reason: text(data, 'reason'), confirm: data.get('confirm') === 'on' })}>
      <p>Check this event identity at the receiver first. Requeue only after confirming it was not accepted. A recovery uses the same event identity and a new attempt identity.</p>
      <label className="field"><span>Receiver outcome</span><select name="resolution" aria-label="Receiver outcome" required><option value="">Choose reviewed outcome</option><option value="receiver-confirmed-accepted">Receiver confirms acceptance; do not resend</option><option value="receiver-confirmed-not-accepted">Receiver confirms no acceptance; queue one new attempt</option></select></label>
      <Field label="Receiver reconciliation evidence" name="reason" />
      <label><input type="checkbox" name="confirm" required /> I checked the receiver for this exact event and approve the recorded recovery.</label>
    </Form>}
  </article>
}
