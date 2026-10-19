import type { CSSProperties, ReactNode } from 'react'
import { Barcode, Icon } from './parts'

// The tags pinned to the painting, at the desk's positions on its 1536 x 1024 canvas
// (style/landing.css scales the canvas with the hero). Each is a record Pier keeps:
// PO-1048's short receipt, the Target ship notice, A-14's recount, the morning's picks,
// what bin A-14 holds and the reorder the agent suggests. Only Bin A-14, a physical label,
// carries a barcode (page-s1 STRUCTURE.md). Phones show the painting's
// middle (canvas x 700-1340, y 74-1024) with all six tags enlarged to read, so each tag
// also has a phone position and pin on the same canvas. Each wire starts under its tag.
type Pin = [number, number, number, number]
type Tag = { id: string; x: number; y: number; w: number; icon: string; tone: string; title: string; lines: ReactNode[]; code?: string; pin: Pin; phone: [number, number]; phonePin: Pin }
const TAGS: Tag[] = [
  { id: 'edi', x: 1108, y: 188, w: 182, icon: 'truck', tone: 'green', title: 'EDI 856 sent', lines: ['Target DC 0593'], pin: [1108, 236, 1068, 217], phone: [1087, 87], phonePin: [1087, 156, 1068, 217] },
  { id: 'po', x: 784, y: 298, w: 209, icon: 'box', tone: 'blue', title: 'PO-1048', lines: ['480 of 500 received', <span className="red">20 short</span>], pin: [827, 366, 795, 452], phone: [713, 87], phonePin: [799, 190, 795, 452] },
  { id: 'count', x: 1297, y: 414, w: 206, icon: 'alert', tone: 'red', title: 'Count mismatch', lines: [<>A-14 · <span className="green">recounted ✓</span></>], pin: [1412, 467, 1462, 578], phone: [1012, 425], phonePin: [1258, 425, 1307, 402] },
  { id: 'picked', x: 1013, y: 571, w: 207, icon: 'list', tone: 'navy', title: 'Picked 38 orders', lines: ['6:40 am'], pin: [1055, 614, 1025, 694], phone: [713, 474], phonePin: [987, 566, 1050, 710] },
  { id: 'bin', x: 541, y: 757, w: 166, icon: 'box', tone: 'blue', title: 'Bin A-14', lines: ['212 units'], code: 'BIN-A-14', pin: [690, 845, 741, 870], phone: [713, 632], phonePin: [798, 757, 780, 860] },
  { id: 'reorder', x: 1263, y: 794, w: 208, icon: 'trend', tone: 'green', title: 'Reorder suggested', lines: ['Blue Mug 12oz', <strong>600</strong>], pin: [1332, 858, 1407, 937], phone: [1054, 845], phonePin: [1241, 845, 1290, 770] },
]

const pins = (className: string, pick: (tag: Tag) => Pin) => <g className={className}>{TAGS.map(tag => { const [x1, y1, x2, y2] = pick(tag); return <g key={tag.id}><path d={`M${x1} ${y1}L${x2} ${y2}`} /><circle cx={x2} cy={y2} r="7.5" /></g> })}</g>

export function HeroTags() {
  return <div className="hero-tags" role="img" aria-label="Tags on the harbour: PO-1048, 480 of 500 received, 20 short; EDI 856 ship notice sent to Target DC 0593; a count mismatch in bin A-14, recounted; 38 orders picked by 6:40 am; bin A-14 holds 212 units; a reorder of 600 Blue Mug 12oz suggested">
    <div className="hero-canvas" aria-hidden="true">
      <svg className="hero-pins" viewBox="0 0 1536 1024">{pins('pins-wide', tag => tag.pin)}{pins('pins-phone', tag => tag.phonePin)}</svg>
      {TAGS.map(tag => <div key={tag.id} className={`tag tag-${tag.id}`} style={{ '--x': tag.x, '--y': tag.y, '--w': tag.w, '--px': tag.phone[0], '--py': tag.phone[1] } as CSSProperties}>
        <Icon name={tag.icon} className={`tag-icon ${tag.tone}`} />
        <div><p className="tag-title">{tag.title}</p>{tag.lines.map((line, index) => <p key={index} className="tag-line">{line}</p>)}{tag.code && <Barcode value={tag.code} width={78} height={16} />}</div>
      </div>)}
    </div>
  </div>
}
