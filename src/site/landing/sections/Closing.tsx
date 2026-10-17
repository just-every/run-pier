import { Actions } from '../../shell/Actions'
import { SiteFooter } from '../../shell/SiteFooter'
import { Check, Icon, Painting } from '../parts'

/** The closing promise over the dock at dusk, a loaded truck pulling out, then the footer.
 * The tags sit on the painting's 1536 x 934 canvas; phones show its right part (x 836-1536, y 440-906). */
export function Closing() {
  return <>
    <section className="closing" aria-labelledby="closing-title">
      <div className="closing-scene">
        <Painting className="closing-art" name="closing" widths={[768, 1152, 1536]} sizes="100vw" phone={{ name: 'closing-phone', widths: [700], media: '(max-width: 760px)' }} />
        <div className="closing-canvas" aria-hidden="true">
          <svg className="closing-pins" viewBox="0 0 1536 934"><path d="M222 609 185 681" /><circle cx="185" cy="681" r="7.5" /><path d="M1317 648 1287 691" /><circle cx="1287" cy="691" r="7.5" /></svg>
          <p className="closing-tag tag-bin-a14"><Icon name="box" />Bin A-14 · 212 units</p>
          <p className="closing-tag tag-shipped"><Check />Shipped</p>
        </div>
      </div>
      <div className="site-wrap closing-copy">
        <h2 id="closing-title">Every shelf, counted.</h2>
        <p className="closing-sub">Open source inventory and order management for wholesalers and distributors.</p>
        <Actions demo={false} />
        <p className="closing-small">Free and open source, MIT licensed.</p>
      </div>
    </section>
    <SiteFooter />
  </>
}
