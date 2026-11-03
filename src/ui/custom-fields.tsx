import { useEffect, useRef, useState } from 'react'
import { records, type PierState, type RunCommand, type RecordData } from './api'
import { Evidence, Field, Form, Select, Table, text } from './controls'

const kinds = ['item', 'customer', 'supplier', 'order']
function parseValue(definition: RecordData, value: string) {
  if (value === '') return null
  if (definition.type === 'boolean') return value === 'true'
  return value
}
function ValueInput({ definition, value, onChange }: { definition: RecordData; value: string; onChange: (value: string) => void }) {
  const label = definition.label
  if (['boolean', 'choice'].includes(definition.type)) return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}><option value="">No value</option>{(definition.type === 'boolean' ? ['true', 'false'] : definition.options).map((option: string) => <option key={option} value={option}>{option}</option>)}</select></label>
  return <Field label={label} required={false} type={definition.type === 'date' ? 'date' : 'text'} inputMode={definition.type === 'number' ? 'decimal' : undefined} value={value} onChange={onChange} />
}
export function CustomFields({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [kind, setKind] = useState('item'), [recordId, setRecordId] = useState(''), [values, setValues] = useState<Record<string, string>>({})
  const [fieldId, setFieldId] = useState(''), [filterValue, setFilterValue] = useState(''), [matches, setMatches] = useState<any>(null)
  const [problem, setProblem] = useState(''), [review, setReview] = useState<any>(null), [reading, setReading] = useState(false)
  const request = useRef<AbortController | null>(null), fileRound = useRef(0)
  const definitions = records(state, 'customFieldDefinitions').filter(d => d.ownerType === kind)
  const rows: RecordData[] = kind === 'item' ? records(state, 'items') : kind === 'order' ? records(state, 'orders').map(r => ({ ...r, name: r.reference })) : records(state, 'parties').filter(r => r.kind === kind)
  const record = rows.find(r => r.id === recordId), field = definitions.find(d => d.id === fieldId)
  useEffect(() => {
    setValues(Object.fromEntries(definitions.map(d => [d.key, record?.customFields?.[d.key] == null ? '' : String(record.customFields[d.key])])))
    request.current?.abort(); setReading(false); setMatches(null); setReview(null); setProblem(''); fileRound.current++
  }, [kind, recordId, state.version])
  useEffect(() => () => request.current?.abort(), [])
  if (state.actor.role !== 'owner') return <section className="panel"><h1>Custom fields</h1><p role="status">Only the current owner can access custom fields.</p></section>
  function download() {
    const content = rows.map(r => ({ ownerType: kind, recordId: r.id, version: r.version, values: r.customFields ?? {} }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)]))
    const link = document.createElement('a'); link.href = url; link.download = 'pier-custom-fields.json'; link.click(); URL.revokeObjectURL(url)
  }
  async function importFile(file?: File) {
    const round = ++fileRound.current; setReview(null); setProblem('')
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Choose a JSON file smaller than 1 MB.')
      const imported = JSON.parse(await file.text())
      if (!Array.isArray(imported) || !imported.length || imported.length > 200) throw new Error('Import 1 to 200 records from the downloaded JSON format.')
      const seen = new Set()
      for (const entry of imported) {
        const collection = entry.ownerType === 'item' ? records(state, 'items') : entry.ownerType === 'order' ? records(state, 'orders') : records(state, 'parties').filter(r => r.kind === entry.ownerType)
        const current = collection.find(r => r.id === entry.recordId)
        if (!kinds.includes(entry.ownerType) || !current || current.version !== entry.version || seen.has(current.id)) throw new Error('A record is missing, repeated or changed. Download current records and review again.')
        seen.add(current.id)
        if (!entry.values || typeof entry.values !== 'object' || Array.isArray(entry.values)) throw new Error('Each record needs a values object.')
        for (const key of Object.keys(entry.values)) if (!records(state, 'customFieldDefinitions').some(d => d.ownerType === entry.ownerType && d.key === key)) throw new Error('Define each imported field before importing its values.')
      }
      if (round === fileRound.current) setReview({ rows: imported, stateVersion: state.version })
    } catch (error) { if (round === fileRound.current) setProblem((error as Error).message) }
  }
  async function filter() {
    if (!field) return
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setReading(true); setMatches(null); setProblem('')
    try {
      const response = await fetch('/api/pier/custom-fields?' + new URLSearchParams({ ownerType: kind, field: field.key, value: JSON.stringify(parseValue(field, filterValue)) }), { cache: 'no-store', signal: controller.signal })
      const body: any = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Filtering failed. Try again.')
      if (!controller.signal.aborted) setMatches(body.records)
    } catch (error) { if (!controller.signal.aborted) setProblem((error as Error).message) }
    finally { if (!controller.signal.aborted) setReading(false) }
  }
  return <section aria-label="Custom fields"><h1>Custom fields</h1><p>Owner-only attributes. Blank values clear the live value; retained originals and documents stay under owner custody.</p>
    <label className="field"><span>Record type</span><select aria-label="Record type" value={kind} onChange={e => { setKind(e.target.value); setRecordId(''); setFieldId(''); setFilterValue('') }}>{kinds.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
    {problem && <p role="alert">{problem}</p>}
    <details><summary>Define a custom field</summary><Form title="New field" submit="Define field" busy={busy} onSubmit={data => run('customField.define', { ownerType: kind, key: text(data, 'key'), label: text(data, 'label'), type: text(data, 'type'), options: text(data, 'options').split('\n').map(v => v.trim()).filter(Boolean) })}>
      <Field label="Field key" name="key" pattern="[a-z][a-z0-9_]{0,49}" hint="Stable lowercase key. Type and key cannot change after definition." /><Field label="Field label" name="label" />
      <label className="field"><span>Field type</span><select aria-label="Field type" name="type">{['text', 'number', 'boolean', 'date', 'choice'].map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Choices (one per line)</span><textarea aria-label="Choices (one per line)" name="options" /></label>
    </Form></details>
    <Form key={kind + recordId + (record?.version ?? 0)} title="Edit field values" submit="Save field values" busy={busy} disabled={!record || !definitions.length} onSubmit={() => record ? run('customField.set', { ownerType: kind, recordId, version: record.version, values: Object.fromEntries(definitions.map(d => [d.key, parseValue(d, values[d.key] ?? '')])) }) : undefined}>
      <Select label="Field record" rows={rows} value={recordId} onChange={setRecordId} />
      {record && definitions.map(d => <ValueInput key={d.id} definition={d} value={values[d.key] ?? ''} onChange={value => setValues(old => ({ ...old, [d.key]: value }))} />)}
      {!definitions.length && <p>Define a field for this record type to begin.</p>}
    </Form>
    <section className="panel"><h2>Filter field values</h2><Select label="Filter field" rows={definitions.map(d => ({ ...d, label: d.label }))} value={fieldId} onChange={value => { request.current?.abort(); setReading(false); setFieldId(value); setFilterValue(''); setMatches(null) }} />
      {field && <ValueInput definition={{ ...field, label: 'Filter value' }} value={filterValue} onChange={value => { request.current?.abort(); setReading(false); setFilterValue(value); setMatches(null) }} />}
      <button disabled={busy || reading || !field} onClick={() => void filter()}>Filter records</button>
      {matches && <><p role="status">{matches.length} matching records</p><Table headings={['Record', 'Value']}>{matches.map((r: any) => <tr key={r.id}><td>{r.sku || r.reference || r.name}</td><td>{r.customFields[field!.key] === null ? 'No value' : String(r.customFields[field!.key])}</td></tr>)}</Table></>}
    </section>
    <section className="panel"><h2>Import and export field values</h2><p>Download current records, edit the values object and upload the JSON file. Keep record identities and versions. Review every proposed value before applying; a changed record requires a fresh review.</p>
      <button onClick={download}>Download field records</button><label className="field"><span>Field JSON file</span><input aria-label="Field JSON file" type="file" accept=".json" onChange={e => void importFile(e.target.files?.[0])} /></label>
      {review && <div><h3>Review field import</h3><Evidence value={review.rows} /><button disabled={busy || review.stateVersion !== state.version} onClick={() => void run('customField.import', review)}>Approve field import</button></div>}
    </section>
  </section>
}
