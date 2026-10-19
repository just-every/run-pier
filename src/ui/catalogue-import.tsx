import { useRef, useState } from 'react'
import { records, type PierState, type RecordData, type RunCommand } from './api'
import { Table } from './controls'

import { CatalogueDetail } from './catalogue-detail'

type Preview = { stateVersion: number; rows: { line: number; item: RecordData; affectedDocuments: { kind: string; id: string }[] }[]; errors: { line: number; message: string; details?: unknown }[] }
const headers = 'sku,name,unit,packSize,barcode,caseBarcode,variantFamily,category,imageUrl,weight,length,width,height,dimensionUnit,barcodes,references,archived'

export function CatalogueImport({ run, busy, state }: { run: RunCommand; busy: boolean; state: PierState }) {
  const [csv, setCsv] = useState(''), [filename, setFilename] = useState(''), [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [applied, setApplied] = useState(false)
  const revision = useRef(0)
  async function load(file?: File) {
    const current = ++revision.current
    setCsv(''); setPreview(null); setError(''); setApplied(false); setFilename(file?.name || '')
    if (!file) return
    setLoading(true)
    try { const source = await file.text(); if (revision.current === current) setCsv(source) }
    catch { if (revision.current === current) setError('The CSV file could not be read. Choose it again.') }
    finally { if (revision.current === current) setLoading(false) }
  }
  async function review() {
    if (!csv || loading || busy) return
    setLoading(true); setPreview(null); setError(''); setApplied(false)
    try {
      const response = await fetch('/api/pier/catalogue/preview', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv }) })
      const body = await response.json() as Preview & { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'The catalogue preview could not be loaded.')
      setPreview(body)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The catalogue preview could not be loaded.') }
    finally { setLoading(false) }
  }
  return <details className="panel"><summary>Bulk import or edit catalogue CSV</summary>
    <p>Match existing items by SKU to edit them, or add new SKUs. Previewing changes no records or stock. Approval applies the reviewed catalogue changes together.</p>
    <p><a className="button" download="pier-catalogue.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${headers}\r\n`)}`}>Download CSV headers</a></p>
    <details><summary>CSV fields and exact quantities</summary>
      <p>Required columns: sku, name, unit, packSize. Optional columns: barcode, caseBarcode, variantFamily, category, imageUrl, weight, length, width, height, dimensionUnit, barcodes, references, archived.</p>
      <p>Omitted optional columns keep existing values. Blank metadata cells clear those values. Set archived to true or false. Weight is in pounds. Supply all three dimensions with dimensionUnit in or cm; blank dimensions clear them. Images use HTTPS URLs. Used base units and pack conversions cannot change.</p>
      <p>barcodes and references contain JSON arrays. Barcode quantities are exact positive decimal strings in base units; references use a supplier or customer’s Pier ID. Quote each CSV cell containing JSON and double every quote inside it.</p>
      <p>Barcode cell example: <code style={{ overflowWrap: 'anywhere' }}>{'"[{""code"":""INNER-6"",""quantity"":""6"",""label"":""Inner""}]"'}</code></p>
      <p>Reference cell shape: <code style={{ overflowWrap: 'anywhere' }}>{'[{"partyId":"the Pier party ID","code":"their item code"}]'}</code>. Use an empty array to clear additional barcodes or references.</p>
    </details>
    <label className="field"><span>Catalogue CSV file</span><input type="file" accept=".csv,text/csv" disabled={loading || busy} onChange={event => void load(event.target.files?.[0])} /></label>
    {filename && <p>{filename}</p>}
    <div className="form-actions"><button type="button" disabled={!csv || busy || loading} onClick={() => void review()}>{loading ? 'Reading catalogue…' : 'Preview catalogue changes'}</button></div>
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <h3>Review catalogue changes</h3><p>{preview.rows.length} {preview.rows.length === 1 ? 'item' : 'items'} · {preview.errors.length} {preview.errors.length === 1 ? 'error' : 'errors'}. No catalogue changes have been applied.</p>
      {!!preview.errors.length && <div role="alert"><p>Resolve every error in your CSV, upload the corrected file, then preview again.</p><Table headings={['CSV line', 'Error']}>{preview.errors.map((row, index) => <tr key={index}><td>{row.line}</td><td>{row.message}</td></tr>)}</Table></div>}
      {preview.rows.map(row => <article className="panel" key={row.line}>
        <h3>CSV line {row.line} · {row.item.name} · {row.item.sku}</h3>
        <details><summary>Inspect proposed item</summary><CatalogueDetail item={row.item} state={state} preview /></details>
        <p>Affected documents: {row.affectedDocuments.length ? row.affectedDocuments.map(document => `${document.kind} · ${records(state, document.kind).find(record => record.id === document.id)?.reference || records(state, document.kind).find(record => record.id === document.id)?.supplierReference || document.id}`).join(', ') : 'None'}</p>
      </article>)}
      <p>Approval uses this exact preview. If records change before approval, preview again.</p>
      <div className="form-actions"><button type="button" className="primary" disabled={busy || loading || !!preview.errors.length || !preview.rows.length} onClick={async () => {
        if (await run('catalogue.apply', { csv, stateVersion: preview.stateVersion }, { onRefused: refusal => { setError(refusal.message); if (refusal.code === 'STALE') setPreview(null) } })) { setPreview(null); setCsv(''); setApplied(true) }
      }}>{busy ? 'Applying…' : 'Approve and apply catalogue changes'}</button></div>
    </>}
    {applied && <p role="status">Catalogue changes applied. Stock quantities are unchanged.</p>}
  </details>
}
