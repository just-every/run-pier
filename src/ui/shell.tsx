import { useMemo, useState, type ReactNode } from 'react'
import { label, records, type PierState } from './api'
import { words } from './display'
import { Icon, type IconName } from './icons'
import { ago, inWarehouse, isOpen, warehouses } from './orders/model'
import { connections, providerName } from './channels/model'

// The app's frame, drawn from the owner-picked workbench: a top bar with the
// lockup, the warehouse switcher, search and the sync line; a labelled left rail.

export const tabs: { id: string; title: string; icon: IconName; foot?: boolean }[] = [
  { id: 'sales', title: 'Sales orders', icon: 'orders' }, { id: 'stock', title: 'Stock', icon: 'stock' }, { id: 'purchasing', title: 'Purchasing', icon: 'purchasing' },
  { id: 'floor', title: 'Floor', icon: 'floor' }, { id: 'transfers', title: 'Transfers', icon: 'transfers' }, { id: 'counts', title: 'Counts', icon: 'counts' },
  { id: 'channels', title: 'Channels', icon: 'channels' }, { id: 'books', title: 'Books', icon: 'books' }, { id: 'reports', title: 'Reports', icon: 'reports' },
  { id: 'imports', title: 'Imports', icon: 'imports' }, { id: 'activity', title: 'Activity', icon: 'activity', foot: true }, { id: 'ai', title: 'AI setup', icon: 'ai', foot: true },
]

export function Rail({ tab, state, warehouse }: { tab: string; state: PierState | null; warehouse: string }) {
  const open = state ? records(state, 'orders').filter(order => isOpen(order) && inWarehouse(state, order, warehouse)).length : 0
  const link = (row: typeof tabs[number]) => <a key={row.id} href={`#${row.id}`} aria-current={row.id === tab ? 'page' : undefined}><Icon name={row.icon} /><span>{row.title}</span>{row.id === 'sales' && open > 0 && <b className="rail-count" aria-hidden="true">{open}</b>}</a>
  return <nav className="rail" aria-label="Stock operations"><div className="rail-main">{tabs.filter(row => !row.foot).map(link)}</div><div className="rail-foot">{tabs.filter(row => row.foot).map(link)}</div></nav>
}

export function TopBar({ state, warehouse, setWarehouse, signOut }: { state: PierState | null; warehouse: string; setWarehouse: (value: string) => void; signOut: () => void }) {
  const names = state ? warehouses(state) : []
  const name = state?.actor.name || 'Your session', role = state ? words(state.actor.role) : ''
  return <header className="topbar">
    <a className="wordmark" href="#sales"><img src="/brand/mark.svg" alt="" width="40" height="40" /><span data-rer-name>Pier</span></a>
    {names.length > 0 && <div className="switcher" role="group" aria-label="Warehouse">{[...names, ''].map(value => <button key={value || 'all'} type="button" aria-pressed={warehouse === value} onClick={() => setWarehouse(value)}>{value || 'All'}</button>)}</div>}
    {state && <GlobalSearch state={state} />}
    {state && <SyncLine state={state} />}
    <div className="account"><span className="avatar" aria-hidden="true">{initials(name)}</span><span className="account-name"><span title={name}>{name}</span>{role.toLowerCase() !== name.trim().toLowerCase() && <small>{role}</small>}</span><button type="button" onClick={signOut}>Sign out</button></div>
  </header>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '·'

/** Orders by reference or customer, items by SKU, name or barcode; each opens its own record. */
function GlobalSearch({ state }: { state: PierState }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const parties = records(state, 'parties')
    const orders = records(state, 'orders').filter(row => `${row.reference} ${label(parties, row.customerId)}`.toLowerCase().includes(q)).slice(-5).reverse().map(row => ({ href: `#sales/${row.id}`, title: row.reference, detail: label(parties, row.customerId) }))
    const items = records(state, 'items').filter(row => `${row.sku} ${row.name} ${row.barcode || ''}`.toLowerCase().includes(q)).slice(0, 5).map(row => ({ href: `#stock/${row.id}`, title: row.sku, detail: row.name }))
    return [...orders, ...items]
  }, [query, state])
  return <div className="global-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <label className="search"><Icon name="search" /><input type="search" aria-label="Search SKU, order or customer" placeholder="Search SKU, order or customer…" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true) }} onKeyDown={event => { if (event.key === 'Enter' && results[0]) { window.location.hash = results[0].href.slice(1); setOpen(false) } if (event.key === 'Escape') setOpen(false) }} /></label>
    {open && query.trim() && <div className="search-results" role="list">{results.length ? results.map(row => <a role="listitem" key={row.href} href={row.href} onClick={() => setOpen(false)}><b>{row.title}</b><span>{row.detail}</span></a>) : <p>No order, customer or SKU matches “{query.trim()}”.</p>}</div>}
  </div>
}

/** The connected sales channels and books, and when each last reported. */
function SyncLine({ state }: { state: PierState }) {
  const channels = connections(state).filter(row => row.enabled), books = records(state, 'bookConnections').filter(row => row.enabled)
  const sources = [...channels.map(row => ({ name: row.name || providerName(row.provider), at: row.lastReceivedAt, problem: row.problem })), ...books.map(row => ({ name: 'Pantry', at: row.lastSync, problem: row.problem }))]
  const problem = sources.find(row => row.problem), latest = sources.map(row => row.at).filter(Boolean).sort().at(-1)
  let body: ReactNode
  if (!sources.length) body = <><i className="dot idle" /><a href="#channels">No channels or books connected</a></>
  else if (problem) body = <><i className="dot problem" /><a href={channels.some(row => row.problem) ? '#channels' : '#books'}>{problem.name} needs attention</a></>
  else body = <><i className="dot ok" /><span>{sources.map(row => row.name).join(', ')} {latest ? `synced ${ago(latest)}` : 'connected'}</span></>
  return <p className="sync">{body}</p>
}
