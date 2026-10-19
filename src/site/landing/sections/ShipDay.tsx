import type { CSSProperties } from 'react'
import { Check, Icon, SectionHead } from '../parts'
import { DAY_TICKS, RATE_SHOP, SHIP_DAY, type DayEvent } from '../story'

// Desk page 06: Nov 5 on a linear axis from 6 am to 4 pm, each event at its real time (--t is minutes
// after 6 am), with the UPS label failure and its recovery, then SO-2291's rate shop. The tick labels
// have their own row; the cards below the line start under it (BUILD-NOTES: no label hidden by a card).
// On phones and tablets the day turns vertical on a left rail.

// How far each card starts left of its stem, in desk px, so the cards keep the desk's places and clear
// each other (the 2:10 failure and 3:55 now sit 8 apart instead of touching).
const OFFSET: Record<string, number> = { '6:40 am': 83, '9:15 am': 96, '11:20 am': 97, '1:05 pm': 95, '2:10 pm': 115, '2:14 pm': 9, '3:55 pm': 107 }

const Mark = ({ tone }: { tone: DayEvent['tone'] }) => tone === 'failed' ? <Icon name="alert" className="event-alert" /> : <Check />

function Event({ event }: { event: DayEvent }) {
  return <li className={`event ${event.side} ${event.tone}`} style={{ '--t': event.minutes, '--o': OFFSET[event.at] } as CSSProperties}>
    <span className="event-stem" /><span className="event-dot" />
    <div className="event-card"><Mark tone={event.tone} /><div><p className="event-at">{event.at}</p><p className="event-title">{event.title}</p><p className="event-note">{event.note}</p></div></div>
  </li>
}

function RateShop() {
  return <div className="card rate-card" role="img" aria-label={`${RATE_SHOP.title}, ${RATE_SHOP.sub}: ${RATE_SHOP.rates.map(rate => `${rate.service} ${rate.price}${rate.chosen ? ', chosen' : ''}`).join('; ')}.`}>
    <div aria-hidden="true">
      <div className="rate-head"><Icon name="truck" className="rate-truck" /><div><h3 className="card-title">{RATE_SHOP.title}</h3><p className="card-sub">{RATE_SHOP.sub}</p></div></div>
      <ul className="rate-rows">{RATE_SHOP.rates.map(rate => <li key={rate.service} className={rate.chosen ? 'chosen' : ''}>
        <span className={`dot dot-${rate.tone}`} /><span className="rate-service">{rate.service}</span><span className="rate-price">{rate.price}</span>{rate.chosen ? <svg className="tick" viewBox="0 0 16 16"><path d="m2.8 8.6 3.3 3.2 7-7.4" /></svg> : <span />}
      </li>)}</ul>
    </div>
  </div>
}

export function ShipDay() {
  const label = `Nov 5, 6 am to 4 pm: ${SHIP_DAY.map(event => `${event.at}, ${event.title}, ${event.note}`).join('; ')}.`
  return <section id="ship-day" className="band ship-day desk-scaled" aria-labelledby="ship-day-title">
    <div className="page-wrap">
      <SectionHead id="ship-day" eyebrow="Nov 5 · Ship day" title="All out by 4 pm.">
        Pick by wave, pack, rate-shop, print the label and send the ship notice. Tracking goes to each customer.
      </SectionHead>
      <div className="day">
        <div className="day-line" role="img" aria-label={label}>
          <ol className="day-events" aria-hidden="true">{SHIP_DAY.map(event => <Event key={event.at} event={event} />)}</ol>
          <div className="day-axis" aria-hidden="true">{DAY_TICKS.map(([minutes, text]) => <span key={text} className="tick-mark" style={{ '--t': minutes } as CSSProperties}><span className="tick-label">{text}</span></span>)}</div>
        </div>
        <RateShop />
      </div>
    </div>
  </section>
}
