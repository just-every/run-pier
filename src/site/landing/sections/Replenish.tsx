import { Check, Feature, Icon, Pair, Tick } from '../parts'

// Desk page 5: the suggested PO-1052 to Hillside Ceramics, and October's books matched
// to QuickBooks Online with PO-1048's freight bill in the review queue.

const LINES: [string, string, string][] = [['mug', 'Blue Mug 12oz', '600'], ['bowl', 'Stoneware Bowl 6in', '400'], ['tall', 'Latte Mug 16oz', '240']]

function SuggestedPo() {
  return <div className="suggested">
    <div className="card po-card">
      <h3 className="card-title">Suggested PO · Hillside Ceramics</h3>
      <p className="card-sub">Lead time 21 days</p>
      <ul className="po-lines">{LINES.map(([icon, item, qty]) => <li key={item}><span className="po-thumb"><Icon name={icon} /></span><span>{item} · {qty}</span></li>)}</ul>
      <p className="po-cost">Landed cost · $4.82 per unit · freight and duty included</p>
      <p className="po-send">Send PO-1052</p>
    </div>
    <p className="alert-strip red"><Icon name="clock" />Latte Mug 16oz · 14 backorders promised Nov 12</p>
  </div>
}

function BooksMatch() {
  return <div className="card books">
    <h3 className="card-title">October 2026 · QuickBooks Online</h3>
    <div className="books-values">
      <div><p className="card-sub">Inventory value in Pier</p><p className="books-figure">$412,880.15</p></div>
      <div><p className="card-sub">Inventory value in QuickBooks</p><p className="books-figure">$412,880.15</p></div>
      <span className="chip chip-green big">Matched <Tick /></span>
    </div>
    <ul className="books-rows">
      <li><Check tone="tint" />1,284 invoices posted with COGS</li>
      <li><Check tone="tint" />37 bills synced</li>
    </ul>
    <p className="books-queue-label">Review queue</p>
    <p className="books-queue"><span className="queue-check"><Tick /></span>Bill 7731 · freight $86.00 · allocated to PO-1048 <Tick /></p>
  </div>
}

export function Replenish() {
  return <Pair className="replenish" rule>
    <Feature id="replenishment" eyebrow="Replenishment" title={<>Reorder before<br />you run out.</>} art={<SuggestedPo />} label="Suggested PO to Hillside Ceramics, lead time 21 days: Blue Mug 12oz 600, Stoneware Bowl 6in 400, Latte Mug 16oz 240. Landed cost $4.82 per unit with freight and duty. Send PO-1052. Latte Mug 16oz: 14 backorders promised Nov 12.">
      Reorder points learn from what actually sells. Pier drafts the purchase order with landed cost, and backorders get a real date.
    </Feature>
    <Feature id="accounting" flip eyebrow="Accounting" title={<>Books that<br />match the shelf.</>} art={<BooksMatch />} label="October 2026 with QuickBooks Online: inventory value $412,880.15 in Pier and in QuickBooks, matched. 1,284 invoices posted with cost of goods, 37 bills synced. In the review queue: bill 7731, freight $86.00, allocated to PO-1048.">
      Two-way sync with QuickBooks Online and Xero: items, invoices, bills, cost of goods and inventory value. Anything off waits in one short queue.
    </Feature>
  </Pair>
}
