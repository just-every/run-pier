import { useState } from 'react'
import { Badge, Table } from '../controls'
import { day, money } from '../display'
import type { RunCommand } from '../api'
import type { ShippingJob } from './model'

export function Rates({ job, run, busy, disabled, test }: { job: ShippingJob; run: RunCommand; busy: boolean; disabled: boolean; test: boolean }) {
  const [chosen, setChosen] = useState(job.selectedRateId ?? '')
  const selected = job.rates.find(rate => rate.id === chosen)
  return <section className="record"><h3>Compare services</h3><p className="muted">Rates use this carton’s saved weight, dimensions and approved destination. Delivery estimates come from the carrier.</p>
    <Table headings={['Service', 'Price', 'Estimated delivery', 'Choose']} numeric={[1]}>{job.rates.map(rate => <tr key={rate.id} className={chosen === rate.id ? 'selected' : ''}>
      <td>{rate.carrier} · {rate.service}{rate.cheapest && <Badge>Cheapest</Badge>}{rate.fastest && <Badge>Fastest</Badge>}</td>
      <td>{money(rate.rate)} {rate.currency}</td><td>{rate.delivery_date ? day(rate.delivery_date) : rate.delivery_days !== null && rate.delivery_days !== undefined ? `${rate.delivery_days} ${rate.delivery_days === 1 ? 'day' : 'days'}` : 'Not provided'}</td>
      <td><label className="check"><input type="radio" name={`shipping-rate-${job.id}`} aria-label={`Choose ${rate.carrier} ${rate.service}, ${money(rate.rate)} ${rate.currency}`} checked={chosen === rate.id} disabled={busy || disabled} onChange={() => setChosen(rate.id)} /><span>{chosen === rate.id ? 'Selected' : 'Choose'}</span></label></td>
    </tr>)}</Table>
    {selected && <p>{test ? 'Test label' : 'Postage purchase'}: {selected.carrier} {selected.service} · {money(selected.rate)} {selected.currency}.{test ? ' This label is not valid postage.' : ' Buying charges your connected carrier account.'}</p>}
    <div className="actions"><button className="primary" disabled={busy || disabled || !selected} onClick={() => selected && run('shipping.buy', { jobId: job.id, version: job.version, rateId: selected.id })}>{test ? 'Buy test label' : 'Buy postage and label'}</button></div>
  </section>
}
