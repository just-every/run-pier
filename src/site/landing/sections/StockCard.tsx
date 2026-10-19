import { Icon, SectionHead } from '../parts'
import { ITEM, SEP, STOCK_CARD } from '../story'

/** Desk page 08: the Blue Mug's stock card from Oct 6 to Nov 16, eleven rows with the reorder row tinted and
 * its reason on the row. On phones each row becomes two lines (date, movement, qty, on hand; then reference
 * and value). */
export function StockCard() {
  return <section id="stock-card" className="band stock-card" aria-labelledby="stock-card-title">
    <div className="page-wrap">
      <SectionHead id="stock-card" eyebrow="Oct 6 – Nov 16 · Stock card" title="Six weeks, one card." className="head-center">
        Each scan, sale, count and bill writes a line. Value moves with it.
      </SectionHead>
      <div className="card ledger">
        <div className="ledger-head"><h3 className="card-display">Stock card{SEP}{ITEM.name}{SEP}<span className="nowrap">{ITEM.sku}</span>{SEP}{ITEM.warehouse}</h3><p className="ledger-basis">FIFO · USD</p></div>
        <table className="ledger-table">
          <thead><tr><th className="c-date" scope="col">Date</th><th className="c-move" scope="col">Movement</th><th className="c-ref" scope="col">Reference</th><th className="c-qty" scope="col">Qty</th><th className="c-hand" scope="col">On hand</th><th className="c-value" scope="col">Value</th></tr></thead>
          <tbody>{STOCK_CARD.map((row, index) => <tr key={index} className={row.reorder ? 'reorder' : undefined}>
            <td className="c-date">{row.date}</td>
            <td className="c-move">{row.reorder
              ? <><span className="move-reorder"><Icon name="spark" className="mark-spark" />{row.movement}</span><span className="reorder-why">{row.reorder}</span></>
              : <>{row.dot && <span className="dot dot-yellow" />}{row.movement}</>}</td>
            <td className="c-ref">{row.reference}</td>
            <td className="c-qty">{row.qty}</td>
            <td className="c-hand">{row.onHand}</td>
            <td className="c-value">{row.value}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </section>
}
