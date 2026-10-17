import { Icon } from '../parts'

const DETAILS: [string, string, string, string][] = [
  ['doc', 'blue', 'FIFO or average cost', 'Valuation your accountant will recognize.'],
  ['swap', 'red', 'Transfers', 'Move stock between warehouses with a full trail.'],
  ['box-return', 'yellow', 'Returns', 'Back on the shelf or written off in one scan.'],
  ['alert', 'red', 'Dead stock', 'Slow movers flagged before they cost you.'],
  ['bars', 'blue', 'Margin by SKU', 'Profit by item, channel and customer.'],
  ['list', 'yellow', 'Activity log', 'Every scan, edit and sync, recorded.'],
]

/** Six smaller things done right, as white cards with tinted icons. */
export function Details() {
  return <section className="details" aria-labelledby="details-title">
    <div className="site-wrap">
      <p className="eyebrow center">Also included</p>
      <h2 id="details-title">The quiet details.</h2>
      <ul className="details-grid">{DETAILS.map(([icon, tone, title, body]) => <li key={title} className="card detail">
        <span className={`detail-icon ${tone}`}><Icon name={icon} /></span><h3>{title}</h3><p>{body}</p>
      </li>)}</ul>
    </div>
  </section>
}
