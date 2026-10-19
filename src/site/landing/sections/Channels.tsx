import { Check, Icon, SectionHead } from '../parts'
import { CHANNELS_OUT, COUNT, ITEM, ORDERS_IN, SEP } from '../story'

// Desk page 05: Nov 4's six orders wired IN to the Blue Mug's one count, and the count wired OUT to the
// four store channels. The wires are SVG drawn in the gaps between the columns; rows are fixed-height so
// every wire meets its row's dot.

// Each wire's row and where it meets the count card, in the desk's px from the flow's top (rows are 60
// high with 14 between; the card starts 9 below the first IN row), and where it turns, in % of its gap.
const IN_ROWS = ORDERS_IN.map((_, index) => 30 + index * 74)
const IN_ENTRY = [159, 168, 177, 210, 226, 243]
const IN_TURN = IN_ROWS.map((_, index) => 35 + index * 5.6)
const OUT_ROWS = CHANNELS_OUT.map((_, index) => 104 + index * 74)
const OUT_EXIT = 201
const OUT_TURN = [42, 48, 51, 58]
const FLOW_HEIGHT = 430

const elbow = (fromY: number, toY: number, turn: number) => {
  const r = Math.min(10, Math.abs(toY - fromY) / 2)
  const dir = toY > fromY ? 1 : -1
  return r < 1 ? `M0 ${fromY}H100` : `M0 ${fromY}H${turn - r}Q${turn} ${fromY} ${turn} ${fromY + dir * r}V${toY - dir * r}Q${turn} ${toY} ${turn + r} ${toY}H100`
}

function Wires({ side }: { side: 'in' | 'out' }) {
  const paths = side === 'in'
    ? IN_ROWS.map((y, index) => elbow(y, IN_ENTRY[index], IN_TURN[index]))
    : OUT_ROWS.map((y, index) => elbow(OUT_EXIT, y, OUT_TURN[index]))
  return <svg className={`wires wires-${side}`} viewBox={`0 0 100 ${FLOW_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
    {paths.map((d, index) => <path key={index} d={d} />)}
  </svg>
}

export function Channels() {
  const label = `IN: ${ORDERS_IN.map(order => `${order.source} ${order.ref}, ${order.qty}`).join('; ')}. ${ITEM.name}, ${ITEM.sku}, ${ITEM.warehouse}: ${COUNT.available} available, ${COUNT.onHand} on hand, ${COUNT.reserved} ${COUNT.reservedLabel}; ${COUNT.ack}. OUT: ${CHANNELS_OUT.map(name => `${name} ${COUNT.available}`).join('; ')}.`
  return <section id="channels" className="band channels" aria-labelledby="channels-title">
    <div className="page-wrap">
      <SectionHead id="channels" eyebrow="Nov 4 · Orders" title="Every channel, one count." className="head-split">
        Orders from your stores, marketplaces and EDI land in one queue. Stock goes back out to every channel.
      </SectionHead>
      <div className="flow" role="img" aria-label={label}>
        <div className="flow-in" aria-hidden="true">
          <p className="flow-label">In</p>
          <ul className="flow-rows">{ORDERS_IN.map(order => <li key={order.source} className="flow-row wire-end">
            <span className={`dot dot-${order.tone}`} /><span className="flow-name">{order.source}</span><span className="flow-ref">{order.ref}</span><b className="flow-qty">{order.qty}</b>
          </li>)}</ul>
        </div>
        <Wires side="in" />
        <div className="card count-card" aria-hidden="true">
          <div className="count-head"><Icon name="mug" className="count-mug" /><div><h3 className="card-title">{ITEM.name}{SEP}{ITEM.sku}</h3><p className="card-sub">{ITEM.warehouse}</p></div></div>
          <p className="count-big"><span>{COUNT.available}</span>available</p>
          <ul className="rows count-rows">
            <li><b>{COUNT.onHand}</b>on hand</li>
            <li><b>{COUNT.reserved}</b>{COUNT.reservedLabel}</li>
          </ul>
          <p className="chip-done"><svg className="tick" viewBox="0 0 16 16"><path d="m2.8 8.6 3.3 3.2 7-7.4" /></svg>{COUNT.ack}</p>
        </div>
        <Wires side="out" />
        <div className="flow-out" aria-hidden="true">
          <p className="flow-label">Out</p>
          <ul className="flow-rows">{CHANNELS_OUT.map(name => <li key={name} className="flow-row wire-start">
            <Check /><span className="flow-name">{name}</span><b className="flow-qty">{COUNT.available}</b>
          </li>)}</ul>
        </div>
      </div>
    </div>
  </section>
}
