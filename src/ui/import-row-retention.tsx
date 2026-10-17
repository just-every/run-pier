import { useState } from 'react'
import { parseCSV } from '../pier/import-csv'
import { fishbowlPurchase, type ExportFile } from '../pier/import-layouts'

/** Retain unsupported source rows under explicit review, never edit originals. */
export function RowRetention({ file, update }: { file: ExportFile; update: (patch: Partial<ExportFile>) => void }) {
  const [selected, setSelected] = useState(''), [reason, setReason] = useState('')
  let rows: { number: number; label: string }[] = []
  try {
    const parsed = parseCSV(file.csv)
    rows = file.layout === 'fishbowl-purchase'
      ? fishbowlPurchase(parsed).filter(row => row.values['@record'] !== 'PO').map(row => ({ number: row.row, label: Object.values(row.values).slice(0, 4).join(' · ') }))
      : parsed.slice(1).map((cells, index) => ({ number: index + 2, label: cells.slice(0, 4).join(' · ') }))
  } catch { return null }
  const retained = file.excludedRows ?? {}
  function add() {
    if (!selected || !reason.trim()) return
    update({ excludedRows: { ...retained, [selected]: reason.trim() } }); setSelected(''); setReason('')
  }
  return <details><summary>Retain individual unsupported rows without importing them ({Object.keys(retained).length})</summary>
    <p>Choose each unsupported or completed row and explain why it stays in the original only. These rows create no items, stock or open orders. Reconcile the supported subset against its own independent stock check; related rows in other files still need review.</p>
    <div className="form-grid"><label className="field"><span>CSV row to retain only</span><select aria-label={`${file.name} row to retain only`} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a source row</option>{rows.filter(row => !retained[String(row.number)]).map(row => <option key={row.number} value={row.number}>Row {row.number}: {row.label.slice(0, 120)}</option>)}</select></label><label className="field"><span>Reason to retain this row only</span><input aria-label={`${file.name} row retention reason`} value={reason} onChange={event => setReason(event.target.value)} /></label></div>
    <button type="button" disabled={!selected || !reason.trim()} onClick={add}>Retain this row without importing</button>
    {Object.entries(retained).map(([number, why]) => <p key={number}>Row {number}: {why} <button className="link" type="button" onClick={() => { const next = { ...retained }; delete next[number]; update({ excludedRows: next }) }}>Include this row again</button></p>)}
  </details>
}
