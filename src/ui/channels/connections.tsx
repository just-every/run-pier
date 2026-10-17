import { records } from '../api'
import { when } from '../display'
import { ChannelBrand } from './brand'
import { StallLink } from './stall-link'
import { connectionPayload, connections, listings, providerName, providers, type ChannelOrder, type ChannelProps, type Connection, type Provider } from './model'

type Props = ChannelProps & { edit: (row: Connection) => void; connect: (provider: Provider) => void }
export function ConnectionCards({ state, run, busy, connect }: Props) {
  const rows = connections(state), stock = listings(state), orders = records(state, 'channelOrders') as ChannelOrder[]
  return <section className="channel-cards" aria-label="Channel connections">{providers.flatMap(provider => {
    const connected = rows.filter(row => row.provider === provider.id)
    if (!connected.length) return [<article className="channel-card" key={provider.id}>
      <ChannelBrand provider={provider.id} /><div className="channel-card-content"><h2>{provider.name}</h2><span className="channel-status">Not connected</span><p className="muted">{['shopify', 'amazon'].includes(provider.id) ? 'Connect when your owner account is ready.' : 'Connect a store to receive listings and orders.'}</p>{state.actor.role === 'owner' && <button disabled={busy} onClick={() => connect(provider.id)}>Connect {provider.name}</button>}</div>
    </article>]
    return connected.map(row => {
      const accepted = stock.filter(listing => listing.channelId === row.id && listing.acceptedAt).sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)))[0]
      const imported = orders.filter(order => order.channelId === row.id && order.reservedAt).sort((a, b) => String(b.reservedAt).localeCompare(String(a.reservedAt)))[0]
      return <article className="channel-card" key={row.id}>
        <ChannelBrand provider={row.provider} /><div className="channel-card-content"><h2>{row.name}</h2><p className="channel-provider">{providerName(row.provider)} <span className={`channel-status ${row.problem ? 'channel-status-problem' : row.enabled ? 'channel-status-enabled' : ''}`}>{row.problem ? 'Needs attention' : row.enabled ? 'Enabled' : 'Paused'}</span></p>
          <dl><dt>Warehouse · buffer</dt><dd>{row.warehouse} · {row.buffer} base units</dd><dt>Last order import</dt><dd>{imported?.reservedAt ? when(imported.reservedAt) : 'No orders imported'}</dd><dt>Last stock accepted</dt><dd>{accepted ? <>{when(accepted.acceptedAt)}<small>{accepted.sku || accepted.externalId} · {accepted.publishedQuantity ?? 'Unconfirmed'} base units</small></> : 'Not yet accepted'}</dd></dl>
          {row.lastReceivedAt && <small>Last received {when(row.lastReceivedAt)}</small>}
          {row.problem && <p className="channel-problem">{row.problem}</p>}
          {row.provider === 'stall' && state.actor.role === 'owner' && <StallLink state={state} run={run} busy={busy} row={row} />}
          {row.provider === 'woocommerce' && <details className="channel-webhook"><summary>Order webhook address</summary><code>{typeof window === 'undefined' ? '' : window.location.origin}/api/pier/channels/{encodeURIComponent(row.id)}/webhook</code><small>Use this address and the saved signing secret in WooCommerce.</small></details>}
        </div>
      </article>
    })
  })}</section>
}

export function ConnectionSetup({ state, run, busy, edit, connect }: Props) {
  const rows = connections(state), owner = state.actor.role === 'owner'
  return <section className="panel channel-setup"><h2>Connection setup</h2>
    {providers.flatMap(provider => {
      const connected = rows.filter(row => row.provider === provider.id)
      return connected.length ? connected.map(row => <div className="channel-setup-row" key={row.id}><ChannelBrand provider={row.provider} /><div><strong>{row.name}</strong><small>{providerName(row.provider)} · {row.enabled ? 'Enabled' : 'Paused'}</small></div>{owner && <div className="actions"><button disabled={busy} onClick={() => edit(row)} aria-label={`Manage ${row.name}`}>Manage</button><button disabled={busy} onClick={() => void run('channel.save', { ...connectionPayload(row), enabled: !row.enabled })} aria-label={`${row.enabled ? 'Pause' : 'Enable'} ${row.name}`}>{row.enabled ? 'Pause' : 'Enable'}</button></div>}</div>) : [<div className="channel-setup-row" key={provider.id}><ChannelBrand provider={provider.id} /><div><strong>{provider.name}</strong><small>No owner account connected</small></div>{owner && <button disabled={busy} onClick={() => connect(provider.id)} aria-label={`Set up ${provider.name}`}>Connect</button>}</div>]
    })}
    {owner && <button className="link" disabled={busy} onClick={() => connect('stall')}>Add another connection</button>}
    <p className="channel-boundary">Shopify and Amazon connect once owner accounts exist. Their documented API adapters have been exercised with recorded fixtures only; live account acceptance is still required.</p>
    <p className="channel-boundary">Stall reads Pier stock live with the key Pier gives it and links existing reservations. Current Stall requires a single warehouse and a zero stock buffer.</p>
  </section>
}
