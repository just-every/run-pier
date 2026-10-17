import { useEffect, useState } from 'react'
import { records } from '../api'
import { readReply } from '../wire'
import { when } from '../display'
import type { ChannelProps, Connection } from './model'

// The Stall side of a Stall connection: Pier creates the key Stall uses to read
// Pier's stock and reserve its paid orders, and says exactly where it goes.

type Issued = { key: string; origin: string; customerId: string }

export function StallSteps() {
  return <div className="stall-steps"><h3>Before you start, in Stall</h3><ol className="steps">
    <li>Open Stall and sign in as its owner. No Stall yet? Start one on this computer with <code>rer dev just-every/run-stall</code> (the <code>rer</code> command from <a href="https://run-pier.com/run" target="_blank" rel="noreferrer">run-pier.com/run</a>).</li>
    <li>In Stall, open <strong>Settings</strong> and scroll to <strong>Agent access</strong> and choose <strong>Create agent credential</strong>. Copy the credential it shows into <strong>Access token</strong> below. Stall's agent credentials last seven days; create a new one here when Pier reports that Stall refused access.</li>
    <li>For <strong>Store API address</strong>, copy Stall's address from its browser tab, for example <code>http://localhost:8791</code>.</li>
  </ol><p className="muted">After you connect, Pier shows the key Stall needs to read Pier's stock. Guide: <a href="https://run-pier.com/docs/channels" target="_blank" rel="noreferrer">Channels</a>.</p></div>
}

export function StallLink({ state, run, busy, row }: ChannelProps & { row: Connection }) {
  const customers = records(state, 'parties').filter(p => p.kind === 'customer')
  const [customerId, setCustomerId] = useState<string>(row.stallLink?.customerId ?? customers.find(p => /stall|shop|online/i.test(String(p.name)))?.id ?? '')
  // The customer just added with “Add Online shop (Stall)” is selected for the key.
  useEffect(() => { if (!customerId) { const shop = customers.find(p => /stall|shop|online/i.test(String(p.name))); if (shop) setCustomerId(shop.id) } }, [customers.length])
  const [issued, setIssued] = useState<Issued | null>(null)
  // The key is shown once: leaving this page (any navigation) puts it away for good.
  useEffect(() => { if (!issued) return; const away = () => setIssued(null); addEventListener('hashchange', away); return () => removeEventListener('hashchange', away) }, [issued])
  const [problem, setProblem] = useState('')
  const [working, setWorking] = useState(false)
  async function create() {
    setWorking(true); setProblem('')
    try {
      const response = await fetch('/api/pier/commands', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: crypto.randomUUID(), type: 'channel.stallKey', payload: { channelId: row.id, version: row.version, customerId } }) })
      const reply = readReply(await response.json())
      if (!reply.ok) setProblem(reply.error.message)
      else { setIssued(reply.result as Issued); await run('channel.sync', {}) }
    } catch { setProblem('Pier could not create the key. Check your connection and try again.') }
    setWorking(false)
  }
  const copy = (value: string) => void navigator.clipboard?.writeText(value)
  return <div className="stall-link">
    <h3>Stall's key to Pier {row.stallLink ? <small>created {when(row.stallLink.createdAt)}</small> : <small>not created yet</small>}</h3>
    {!issued && <>
      <p className="muted">Stall reads Pier's stock and reserves each paid order here, under one Pier customer. {row.stallLink ? 'Creating a new key stops the old one at once.' : 'Choose that customer, then create the key.'}</p>
      <label className="field"><span>Customer for Stall's orders</span><select aria-label="Customer for Stall's orders" value={customerId} disabled={busy || working} onChange={event => setCustomerId(event.target.value)}><option value="">Choose a customer</option>{customers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><small>No shop customer yet? <button type="button" className="link" disabled={busy || working} onClick={() => void run('party.save', { name: 'Online shop (Stall)', kind: 'customer', email: '' })}>Add “Online shop (Stall)”</button></small></label>
      <div className="actions"><button className="primary" disabled={busy || working || !customerId} onClick={() => void create()}>{working ? 'Creating…' : row.stallLink ? 'Create a new key for Stall' : 'Create Stall\'s key to Pier'}</button>{row.stallLink && <button disabled={busy || working} onClick={() => void run('channel.stallUnlink', { channelId: row.id, version: row.version })}>Remove Stall's key</button>}</div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </>}
    {issued && <>
      <p><strong>Copy the key now.</strong> Pier shows it once and keeps only a fingerprint of it.</p>
      <dl className="stall-settings" aria-label="Stall settings">
        <dt>Pier address</dt><dd><code>{issued.origin}</code> <button className="link" onClick={() => copy(issued.origin)}>Copy</button></dd>
        <dt>Pier key</dt><dd><code>{issued.key}</code> <button className="link" onClick={() => copy(issued.key)}>Copy</button></dd>
      </dl>
      <h4>Put them in Stall</h4>
      <ol className="steps">
        <li>In Stall, sign in as the owner and open <strong>Settings</strong>, then <strong>Provider connections</strong> (Stall's address followed by <code>/app#connections</code>).</li>
        <li>In <strong>Connect Pier</strong>, paste the Pier address and the Pier key above and choose <strong>Connect Pier</strong>. Stall checks the key with Pier and shows <strong>Connected</strong>. This works the same for a Stall on this computer and a Stall online.</li>
        <li>Stall takes payments through Stripe, on your own Stripe account. On the same Stall page, fill in <strong>Connect Stripe</strong> with your Stripe secret key (test keys first). A Stall on this computer confirms payments by asking Stripe; a Stall online also takes its Stripe webhook signing secret, and the form says where to find it.</li>
        <li>In Stall, publish a product whose SKU matches a Pier item. Its stock shows in Stall at once, and each paid Stall order appears here under Orders, reserved in Pier.</li>
      </ol>
      <div className="actions"><button className="link" onClick={() => setIssued(null)}>Done</button></div>
    </>}
  </div>
}
