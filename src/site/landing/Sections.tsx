import { Quantity, StockLabel } from './StockLabel'

/** 100% free, with the licence drawn as a label. */
export function Free() {
  return (
    <section className="landing-section landing-free" aria-labelledby="free-title">
      <div className="landing-text">
        <h2 id="free-title" className="landing-h2">100% free. Yours to keep.</h2>
        <p>Read, change and share Pier under the MIT license.</p>
      </div>
      <StockLabel title="MIT License" className="drawing"><p className="label-note">free of charge</p></StockLabel>
    </section>
  )
}

/** The strongest difference: a movement carries its document, its actor and its reason. */
export function Movements() {
  return (
    <section className="landing-section landing-movements" aria-labelledby="movements-title">
      <div className="landing-text">
        <h2 id="movements-title" className="landing-h2">Every movement has a source.</h2>
        <p>Follow a quantity to its document, who changed it and why.</p>
      </div>
      <div className="movement-record drawing" role="group" aria-label="One Activity movement">
        <StockLabel title="Activity"><Quantity label="Signed quantity" value="−12 each" /></StockLabel>
        <span className="movement-link" aria-hidden="true" />
        <StockLabel title="Source / correction"><p className="label-source">shipments · SHP-001</p></StockLabel>
        <span className="movement-link" aria-hidden="true" />
        <StockLabel title="Actor / reason"><p className="label-actor">Alex Morgan</p><p className="label-note">dispatch</p></StockLabel>
      </div>
    </section>
  )
}

/** A document label with three aligned quantities. */
function DocumentLabel({ title, status, quantities }: { title: string; status?: string; quantities: [string, string][] }) {
  return (
    <StockLabel title={title} tone="band" className="drawing">
      {status ? <p className="label-status">{status}</p> : null}
      <div className="label-columns">{quantities.map(([label, value]) => <Quantity key={label} label={label} value={value} />)}</div>
    </StockLabel>
  )
}

export function Orders() {
  return (
    <section className="landing-section landing-feature" aria-labelledby="orders-title">
      <div className="landing-text">
        <h2 id="orders-title" className="landing-h3">Send an order in parts.</h2>
        <p>Dispatch what is ready. Keep the remaining quantity reserved for that order.</p>
      </div>
      <DocumentLabel title="Sales orders" status="Partially dispatched" quantities={[['Ordered', '24 each'], ['Reserved', '12 each'], ['Dispatched', '12 each']]} />
    </section>
  )
}

export function Purchasing() {
  return (
    <section className="landing-section landing-feature" aria-labelledby="purchasing-title">
      <div className="landing-text">
        <h2 id="purchasing-title" className="landing-h3">Receive stock as it arrives.</h2>
        <p>Record each delivery into its bin. The rest stays expected.</p>
      </div>
      <DocumentLabel title="Purchasing" quantities={[['Ordered', '36 each'], ['Received', '12 each'], ['Expected', '24 each']]} />
    </section>
  )
}

export function MovingIn() {
  return (
    <section className="landing-section landing-feature landing-imports" aria-labelledby="imports-title">
      <div className="landing-text">
        <h2 id="imports-title" className="landing-h3">Bring your stock with you.</h2>
        <p>Import items, bins and open orders from CSV, and keep the original files.</p>
      </div>
      <StockLabel title="Imports" tone="band" className="drawing">
        <Quantity label="Retained original files" value="3" />
        <span className="label-pill">Download retained original CSV</span>
      </StockLabel>
    </section>
  )
}
