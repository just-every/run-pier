import { Check, Icon, Painting, SectionHead } from '../parts'
import { RECEIVING } from '../story'

/** Desk page 03: the receiving bay at dock 2 as a painted plate (no text in it), with the Dock 2 tag pinned
 * to the door and the Receiving card set over the wall. Positions are on the plate's 1536 x 1024 canvas. */
export function Receiving() {
  return <section id="receiving" className="band receiving" aria-labelledby="receiving-title">
    <div className="page-wrap">
      <SectionHead id="receiving" eyebrow="Nov 3 · Receiving" title="Checked in at the door.">
        Each carton is scanned against the PO as it comes off the truck.
      </SectionHead>
    </div>
    <div className="receiving-scene">
      <div className="receiving-plate">
        <Painting className="receiving-art" name="receiving" widths={[768, 1152, 1536, 2304, 3072]} sizes="(max-width: 760px) 190vw, 100vw" alt="A box truck backed up to dock 2's open door, its trailer stacked with cartons, three shrink-wrapped pallets of cartons on the floor in front of it and a pallet jack beside the racking." />
        <div className="receiving-canvas" aria-hidden="true">
          <svg className="receiving-pin" viewBox="0 0 1536 1024"><path d="M640 84 604 136" /><circle cx="604" cy="136" r="7.5" /></svg>
          <p className="dock-tag"><Icon name="anchor" />Dock 2</p>
        </div>
      </div>
      <div className="card receiving-card" role="img" aria-label={`${RECEIVING.title}: ${RECEIVING.scanned}; ${RECEIVING.received}; ${RECEIVING.short}.`}>
        <div aria-hidden="true">
          <h3 className="card-title with-icon"><Icon name="scan-line" className="title-icon" />{RECEIVING.title}</h3>
          <ul className="rows">
            <li className="lead-mark"><Check />{RECEIVING.scanned}</li>
            <li>{RECEIVING.received}</li>
          </ul>
          <p className="alert red"><Icon name="alert" />{RECEIVING.short}</p>
        </div>
      </div>
    </div>
  </section>
}
