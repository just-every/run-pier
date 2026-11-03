import { Field, Table } from '../controls'
import { itemLabel, records, type RecordData, type PierState } from '../api'

type SourceLine = { poLineId: string; quantity: string; packSize: string; unit: string }
type Source = { reference: string; original: string; freight?: string | null; tax?: string; lines: SourceLine[] }
export type BillSources = { invoice?: Source; bol?: Source }

type Props = { state: PierState; po?: RecordData; value: BillSources; onChange: (value: BillSources) => void; busy: boolean }
export function BillDocumentEditor({ state, po, value, onChange, busy }: Props) {
  if (!po) return null
  return <div className="line-editor"><h3>Source documents</h3><p>Optionally retain invoice and BOL text and transcribe their quantities. These are operator-entered comparisons, not supplier verification. Quantities below are document packs; the billed quantities above remain base units. Freight and tax transcribed here must equal the invoice freight and tax above; a BOL that states no freight is left blank.</p>{(['invoice', 'bol'] as const).map(kind => {
    const source = value[kind], title = kind === 'invoice' ? 'Invoice' : 'BOL'
    const change = (next: Source) => onChange({ ...value, [kind]: next })
    return <div key={kind}><label><input type="checkbox" checked={!!source} disabled={busy || (kind === 'bol' && !value.invoice)} onChange={event => {
      if (!event.target.checked) { const next = { ...value }; delete next[kind]; if (kind === 'invoice') delete next.bol; onChange(next) }
      else change({ reference: '', original: '', ...(kind === 'invoice' ? { freight: '0', tax: '0' } : { freight: '' }), lines: po.lines.map((line: any) => ({ poLineId: line.id, quantity: '', packSize: '1', unit: records(state, 'items').find(i => i.id === line.itemId)?.unit ?? '' })) })
    }} /> Retain {title} source</label>{source && <>
      <Field label={`${title} source reference`} value={source.reference} onChange={reference => change({ ...source, reference })} disabled={busy} maxLength={2000} />
      <label className="field"><span>{title} original text</span><textarea aria-label={`${title} original text`} required maxLength={2000} value={source.original} onChange={event => change({ ...source, original: event.target.value })} disabled={busy} /></label>
      <Field label={`${title} freight (USD)`} value={source.freight ?? ''} required={kind === 'invoice'} onChange={freight => change({ ...source, freight })} disabled={busy} inputMode="decimal" />
      {kind === 'invoice' && <Field label="Invoice tax (USD)" value={source.tax ?? '0'} onChange={tax => change({ ...source, tax })} disabled={busy} inputMode="decimal" />}
      <Table headings={['Source item', 'Document quantity', 'Base units per pack', 'Base unit']} numeric={[1, 2]}>{source.lines.map(line => {
        const committed = po.lines.find((l: any) => l.id === line.poLineId)
        const update = (key: keyof SourceLine, next: string) => change({ ...source, lines: source.lines.map(l => l.poLineId === line.poLineId ? { ...l, [key]: next } : l) })
        return <tr key={line.poLineId}><td>{itemLabel(state, committed.itemId)}</td>{(['quantity', 'packSize', 'unit'] as const).map((key, index) => <td key={key}><Field label={`${title} ${['document quantity', 'base units per pack', 'base unit'][index]} · ${itemLabel(state, committed.itemId)}`} value={line[key]} required={key === 'quantity' ? false : !!line.quantity} onChange={next => update(key, next)} disabled={busy} /></td>)}</tr>
      })}</Table>
    </>}</div>
  })}</div>
}
export function BillDocumentReview({ bill, state }: { bill: RecordData; state: PierState }) {
  if (!bill.documents) return null
  return <div><h3>Retained source documents</h3>{Object.entries(bill.documents).map(([kind, raw]) => {
    const source = raw as Source
    return <details key={kind}><summary>{kind === 'bol' ? 'BOL' : 'Invoice'} · {source.reference}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.original}</pre><p>Freight {source.freight ?? 'not stated'} USD{kind === 'invoice' ? ` · tax ${source.tax} USD` : ''}</p><Table headings={['PO line', 'Document quantity × pack', 'Base quantity / unit']}>{source.lines.map(line => <tr key={line.poLineId}><td>{itemLabel(state, bill.lines.find((l: any) => l.poLineId === line.poLineId)?.itemId)}</td><td>{line.quantity} × {line.packSize}</td><td>{(line as any).baseQuantity} {line.unit}</td></tr>)}</Table></details>
  })}{bill.documentHistory?.length > 0 && <details><summary>Earlier source versions ({bill.documentHistory.length})</summary>{bill.documentHistory.map((entry: any, index: number) => <div key={index}><p>Invoice version {entry.version} · replaced {entry.replacedAt}</p>{Object.entries(entry.documents).map(([kind, source]: [string, any]) => <div key={kind}><strong>{source.reference}</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.original}</pre></div>)}</div>)}</details>}{bill.match.differences.filter((d: any) => d.kind.endsWith('Document')).map((d: any, index: number) => <p role="alert" key={index}>{d.message}</p>)}</div>
}
