import { useState } from 'react'
import { itemLabel, records, unit, type PierState, type RecordData, type RunCommand } from './api'
import { Field, Form, Select, text } from './controls'
import { ItemName } from './display'

export function CountRecord({ state, count, run, busy }: { state: PierState; count: RecordData; run: RunCommand; busy: boolean }) {
  const [additional, setAdditional] = useState<number[]>([])
  return <Form title="Record physical quantities" submit="Save physical count for review" busy={busy} onSubmit={data => run('count.record', { countId: count.id, version: count.version, reason: text(data, 'reason'), lines: [...count.lines.map((line: any, index: number) => ({ itemId: line.itemId, status: line.status, quantity: text(data, `quantity-${index}`) })), ...additional.map(index => ({ itemId: text(data, `extra-item-${index}`), status: text(data, `extra-status-${index}`), quantity: text(data, `extra-quantity-${index}`) }))] })}>
    {count.lines.map((line: any, index: number) => <Field key={`${line.itemId}-${line.status}`} label={`${itemLabel(state, line.itemId)} · ${line.status} (${unit(state, line.itemId)})`} display={<><ItemName state={state} id={line.itemId} /> · {line.status} ({unit(state, line.itemId)})</>} name={`quantity-${index}`} defaultValue={line.quantity} hint={`Captured system quantity ${line.expected} ${unit(state, line.itemId)}`} inputMode="decimal" />)}
    {additional.map(index => <fieldset className="line-row" key={index}><legend>Additional physically observed position</legend><Select label="Observed item" name={`extra-item-${index}`} rows={records(state, 'items')} /><label className="field"><span>Stock status</span><select aria-label="Stock status" name={`extra-status-${index}`}><option value="sellable">Sellable</option><option value="quarantine">Quarantine</option></select></label><Field label="Physical quantity (base units)" name={`extra-quantity-${index}`} inputMode="decimal" /><button type="button" onClick={() => setAdditional(rows => rows.filter(row => row !== index))}>Remove observation</button></fieldset>)}
    <button type="button" onClick={() => setAdditional(rows => [...rows, rows.length ? Math.max(...rows) + 1 : 0])}>+ Add observed item position</button>
    <Field label="Count evidence / reason" name="reason" />
  </Form>
}
