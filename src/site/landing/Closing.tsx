import { Actions } from './Actions'
import { Quantity, StockLabel } from './StockLabel'

export function Closing() {
  return (
    <section className="landing-section landing-closing" aria-labelledby="closing-title">
      <div className="landing-text">
        <h2 id="closing-title" className="landing-h2">Keep your stock in order.</h2>
        <p className="landing-sub">Inventory and wholesale orders, together.</p>
        <Actions />
      </div>
      <StockLabel title="Stock" tone="teal" className="drawing"><Quantity size="hero" label="Available" value="96" /></StockLabel>
    </section>
  )
}
