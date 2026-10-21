import { useState } from 'react'
import { records, label, unit, type PierState, type RunCommand } from './api'
import { ItemName, when } from './display'
import { Badge, Empty, Evidence, Field, Form, Select, Table, text } from './controls'

/** Extends Transfers with the same existing panels, forms and responsive tables. */
export function WarehouseSlotting({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const bins = records(state, 'locations').filter(l => l.kind === 'bin'), items = records(state, 'items').filter(i => !i.archived)
  const [binId, setBinId] = useState('')
  const bin = bins.find(b => b.id === binId), policy = bin?.storagePolicy
  const warehouses = [...new Set(bins.map(b => b.warehouse))].map(name => ({ id: name, version: 1, name }))
  const plans = records(state, 'slottingPlans').slice().reverse()
  return <>
    <section className="panel"><h2>Bin policies and directed tasks</h2><p>Capacity includes sellable and quarantine stock. Set dimensions in centimetres and usable volume in cubic centimetres. Aisle and bay are walking coordinates in metres from your warehouse entrance; sequence breaks travel ties. Until supervisor roles exist, the owner approves policies and plans.</p><Select label="Bin policy to edit" rows={bins.map(b => ({ ...b, label: `${b.warehouse} · ${b.name}` }))} value={binId} onChange={setBinId} /></section>
    {bin && state.actor.role === 'owner' && <Form key={`${bin.id}-${bin.version}`} title={`Storage policy · ${bin.name}`} submit="Save bin policy" busy={busy} onSubmit={data => {
      const pickFace = data.get('pickFace') === 'on', itemId = text(data, 'faceItemId')
      const pickFaces = pickFace ? [...(policy?.pickFaces ?? []).filter((f: any) => f.itemId !== itemId), ...(itemId ? [{ itemId, minimum: text(data, 'minimum'), maximum: text(data, 'maximum') }] : [])] : []
      return run('location.policy', { locationId: bin.id, version: bin.version, allowedItemIds: data.getAll('allowedItemIds').map(String), pickFace, pickFaces, ...Object.fromEntries(['capacityCm3','lengthCm','widthCm','heightCm','aisleMetres','bayMetres','pickSequence'].map(key => [key, text(data, key)])) })
    }}>
      <Field label="Usable capacity (cm³)" name="capacityCm3" defaultValue={policy?.capacityCm3 ?? ''} inputMode="decimal" />
      <Field label="Bin length (cm)" name="lengthCm" defaultValue={policy?.lengthCm ?? ''} inputMode="decimal" /><Field label="Bin width (cm)" name="widthCm" defaultValue={policy?.widthCm ?? ''} inputMode="decimal" /><Field label="Bin height (cm)" name="heightCm" defaultValue={policy?.heightCm ?? ''} inputMode="decimal" />
      <Field label="Aisle coordinate (metres)" name="aisleMetres" defaultValue={policy?.aisleMetres ?? '0'} inputMode="decimal" /><Field label="Bay coordinate (metres)" name="bayMetres" defaultValue={policy?.bayMetres ?? '0'} inputMode="decimal" /><Field label="Pick sequence" name="pickSequence" defaultValue={policy?.pickSequence ?? '0'} inputMode="decimal" />
      <label className="field"><span>Permitted stock</span><select aria-label="Permitted stock" name="allowedItemIds" multiple defaultValue={policy?.allowedItemIds ?? []}>{items.map(i => <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>)}</select><small>No selection permits all dimensioned items.</small></label>
      <label className="field"><span><input name="pickFace" type="checkbox" defaultChecked={policy?.pickFace ?? false} /> Pick face</span></label>
      <Select label="Item threshold to add or replace" name="faceItemId" required={false} rows={items} /><Field label="Pick-face minimum (base units)" name="minimum" required={false} inputMode="decimal" /><Field label="Pick-face maximum (base units)" name="maximum" required={false} inputMode="decimal" />
      {policy?.pickFaces?.length > 0 && <div>{policy.pickFaces.map((f: any) => <p key={f.itemId}>{label(items, f.itemId)} · minimum {f.minimum} · maximum {f.maximum}</p>)}</div>}
    </Form>}
    <Form title="Plan put-away and replenishment" submit="Prepare warehouse plan" busy={busy} note="Plans move no stock. Only dimensioned, permitted goods and measured destination bins are proposed; receiving-bin put-away is optional." onSubmit={data => run('slotting.plan', { warehouse: text(data, 'warehouse'), ...(text(data, 'sourceLocationId') ? { sourceLocationId: text(data, 'sourceLocationId') } : {}) })}><Select label="Planning warehouse" name="warehouse" rows={warehouses} /><Select label="Receiving bin to put away" name="sourceLocationId" required={false} rows={bins.map(b=>({...b,label:`${b.warehouse} · ${b.name}`}))} /></Form>
    {!plans.length && <Empty>No warehouse plans yet.</Empty>}
    {plans.map(plan => <section className="panel" id={`document-${plan.id}`} key={plan.id}><h2>Warehouse plan · {plan.warehouse}</h2><p><Badge>{plan.status}</Badge> · {when(plan.createdAt)}</p><p className="muted">{plan.basis}</p>
      {plan.status === 'proposed' && state.actor.role === 'owner' && <button className="primary" disabled={busy} onClick={()=>run('slotting.approve',{planId:plan.id,version:plan.version})}>Approve exact warehouse plan</button>}
      {!plan.tasks.length && <Empty>No fitting stock movement is currently proposed.</Empty>}
      {plan.tasks.map((task: any, index: number) => <article className="record" key={index}><h3>{task.kind} · {label(items,task.itemId)}</h3><p>{label(bins,task.fromLocationId)} → {label(bins,task.toLocationId)} · {task.quantity} {unit(state,task.itemId)} · {task.distanceMetres === null ? 'Travel coordinates unavailable' : `${task.distanceMetres} metres`} · priority {task.priority + 1}</p><p>{task.reason}</p>{task.status === 'completed' ? <p>Movement confirmed · {when(task.confirmation.at)} · {task.confirmation.device}</p> : plan.status === 'approved' && <Form title="Confirm physical task" submit="Confirm scanned movement" busy={busy} onSubmit={data=>run('slotting.scan',{planId:plan.id,version:plan.version,taskIndex:index,fromCode:text(data,'fromCode'),toCode:text(data,'toCode'),itemCode:text(data,'itemCode'),quantity:text(data,'quantity'),device:text(data,'device')})}><Field label="Scan source bin" name="fromCode" /><Field label="Scan destination bin" name="toCode" /><Field label="Scan task item" name="itemCode" /><Field label="Confirmed base-unit quantity" name="quantity" inputMode="decimal" /><Field label="Device or workstation" name="device" /></Form>}</article>)}
      <details><summary>ABC slotting and pick evidence</summary><Table numeric={[2]} headings={['Item','ABC','Confirmed picks / day','Recommendation','Basis']}>{plan.abc.map((entry: any)=><tr key={entry.itemId}><td><ItemName state={state} id={entry.itemId} /></td><td>{entry.group}</td><td>{entry.scansPerDay}</td><td>{entry.recommendedLocationId ? label(bins,entry.recommendedLocationId) : 'No evidence-backed recommendation'}</td><td>{entry.reason}<details><summary>Source observations and size</summary><Evidence value={{dimensions:entry.dimensions,travel:entry.travel,observations:entry.observations}} /></details></td></tr>)}</Table></details>
    </section>)}
  </>
}
