import { useEffect, useRef, useState } from 'react'
import { readReply } from '../wire'

type Location = { id: string; name: string }
export function ShopifyLocation({ baseUrl, authMode, accessToken, clientId, clientSecret, busy }: { baseUrl: string; authMode: string; accessToken: string; clientId: string; clientSecret: string; busy: boolean }) {
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    request.current?.abort()
    setLocations([]); setLocationId(''); setProblem(''); setLoading(false)
    return () => request.current?.abort()
  }, [baseUrl, authMode, accessToken, clientId, clientSecret])
  async function load() {
    const controller = new AbortController()
    request.current?.abort(); request.current = controller
    setLoading(true); setProblem(''); setLocations([]); setLocationId('')
    try {
      const response = await fetch('/api/pier/commands', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandId: crypto.randomUUID(), type: 'channel.shopifyLocations', payload: { baseUrl, authMode, ...(authMode === 'clientCredentials' ? { clientId, clientSecret } : { accessToken }) } }),
      })
      const reply = readReply(await response.json())
      if (!reply.ok) throw new Error(reply.error.message)
      const result = reply.result as { locations?: unknown }
      if (!result || !Array.isArray(result.locations) || !result.locations.every(row => row && typeof row.id === 'string' && /^gid:\/\/shopify\/Location\/\d+$/.test(row.id) && typeof row.name === 'string')) throw new Error('Shopify did not confirm its location list. Check app access and try again.')
      if (controller.signal.aborted) return
      setLocations(result.locations)
      if (!result.locations.length) setProblem('No active Shopify locations were returned. Check Settings → Locations in Shopify and your app permissions.')
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : 'Could not load Shopify locations. Check your store address and app credentials.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  return <div className="field">
    <span>Shopify location</span>
    <button type="button" disabled={busy || loading || !baseUrl.trim() || (authMode === 'clientCredentials' ? !clientId.trim() || !clientSecret.trim() : !accessToken.trim())} onClick={() => void load()}>{loading ? 'Loading Shopify locations…' : 'Load Shopify locations'}</button>
    <select aria-label="Shopify location" name="locationId" value={locationId} required disabled={busy || loading} onChange={event => setLocationId(event.target.value)}>
      <option value="">Choose the matching Shopify location</option>
      {locations.map(row => <option key={row.id} value={row.id}>{row.name} · {row.id.split('/').pop()}</option>)}
    </select>
    <small>Pier reads your active locations using the selected authorization. Choose the one matching the warehouse above. Shopify shows the same names at Settings → Locations.</small>
    {problem && <p className="error" role="alert">{problem}</p>}
  </div>
}
