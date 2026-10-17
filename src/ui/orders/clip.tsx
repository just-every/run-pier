import { useLayoutEffect, useRef } from 'react'

/** One line of text that ends after its last whole word that fits, with an
 * ellipsis; the full text stays in the title. A single word too long for the
 * cell falls back to the stylesheet's ellipsis. */
export function WordClip({ text, className }: { text: string; className?: string }) {
  const cell = useRef<HTMLTableCellElement>(null)
  useLayoutEffect(() => {
    const element = cell.current
    if (!element) return
    const fit = () => {
      element.textContent = text
      const words = text.split(/\s+/)
      while (words.length > 1 && element.scrollWidth > element.clientWidth) { words.pop(); element.textContent = `${words.join(' ').replace(/[,;:·-]+$/, '')}…` }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text])
  // The text is written here, not by React, so the fitting above owns the cell's contents.
  return <td ref={cell} className={className} title={text} />
}
