import { useLayoutEffect, useRef } from 'react'

/** One line of text that ends after its last whole word that fits, with an
 * ellipsis; the full text stays in the title and, for assistive technology and
 * search, in a visually hidden copy. A single word too long for the cell falls
 * back to the stylesheet's ellipsis. */
export function WordClip({ text, className }: { text: string; className?: string }) {
  const cell = useRef<HTMLTableCellElement>(null), shown = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = cell.current, visible = shown.current
    if (!element || !visible) return
    const fit = () => {
      visible.textContent = text
      const words = text.split(/\s+/)
      while (words.length > 1 && element.scrollWidth > element.clientWidth) { words.pop(); visible.textContent = `${words.join(' ').replace(/[,;:·-]+$/, '')}…` }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text])
  // The visible text is written by the fitting above, not by React, so it owns that span.
  return <td ref={cell} className={className} title={text}><span ref={shown} aria-hidden="true" /><span className="visually-hidden">{text}</span></td>
}
