import { Check, Painting } from '../parts'

/** The one painted band between the stories: down the aisle with a scanner on bin A-14, the day's orders out. */
export function Interlude() {
  return <section className="interlude" aria-label="All 214 orders out by 4 pm">
    <p className="interlude-badge"><Check />All 214 orders out by 4 pm</p>
    <Painting className="interlude-art" name="interlude" widths={[768, 1152, 1536]} sizes="100vw" alt="A warehouse aisle of blue and orange racking, a reach truck lifting a pallet, and a gloved hand scanning the label on bin A-14." />
  </section>
}
