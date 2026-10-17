import { useState } from 'react'
import { records } from '../api'
import { readReply } from '../wire'
import { when } from '../display'
import type { ChannelProps, Connection } from './model'

// The Stall side of a Stall connection: Pier creates the key Stall uses to read
// Pier's stock and reserve its paid orders, and says exactly where it goes.

type Issued = { key: string; origin: string; customerId: string }

export function StallSteps() {
  return <div className="stall-steps"><h3>Before you start, in Stall</h3><ol className="steps">
    <li>Open Stall and sign in as its owner. No Stall yet? Start one on this computer with <code>npx -y @runeditrun/rer dev just-every/run-stall</code>.</li>
    <li>On Stall's owner page, scroll to <strong>Agent access</strong> and choose <strong>Create agent credential</strong>. Copy the credential it shows into <strong>Access token</strong> below. Stall's agent credentials last seven days; create a new one here when Pier reports that Stall refused access.</li>
    <li>For <strong>Store API address</strong>, copy Stall's address from its browser tab, for example <code>http://localhost:8791</code>.</li>
  </ol><p className="muted">After you connect, Pier shows the key Stall needs to read Pier's stock. Guide: <a href="https://run-pier.com/docs/channels" target="_blank" rel="noreferrer">Channels</a>.</p></div>
}

export function StallLink({ state, run, busy, row }: ChannelProps & { row: Connection }) {
  const customers = records(state, 'parties').filter(p => p.kind === 'customer')
  const [customerId, setCustomerId] = useState<string>(row.stallLink?.customerId ?? customers.find(p => /stall|shop|online/i.test(String(p.name)))?.id ?? '')
  const [issued, setIssued] = useState<Issued | null>(null)
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
  const settings = issued && `PIER_ORIGIN=${issued.origin}\nPIER_SESSION=pier_channel=${issued.key}\nPIER_CUSTOMER_ID=${issued.customerId}`
  return <div className="stall-link">
    <h3>Stall's key to Pier {row.stallLink ? <small>created {when(row.stallLink.createdAt)}</small> : <small>not created yet</small>}</h3>
    {!issued && <>
      <p className="muted">Stall reads Pier's stock and reserves each paid order here, under one Pier customer. {row.stallLink ? 'Creating a new key stops the old one at once.' : 'Choose that customer, then create the key.'}</p>
      <label className="field"><span>Customer for Stall's orders</span><select aria-label="Customer for Stall's orders" value={customerId} disabled={busy || working} onChange={event => setCustomerId(event.target.value)}><option value="">Choose a customer</option>{customers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><small>No shop customer yet? <button type="button" className="link" disabled={busy || working} onClick={() => void run('party.save', { name: 'Online shop (Stall)', kind: 'customer', email: '' })}>Add “Online shop (Stall)”</button></small></label>
      <div className="actions"><button className="primary" disabled={busy || working || !customerId} onClick={() => void create()}>{working ? 'Creating…' : row.stallLink ? 'Create a new key for Stall' : 'Create Stall\'s key to Pier'}</button>{row.stallLink && <button disabled={busy || working} onClick={() => void run('channel.stallUnlink', { channelId: row.id, version: row.version })}>Remove Stall's key</button>}</div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </>}
    {settings && <>
      <p><strong>Copy these three lines now.</strong> Pier shows the key once and keeps only a fingerprint of it.</p>
      <pre className="stall-settings" aria-label="Stall settings">{settings}</pre>
      <div className="actions"><button onClick={() => void navigator.clipboard?.writeText(settings)}>Copy the three lines</button><button className="link" onClick={() => setIssued(null)}>Done</button></div>
      <h4>Put them in Stall</h4>
      <ol className="steps">
        <li><strong>Stall on this computer:</strong> in Stall's folder, open the file named <code>.dev.vars</code> (create it if it is missing), paste the three lines on their own lines and save. Then restart Stall: run <code>rer dev --stop</code> and then <code>rer dev</code> in that folder.</li>
        <li><strong>Stall online:</strong> in Stall's folder run <code>rer deploy --set-secret PIER_ORIGIN</code>, then the same for <code>PIER_SESSION</code> and <code>PIER_CUSTOMER_ID</code>, pasting each value after the equals sign when asked.</li>
        <li>Back in Stall, publish a product whose SKU matches a Pier item. A paid Stall order then appears here under Orders, reserved in Pier.</li>
      </ol>
    </>}
  </div>
}
