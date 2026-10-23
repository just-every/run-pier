import { useRef, useState } from 'react'
import { records, type PierState, type RunCommand } from './api'
import { Empty, Field, Form, Select, Table, text } from './controls'
import { words } from './display'

type Props = { state: PierState; run: RunCommand; busy: boolean; refresh: () => Promise<void> }

export function Operators({ state, run, busy, refresh }: Props) {
  const [pending, setPending] = useState(false)
  const [physicalGrant, setPhysicalGrant] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const inFlight = useRef(false)
  const operators = records(state, 'operators')
  const canInvite = operators.some(operator => operator.id === state.actor.id && operator.role === 'owner' && operator.status === 'active')
  const grantFor = (id: string) => records(state, 'roles').find(role => role.id === id)?.permissions
  const assignable = operators.filter(operator => operator.id !== state.actor.id && operator.role !== 'owner')

  async function reload() {
    if (inFlight.current) return
    inFlight.current = true; setPending(true)
    try { await refresh(); setNeedsReload(false); setError('') }
    catch { setError('Current operators could not reload. Try reloading again before taking another action.') }
    finally { inFlight.current = false; setPending(false) }
  }

  async function invite(data: FormData) {
    if (inFlight.current || busy || needsReload) return
    inFlight.current = true; setPending(true); setNotice(''); setError('')
    const email = text(data, 'email').trim()
    try {
      const response = await fetch('/auth/invite', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, displayName: text(data, 'displayName').trim(), role: 'member', returnTo: '/app' }),
      })
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('unconfirmed')
      if (response.status >= 500) throw new Error('unconfirmed')
      if (!response.ok) {
        const code = 'error' in body && typeof body.error === 'string' ? body.error : 'request_rejected'
        setError(code === 'invitation_conflict'
          ? 'Invitation conflicts with an existing operator. Reload operators to check their current status.'
          : `Invitation was not accepted (${code}). Check the details and your current native owner session.`)
        return
      }
      if (response.status !== 202 || !('status' in body) || body.status !== 'accepted') throw new Error('unconfirmed')
      setNotice(`Invitation accepted for ${email}. Email delivery is not confirmed. The operator must accept the invitation before signing in.`)
      try { await refresh() }
      catch { setNeedsReload(true); setError('The invitation was accepted, but current operators could not reload. Reload operators before taking another action.') }
    } catch {
      setNeedsReload(true)
      setError('The invitation outcome is unconfirmed. Reload operators and check their status before deciding whether to invite again. Email delivery is not confirmed.')
    } finally { inFlight.current = false; setPending(false) }
  }

  return <section className="panel"><h2>Operator roles</h2>
    <Table headings={['Operator', 'Status', 'Pier role', 'Physical stock grant']}>{operators.map(operator => <tr key={operator.id}>
      <td>{operator.name || operator.email}<small>{operator.email}</small></td><td>{words(operator.status)}</td>
      <td>{words(records(state, 'roles').find(role => role.id === operator.id)?.role || (operator.role === 'owner' ? 'owner' : 'viewer'))}</td>
      <td>{grantFor(operator.id) ? <>{grantFor(operator.id).warehouses.join(', ') || 'No warehouses'}<small>{grantFor(operator.id).locationIds.length ? `Locations: ${grantFor(operator.id).locationIds.join(', ')}` : 'All locations in these warehouses'}</small><small>{grantFor(operator.id).expiresAt ? `Expires ${grantFor(operator.id).expiresAt}` : 'No expiry'}</small></> : 'No physical stock restriction'}</td>
    </tr>)}</Table>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy || pending} onClick={() => void reload()}>Reload operators</button>
    {!needsReload && (canInvite ? <Form title="Invite an operator" submit="Invite operator" busy={busy || pending} onSubmit={invite}
      note="Invite a native member, then assign their Pier role below. New members have viewer access until you assign a role.">
      <Field label="Operator name" name="displayName" maxLength={120} autoComplete="name" />
      <Field label="Operator email" name="email" type="email" autoComplete="email" />
    </Form> : <p className="muted">A native owner must invite new operators.</p>)}
    {!needsReload && (assignable.length ? <Form title="Set an invited operator’s role" busy={busy || pending}
      note="Pier roles control stock and document authority. Your own authority and native owners are managed through native owner management. The server checks current authority on every command."
      onSubmit={data => run('role.set', { operatorId: text(data, 'operatorId'), role: text(data, 'role'), ...(physicalGrant ? { permissions: { warehouses: text(data, 'warehouses').split(',').map(value => value.trim()).filter(Boolean), locationIds: text(data, 'locationIds').split(',').map(value => value.trim()).filter(Boolean), ...(text(data, 'expiresAt') ? { expiresAt: text(data, 'expiresAt') } : {}) } } : {}) })}>
      <label className="field"><span><input type="checkbox" checked={physicalGrant} onChange={event => setPhysicalGrant(event.target.checked)} /> Restrict to physical stock and counts</span></label>
      {physicalGrant && <><p className="muted">Costs, prices, customers and business documents stay private. Empty warehouses revoke physical access. Empty locations permit every location in the named warehouses. Use an ISO timestamp with Z or an explicit offset for expiry.</p><Field label="Granted warehouses (comma separated)" name="warehouses" required={false} /><Field label="Granted location identities (comma separated)" name="locationIds" required={false} /><Field label="Grant expiry (ISO timestamp)" name="expiresAt" required={false} /><details><summary>Available location identities</summary><ul>{records(state, 'locations').map(location => <li key={location.id}>{location.warehouse} · {location.name} · {location.id}</li>)}</ul></details></>}
      <Select label="Operator" name="operatorId" rows={assignable} />
      <label className="field"><span>Role</span><select aria-label="Role" name="role" defaultValue="viewer">{['viewer', 'buyer', 'operator', 'warehouse', 'agent', 'owner'].map(role => <option key={role} value={role}>{words(role)}</option>)}</select></label>
    </Form> : <Empty>Invite an operator to assign a Pier role.</Empty>)}
  </section>
}
