// The pieces every section is made of. Text in the drawings is real text; the
// drawings are HTML and CSS (style/cards.css), never screenshots.
import type { ReactNode } from 'react'

/** One idea: eyebrow, heading and a short paragraph beside its drawing. `flip` puts the drawing first. */
export function Feature({ id, eyebrow, title, children, art, label, flip = false }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode; art: ReactNode; label: string; flip?: boolean }) {
  return <section id={id} className={`feature${flip ? ' flip' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="feature-copy"><p className="eyebrow">{eyebrow}</p><h2 id={`${id}-title`}>{title}</h2><p className="feature-body">{children}</p></div>
    <div className="feature-art" role="img" aria-label={label}><div aria-hidden="true" className="feature-drawing">{art}</div></div>
  </section>
}

/** Two features on one band of paper, as each desk page draws them. */
export function Pair({ children, className = '', rule = false }: { children: ReactNode; className?: string; rule?: boolean }) {
  return <div className={`pair ${className}${rule ? ' ruled' : ''}`}><div className="site-wrap feature-wrap">{children}</div></div>
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
  scan: <><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></>,
  spark: <><path d="M12 2.5c.8 4.6 2.9 6.7 7.5 7.5-4.6.8-6.7 2.9-7.5 7.5-.8-4.6-2.9-6.7-7.5-7.5 4.6-.8 6.7-2.9 7.5-7.5z" /></>,
  mug: <><path d="M4.5 5.5h11.5v11a3 3 0 0 1-3 3H7.5a3 3 0 0 1-3-3z" /><path d="M16 8.5h1.5a3 3 0 0 1 0 6H16" /></>,
  tall: <><path d="M6 3.5h10l-1.2 15.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" /><path d="M15.7 7.5h1.3a2.6 2.6 0 0 1 0 5.2h-1.8" /></>,
  bowl: <><path d="M3 9.5h18a9 9 0 0 1-18 0z" /><path d="M4.2 9.5c1.6-2 4.5-3 7.8-3s6.2 1 7.8 3" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M10 7.5h.01M7 16.5h.01M10 16.5h.01" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  export: <><path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h10a1.5 1.5 0 0 0 1.5-1.5V16" /><path d="M13.5 3 18 7.5M11 12h10M17.5 8.5 21 12l-3.5 3.5" /></>,
  swap: <><path d="M4 8.5h15l-3.5-3.5M20 15.5H5l3.5 3.5" /></>,
  'box-return': <><path d="M10 7.5 16 10.8v6.6L10 20.7l-6-3.3v-6.6z" /><path d="M4 10.8 10 14l6-3.2M10 14v6.7" /><path d="M14 4.5a4.5 4.5 0 0 1 6.4 4.8M20.4 9.3l1.4-2.6M20.4 9.3l-2.7-1" /></>,
  bars: <><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="8" width="3.6" height="12" rx="1" /><rect x="16.4" y="4" width="3.6" height="16" rx="1" /></>,
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
