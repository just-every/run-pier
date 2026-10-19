import type { CSSProperties, ReactNode } from 'react'
import { Check, Icon, SectionHead } from '../parts'
import { HANDHELDS, ITEM, SEP } from '../story'

// Desk page 04: three rugged handhelds (painted plates of the devices with their screens blank, redrawn
// clean from the desk's page by 12ui) whose screens are HTML: the put-away split on Nov 3, the count that
// disagrees and the recount on Nov 4. Each plate's glass, as shares of the plate: left, top, width, height.

type Glass = [number, number, number, number]
const GLASS: Record<string, Glass> = { 'put-away': [19.8, 12.4, 63.6, 71], 'cycle-count': [16.9, 12.96, 66.2, 71.5], recount: [17.2, 12.5, 64.7, 71] }

function Handheld({ plate, time, where, title, sub, label, children }: { plate: string; time: string; where: string; title: string; sub: string; label: string; children: ReactNode }) {
  const [left, top, width, height] = GLASS[plate]
  const set = (ext: string) => `/site/handheld-${plate}-435.${ext} 435w, /site/handheld-${plate}-870.${ext} 870w`
  return <figure className={`handheld handheld-${plate}`} role="img" aria-label={label} style={{ '--gl': `${left}%`, '--gt': `${top}%`, '--gw': width / 100, '--gh': `${height}%` } as CSSProperties}>
    <picture className="handheld-body">
      <source type="image/avif" srcSet={set('avif')} sizes="(max-width: 999px) 360px, 29vw" />
      <img src={`/site/handheld-${plate}-870.webp`} srcSet={set('webp')} sizes="(max-width: 999px) 360px, 29vw" alt="" loading="lazy" decoding="async" />
    </picture>
    <div className="screen" aria-hidden="true">
      <p className="screen-status"><span>{time}</span><span>{where}</span></p>
      <div className="screen-head"><p className="screen-title">{title}</p><p className="screen-sub">{sub}</p></div>
      <div className="screen-body">{children}</div>
    </div>
  </figure>
}

const Item = ({ bin }: { bin?: string }) => bin
  ? <p className="screen-item"><span className="bin-chip">{bin}</span>{ITEM.name}</p>
  : <p className="screen-item"><Icon name="mug" className="item-mug" />{ITEM.name}{SEP}{ITEM.sku}</p>

const Figure = ({ label, sub, value, tone = '' }: { label: ReactNode; sub: string; value: string; tone?: string }) =>
  <div className={`screen-figure ${tone}`.trim()}><div><p className="figure-label">{label}</p><p className="figure-sub">{sub}</p></div><p className="figure-value">{value}</p></div>

export function Counting() {
  const { putAway, count, recount } = HANDHELDS
  return <section id="count" className="band counting" aria-labelledby="count-title">
    <div className="page-wrap">
      <SectionHead id="count" eyebrow="Nov 3–4 · Put away and count" title="Right bin, right count.">
        Scan the bin, scan the carton. A count that disagrees gets a recount before anything moves.
      </SectionHead>
      <div className="handhelds">
        <Handheld plate="put-away" {...putAway} label={`Put away at ${putAway.time}, ${putAway.sub}: ${putAway.bins.map(b => `${b.bin} ${b.from} to ${b.to}, ${b.add}`).join('; ')}; ${putAway.cartons.join(', ')}; ${putAway.done}.`}>
          <Item />
          {putAway.bins.map(bin => <div key={bin.bin} className="bin-move">
            <span className="bin-chip">{bin.bin}</span><p className="bin-change">{bin.from} → {bin.to}</p>
            {bin.note === 'Overflow' ? <span className="overflow">{bin.note}</span> : <span className="bin-note">{bin.note}</span>}<span className="bin-add">{bin.add}</span>
          </div>)}
          <p className="screen-line"><span>{putAway.cartons[0]}</span><b>{putAway.cartons[1]}</b></p>
          <p className="screen-action green"><Check />{putAway.done}</p>
        </Handheld>
        <Handheld plate="cycle-count" {...count} label={`Cycle count ${count.sub} at ${count.time}: bin A-14 expected ${count.expected[0]} (${count.expected[1]}), counted ${count.counted[0]} (${count.counted[1]}). ${count.note} ${count.last.join(' ')}. ${count.action}.`}>
          <Item bin="A-14" />
          <Figure label="Expected" sub={count.expected[1]} value={count.expected[0]} />
          <Figure label={<><Icon name="alert" className="figure-alert" />Counted</>} sub={count.counted[1]} value={count.counted[0]} tone="red" />
          <p className="screen-note">{count.note}</p>
          <p className="screen-line"><span>{count.last[0]}</span><b>{count.last[1]}</b></p>
          <p className="screen-action red"><Icon name="clock" />{count.action}</p>
        </Handheld>
        <Handheld plate="recount" {...recount} label={`Recount ${recount.sub} at ${recount.time}: bin A-14 expected ${recount.expected[0]}, counted ${recount.counted[0]}; ${recount.note}. ${recount.adjustment.join(': ')}. ${recount.done}.`}>
          <Item bin="A-14" />
          <Figure label="Expected" sub={recount.expected[1]} value={recount.expected[0]} />
          <Figure label="Counted" sub={recount.counted[1]} value={recount.counted[0]} tone="green" />
          <p className="screen-note">{recount.note}</p>
          <p className="screen-line"><span>{recount.adjustment[0]}</span><b>{recount.adjustment[1]}</b></p>
          <p className="screen-action green"><Check />{recount.done}</p>
        </Handheld>
      </div>
    </div>
  </section>
}
