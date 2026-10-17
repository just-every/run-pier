import type { ChannelConfig } from './types'
import { baseUrl, credential, integer, object, request, string } from './http'

export function shopifyOrigin(config: ChannelConfig): URL {
  const url = baseUrl(config)
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(url.hostname) || url.port || url.pathname !== '/') {
    throw new Error('Use your HTTPS myshopify.com store address, without an admin path.')
  }
  return url
}

/** One selected authorization method; a refusal never switches methods or retries. */
export async function shopifyAccessToken(config: ChannelConfig): Promise<string> {
  const mode = config.credentials.authMode ?? (config.credentials.accessToken ? 'accessToken' : 'clientCredentials')
  if (mode === 'accessToken') return credential(config, 'accessToken')
  if (mode !== 'clientCredentials') throw new Error('Choose a supported Shopify authorization method')
  const url = shopifyOrigin(config)
  url.pathname = '/admin/oauth/access_token'
  const { body } = await request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: credential(config, 'clientId'), client_secret: credential(config, 'clientSecret') }).toString(),
  }, 'Shopify authorization')
  const result = object(body, 'Shopify authorization response')
  if (!integer(result.expires_in, 'Shopify token lifetime')) throw new Error('Shopify returned an expired access token')
  return string(result.access_token, 'Shopify access token')
}
