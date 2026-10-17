import { Arrow } from '../../shell/Actions'
import { Barcode, Check, Feature, Icon, Pair, Tick } from '../parts'

// Desk page 3: a Target purchase order through its EDI documents, and SO-2291 for
// Harbor Home Goods rated across three carriers and labeled.

const EDI: [string, string, string, boolean][] = [
  ['850', 'Purchase order received', 'Oct 20', true],
  ['855', 'Acknowledged', 'Oct 20', true],
  ['856', 'Ship notice sent', 'Oct 23', true],
  ['810', 'Invoice', 'queued for delivery', false],
]

function EdiTimeline() {
  return <div className="card edi">
    <div className="edi-head"><Icon name="box" className="edi-icon" /><div><h3 className="card-title">Target PO 4471-0093</h3><p className="card-sub">DC 0593 · Ship by Oct 24</p></div></div>
    <ol className="edi-steps">{EDI.map(([code, name, when, done]) => <li key={code} className={done ? 'done' : 'queued'}>
      {done ? <Check /> : <Icon name="clock" className="edi-clock" />}<span><b>{code}</b> · {name} <span className="muted">· {when}</span></span>
    </li>)}</ol>
    <p className="note-chip yellow"><Icon name="doc" />Carton 7 label reprinted · GS1-128 <Tick /></p>
    <Barcode value="00 0 0614141 123456789 0" width={226} height={36} className="edi-code" />
  </div>
}

const RATES: [string, string, string, string, string, boolean][] = [
  ['ups', 'UPS', 'UPS Ground', '2 days', '$38.12', false],
  ['fedex', 'FedEx', 'FedEx Ground', '2 days', '$36.40', true],
  ['usps', 'USPS', 'USPS Ground Advantage', '4 days', '$44.90', false],
]

function RateShop() {
  return <div className="rates">
    <div className="card rate-card">
      <div className="rate-head"><Icon name="truck" className="rate-truck" /><div><h3 className="card-title">SO-2291 · Harbor Home Goods</h3><p className="card-sub">3 cartons · 41 lb · Columbus, OH</p></div></div>
      <ul className="rate-rows">{RATES.map(([key, tile, service, days, price, chosen]) => <li key={key} className={chosen ? 'chosen' : ''}>
        <span className="radio" /><span className={`carrier carrier-${key}`}>{tile}</span><span className="rate-service">{service} <span className="muted">· {days}</span></span><span className="rate-price">{price}</span>
      </li>)}</ul>
      <p className="print-button">Print 3 labels<Arrow /></p>
    </div>
    <p className="toast"><Check /><span>Address corrected<span className="toast-note"> · 1420 E Main St, Ste 200</span></span></p>
  </div>
}

export function Retail() {
  return <Pair className="retail">
    <Feature id="edi" eyebrow="Retail EDI" title={<>Ready for<br />big-box buyers.</>} art={<EdiTimeline />} label="Target PO 4471-0093 for DC 0593, ship by Oct 24: 850 purchase order received Oct 20, 855 acknowledged Oct 20, 856 ship notice sent Oct 23, 810 invoice queued for delivery. Carton 7's GS1-128 label was reprinted.">
      Take EDI purchase orders from Target, Walmart and Home Depot, and send the acknowledgment, ship notice and invoice on time, every time.
    </Feature>
    <Feature id="shipping" flip eyebrow="Shipping" title={<>Best rate,<br />label printed.</>} art={<RateShop />} label="SO-2291 for Harbor Home Goods, 3 cartons, 41 lb, to Columbus, OH: UPS Ground 2 days $38.12, FedEx Ground 2 days $36.40 chosen, USPS Ground Advantage 4 days $44.90. Print 3 labels. Address corrected to 1420 E Main St, Ste 200.">
      Pier compares UPS, FedEx and USPS through ShipStation or EasyPost, prints the label and sends tracking to your customer.
    </Feature>
  </Pair>
}
