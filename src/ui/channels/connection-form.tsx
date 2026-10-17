import { useState } from 'react'
import { Field, Form, Select, text } from '../controls'
import { SetupGuide } from './setup-guides'
import { ShopifyCredentials, shopifyCredentialNames } from './shopify-credentials'
import { marketplaces, marketplaceOrigin } from './marketplaces'
import { providers, warehouses, type ChannelProps, type Connection, type Provider } from './model'

type CredentialField = { name: string; label: string; secret?: boolean; hint?: string; optional?: boolean }
const credentials: Record<Provider, CredentialField[]> = {
  stall: [{ name: 'accessToken', label: 'Access token', secret: true, hint: 'Stall → Settings → Agent access → Create agent credential.' }],
  woocommerce: [
    { name: 'consumerKey', label: 'Consumer key', secret: true, hint: 'WooCommerce → Settings → Advanced → REST API → Add key → Read/Write → Generate API Key.' },
    { name: 'consumerSecret', label: 'Consumer secret', secret: true, hint: 'Copy the Consumer secret shown beside the new key; it is shown once.' },
    { name: 'webhookSecret', label: 'Webhook signing secret', secret: true, optional: true, hint: 'Optional password you choose and repeat in WooCommerce → Settings → Advanced → Webhooks → your webhook → Secret.' },
  ],
  shopify: [],
  amazon: [{ name: 'sellerId', label: 'Seller ID', hint: 'Seller Central → Settings → Account Info → Business Information → Your Merchant Token.' }, { name: 'marketplaceId', label: 'Marketplace' }],
}
const refreshFields: CredentialField[] = [
  { name: 'refreshToken', label: 'Refresh token', secret: true, hint: 'Develop Apps → your app → Authorize → Authorize app for your selling account.' },
  { name: 'clientId', label: 'Client ID', hint: 'Develop Apps → your app → LWA credentials → View.' },
  { name: 'clientSecret', label: 'Client secret', secret: true, hint: 'Copy the LWA client secret from the same View panel.' },
]

export function ConnectionForm({ state, run, busy, connection, initialProvider, close }: ChannelProps & { connection?: Connection; initialProvider: Provider; close: () => void }) {
  const [provider, setProvider] = useState<Provider>(connection?.provider ?? initialProvider)
  const [replaceCredentials, setReplaceCredentials] = useState(!connection)
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '')
  const [marketplaceId, setMarketplaceId] = useState(connection ? '' : 'ATVPDKIKX0DER')
  const credentialFields = [...credentials[provider], ...(provider === 'amazon' ? refreshFields : [])]
  const warehouseRows = warehouses(state)
  async function save(data: FormData) {
    const names = provider === 'shopify' ? shopifyCredentialNames : credentialFields.map(field => field.name)
    const secret = Object.fromEntries(names.map(name => [name, text(data, name).trim()]).filter(([, value]) => value !== ''))
    const ok = await run('channel.save', {
      ...(connection ? { id: connection.id, version: connection.version } : {}),
      name: text(data, 'name'), provider,
      baseUrl: connection?.baseUrl ?? (provider === 'amazon' ? marketplaceOrigin(marketplaceId) : text(data, 'baseUrl')),
      warehouse: text(data, 'warehouse'), buffer: text(data, 'buffer'), enabled: data.has('enabled'),
      ...(replaceCredentials ? { credentials: secret } : {}),
    })
    if (ok) close()
  }
  return <div className="channel-connection-editor" id="channel-connection-editor">
    <SetupGuide provider={provider} />
    <Form title={connection ? `Manage ${connection.name}` : 'Connect a store'} busy={busy} disabled={!warehouseRows.length} submit={connection ? 'Save connection' : 'Connect store'} onSubmit={save} note="The owner approves which warehouse and stock buffer this connection uses.">
      <label className="field"><span>Provider</span><select aria-label="Provider" value={provider} disabled={!!connection || busy} onChange={event => setProvider(event.target.value as Provider)}>{providers.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
      <Field label="Connection name" name="name" defaultValue={connection?.name ?? ''} maxLength={200} disabled={busy} />
      <Field label="Store API address" name="baseUrl" type="url" value={provider === 'amazon' ? connection?.baseUrl ?? marketplaceOrigin(marketplaceId) : baseUrl} onChange={setBaseUrl} readOnly={!!connection || provider === 'amazon'} disabled={busy} hint={provider === 'amazon' ? 'Filled from your marketplace country. A different regional address needs a new connection.' : connection ? 'Create a new connection to use another store address.' : provider === 'shopify' ? 'Shopify → Settings → Domains: use https://your-store.myshopify.com, without an admin path.' : provider === 'woocommerce' ? 'WordPress → Settings → General → Site Address (URL): use the shop root, including any subdirectory.' : 'Copy Stall’s address from its browser tab. Do not include credentials.'} />
      <Select label="Warehouse" name="warehouse" rows={warehouseRows} defaultValue={connection?.warehouse ?? (warehouseRows.length === 1 ? warehouseRows[0].id : '')} />
      <Field label="Stock buffer (base units)" name="buffer" defaultValue={connection?.buffer ?? '0'} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" disabled={busy} hint={provider === 'stall' ? 'Stall currently reads one company-wide pool: use one warehouse and a zero buffer.' : 'Deducted from unreserved sellable stock after holds.'} />
      <label className="check"><input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? true} disabled={busy} /><span>Enable this connection</span></label>
      {connection && <label className="check"><input type="checkbox" checked={replaceCredentials} disabled={busy} onChange={event => setReplaceCredentials(event.target.checked)} /><span>Replace credentials <small>Leave off to retain the saved credentials.</small></span></label>}
      {replaceCredentials && <fieldset disabled={busy}><legend>Account credentials</legend><div className="form-grid">
        {provider === 'shopify' && <ShopifyCredentials baseUrl={baseUrl} busy={busy} />}
        {credentialFields.map(field => provider === 'amazon' && field.name === 'marketplaceId'
            ? <label className="field" key="marketplace"><span>Marketplace</span><select aria-label="Marketplace" name="marketplaceId" required value={marketplaceId} onChange={event => setMarketplaceId(event.target.value)}><option value="">Choose your selling country</option>{marketplaces.filter(row => !connection || marketplaceOrigin(row.id) === connection.baseUrl).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><small>Pier supplies the marketplace ID and regional address. Non-USD orders wait for currency review.</small></label>
            : <Field key={`${provider}-${field.name}`} label={field.label} name={field.name} required={!field.optional} type={field.secret ? 'password' : 'text'} autoComplete="off" hint={field.hint} />)}
      </div></fieldset>}
    </Form>
    {!warehouseRows.length && <p className="channel-problem">Create a warehouse bin in Stock before connecting a store.</p>}
    <button type="button" disabled={busy} onClick={close}>Cancel</button>
  </div>
}
