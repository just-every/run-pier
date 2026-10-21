import { useEffect, useState } from 'react'
import { itemLabel, label, records, type PierState, type RunCommand } from './api'
import { Empty, Facts, Field, Form, Select, Table, text } from './controls'

type Props = { state: PierState; run: RunCommand; busy: boolean }
export function ReorderScope({ state, run, busy }: Props) {
 const settings = records(state, 'replenishmentSettings')[0], warehouses = [...new Set(records(state, 'locations').filter(l => l.kind === 'bin').map(l => l.warehouse as string))]
 if (state.actor.role !== 'owner' || !warehouses.length) return null
 return <Form key={settings?.version ?? 0} title="Reorder planning scope" submit="Save planning scope" busy={busy} onSubmit={data => run('replenishment.configure', { version: settings?.version ?? 0, mode: text(data, 'mode'), warehouses: data.getAll('warehouses'), destinationWarehouse: text(data, 'destinationWarehouse') })}>
  <Select label="Replenishment scope" name="mode" defaultValue={settings?.mode ?? 'location'} rows={[{ id: 'location', version: 1, label: 'Per location' }, { id: 'company', version: 1, label: 'Company-wide' }]} />
  <fieldset><legend>Warehouses included in planning</legend>{warehouses.map(w => <Field key={w} label={w} name="warehouses" type="checkbox" value={w} defaultChecked={!settings || settings.warehouses.includes(w)} required={false} />)}</fieldset>
  <Select label="Default receiving warehouse" name="destinationWarehouse" defaultValue={settings?.destinationWarehouse ?? warehouses[0]} rows={warehouses.map(w => ({ id: w, version: 1, label: w }))} />
 </Form>
}
export function ReorderBatch({ state, run, busy }: Props) {
 const low = (state.forecasts ?? []).filter((f: any) => f.configured && f.low)
 const [choices, setChoices] = useState<Record<string, any>>({}), [error, setError] = useState(''), [loading, setLoading] = useState(false)
 useEffect(() => { setChoices({}); setError('') }, [state.version])
 const key = (f: any) => JSON.stringify([f.itemId, f.warehouse])
 const suppliers = records(state, 'parties')
 async function supplier(f: any, supplierId: string) {
   setLoading(true); setError('')
   try {
     const response = await fetch(`/api/pier/replenishment?${new URLSearchParams({ itemId: f.itemId, warehouse: f.warehouse, supplierId })}`, { credentials: 'same-origin', cache: 'no-store' })
     const result: any = await response.json()
     if (!response.ok) throw new Error(result.error?.message ?? 'Supplier calculation could not load.')
     const preview = result.find((r: any) => key(r) === key(f))
     setChoices(current => ({ ...current, [key(f)]: { ...current[key(f)], preview, supplierId, quantity: preview.suggestedQuantity } }))
   } catch (cause) { setError(cause instanceof Error ? cause.message : 'Supplier calculation could not load.') }
   finally { setLoading(false) }
 }
 return <section className="panel"><h2>Reorder list and purchase batch</h2><p>Selected lines become one purchase draft per supplier and destination. Company-wide rows use the included warehouses and the default receiving warehouse. Drafts cover suggestions without adding stock.</p>
  {error && <p role="alert">{error}</p>}
  {!low.length ? <Empty>No items at or below their reorder point.</Empty> : <Table headings={['Choose', 'SKU / destination', 'Supplier / lead time', 'Calculation', 'Draft quantity']}>
   {low.map((original: any) => { const k = key(original), choice = choices[k] ?? {}, f = choice.preview ?? original, terms = records(state, 'supplierItems').filter(t => t.itemId === f.itemId)
    return <tr key={k}><td><input type="checkbox" aria-label={`Select ${itemLabel(state, f.itemId)} at ${f.warehouse}`} checked={choice.selected ?? false} onChange={event => setChoices(c => ({ ...c, [k]: { ...c[k], selected: event.target.checked } }))} /></td><td>{itemLabel(state, f.itemId)}<small>{f.scope === 'company' ? 'Company-wide → ' : ''}{f.warehouse}</small></td><td><select aria-label={`Supplier for ${itemLabel(state, f.itemId)} at ${f.warehouse}`} value={choice.supplierId ?? f.supplierId ?? ''} disabled={loading} onChange={e => void supplier(original, e.target.value)}><option value="">Choose supplier</option>{terms.map(t => <option key={t.id} value={t.supplierId}>{label(suppliers, t.supplierId)}</option>)}</select><small>{f.leadDays} days</small></td><td><details><summary>Calculation for {itemLabel(state, f.itemId)}</summary><Facts values={['onHand', 'reserved', 'backorders', 'onOrder', 'inboundTransfers', 'outboundTransfers', 'position', 'unroundedNeed', 'roundingAdded', 'roundedQuantity', 'draftQuantity', 'suggestedQuantity'].map(name => ({ label: name.replace(/[A-Z]/g, s => ' ' + s.toLowerCase()), value: f[name] }))} /><p>Point {f.applied.reorderPoint}; {f.applied.method} {f.applied.maximum ?? f.applied.reorderQuantity}; pack {f.packSize}; minimum {f.minimum}.</p>{f.daysOfCover !== null && <p>Days of cover {f.daysOfCover}; stockout {f.projectedStockoutDate ?? 'Unknown'}.</p>}{f.drafts.map((d: any) => <p key={d.poId}>{d.reference}: {d.quantity} covered.</p>)}</details>{f.blockedReason && <p>{f.blockedReason}</p>}</td><td><input aria-label={`Purchase quantity for ${itemLabel(state, f.itemId)} at ${f.warehouse}`} inputMode="decimal" value={choice.quantity ?? f.suggestedQuantity} onChange={e => setChoices(c => ({ ...c, [k]: { ...c[k], quantity: e.target.value } }))} />{f.minimumValueUnmet && <small>Supplier minimum value unmet. Grouped draft is checked without padding.</small>}</td></tr>
   })}
  </Table>}
  <button className="primary" disabled={busy || loading || !['owner', 'buyer'].includes(state.actor.role) || !Object.values(choices).some(c => c.selected)} onClick={() => run('replenishment.plan', { stateVersion: state.version, lines: low.filter((f: any) => choices[key(f)]?.selected).map((f: any) => ({ itemId: f.itemId, warehouse: f.warehouse, supplierId: choices[key(f)].supplierId ?? f.supplierId, quantity: choices[key(f)].quantity ?? f.suggestedQuantity })) })}>Create selected purchase drafts</button>
  <h3>Low-stock exceptions</h3>{records(state, 'replenishmentExceptions').filter(e => e.status === 'open').map(e => <p key={e.id}>{itemLabel(state, e.itemId)} · {e.scope === 'company' ? 'Company-wide → ' : ''}{e.warehouse} · {e.nextAction}</p>)}
 </section>
}
