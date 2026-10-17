import type { ReactNode } from 'react'
import { Check, Feature, Icon, Pair, Tick } from '../parts'

// Desk page 6: the inventory agent carrying the Blue Mug 12oz from forecast to a closed
// receipt on PO-1052, and moving in from Cin7 Core.

const STEPS: [string, string, string, ReactNode][] = [
  ['Oct 14', '7:02 am', 'blue', 'Forecast: 600 needed by Nov 14'],
  ['', '7:03 am', 'blue', 'PO-1052 sent to Hillside Ceramics'],
  ['Oct 15', '', 'green', 'Supplier confirmed · ships Oct 28'],
  ['Oct 29', '', 'orange', 'Ship notice changed: 560 now, 40 on Nov 4'],
  ['Oct 29', '', 'green', '3 orders re-promised · customers emailed'],
  ['Nov 6', '', 'green', <>Receipt matched · ledger closed <Tick /></>],
]

function AgentLog() {
  return <div className="card agent">
    <div className="agent-head"><Icon name="mug" className="agent-mug" /><h3 className="card-display">Blue Mug 12oz</h3><span className="chip chip-blue agent-chip"><Icon name="spark" />Agent</span></div>
    <ol className="agent-steps">{STEPS.map(([date, time, tone, text], index) => <li key={index}>
      <span className="agent-when">{date && <>{date}{time && ' · '}</>}{time}</span><span className={`agent-dot ${tone}`} /><span className="agent-text">{text}</span>
    </li>)}</ol>
  </div>
}

const IMPORTED: [string, string, boolean][] = [
  ['Items', '4,812', true],
  ['Bins', '1,206', true],
  ['Stock on hand', '318,440 units · matched', true],
  ['Open sales orders', '214', true],
  ['Open purchase orders', '37', true],
  ['Amazon', '2 listings awaiting SKU match', false],
]

function Importing() {
  return <div className="card importing">
    <div className="import-head"><Icon name="box" className="import-icon" /><h3 className="card-title">Importing from Cin7 Core</h3></div>
    <div className="progress"><span className="progress-bar"><span /></span><b>100%</b></div>
    <ul className="import-rows">{IMPORTED.map(([name, value, done]) => <li key={name}>{done ? <Check /> : <span className="warn-dot">!</span>}<span>{name}</span><span className="import-value">{value}</span></li>)}</ul>
  </div>
}

export function Agent() {
  return <Pair className="agent-pair">
    <Feature id="agent" eyebrow="Inventory agent" title={<>Stock that keeps<br />itself moving.</>} art={<AgentLog />} label="The agent's log for Blue Mug 12oz: Oct 14 at 7:02 am, forecast 600 needed by Nov 14; at 7:03 am, PO-1052 sent to Hillside Ceramics; Oct 15, supplier confirmed, ships Oct 28; Oct 29, ship notice changed to 560 now and 40 on Nov 4; Oct 29, 3 orders re-promised and customers emailed; Nov 6, receipt matched and ledger closed.">
      The agent forecasts from real sell-through, sends the PO, chases the supplier, re-promises affected orders and checks the receipt closes in the books.
    </Feature>
    <Feature id="move-in" flip eyebrow="Move in" title={<>Bring your<br />warehouse with you.</>} art={<Importing />} label="Importing from Cin7 Core, 100%: 4,812 items, 1,206 bins, 318,440 units of stock on hand matched, 214 open sales orders, 37 open purchase orders; 2 Amazon listings await a SKU match.">
      Move from Cin7, inFlow or Fishbowl with your items, bins, stock on hand, customers, suppliers and open orders. Channels reconnect to the same listings.
    </Feature>
  </Pair>
}
