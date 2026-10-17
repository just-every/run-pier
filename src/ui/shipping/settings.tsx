import { useState } from 'react'
import { Badge, Field, Form, text } from '../controls'
import { AddressFields, readAddress } from './address'
import type { Settings, ShippingProps } from './model'

export function ShippingSettings({ state, run, busy, settings }: ShippingProps & { settings?: Settings }) {
  const [mode, setMode] = useState(settings?.mode ?? 'test')
  const [apiKey, setApiKey] = useState(''), [webhookSecret, setWebhookSecret] = useState('')
  const owner = state.actor.role === 'owner'
  return <section className="panel"><h2>EasyPost connection <Badge>{settings?.connected ? settings.mode === 'test' ? 'Test key saved' : 'Production key saved' : 'Connection pending'}</Badge></h2>
    {!settings?.connected && <p>Start with your EasyPost Test API key (EZTK…). When you are ready to buy postage, save your Production API key (EZAK…) in production mode.</p>}
    <p className="muted">EasyPost and carriers charge for production postage and any account fees. UPS and FedEx services need activated carrier accounts in EasyPost.</p>
    {settings?.mode === 'test' && <p className="notice">Test labels are not postage and cannot be used to ship goods.</p>}
    {settings?.connected && <p>Tracking webhooks: {settings.webhookConfigured ? 'signing secret saved' : 'not configured'}.</p>}
    {!owner ? <p className="muted">The owner connects EasyPost and maintains the ship-from address.</p> : <details open={!settings?.connected}><summary>{settings?.connected ? 'Manage connection and ship-from address' : 'Set up EasyPost'}</summary>
      <Form title="EasyPost setup" submit="Save shipping setup" busy={busy} onSubmit={async data => {
        if (await run('shipping.save', { apiKey: apiKey.trim(), webhookSecret: webhookSecret.trim(), mode, fromAddress: readAddress(data) })) { setApiKey(''); setWebhookSecret('') }
      }} note="Leave secret fields blank to keep saved credentials. Saving setup does not purchase a label.">
        <label className="field"><span>Mode</span><select aria-label="Mode" value={mode} disabled={busy} onChange={event => setMode(event.target.value as 'test' | 'production')}><option value="test">Test</option><option value="production">Production — real postage</option></select></label>
        <Field label="EasyPost API key" type="password" value={apiKey} onChange={setApiKey} required={!settings?.connected || mode !== settings.mode} autoComplete="off" disabled={busy} hint={mode === 'test' ? 'Test key begins EZTK.' : 'Production key begins EZAK. Label purchase charges the connected account.'} />
        <Field label="Webhook signing secret" type="password" value={webhookSecret} onChange={setWebhookSecret} required={false} autoComplete="off" disabled={busy} hint="Use the same signing secret for your EasyPost tracking webhook." />
        <fieldset disabled={busy}><legend>Ship from</legend><div className="form-grid"><AddressFields address={settings?.fromAddress} disabled={busy} nameLabel="Sender or business name" /></div></fieldset>
      </Form>
      <p className="muted">For automatic tracking updates, register this address as an EasyPost webhook using the same signing secret:</p><p><code>{typeof window === 'undefined' ? '' : window.location.origin}/api/pier/shipping/webhook</code></p>
    </details>}
  </section>
}
