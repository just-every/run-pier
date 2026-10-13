import type { ReactNode } from 'react'

/**
 * Pier's drawing unit: a shallow stock label with a cut upper-right corner, a
 * header row and its body. `teal` marks the quantity you can promise; `band`
 * tints only the header, for the document labels.
 */
export function StockLabel({ title, step, tone = 'paper', className = '', children }: { title: string; step?: number; tone?: 'paper' | 'teal' | 'band'; className?: string; children: ReactNode }) {
  return (
    <div className={['stock-label', `stock-label-${tone}`, className].filter(Boolean).join(' ')}>
      <p className="stock-label-head">{step ? <span className="stock-label-step">{step}</span> : null}{title}</p>
      <div className="stock-label-body">{children}</div>
    </div>
  )
}

/** One labelled quantity inside a label: its name, then the number. */
export function Quantity({ label, value, size = 'body' }: { label: string; value: string; size?: 'hero' | 'body' }) {
  return (
    <div className={`label-quantity label-quantity-${size}`}>
      <span className="label-quantity-name">{label}</span>
      <span className="label-quantity-value">{value}</span>
    </div>
  )
}
