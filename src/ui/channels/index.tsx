import { useState } from 'react'
import { ConnectionForm } from './connection-form'
import { ConnectionCards, ConnectionSetup } from './connections'
import { TransferHolds } from './holds'
import { Listings, UnmatchedListings } from './listings'
import { ChannelOrders } from './orders'
import { connections, type ChannelProps, type Connection, type Provider } from './model'

export function Channels(props: ChannelProps) {
  const { state, run, busy } = props
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ provider: Provider; id?: string } | null>(null)
  const owner = state.actor.role === 'owner'
  const connection = editor?.id ? connections(state).find(row => row.id === editor.id) : undefined
  function open(next: { provider: Provider; id?: string }) {
    setEditor(next)
    requestAnimationFrame(() => document.getElementById('channel-connection-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  const actions = { connect: (provider: Provider) => open({ provider }), edit: (row: Connection) => open({ provider: row.provider, id: row.id }) }
  return <div className="channels-page"><div className="page-title"><div><h1>Channels</h1><p className="channel-subtitle">Connect stores, sync inventory, keep listings in step</p></div>{owner && <div className="actions"><button disabled={busy || !connections(state).some(row => row.enabled)} onClick={() => void run('channel.sync', {})}>{busy ? 'Working…' : 'Sync now'}</button><button className="primary" disabled={busy} onClick={() => actions.connect('stall')}>Connect a store</button></div>}</div>
    {!owner && <p className="channel-read-only">Your role can review channels. The owner manages connections, sync, SKU matches and transfer holds.</p>}
    {owner && editor && <ConnectionForm key={`${editor.id ?? 'new'}-${editor.provider}-${connection?.version ?? 'new'}`} {...props} connection={connection} initialProvider={editor.provider} close={() => setEditor(null)} />}
    <ConnectionCards {...props} {...actions} />
    <Listings {...props} search={search} setSearch={setSearch} />
    <div className="channel-bottom"><UnmatchedListings {...props} /><div className="channel-side"><TransferHolds {...props} /><ConnectionSetup {...props} {...actions} /></div></div>
    <ChannelOrders {...props} />
  </div>
}
