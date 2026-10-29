import { records, type RecordData } from '../api'
import { Empty, Table } from '../controls'
import { when } from '../display'
import { Icon } from '../icons'
import { sum } from '../quantity'
import { ChannelBrand } from './brand'
import { connections, lagTime, listings, providerName, type ChannelProps, type Listing, type Publication } from './model'

export function Listings({ state, search, setSearch }: ChannelProps & { search: string; setSearch: (value: string) => void }) {
  const rows = listings(state).flatMap<Listing & { publicationLocation: string | null; publicationWarehouse: string; retainedPublication?: Publication }>(row => {
    const current = row.publications?.length && row.publicationLocations?.length ? row.publicationLocations.map(target => ({ ...row, publicationLocation: target.locationId, publicationWarehouse: target.warehouses.join(', '), holds: row.holds.filter(h => target.warehouses.includes(h.warehouse)), available: target.quantity, publishedQuantity: target.publication?.status === 'accepted' ? target.publication.quantity : null, acceptedAt: target.publication?.acceptedAt, problem: !row.publicationAuthorized ? 'Publication authority is paused or revoked. Review the connection and routing rule.' : target.publication?.problem, lag: !row.publicationAuthorized || target.publication?.status !== 'accepted' })) : row.unconfirmedPublications?.length ? [] : [{ ...row, publicationLocation: null, publicationWarehouse: '' }]
    return [...current, ...(row.unconfirmedPublications ?? []).map(publication => ({ ...row, publicationLocation: publication.locationId, publicationWarehouse: publication.warehouses.join(', '), retainedPublication: publication, holds: [], available: null, publishedQuantity: null, acceptedAt: null, problem: publication.problem, lag: true }))]
  }), channels = connections(state), items = records(state, 'items')
  const query = search.trim().toLowerCase()
  const visible = rows.filter(row => {
    const channel = channels.find(value => value.id === row.channelId), item = items.find(value => value.id === row.itemId)
    return [row.sku, row.title, row.externalId, item?.sku, item?.name, channel?.name, channel && providerName(channel.provider)].filter(Boolean).join(' ').toLowerCase().includes(query)
  })
  return <section className="channel-listings" aria-labelledby="channel-listings-title">
    <div className="channel-section-heading"><h2 id="channel-listings-title"><span className="channel-diamond" aria-hidden="true" />Listings</h2><div className="channel-section-tools"><span>{visible.length} of {rows.length}</span><label className="channel-search"><Icon name="search" /><input aria-label="Search by SKU, title or channel" placeholder="Search by SKU, title or channel…" value={search} onChange={event => setSearch(event.target.value)} /></label></div></div>
    <p className="channel-table-note">Available is sellable stock after reservations, transfer holds and the connection’s buffer, in the matched item’s base unit.</p>
    {!visible.length ? <Empty>{query ? 'No listings match this search.' : 'No listings received yet. Connect a store and sync to read its listings.'}</Empty> : <Table className="channel-inventory" headings={['SKU', 'Channel listing', 'Available', 'Held', 'Buffer', 'Published quantity', 'Lag / result']} numeric={[2, 3, 4, 5]}>{visible.map(row => {
      const channel = channels.find(value => value.id === row.channelId), item = items.find(value => value.id === row.itemId)
      return <tr key={`${row.id}-${row.retainedPublication?.id ?? row.publicationLocation ?? "single"}`}><td><span className="nowrap">{item?.sku || row.sku || 'No SKU'}</span>{item && <small>{item.unit}</small>}</td><td><div className="channel-product">{channel && <ChannelBrand provider={channel.provider} />}<div><strong>{row.title || row.externalId}</strong><small>{channel?.name ?? 'Removed connection'}</small>{!row.itemId && <small className="channel-problem">Match required</small>}{row.matchedBy && <small>Matched by {row.matchedBy}</small>}{row.publicationLocation && <><small>{row.publicationWarehouse}</small><small>{row.publicationLocation}</small></>}{row.retainedPublication && <small className="channel-problem">Earlier mapping; publication stopped</small>}</div></div></td>
        <td>{row.retainedPublication ? 'No current target' : row.available ?? 'Unmatched'}</td><td>{sum(row.holds.map(hold => hold.quantity))}{row.holds.length > 0 && <small className="channel-held-reasons">{row.holds.map(hold => `${hold.quantity}: ${hold.reason}`).join('; ')}</small>}</td><td>{channel?.buffer ?? '—'}</td>
        <td>{row.publishedQuantity ?? 'Not accepted'}{row.acceptedAt && <small>{when(row.acceptedAt)}{row.acceptanceMs !== null && row.acceptanceMs !== undefined && <> · {row.acceptanceMs}ms</>}</small>}</td>
        <td><span className={row.problem || row.lag ? 'channel-problem' : 'channel-current'}>{row.retainedPublication ? 'Unconfirmed' : row.problem ? 'Failed' : !row.itemId ? 'Awaiting match' : row.lag ? `Pending · ${lagTime(row.lagSeconds)}` : row.acceptedAt ? 'In step' : 'Not yet accepted'}</span>{row.problem && <small className="channel-problem">{row.problem}</small>}{channel && !channel.enabled && <small>Connection paused</small>}{Boolean(row.publications?.length) && <details><summary>Location outcomes</summary>{row.publications!.filter(p => row.retainedPublication ? p.id === row.retainedPublication.id : !row.publicationLocation || p.locationId === row.publicationLocation).map(p => <p key={p.id}>{p.locationId ?? 'Configured location'} · {p.warehouses.join(', ')} · {p.quantity} · {p.status}{p.invalidated && ' · Earlier mapping or stock; no longer eligible'}{p.problem && <small>{p.problem}</small>}</p>)}</details>}</td></tr>
    })}</Table>}
  </section>
}

function MatchListing({ row, items, run, busy }: { row: Listing; items: RecordData[]; run: ChannelProps['run']; busy: boolean }) {
  return <form className="channel-match" onSubmit={event => { event.preventDefault(); const itemId = String(new FormData(event.currentTarget).get('itemId') || ''); if (itemId && !busy) void run('channel.match', { listingId: row.id, version: row.version, itemId }) }}>
    <select name="itemId" required disabled={busy || !items.length} aria-label={`Match ${row.title || row.sku || row.externalId}`} defaultValue=""><option value="">Select existing SKU</option>{items.map(item => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select><button disabled={busy || !items.length} type="submit">Match</button>
  </form>
}
export function UnmatchedListings({ state, run, busy }: ChannelProps) {
  const rows = listings(state).filter(row => !row.itemId), channels = connections(state), items = records(state, 'items').filter(row => !row.archived)
  return <section className="panel channel-unmatched"><div className="channel-panel-title"><h2><span className="channel-diamond" aria-hidden="true" />Unmatched listings</h2><span className="muted">{rows.length}</span></div>
    {!rows.length ? <Empty>No listings need a match.</Empty> : <>{!items.length && <p className="channel-problem">Create an item in Stock before matching a listing.</p>}<Table headings={['Channel / SKU', 'Title', 'Match']}>{rows.map(row => <tr key={row.id}><td>{channels.find(channel => channel.id === row.channelId)?.name ?? 'Removed connection'}<small>{row.sku || 'No SKU'}</small></td><td>{row.title || row.externalId}{row.problem && <small className="channel-problem">{row.problem}</small>}</td><td>{state.actor.role === 'owner' ? <MatchListing row={row} items={items} run={run} busy={busy} /> : <span>Owner match required</span>}</td></tr>)}</Table></>}
  </section>
}
