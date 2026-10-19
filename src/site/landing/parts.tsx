// The pieces every section is made of. Text in the drawings is real text; the
// drawings are HTML and CSS (style/cards.css, style/sections/), never screenshots.
import type { ReactNode } from 'react'
import { SEP } from './story'

/** A section's eyebrow (a date in PO-1048's story), heading and lead. */
export function SectionHead({ id, eyebrow, title, children, className = '' }: { id: string; eyebrow: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return <div className={`section-head ${className}`.trim()}>
    <p className="eyebrow">{eyebrow.replaceAll(' · ', SEP)}</p>
    <h2 id={`${id}-title`}>{title}</h2>
    {children && <p className="lead">{children}</p>}
  </div>
}

/** A painted plate: AVIF, then WebP, at the sizes public/site holds. */
export function Painting({ name, widths, sizes, alt = '', className, phone, eager = false }: { name: string; widths: number[]; sizes: string; alt?: string; className?: string; phone?: { name: string; widths: number[]; media: string }; eager?: boolean }) {
  const set = (n: string, ws: number[], ext: string) => ws.map(w => `/site/${n}-${w}.${ext} ${w}w`).join(', ')
  const largest = Math.max(...widths)
  return <picture className={className}>
    {phone && <source media={phone.media} type="image/avif" srcSet={set(phone.name, phone.widths, 'avif')} sizes="100vw" />}
    {phone && <source media={phone.media} type="image/webp" srcSet={set(phone.name, phone.widths, 'webp')} sizes="100vw" />}
    <source type="image/avif" srcSet={set(name, widths, 'avif')} sizes={sizes} />
    <img src={`/site/${name}-${largest}.webp`} srcSet={set(name, widths, 'webp')} sizes={sizes} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
  </picture>
}

/** A filled round check, the green "done" of every drawing. */
export const Check = ({ tone = 'green' }: { tone?: 'green' | 'tint' }) => <svg className={`check check-${tone}`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="m7 12.4 3.3 3.3L17.2 8.6" /></svg>
/** A bare tick after a line of text. */
export const Tick = () => <svg className="tick" viewBox="0 0 16 16"><path d="m2.8 8.6 3.3 3.2 7-7.4" /></svg>

const PATHS: Record<string, ReactNode> = {
  box: <><path d="M12 2.8 20.5 7.4v9.2L12 21.2l-8.5-4.6V7.4z" /><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2" /></>,
  truck: <><path d="M2.5 6h11v10h-11zM13.5 9.5h4.2l3 3.4V16h-7.2" /><circle cx="6.5" cy="17.5" r="1.9" /><circle cx="17" cy="17.5" r="1.9" /></>,
  alert: <><path d="M12 3.2 21.6 20H2.4z" /><path d="M12 9.5v5M12 17.4v.1" /></>,
  list: <><rect x="4.5" y="3" width="15" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
  doc: <><path d="M6 2.8h8.5l4.5 4.5v13.9H6z" /><path d="M14.3 2.8v4.6h4.7M9 12h7M9 15.5h7" /></>,
  store: <><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5 4.6 4h14.8L21 9.5c0 1.5-1.2 2.5-2.6 2.5S16 11 16 9.5c0 1.5-1.2 2.5-2.6 2.5h-2.8C9.2 12 8 11 8 9.5 8 11 6.8 12 5.4 12S3 11 3 9.5z" /><path d="M9.5 20v-5h5v5" /></>,
  anchor: <><circle cx="12" cy="5" r="2.2" /><path d="M12 7.2V21M8 11h8M4.5 14.5c0 3.6 3.4 6.5 7.5 6.5s7.5-2.9 7.5-6.5M4.5 14.5l-1.6 1.8M4.5 14.5l2 1.2M19.5 14.5l1.6 1.8M19.5 14.5l-2 1.2" /></>,
  'scan-line': <><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15M7.5 12h9" /></>,
  spark: <><path d="M12 2.5c.8 4.6 2.9 6.7 7.5 7.5-4.6.8-6.7 2.9-7.5 7.5-.8-4.6-2.9-6.7-7.5-7.5 4.6-.8 6.7-2.9 7.5-7.5z" /></>,
  mug: <><path d="M4.5 5.5h11.5v11a3 3 0 0 1-3 3H7.5a3 3 0 0 1-3-3z" /><path d="M16 8.5h1.5a3 3 0 0 1 0 6H16" /></>,
}
export const Icon = ({ name, className = '' }: { name: keyof typeof PATHS | string; className?: string }) => <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24">{PATHS[name]}</svg>

/** A barcode drawn from its own text, so the same label always draws the same bars. */
export function Barcode({ value, width = 120, height = 18, className = '' }: { value: string; width?: number; height?: number; className?: string }) {
  let seed = 0
  for (const character of value) seed = (seed * 31 + character.charCodeAt(0)) >>> 0
  const bars: [number, number][] = []
  let x = 0
  while (x < width) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const bar = 1 + (seed >>> 16) % 3, gap = 1 + (seed >>> 20) % 2
    if (x + bar > width) break
    bars.push([x, bar]); x += bar + gap
  }
  return <svg className={`barcode ${className}`.trim()} viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none">{bars.map(([at, w]) => <rect key={at} x={at} width={w} height={height} />)}</svg>
}
