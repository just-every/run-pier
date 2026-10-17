import { useState } from 'react'
import { type RunCommand } from './api'
import { Field, Form, Table, text } from './controls'
import { moveInFields, providerNames, type ExportFile } from '../pier/import-layouts'
import { applyPreset, checkTemplate, exportHeaders, presets, recognise, systemGuides } from '../pier/import-presets'
import { parseCSV } from '../pier/import-csv'

type MoveFile = ExportFile & { preset?: string }
const now = () => new Date().toISOString().slice(0, 19) + 'Z'
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'America/Chicago' } }

/** Recognise a standard export and map it completely, or leave it for the owner to choose. */
function prepared(provider: string, file: MoveFile): MoveFile {
  try {
    const rows = parseCSV(file.csv), preset = recognise(provider, file.name, rows)
    return preset ? applyPreset(file, preset, rows, providerNames[provider]) : { ...file, preset: undefined }
  } catch { return file }
}

export function MoveIn({ run, busy }: { run: RunCommand; busy: boolean }) {
  const [provider, setProvider] = useState('cin7-core'), [files, setFiles] = useState<MoveFile[]>([]), [error, setError] = useState('')
  const update = (index: number, patch: Partial<MoveFile>) => setFiles(previous => previous.map((f, i) => i === index ? { ...f, ...patch } : f))
  const guide = systemGuides[provider]
  async function load(list: FileList | null) {
    if (!list) return
    try {
      const next = await Promise.all(Array.from(list).map(async file => prepared(provider, { name: file.name, kind: '', csv: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await file.arrayBuffer()), columns: {}, constants: {}, archivedColumns: {} })))
      setFiles(previous => [...previous, ...next]); setError('')
    } catch { setError('Save every source file as UTF-8 CSV, then select it again.') }
  }
  function choose(next: string) { setProvider(next); setFiles(previous => previous.map(file => prepared(next, file))) }
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(checkTemplate(provider))}`
  return <Form title="Move from your inventory system" submit="Preview move-in without changing stock" busy={busy} disabled={!files.length || files.some(f => !f.kind)} note="Nothing changes in Pier until you approve the preview. Keep the original exports; costs and the check file are in USD." onSubmit={data => run('import.stage', { provider, namespace: text(data, 'namespace'), sourceVersion: text(data, 'sourceVersion'), exportedAt: text(data, 'exportedAt'), filters: text(data, 'filters'), cutoffTimezone: text(data, 'cutoffTimezone'), mappingRevision: text(data, 'mappingRevision'), currency: 'USD', files: files.map(({ preset, ...file }) => file) })}>
    <label className="field"><span>Current inventory system</span><select aria-label="Current inventory system" value={provider} onChange={e => choose(e.target.value)}>{Object.entries(providerNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    <div className="line-editor"><h3>1. Export from {providerNames[provider]}</h3><p>{guide.menu}</p><ul>{guide.exports.map(row => <li key={row.label}><strong>{row.label}</strong>: {row.how}</li>)}</ul>
      <h3>2. Make the stock check file</h3><p>From a stock valuation report you trust (not the files above), write one row per {provider === 'fishbowl' ? 'location' : 'warehouse and bin'} and unit: {provider === 'fishbowl' ? 'the full Fishbowl location (for example Main-Stock 100)' : 'the warehouse and bin names exactly as in the stock export'}, the unit, the quantity and its USD value. Pier compares these totals before anything moves in. <a href={template} download="stock-check.csv">Download a blank check file</a>.</p>
      <h3>3. Add all the files</h3><p className="muted">Pier recognises each standard export and maps every column. Check each file below, change anything that is wrong, then preview.</p></div>
    <label className="field"><span>Exports and check file</span><input type="file" multiple accept=".csv,text/csv" onChange={e => void load(e.target.files)} /></label>
    <div className="line-editor">{files.map((file, index) => <FileMap key={`${index}-${file.name}`} file={file} provider={provider} update={patch => update(index, patch)} remove={() => setFiles(previous => previous.filter((_, i) => i !== index))} />)}{error && <p role="alert">{error}</p>}</div>
    <details key={provider} className="line-editor"><summary>Export details (filled in for you)</summary><div className="form-grid"><Field label="Source namespace" name="namespace" defaultValue={provider} hint="Keep the same name every time you preview again from this company." /><Field label="Source version" name="sourceVersion" defaultValue={`${providerNames[provider]} export`} /><Field label="Exported at (ISO timestamp)" name="exportedAt" defaultValue={now()} hint="When you saved the exports." /><Field label="Export filters / scope" name="filters" defaultValue="All active records" /><Field label="Cutoff timezone" name="cutoffTimezone" defaultValue={zone()} hint="For example America/Chicago." /><Field label="Mapping revision" name="mappingRevision" defaultValue="1" hint="Raise it when you change a mapping and preview again." /></div></details>
  </Form>
}
function FileMap({ file, provider, update, remove }: { file: MoveFile; provider: string; update: (patch: Partial<MoveFile>) => void; remove: () => void }) {
  let headers: string[] = [], parseError = ''
  try { headers = exportHeaders(parseCSV(file.csv), file.layout) } catch (e) { parseError = (e as Error).message }
  const preset = presets[provider]?.find(p => p.id === file.preset)
  const fields = moveInFields[file.kind] ?? []
  const unmapped = headers.filter(h => h !== '@line' && !Object.values(file.columns ?? {}).includes(h))
  return <section className="record"><h3>{file.name}</h3>{preset ? <p className="notice">Recognised as the {providerNames[provider]} {preset.label} export. All {headers.filter(h => h !== '@line').length} columns are mapped or kept with a reason; open the mapping to check or change it.</p> : !parseError && <p className="muted">Pier does not recognise this as a standard {providerNames[provider]} export. Choose what it contains, then map its columns.</p>}<div className="form-grid"><label className="field"><span>Export content</span><select aria-label={`${file.name} export content`} value={file.kind} onChange={e => update({ kind: e.target.value, columns: {}, constants: {}, archivedColumns: {} })}><option value="">Choose content</option>{Object.keys(moveInFields).map(kind => <option key={kind} value={kind}>{({ items: 'Items / SKU variants', locations: 'Warehouses and bins', suppliers: 'Suppliers', customers: 'Customers', positions: 'Stock on hand and cost', orders: 'Remaining open sales lines', purchaseOrders: 'Remaining open PO lines', controls: 'Stock check file', archive: 'Retain unsupported records' } as Record<string, string>)[kind]}</option>)}</select></label>
    {provider === 'fishbowl' && file.kind === 'purchaseOrders' && <label className="field"><span>Fishbowl PO layout</span><select aria-label="Fishbowl PO layout" value={file.layout ?? ''} onChange={e => update({ layout: e.target.value, columns: {} })}><option value="">Flat report with header</option><option value="fishbowl-purchase">PO and Item record sections</option></select></label>}
    {['orders', 'purchaseOrders'].includes(file.kind) && <><label className="field"><span>Quantity meaning</span><select aria-label="Quantity meaning" value={file.quantityMeaning ?? ''} onChange={e => update({ quantityMeaning: e.target.value })}><option value="">Choose quantity evidence</option><option value="remaining">Remaining open quantity</option><option value="ordered-less-fulfilled">Ordered less fulfilled quantity</option></select></label><label className="field"><span>Line identity</span><select aria-label="Line identity" value={file.lineIdentity ?? ''} onChange={e => update({ lineIdentity: e.target.value })}><option value="">Mapped stable line key</option><option value="document-ordinal">Document + original line order</option></select></label><label className="field"><span>Source promise-date format</span><select aria-label="Source promise-date format" value={file.dateFormat ?? ''} onChange={e => update({ dateFormat: e.target.value })}><option value="">YYYY-MM-DD</option><option value="M/D/YYYY">M/D/YYYY</option></select></label></>}
    <button type="button" onClick={remove}>Remove file</button></div>
    {file.kind === 'archive' ? <Field label="Why these records remain archived" value={file.archiveReason ?? ''} onChange={archiveReason => update({ archiveReason })} /> : <details open={!!file.kind && !preset}><summary>Review column mapping</summary><p className="muted">Choose a source column or enter an explicit fixed value. Leave unit blank on stock/order lines to use the matched item’s base unit. Leave stock cost blank to use the item’s mapped openingCost. A blank stock key uses item + bin + status. Other stable keys are required unless the original document line order is explicitly selected. Map warehouse and bin together to derive stock bins when there is no separate location export.</p><Table headings={['Pier field', 'Source column', 'Explicit fixed value']}>{fields.map(field => <tr key={field}><td>{field}</td><td><select aria-label={`${file.name} ${field} column`} value={file.columns?.[field] ?? ''} onChange={e => { const columns = { ...file.columns }, constants = { ...file.constants }; delete constants[field]; e.target.value ? columns[field] = e.target.value : delete columns[field]; update({ columns, constants }) }}><option value="">Unmapped</option>{headers.map((h, i) => <option key={`${h}-${i}`}>{h}</option>)}</select></td><td><input aria-label={`${file.name} ${field} fixed value`} value={file.constants?.[field] ?? ''} disabled={!!file.columns?.[field]} onChange={e => { const constants = { ...file.constants }; e.target.value ? constants[field] = e.target.value : delete constants[field]; update({ constants }) }} /></td></tr>)}</Table></details>}
    {file.kind && file.kind !== 'archive' && unmapped.length > 0 && <details open={unmapped.some(column => !file.archivedColumns?.[column])}><summary>{unmapped.length} columns Pier keeps in the original, with reasons</summary>{unmapped.map((column, i) => <Field key={`${column}-${i}`} label={`${column}: reason to retain without mapping`} value={file.archivedColumns?.[column] ?? ''} onChange={reason => update({ archivedColumns: { ...file.archivedColumns, [column]: reason } })} />)}</details>}
    {parseError && <p role="alert">{parseError}</p>}<details><summary>Inspect untouched original</summary><pre>{file.csv}</pre></details>
  </section>
}
