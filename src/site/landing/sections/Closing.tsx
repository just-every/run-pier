import { Actions } from '../../shell/Actions'
import { SiteFooter } from '../../shell/SiteFooter'
import { Check, Icon, Painting } from '../parts'
import { CLOSING_TAGS } from '../story'

/** Desk page 10: the closing promise at the hero's size over the dock at dusk, a loaded truck pulling out,
 * then the footer. The tags sit on the plate's 1536 x 1080 canvas: the reorder sent from the lit door and
 * ship day's count on the truck. Phones show the plate's right part (x 836-1536, y 520-1080). */
export function Closing() {
  return <>
    <section className="closing" aria-labelledby="closing-title">
      <div className="closing-scene">
        <Painting className="closing-art" name="closing" widths={[768, 1152, 1536, 2304, 3072]} sizes="(max-width: 760px) 220vw, 100vw" />
        <div className="closing-canvas" aria-hidden="true">
          <svg className="closing-pins" viewBox="0 0 1536 1080"><circle className="pin-sent" cx="420" cy="716" r="7.5" /><path className="pin-out" d="M1316 700 1287 744" /><circle className="pin-out" cx="1287" cy="744" r="7.5" /></svg>
          <p className="closing-tag tag-sent"><Icon name="doc" />{CLOSING_TAGS.po}</p>
          <p className="closing-tag tag-out"><Check />{CLOSING_TAGS.out}</p>
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
