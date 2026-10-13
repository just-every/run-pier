import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode, type FormEvent } from 'react'
import { type RecordData } from './api'
import { fromMillionths } from './quantity'

// `display` is the visible label when it needs markup (an item's unbroken SKU); `label` stays its accessible name.
export function Field({ label, display, name, value, onChange, required = true, type = 'text', hint, ...props }: { label: string; display?: ReactNode; name?: string; value?: string; onChange?: (value: string) => void; required?: boolean; type?: string; hint?: string; [key: string]: any }) {
  return <label className="field"><span>{display ?? label}</span><input aria-label={label} name={name} value={value} onChange={onChange ? event => onChange(event.target.value) : undefined} required={required} type={type} {...props} />{hint && <small>{hint}</small>}</label>
}
export function Select({ label, name, rows, value, defaultValue, onChange, required = true }: { label: string; name?: string; rows: RecordData[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; required?: boolean }) {
  return <label className="field"><span>{label}</span><select aria-label={label} name={name} value={value} defaultValue={defaultValue} onChange={onChange ? event => onChange(event.target.value) : undefined} required={required}><option value="">Choose {label.toLowerCase()}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.label || (row.sku ? `${row.name} · ${row.sku} (${row.unit})` : row.name || row.email || row.id)}</option>)}</select></label>
}
// `secondary` gives a destructive or reversing submit the quiet style, so it never looks like the main action.
export function Form({ title, children, onSubmit, submit = 'Save', busy, disabled, note, secondary = false }: { title: string; children: ReactNode; onSubmit: (data: FormData) => void | Promise<unknown>; submit?: string; busy?: boolean; disabled?: boolean; note?: string; secondary?: boolean }) {
  function handle(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy || disabled) return; void onSubmit(new FormData(event.currentTarget)) }
  return <section className="panel"><h2>{title}</h2>{note && <p className="muted">{note}</p>}<form onSubmit={handle}><div className="form-grid">{children}</div><div className="form-actions"><button className={secondary ? undefined : 'primary'} disabled={busy || disabled} type="submit">{busy ? 'Saving…' : submit}</button></div></form></section>
}
export const text = (data: FormData, key: string) => String(data.get(key) || '')
export const version = (row: RecordData) => Number(row.version)
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }
export function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span> }
// Phone widths show each row as a labelled record: every cell names its column
// (data-label, drawn by CSS), so cell text stays exactly the value. Explicit
// roles keep the table semantics when the layout changes. `numeric` columns
// hold quantities and align right; an unlabelled column holds the row's action.
export function Table({ headings, children, numeric = [], className = '' }: { headings: string[]; children: ReactNode; numeric?: number[]; className?: string }) {
  const kind = (index: number) => [numeric.includes(index) && 'num', !headings[index] && 'action'].filter(Boolean).join(' ')
  const rows = Children.map(children, row => isValidElement<{ children: ReactNode }>(row) ? cloneElement(row as ReactElement<any>, { role: 'row' }, Children.map(row.props.children, (cell, index) => isValidElement<{ children: ReactNode; className?: string }>(cell) ? cloneElement(cell as ReactElement<any>, { role: 'cell', 'data-label': headings[index] || undefined, className: [cell.props.className, kind(index)].filter(Boolean).join(' ') || undefined }, <div className="cell-value">{cell.props.children}</div>) : cell)) : row)
  return <div className={['table-wrap', className].filter(Boolean).join(' ')}><table role="table"><thead role="rowgroup"><tr role="row">{headings.map((heading, index) => <th role="columnheader" key={index} className={kind(index) || undefined}>{heading}</th>)}</tr></thead><tbody role="rowgroup">{rows}</tbody></table></div>
}
// Up to four facts read across one row; a longer record reads as label/value pairs.
export function Facts({ values }: { values: { label: string; value: ReactNode }[] }) { return <dl className={values.length > 4 ? 'facts facts-list' : 'facts'}>{values.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value ?? '—'}</dd></div>)}</dl> }
export function Lines({ items, price = false, onChange }: { items: RecordData[]; price?: boolean; onChange: (lines: { itemId: string; quantity: string; price?: string }[]) => void }) {
  const [lines, setLines] = useState([{ itemId: '', quantity: '', price: '' }])
  function update(index: number, key: string, value: string) { const next = lines.map((line, i) => i === index ? { ...line, [key]: value } : line); setLines(next); onChange(next) }
  return <div className="line-editor">{lines.map((line, i) => <div className="line-row" key={i}><Select label={`Item ${i + 1}`} rows={items} value={line.itemId} onChange={value => update(i, 'itemId', value)} /><Field label="Quantity (base units)" value={line.quantity} onChange={value => update(i, 'quantity', value)} inputMode="decimal" />{price && <Field label="Unit price (AUD)" value={line.price} onChange={value => update(i, 'price', value)} inputMode="decimal" />}<button type="button" disabled={lines.length === 1} onClick={() => { const next = lines.filter((_, n) => n !== i); setLines(next); onChange(next) }}>Remove</button></div>)}<button type="button" onClick={() => { const next = [...lines, { itemId: '', quantity: '', price: '' }]; setLines(next); onChange(next) }}>+ Add line</button></div>
}
export function Evidence({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return <ul>{value.map((entry, i) => <li key={i}><Evidence value={entry} /></li>)}</ul>
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    const rawQuantity = 'sequence' in row || ('orderLineId' in row && 'orderId' in row && 'locationId' in row)
    return <dl className="evidence">{Object.entries(row).map(([key, entry]) => <div key={key}><dt>{key === 'quantity' && rawQuantity ? 'quantity (base units)' : key.replace(/([A-Z])/g, ' $1')}</dt><dd><Evidence value={key === 'quantity' && rawQuantity && typeof entry === 'string' ? fromMillionths(entry) : entry} /></dd></div>)}</dl>
  }
  return <span>{String(value)}</span>
}
