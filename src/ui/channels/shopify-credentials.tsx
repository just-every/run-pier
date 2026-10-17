import { useState } from 'react'
import { Field } from '../controls'
import { ShopifyLocation } from './shopify-location'

export const shopifyCredentialNames = ['authMode', 'clientId', 'clientSecret', 'accessToken', 'locationId']

export function ShopifyCredentials({ baseUrl, busy }: { baseUrl: string; busy: boolean }) {
  const [authMode, setAuthMode] = useState('clientCredentials')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
  return <>
    <label className="field"><span>Shopify authorization</span><select aria-label="Shopify authorization" name="authMode" value={authMode} onChange={event => setAuthMode(event.target.value)}>
      <option value="clientCredentials">Custom app client credentials (automatic renewal)</option>
      <option value="accessToken">Legacy Admin API access token</option>
    </select><small>Client credentials require your app and installed store to belong to the same Shopify organization.</small></label>
    {authMode === 'clientCredentials' ? <>
      <Field label="Shopify Client ID" name="clientId" value={clientId} onChange={setClientId} autoComplete="off" hint="Dev Dashboard → your app → App settings (Settings) → Client ID." />
      <Field label="Shopify Client secret" name="clientSecret" type="password" value={clientSecret} onChange={setClientSecret} autoComplete="off" hint="Copy Client secret from the same App settings page. Pier obtains and renews its API access automatically." />
    </> : <Field label="Admin API access token" name="accessToken" type="password" value={accessToken} onChange={setAccessToken} autoComplete="off" hint="Shopify → Settings → Apps → Develop apps → your legacy app → API credentials → Admin API access token." />}
    <ShopifyLocation baseUrl={baseUrl} authMode={authMode} clientId={authMode === 'clientCredentials' ? clientId : ''} clientSecret={authMode === 'clientCredentials' ? clientSecret : ''} accessToken={authMode === 'accessToken' ? accessToken : ''} busy={busy} />
  </>
}
