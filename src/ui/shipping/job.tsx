import { records, type RecordData } from '../api'
import { Badge, Facts, Table } from '../controls'
import { reference, when, words } from '../display'
import { SavedAddress } from './address'
import { canShip, editable, type ShippingJob, type ShippingProps } from './model'
import { PrepareCarton } from './prepare'
import { Rates } from './rates'

export function CartonJob({ state, run, busy, job, pack, providerDisabled }: ShippingProps & { job: ShippingJob; pack?: RecordData; providerDisabled: boolean }) {
  const authority = canShip(state), disabled = busy || providerDisabled || !authority
  const mutable = editable(job) && pack?.status === 'packed', labelled = ['labelled', 'delivered'].includes(job.status)
  const carton = pack?.cartons?.find((value: any) => value.number === job.carton)
  const call = (type: string, payload: object = {}) => run(type, { jobId: job.id, version: job.version, ...payload })
  return <section className="record shipping-job" aria-label={`Carton ${job.carton} shipping`}>
    <h3>Carton {job.carton} <Badge>{words(job.status)}</Badge>{job.mode === 'test' && <Badge>Test · not postage</Badge>}</h3>
    <p className="muted">{reference(records(state, 'orders').find(order => order.id === job.orderId))}{carton && ` · ${carton.weight} lb · ${carton.length} × ${carton.width} × ${carton.height} in`}</p>
    {job.problem && <p className="notice" role="status">{job.problem}</p>}
    {job.verificationErrors.length > 0 && <div className="error" role="alert"><strong>Address verification needs attention</strong><ul>{job.verificationErrors.map((error, index) => <li key={index}>{error}</li>)}</ul><p>Edit the destination and verify it again before buying a label.</p></div>}
    <div className="split shipping-addresses"><section><h4>Original address</h4><SavedAddress address={job.originalAddress} /></section>{job.suggestedAddress && <section><h4>Provider’s suggested address</h4><SavedAddress address={job.suggestedAddress} /></section>}</div>
    {job.addressChoice && <p>Approved for rating: {job.addressChoice === 'suggested' ? 'provider’s suggested address' : 'original address'}.</p>}
    {mutable && <>
      {(!job.verified || job.status === 'draft' || job.status === 'verification_failed') && <div className="actions"><button className="primary" disabled={disabled} onClick={() => call('shipping.verify')}>Verify address</button></div>}
      {job.verified && !job.addressChoice && <><p>Review both addresses and choose the destination to use for this carton.</p><div className="actions">{job.suggestedAddress && <button className="primary" disabled={disabled} onClick={() => call('shipping.address', { choice: 'suggested' })}>Use suggested address</button>}<button disabled={disabled} onClick={() => call('shipping.address', { choice: 'original' })}>Keep original address</button></div></>}
      {job.verified && job.addressChoice && <div className="actions"><button disabled={disabled} onClick={() => call('shipping.rates')}>{job.rates.length ? 'Refresh carrier rates' : 'Get carrier rates'}</button></div>}
      {job.status === 'rated' && job.rates.length > 0 && <Rates key={`${job.id}:${job.version}`} job={job} run={run} busy={busy} disabled={providerDisabled || !authority} test={job.mode === 'test'} />}
      {job.status === 'rated' && job.rates.length === 0 && <p className="notice">No UPS, FedEx or USPS rates were returned for this carton. Review its destination and measurements, and check carrier activation in EasyPost before requesting rates again.</p>}
      {!!job.rateMessages?.length && <ul>{job.rateMessages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      {pack && authority && <details><summary>Edit destination or tracking email</summary><PrepareCarton key={`${job.id}:${job.version}`} state={state} run={run} busy={busy} pack={pack} carton={job.carton} job={job} disabled={false} /></details>}
    </>}
    {['buying', 'uncertain'].includes(job.status) && <div className="notice" role="status"><p>The label purchase outcome needs confirmation. Reconcile this purchase with EasyPost before taking another action.</p><button disabled={disabled} onClick={() => call('shipping.reconcile')}>Reconcile label purchase</button></div>}
    {labelled && <>
      <Facts values={[{ label: 'Tracking number', value: job.trackingCode || 'Not provided' }, { label: 'Customer email', value: job.email }, { label: 'Physical dispatch', value: job.shipmentId ? 'Dispatched' : 'Awaiting dispatch' }]} />
      {job.trackingStatus && <p>Carrier status: <Badge>{words(job.trackingStatus)}</Badge>{job.lastTrackingAt && <small>Last checked {when(job.lastTrackingAt)}</small>}</p>}
      <div className="actions">{job.labelPdfUrl && <a className="button" href={`/api/pier/shipping/labels/${encodeURIComponent(job.id)}.pdf`} target="_blank" rel="noreferrer">Open PDF label</a>}{job.labelZplUrl && <a className="button" href={`/api/pier/shipping/labels/${encodeURIComponent(job.id)}.zpl`} download>Download ZPL label</a>}{job.trackingUrl && <a className="button" href={job.trackingUrl} target="_blank" rel="noreferrer">Open carrier tracking</a>}<button disabled={disabled} onClick={() => call('shipping.track')}>Check tracking</button></div>
      {job.mode === 'test' && <p className="notice">This is a test label. It is not valid postage.</p>}
      <p>Customer tracking email: {job.mail ? words(job.mail.status) : 'Not submitted'}.{job.mail?.detail && <small>{job.mail.detail}</small>}</p>
      {job.mail && ['refused', 'failed', 'not sent', 'not available'].includes(job.mail.status) && <button disabled={disabled} onClick={() => call('shipping.email')}>Retry tracking email</button>}
      {job.mail?.status === 'uncertain' && <p className="muted">Email acceptance is uncertain. Check the mail provider’s delivery record before taking further action.</p>}
      {!job.shipmentId && <p className="muted">Buying a label does not dispatch stock. Once every carton has its label, <a href="#floor/pack">confirm physical dispatch at the pack station</a>.</p>}
    </>}
    {job.events.length > 0 && <><h4>Tracking history</h4><Table headings={['When', 'Status', 'Detail']}>{job.events.map(event => <tr key={event.id}><td>{when(event.datetime)}</td><td>{words(event.status)}</td><td>{event.message}</td></tr>)}</Table></>}
  </section>
}
