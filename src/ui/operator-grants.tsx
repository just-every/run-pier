import { useState } from 'react'
import { records, type PierState, type RecordData, type RunCommand } from './api'
import { Field, Form, Select, text } from './controls'
import { words } from './display'

export const roleLabel = (role: string) => role === 'buyer' ? 'Purchasing' : role === 'operator' ? 'Sales operations' : words(role)

export function CommercialVisibility({ role, nativeOwner }: { role?: RecordData; nativeOwner: boolean }) {
  const owner = nativeOwner || role?.role === 'owner'
  const scoped = !owner && Boolean(role?.permissions)
  const costs = owner || (!scoped && role?.role === 'buyer' && role?.visibility?.costs !== false)
  const prices = owner || (!scoped && ['operator', 'sales'].includes(role?.role) && role?.visibility?.prices !== false)
  return <>Costs {costs ? 'visible' : 'hidden'}<small>Sales prices {prices ? 'visible' : 'hidden'}</small></>
}

const emptyEditor = { operatorId: '', role: 'viewer', physical: false, warehouses: '', locationIds: '', expiresAt: '', hideCosts: false, hidePrices: false }

export function OperatorRoleForm({ state, operators, run, busy }: { state: PierState; operators: RecordData[]; run: RunCommand; busy: boolean }) {
  const [editor, setEditor] = useState(emptyEditor)

  function choose(operatorId: string) {
    const saved = records(state, 'roles').find(role => role.id === operatorId)
    setEditor({
      operatorId, role: saved?.role ?? 'viewer', physical: Boolean(saved?.permissions),
      warehouses: saved?.permissions?.warehouses.join(', ') ?? '',
      locationIds: saved?.permissions?.locationIds.join(', ') ?? '',
      expiresAt: saved?.permissions?.expiresAt ?? '',
      hideCosts: saved?.visibility?.costs === false, hidePrices: saved?.visibility?.prices === false,
    })
  }

  async function save(data: FormData) {
    const visibility = { ...(editor.hideCosts ? { costs: false } : {}), ...(editor.hidePrices ? { prices: false } : {}) }
    const saved = await run('role.set', {
      operatorId: text(data, 'operatorId'), role: text(data, 'role'),
      ...(Object.keys(visibility).length ? { visibility } : {}),
      ...(editor.physical ? { permissions: {
        warehouses: text(data, 'warehouses').split(',').map(value => value.trim()).filter(Boolean),
        locationIds: editor.locationIds.split(',').map(value => value.trim()).filter(Boolean),
        ...(text(data, 'expiresAt') ? { expiresAt: text(data, 'expiresAt') } : {}),
      } } : {}),
    })
    if (saved) setEditor(emptyEditor)
    return saved
  }

  return <Form title="Set an invited operator’s role" busy={busy} onSubmit={save}>
    <Select label="Operator" name="operatorId" rows={operators} value={editor.operatorId} onChange={choose} />
    <label className="field"><span>Role</span><select aria-label="Role" name="role" value={editor.role} onChange={event => setEditor({ ...editor, role: event.target.value })}>{['viewer', 'buyer', 'sales', 'operator', 'warehouse', 'finance', 'agent', 'owner'].map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
    <label className="field"><span><input type="checkbox" checked={editor.hideCosts} onChange={event => setEditor({ ...editor, hideCosts: event.target.checked })} /> Hide purchasing costs</span></label>
    <label className="field"><span><input type="checkbox" checked={editor.hidePrices} onChange={event => setEditor({ ...editor, hidePrices: event.target.checked })} /> Hide sales prices</span></label>
    <label className="field"><span><input type="checkbox" checked={editor.physical} onChange={event => setEditor({ ...editor, physical: event.target.checked })} /> Restrict to physical stock and counts</span></label>
    {editor.physical && <>
      <Field label="Granted warehouses (comma separated)" name="warehouses" required={false} value={editor.warehouses} onChange={warehouses => setEditor({ ...editor, warehouses })} />
      <fieldset><legend>Granted locations</legend><p>Leave all unchecked to allow every location in the granted warehouses.</p>{records(state, 'locations').map(location => <label className="check" key={location.id}><input type="checkbox" checked={editor.locationIds.split(',').map(value => value.trim()).includes(location.id)} onChange={event => { const current = editor.locationIds.split(',').map(value => value.trim()).filter(Boolean); setEditor({ ...editor, locationIds: (event.target.checked ? [...current, location.id] : current.filter(id => id !== location.id)).join(', ') }) }} />{location.warehouse} · {location.name}</label>)}</fieldset>
      <Field label="Grant expiry (ISO timestamp)" name="expiresAt" required={false} value={editor.expiresAt} onChange={expiresAt => setEditor({ ...editor, expiresAt })} />
      <details><summary>Physical grant details</summary><p>Receiving, picking, packing, dispatch and physical slips use this grant. Costs, sales prices and sensitive customer profiles stay private. Empty warehouses revoke physical access. Empty locations permit every location in the named warehouses. Use an ISO timestamp with Z or an explicit offset for expiry.</p></details>
    </>}
    <details><summary>Role and visibility details</summary><p>Purchasing can see purchasing costs. Sales and Sales operations can see sales prices. The hide switches only restrict that access. Physical stock grants hide both. Finance has stock access; receivables authority remains with the owner.</p><p>Native owners retain full visibility. Your own authority and native owners are managed through native owner management. Originals, typed fields and sensitive customer profiles remain owner-only. The server checks current authority on every command.</p></details>
  </Form>
}
