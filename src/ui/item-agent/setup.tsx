import { useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { Badge, Field, Form, text } from '../controls'
import './style.css'

/** Available before the installation has any catalogue or warehouse data. */
export function AISetup({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const settings = records(state, 'aiSettings').find(s => s.id === 'pier-item-ai')
  const [apiKey, setApiKey] = useState('')
  const owner = state.actor.role === 'owner'
  return <div className="item-agent"><section className="panel"><h2>AI setup <Badge>{settings?.enabled && settings.configured ? 'Configured' : 'Not configured'}</Badge></h2><p>Item checks work without an AI key. Connect your own OpenAI account to add an explanation of the stock, receipt-cost, and sell-through evidence.</p><p>OpenAI bills your account for each explanation. Review <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI pricing</a> and your account limits before connecting. Pier does not add a provider fee.</p><p>Only item checks, exact proposed changes, and source record IDs are sent. Customer contact details and the full catalogue stay out of this request. The model cannot apply or approve a change.</p></section>
    {owner ? <Form title={settings?.configured ? 'Manage OpenAI connection' : 'Connect OpenAI'} submit="Save AI connection" busy={busy} onSubmit={async data => {
      const saved = await run('ai.save', { version: settings?.version ?? 0, model: text(data, 'model'), apiKey, consent: data.get('consent') === 'on' })
      if (saved) setApiKey('')
    }}><Field label="OpenAI API key" name="apiKey" type="password" value={apiKey} onChange={setApiKey} autoComplete="off" required={!settings?.configured} hint={settings?.configured ? 'Leave blank to keep the saved key. Enter a key to replace it.' : 'Stored encrypted in this installation. Never returned to the browser.'} /><Field key={`${settings?.id}-${settings?.version}`} label="Exact OpenAI model ID" name="model" defaultValue={settings?.model ?? ''} placeholder="Enter a model available in your OpenAI account" /><label className="field"><span><input type="checkbox" name="consent" required /> I authorize sending this item evidence to OpenAI and paying its usage charges.</span></label></Form> : <section className="panel"><p>An installation owner can connect, replace, or remove the AI key.</p></section>}
    {owner && settings?.configured && <section className="panel"><h2>Remove connection</h2><p>Removing the saved key stops new AI explanations. Deterministic checks and retained review history remain available.</p><button disabled={busy} onClick={() => void run('ai.remove', { version: settings.version })}>Remove AI key</button></section>}
  </div>
}
