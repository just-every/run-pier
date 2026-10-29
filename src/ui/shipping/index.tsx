import { useState } from 'react'
import { records } from '../api'
import { Empty } from '../controls'
import { reference } from '../display'
import { LtlFreight } from './ltl';
import { CartonJob } from './job'
import { canShip, type Settings, type ShippingJob, type ShippingProps } from './model'
import { PrepareCarton } from './prepare'
import { ShippingSettings } from './settings'
import '../shipping.css'

export function Shipping({ state, run, busy }: ShippingProps) {
  const [chosen, setChosen] = useState('')
  const settings = records(state, 'shippingSettings').find(row => row.id === 'shipping:easypost') as Settings | undefined
  const jobs = records(state, 'shippingJobs') as ShippingJob[]
  const packs = records(state, 'packs'), orders = records(state, 'orders'), packed = packs.filter(pack => pack.status === 'packed' && !records(state, 'ltlManifests').some(manifest => manifest.packId === pack.id))
  const pack = packed.find(row => row.id === chosen) ?? packed[0]
  const providerDisabled = !!state.shippingUnavailable || !settings?.connected
  const previous = jobs.filter(job => !packed.some(row => row.id === job.packId))
  return <div className="shipping">
    <LtlFreight state={state} run={run} busy={busy} />
    {state.shippingUnavailable && <p className="notice" role="status">{state.shippingUnavailable}</p>}
    <ShippingSettings key={`${settings?.id ?? 'new'}:${settings?.version ?? 0}`} state={state} run={run} busy={busy} settings={settings} />
    {!settings?.connected && <p className="muted">Connect EasyPost before verifying an address, getting rates or buying labels.</p>}
    {!canShip(state) && <p className="muted">The owner or a warehouse operator verifies addresses and purchases labels.</p>}
    <section className="panel"><h2>Ship packed cartons</h2><p className="muted">Prepare each carton using its measured weight and dimensions. Address approval, postage purchase and physical dispatch are separate steps.</p>
      {!packed.length ? <Empty>No packed orders are waiting for shipping labels. <a href="#floor/pack">Open the pack station</a> when an order is picked and ready.</Empty> : <>
        <label className="field"><span>Packed order</span><select aria-label="Packed order" value={pack.id} disabled={busy} onChange={event => setChosen(event.target.value)}>{packed.map(row => <option key={row.id} value={row.id}>{reference(orders.find(order => order.id === row.orderId))} · {row.cartons.length} {row.cartons.length === 1 ? 'carton' : 'cartons'}</option>)}</select></label>
        {pack.cartons.map((carton: any) => { const job = jobs.find(row => row.packId === pack.id && row.carton === carton.number); return job ? <CartonJob key={job.id} state={state} run={run} busy={busy} job={job} pack={pack} providerDisabled={providerDisabled} /> : <div className="record" key={`${pack.id}:${carton.number}`}><h3>Carton {carton.number}</h3><p className="muted">{carton.weight} lb · {carton.length} × {carton.width} × {carton.height} in</p>{canShip(state) && <PrepareCarton state={state} run={run} busy={busy} pack={pack} carton={carton.number} disabled={false} />}</div> })}
      </>}
    </section>
    {previous.length > 0 && <section className="panel"><h2>Previous shipping records</h2>{previous.slice().reverse().map(job => <CartonJob key={job.id} state={state} run={run} busy={busy} job={job} pack={packs.find(row => row.id === job.packId)} providerDisabled={providerDisabled} />)}</section>}
  </div>
}
