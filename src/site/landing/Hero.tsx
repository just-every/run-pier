import { Actions } from './Actions'
import { Quantity, StockLabel } from './StockLabel'

/** The hero: the promise, then the sum that makes it: on hand less reserved is what you can promise. */
export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <h1 id="hero-title">Promise stock you can ship.</h1>
      <p className="landing-sub">Stock, orders and every movement, together.</p>
      <p className="landing-proof">100% free, open source alternative to Cin7, Zoho Inventory and Katana.</p>
      <Actions />
      <div className="hero-sum" role="group" aria-label="120 on hand less 24 reserved leaves 96 available">
        <StockLabel step={1} title="Stock"><Quantity size="hero" label="On hand (sellable)" value="120" /></StockLabel>
        <span className="hero-operator" aria-hidden="true">−</span>
        <StockLabel step={2} title="Sales orders"><Quantity size="hero" label="Reserved" value="24" /></StockLabel>
        <span className="hero-operator" aria-hidden="true">=</span>
        <StockLabel step={3} title="Stock" tone="teal"><Quantity size="hero" label="Available" value="96" /></StockLabel>
      </div>
    </section>
  )
}
