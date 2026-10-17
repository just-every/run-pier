import { useState } from 'react'
import { Field, Form, Select, text } from '../controls'
import { providers, warehouses, type ChannelProps, type Connection, type Provider } from './model'

type CredentialField = { name: string; label: string; secret?: boolean; hint?: string; optional?: boolean }
const credentials: Record<Provider, CredentialField[]> = {
  stall: [{ name: 'accessToken', label: 'Access token', secret: true }, { name: 'devKey', label: 'Local development key', secret: true, optional: true, hint: 'Only for a local Stall started by rer. Leave blank for a hosted store.' }],
  woocommerce: [
    { name: 'consumerKey', label: 'Consumer key', secret: true },
    { name: 'consumerSecret', label: 'Consumer secret', secret: true },
    { name: 'webhookSecret', label: 'Webhook signing secret', secret: true, optional: true, hint: 'Optional. Use the same secret in WooCommerce to authenticate order webhooks.' },
  ],
  shopify: [
    { name: 'accessToken', label: 'Admin API access token', secret: true },
    { name: 'locationId', label: 'Shopify location ID', hint: 'The full location ID: gid://shopify/Location/ followed by its number.' },
  ],
  amazon: [{ name: 'sellerId', label: 'Seller ID' }, { name: 'marketplaceId', label: 'Marketplace ID' }],
}
const accessFields: CredentialField[] = [{ name: 'accessToken', label: 'Access token', secret: true }]
const refreshFields: CredentialField[] = [
  { name: 'refreshToken', label: 'Refresh token', secret: true },
  { name: 'clientId', label: 'Client ID' },
  { name: 'clientSecret', label: 'Client secret', secret: true },
]

export function ConnectionForm({ state, run, busy, connection, initialProvider, close }: ChannelProps & { connection?: Connection; initialProvider: Provider; close: () => void }) {
  const [provider, setProvider] = useState<Provider>(connection?.provider ?? initialProvider)
  const [replaceCredentials, setReplaceCredentials] = useState(!connection)
  const [amazonAuth, setAmazonAuth] = useState('accessToken')
  const credentialFields = [...credentials[provider], ...(provider === 'amazon' ? amazonAuth === 'accessToken' ? accessFields : refreshFields : [])]
  const warehouseRows = warehouses(state)
  async function save(data: FormData) {
    const secret = Object.fromEntries(credentialFields.map(field => [field.name, text(data, field.name).trim()]).filter(([, value]) => value !== ''))
    const ok = await run('channel.save', {
      ...(connection ? { id: connection.id, version: connection.version } : {}),
      name: text(data, 'name'), provider,
      baseUrl: connection?.baseUrl ?? text(data, 'baseUrl'),
      warehouse: text(data, 'warehouse'), buffer: text(data, 'buffer'), enabled: data.has('enabled'),
      ...(replaceCredentials ? { credentials: secret } : {}),
    })
    if (ok) close()
  }
  return <div className="channel-connection-editor" id="channel-connection-editor">
    <Form title={connection ? `Manage ${connection.name}` : 'Connect a store'} busy={busy} disabled={!warehouseRows.length} submit={connection ? 'Save connection' : 'Connect store'} onSubmit={save} note="The owner approves which warehouse and stock buffer this connection uses.">
      <label className="field"><span>Provider</span><select aria-label="Provider" value={provider} disabled={!!connection || busy} onChange={event => setProvider(event.target.value as Provider)}>{providers.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
      <Field label="Connection name" name="name" defaultValue={connection?.name ?? ''} maxLength={200} disabled={busy} />
      <Field label="Store API address" name="baseUrl" type="url" defaultValue={connection?.baseUrl ?? ''} readOnly={!!connection} disabled={busy} hint={connection ? 'Create a new connection to use another store address.' : 'HTTPS store origin or API endpoint. Do not put credentials in the address.'} />
      <Select label="Warehouse" name="warehouse" rows={warehouseRows} defaultValue={connection?.warehouse ?? (warehouseRows.length === 1 ? warehouseRows[0].id : '')} />
      <Field label="Stock buffer (base units)" name="buffer" defaultValue={connection?.buffer ?? '0'} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" disabled={busy} hint="Deducted from unreserved sellable stock after holds. Current Stall requires zero." />
      <label className="check"><input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? true} disabled={busy} /><span>Enable this connection</span></label>
      {connection && <label className="check"><input type="checkbox" checked={replaceCredentials} disabled={busy} onChange={event => setReplaceCredentials(event.target.checked)} /><span>Replace credentials <small>Leave off to retain the saved credentials.</small></span></label>}
      {replaceCredentials && <fieldset disabled={busy}><legend>Account credentials</legend><div className="form-grid">
        {provider === 'amazon' && <label className="field"><span>Amazon authorization</span><select aria-label="Amazon authorization" value={amazonAuth} onChange={event => setAmazonAuth(event.target.value)}><option value="accessToken">Access token</option><option value="refreshToken">Refresh token and client credentials</option></select></label>}
        {credentialFields.map(field => <Field key={`${provider}-${field.name}`} label={field.label} name={field.name} required={!field.optional} type={field.secret ? 'password' : 'text'} autoComplete="off" hint={field.hint} />)}
      </div></fieldset>}
    </Form>
    {!warehouseRows.length && <p className="channel-problem">Create a warehouse bin in Stock before connecting a store.</p>}
    <button type="button" disabled={busy} onClick={close}>Cancel</button>
  </div>
}
