import type { ChannelConfig } from './types'
import { array, baseUrl, credential, integer, object, request, string, type JsonObject } from './http'

export type AmazonRequest = (path: string, query: Record<string, string>, method?: string, body?: JsonObject) => Promise<JsonObject>

export function amazonClient(config: ChannelConfig): AmazonRequest {
  const root = baseUrl(config)
  let cached: { token: string; expires: number } | undefined

  async function accessToken(): Promise<string> {
    if (config.credentials.accessToken?.trim()) return config.credentials.accessToken
    if (cached && cached.expires > Date.now()) return cached.token
    const form = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: credential(config, 'refreshToken'),
      client_id: credential(config, 'clientId'), client_secret: credential(config, 'clientSecret'),
    })
    const { body } = await request('https://api.amazon.com/auth/o2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: form.toString(),
    }, 'Amazon authorization')
    const result = object(body)
    const token = string(result.access_token, 'Amazon access token')
    const lifetime = integer(result.expires_in, 'Amazon token lifetime')
    if (result.token_type !== 'bearer' || !lifetime) throw new Error('Amazon did not return a valid bearer authorization')
    cached = { token, expires: Date.now() + Math.max(0, lifetime - 60) * 1000 }
    return token
  }

  return async (path, query, method = 'GET', body) => {
    const url = new URL(path, root)
    url.search = new URLSearchParams(query).toString()
    const token = await accessToken()
    const result = await request(url, {
      method, headers: {
        'x-amz-access-token': token, 'Content-Type': 'application/json',
        'x-amz-date': new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''),
        'User-Agent': 'Pier/0.1.0 (Language=JavaScript)',
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, `Amazon ${method === 'GET' ? 'read' : 'stock update'}`)
    const data = object(result.body)
    if (data.errors !== undefined && array(data.errors).length) throw new Error('Amazon returned API errors; reconcile any possible external write before replay')
    return data
  }
}
