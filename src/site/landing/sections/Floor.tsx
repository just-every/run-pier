import { Barcode, Check, Feature, Icon, Pair, Tick } from '../parts'

// Desk page 2: the warehouse floor (Wave 14's pick list off Dock A) and the channels
// that share one stock count for the Blue Mug 12oz.

const PICKS: [string, string, string, boolean][] = [
  ['A-14', 'Blue Mug 12oz', '24', true],
  ['A-16', 'Latte Mug 16oz', '12', true],
  ['C-02', 'Stoneware Bowl 6in', '18', true],
  ['D-21', 'Pour-Over Set', '6', false],
]

function PickList() {
  return <div className="card pick">
    <div className="pick-head"><h3 className="card-display">Pick list · Wave 14</h3><span className="chip chip-blue">Dock A</span></div>
    <p className="card-sub">6 orders · 38 lines</p>
    <ul className="pick-rows">{PICKS.map(([bin, item, qty, done]) => <li key={bin}>
      <span className="bin">{bin}</span><span className="pick-item">{item}</span><span className="pick-qty">{qty}</span>
      {done ? <Check /> : <span className="scan-pending"><Icon name="scan" /></span>}
    </li>)}</ul>
    <div className="pick-foot"><p className="alert-row red"><Icon name="box" />B-03 empty · picked from overflow B-09 <Tick /></p><Barcode value="WAVE-14-DOCK-A" width={108} height={36} /></div>
  </div>
}

const CHANNELS: [string, string, string, string?][] = [
  ['shopify', 'Shopify', '1,184'],
  ['woo', 'WooCommerce', '1,184'],
  ['amazon', 'Amazon', '1,084', '100 held for FBA transfer'],
  ['stall', 'Stall', '1,184'],
]

function ChannelCount() {
  return <div className="channels">
    <div className="card channel-card">
      <h3 className="card-display small">Blue Mug 12oz · SKU BM-12</h3>
      <p className="big-count"><span className="card-display">1,184</span> available</p>
      <ul className="channel-rows">{CHANNELS.map(([key, name, count, note]) => <li key={key}>
        <span className={`dot dot-${key}`} /><span className="channel-name">{name}{note && <small>{note}</small>}</span><span className="channel-count">{count}</span><span className="chip chip-green">synced</span>
      </li>)}</ul>
    </div>
    <p className="toast"><Check tone="tint" /><span>Order #4471 from Shopify<span className="toast-note"> · reserved 9:12 am</span></span></p>
  </div>
}

export function Floor() {
  return <Pair className="floor">
    <Feature id="floor" eyebrow="Warehouse floor" title={<>Scan it, and<br />it’s counted.</>} art={<PickList />} label="Pick list for Wave 14 at Dock A: 6 orders, 38 lines. Bin A-14, 24 Blue Mug 12oz, picked; A-16, 12 Latte Mug 16oz, picked; C-02, 18 Stoneware Bowl 6in, picked; D-21, 6 Pour-Over Set, waiting for its scan. B-03 was empty, so the pick came from overflow bin B-09.">
      Receive, put away, pick, pack and count from any phone or scanner. Every bin knows exactly what it holds.
    </Feature>
    <Feature id="channels" flip eyebrow="Channels" title={<>Every channel,<br />one stock count.</>} art={<ChannelCount />} label="Blue Mug 12oz, SKU BM-12: 1,184 available. Shopify 1,184, WooCommerce 1,184, Amazon 1,084 with 100 held for an FBA transfer, Stall 1,184, all synced. Order #4471 from Shopify reserved at 9:12 am.">
      Shopify, WooCommerce, Amazon and Stall orders land in Pier, and stock flows back to each one within a minute.
    </Feature>
  </Pair>
}
