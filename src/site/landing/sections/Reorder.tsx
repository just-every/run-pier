import { Check, Icon, SectionHead } from '../parts'
import { ITEM, REORDER, SEP, SHIP_NOTICE } from '../story'

// Desk page 02: the story's opening line, then two beats of PO-1048, each a pair of cards joined by a
// cobalt wire. Oct 6: the agent's reorder and the PO it sends. Oct 21: the short ship notice and the
// customer order it leaves on time.

function ReorderCards() {
  return <div className="pair-cards pair-right" role="img" aria-label={`Agent card for ${ITEM.name}, ${ITEM.sku}: ${REORDER.facts.join('; ')}; ${REORDER.advice}. It links to ${REORDER.po.title}: ${REORDER.po.cost}; ${REORDER.po.sent}; ${REORDER.po.confirmed}.`}>
    <div className="card pair-a wired" aria-hidden="true">
      <p className="chip-agent"><Icon name="spark" />Agent</p>
      <h3 className="card-title">{ITEM.name}{SEP}{ITEM.sku}</h3>
      <ul className="rows">{REORDER.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
      <p className="advice"><span className="dot dot-yellow" />{REORDER.advice}</p>
    </div>
    <div className="card pair-b" aria-hidden="true">
      <h3 className="card-title with-icon"><Icon name="box" className="title-icon" />{REORDER.po.title}</h3>
      <ul className="rows">
        <li>{REORDER.po.cost}</li>
        <li className="lead-mark"><span className="dot dot-blue" />{REORDER.po.sent}</li>
        <li className="lead-mark green"><Check />{REORDER.po.confirmed}</li>
      </ul>
    </div>
  </div>
}

function ShortCards() {
  const order = SHIP_NOTICE.order
  return <div className="pair-cards pair-left" role="img" aria-label={`EDI 856 ship notice, ${SHIP_NOTICE.sub}: ordered ${SHIP_NOTICE.ordered}, shipping ${SHIP_NOTICE.shipping}; ${SHIP_NOTICE.followOn}. It links to ${order.title}, ${order.sub}: ${order.kept}; ${order.checked}; ${order.chip}.`}>
    <div className="card pair-a wired" aria-hidden="true">
      <h3 className="card-title with-icon"><Icon name="doc" className="title-icon" />EDI 856{SEP}Ship notice</h3>
      <p className="card-sub">{SHIP_NOTICE.sub}</p>
      <ul className="rows split">
        <li><span>Ordered</span><b>{SHIP_NOTICE.ordered}</b></li>
        <li><span>Shipping</span><b className="red">{SHIP_NOTICE.shipping}</b></li>
      </ul>
      <p className="alert red"><Icon name="clock" />{SHIP_NOTICE.followOn}</p>
    </div>
    <div className="card pair-b" aria-hidden="true">
      <h3 className="card-title with-icon"><Icon name="store" className="title-icon" />{order.title}</h3>
      <p className="card-sub">{order.sub}</p>
      <ul className="rows">
        <li className="lead-mark green"><Check />{order.kept}</li>
        <li className="lead-mark"><Icon name="spark" className="mark-spark" />{order.checked}</li>
      </ul>
      <p className="chip-done"><svg className="tick" viewBox="0 0 16 16"><path d="m2.8 8.6 3.3 3.2 7-7.4" /></svg>{order.chip}</p>
    </div>
  </div>
}

export function Reorder() {
  return <div className="band story">
    <div className="page-wrap">
      <p className="eyebrow story-line">One order of Blue Mugs, from reorder to the books</p>
      <section id="reorder" className="beat beat-copy-left" aria-labelledby="reorder-title">
        <SectionHead id="reorder" eyebrow="Oct 6 · Reorder" title={<>Ordered before<br />it runs out.</>}>
          The inventory agent reads sell-through across your channels, sees the gap and sends the purchase order.
        </SectionHead>
        <ReorderCards />
      </section>
      <section id="ship-notice" className="beat beat-copy-right" aria-labelledby="ship-notice-title">
        <ShortCards />
        <SectionHead id="ship-notice" eyebrow="Oct 21 · Ship notice" title={<>Twenty short.<br />Already sorted.</>}>
          The supplier’s ship notice drops to 480. The agent checks each open order against stock, and no promise moves.
        </SectionHead>
      </section>
    </div>
  </div>
}
