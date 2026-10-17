import type { CSSProperties, ReactNode } from 'react'
import { Barcode, Icon } from './parts'

// The tags pinned to the painting, at the desk's positions on its 1536 x 1024 canvas
// (style/landing.css scales the canvas with the hero). Each is a record Pier keeps:
// PO-1048's short receipt, the Target ship notice, A-14's recount, the morning's picks,
// what bin A-14 holds and the reorder the agent suggests. Phones show the painting's
// middle (x 330-1230, y 424-1024 of the canvas) with the two tags that sit on it.
type Tag = { id: string; x: number; y: number; w: number; icon: string; tone: string; title: string; lines: ReactNode[]; code: string; pin: [number, number, number, number]; phone?: boolean }
const TAGS: Tag[] = [
  { id: 'edi', x: 1108, y: 188, w: 182, icon: 'truck', tone: 'green', title: 'EDI 856 sent', lines: ['Target DC 0593'], code: '856-4471-0093', pin: [1108, 236, 1068, 217] },
  { id: 'po', x: 784, y: 298, w: 209, icon: 'box', tone: 'blue', title: 'PO-1048', lines: ['480 of 500 received', <span className="red">20 short</span>], code: 'PO-1048', pin: [812, 406, 795, 452] },
  { id: 'count', x: 1297, y: 414, w: 206, icon: 'alert', tone: 'red', title: 'Count mismatch', lines: [<>A-14 · <span className="green">recounted ✓</span></>], code: 'A-14-COUNT', pin: [1430, 507, 1462, 578] },
  { id: 'picked', x: 1013, y: 571, w: 207, icon: 'list', tone: 'navy', title: 'Picked 38 orders', lines: ['6:40 am'], code: 'WAVE-14', pin: [1040, 654, 1025, 694], phone: true },
  { id: 'bin', x: 541, y: 757, w: 166, icon: 'box', tone: 'blue', title: 'Bin A-14', lines: ['212 units'], code: 'BIN-A-14', pin: [690, 845, 741, 870], phone: true },
  { id: 'reorder', x: 1263, y: 794, w: 208, icon: 'trend', tone: 'green', title: 'Reorder suggested', lines: ['Blue Mug 12oz', <strong>600</strong>], code: 'BM-12-600', pin: [1370, 898, 1407, 937] },
]

export function HeroTags() {
  return <div className="hero-tags" role="img" aria-label="Tags on the harbour: PO-1048, 480 of 500 received, 20 short; EDI 856 ship notice sent to Target DC 0593; a count mismatch in bin A-14, recounted; 38 orders picked by 6:40 am; bin A-14 holds 212 units; a reorder of 600 Blue Mug 12oz suggested">
    <div className="hero-canvas" aria-hidden="true">
      <svg className="hero-pins" viewBox="0 0 1536 1024">{TAGS.map(({ id, phone, pin: [x1, y1, x2, y2] }) => <g key={id} className={phone ? 'on-phone' : undefined}><path d={`M${x1} ${y1}L${x2} ${y2}`} /><circle cx={x2} cy={y2} r="7.5" /></g>)}</svg>
      {TAGS.map(tag => <div key={tag.id} className={`tag tag-${tag.id}${tag.phone ? ' on-phone' : ''}`} style={{ '--x': tag.x, '--y': tag.y, '--w': tag.w } as CSSProperties}>
        <Icon name={tag.icon} className={`tag-icon ${tag.tone}`} />
        <div><p className="tag-title">{tag.title}</p>{tag.lines.map((line, index) => <p key={index} className="tag-line">{line}</p>)}<Barcode value={tag.code} width={78} height={16} /></div>
      </div>)}
    </div>
  </div>
}
