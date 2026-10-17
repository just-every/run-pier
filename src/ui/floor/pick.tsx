import { useState } from 'react'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemName, person, reference } from '../display'
import { Badge, Empty, Facts, Field, Table } from '../controls'
import { at, hours } from './clock'
import { Refusal, ScanBox } from './scanner'
import { Pickups, Release } from './waves'

// The pick list of one wave: lines in bin order, each confirmed only after its
// bin label and then its item are scanned. A wrong bin is refused at once; a
// wrong item is refused by Pier with the reason, and nothing is picked.

const binOk = (bin: RecordData | undefined, code: string) => !!bin && [bin.name, bin.barcode].filter(Boolean).some(value => String(value).replace(/\s+/g, '').toLowerCase() === code.replace(/\s+/g, '').toLowerCase())
export const waveTitle = (wave: RecordData) => `Wave ${wave.number} · ${wave.dock}`

export function Pick({ state, run, busy, error }: { state: PierState; run: RunCommand; busy: boolean; error: string }) {
  const waves = records(state, 'waves').slice().reverse(), [selected, setSelected] = useState(''), [binScan, setBinScan] = useState<{ line: string; code: string } | null>(null), [binError, setBinError] = useState(''), [quantity, setQuantity] = useState('')
  const wave = waves.find(row => row.id === selected) || waves.find(row => row.status !== 'picked')
  const locations = records(state, 'locations'), carriers = records(state, 'carriers'), orders = records(state, 'orders')
  const line = wave?.lines.find((row: any) => row.status === 'open'), bin = locations.find(row => row.id === line?.locationId)
  // A bin scan confirms only the line it was made for; the next line asks again.
  const binCode = binScan && binScan.line === line?.id ? binScan.code : ''
  const carrier = carriers.find(row => row.id === wave?.carrierId), tote = (orderId: string) => wave?.orders.find((row: any) => row.orderId === orderId)?.tote
  const order = (id: string) => reference(orders.find(row => row.id === id))
  const lastPick = wave?.pickedAt || wave?.lines.map((row: any) => row.pickedAt).filter(Boolean).sort().at(-1)
  return <>
    {!waves.length ? <Empty>No waves yet. Release one from the orders waiting below.</Empty> : <section className="panel"><h2>Waves</h2><Table headings={['Wave', 'Carrier', 'Orders', 'Status', '']}>{waves.map(row => <tr key={row.id}><td>{waveTitle(row)}</td><td>{label(carriers, row.carrierId)}</td><td>{row.ordersPicked} of {row.orders.length} picked</td><td><Badge>{row.status === 'picked' && row.pickedAt ? `Picked ${row.ordersPicked} orders · ${at(row.pickedAt, carriers.find(c => c.id === row.carrierId)?.timeZone || 'UTC')}` : `${row.linesOpen} lines to pick`}</Badge></td><td><button className="link" onClick={() => { setSelected(row.id); setBinScan(null); setBinError('') }}>Open pick list</button></td></tr>)}</Table></section>}
    {wave && <section className="panel" id={`document-${wave.id}`}><h2>Pick list · {waveTitle(wave)}</h2>
      <Facts values={[{ label: 'Carrier', value: carrier ? `${carrier.name} · cut-off ${hours(carrier.cutoff)}` : '—' }, { label: 'Orders', value: `${wave.ordersPicked} of ${wave.orders.length} picked` }, { label: 'Lines left', value: wave.linesOpen }, { label: 'Last pick', value: lastPick && carrier ? at(lastPick, carrier.timeZone) : '—' }]} />
      {line && bin ? <div className="pick-task"><p className="pick-step">{binCode ? <>Bin <strong>{bin.name}</strong> confirmed. Pick <strong>{line.quantity} {unit(state, line.itemId)}</strong> of <ItemName state={state} id={line.itemId} /> into tote {tote(line.orderId)} ({order(line.orderId)}).</> : <>Go to bin <strong>{bin.name}</strong>{line.overflowFrom ? <> (overflow for {label(locations, line.overflowFrom)})</> : null} and scan its label.</>}</p>
        {!binCode ? <ScanBox key={`bin-${line.id}`} label="Scan bin label" busy={busy} onScan={async code => { if (binOk(bin, code)) { setBinScan({ line: line.id, code }); setBinError(''); return true } setBinError(`Wrong bin: scanned ${code}, this line picks from ${bin.name}. Nothing was picked.`); return false }} />
          : <><ScanBox key={`item-${line.id}-${line.picked}`} label="Scan item" hint={`${line.picked} of ${line.quantity} picked. A case barcode picks the whole case.`} busy={busy} onScan={async code => { const ok = await run('pick.scan', { waveId: wave.id, lineId: line.id, binCode, itemCode: code, ...(quantity ? { quantity } : {}) }); if (ok) setQuantity(''); return ok }} /><Field label="Quantity for this scan (optional)" value={quantity} onChange={setQuantity} required={false} inputMode="decimal" hint="Leave empty to count the scanned unit or case." /></>}
        <Refusal error={binError || error} />
        <div className="actions"><button disabled={busy} onClick={async () => { if (await run('pick.short', { waveId: wave.id, lineId: line.id, reason: `${bin.name} empty or short` })) { setBinScan(null); setBinError('') } }}>Bin empty or short</button>{binCode && <button className="link" onClick={() => setBinScan(null)}>Scan a different bin</button>}</div>
      </div> : <p className="notice" role="status">{wave.status === 'picked' ? `Picked ${wave.ordersPicked} ${wave.ordersPicked === 1 ? 'order' : 'orders'}${wave.pickedAt && carrier ? ` · ${at(wave.pickedAt, carrier.timeZone)}` : ''}. Pack them at the pack station.` : 'No open lines.'}</p>}
      <Table numeric={[3, 4]} headings={['Bin', 'Item', 'Order · tote', 'Quantity', 'Picked', 'Status']}>{wave.lines.map((row: any) => <tr key={row.id} className={row.id === line?.id ? 'selected' : ''}><td>{label(locations, row.locationId)}</td><td><ItemName state={state} id={row.itemId} /></td><td>{order(row.orderId)} · tote {tote(row.orderId)}</td><td>{row.quantity} {unit(state, row.itemId)}</td><td>{row.picked} {unit(state, row.itemId)}</td><td>{row.status === 'short' ? <><Badge>{row.short.moved !== '0' ? `Overflow ${label(locations, row.short.overflowLocationId)}` : 'Picked short'}</Badge><small>{label(locations, row.locationId)} empty or short · {row.short.moved !== '0' ? `${row.short.moved} moved to overflow ${label(locations, row.short.overflowLocationId)}` : ''}{row.short.unfilled !== '0' ? ` ${row.short.unfilled} not filled` : ''} · count opened for {label(locations, row.locationId)} · reported by {person(state, row.short.actorId)}</small></> : row.status === 'picked' ? <><Badge>Picked</Badge>{row.overflowFrom && <small>{label(locations, row.overflowFrom)} empty · picked from overflow {label(locations, row.locationId)}</small>}</> : <Badge>To pick</Badge>}</td></tr>)}</Table>
    </section>}
    <Release state={state} run={run} busy={busy} />
    <Pickups state={state} run={run} busy={busy} />
  </>
}
