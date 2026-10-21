import { TracePanel } from './trace'
import { KitPanel, KitReturns } from './kits'
import { records, type PierState, type RecordData, type RunCommand } from './api'
import { sum } from './quantity'
import { Icon } from './icons'
import { day } from './display'
import { ItemAgent } from './item-agent'
import { CatalogueDetail } from './catalogue-detail'

export function StockDetail({ item, state, imported, expected, history, edit, close, run, busy = false }: { item: RecordData; state: PierState; imported?: RecordData; expected: string; history: (id: string) => void; edit: () => void; close: () => void; run?: RunCommand; busy?: boolean }) {
  const positions = records(state, 'stockPositions').filter(position => position.itemId === item.id)
  const sellable = positions.filter(position => position.status === 'sellable')
  const values = [
    ['On hand (sellable)', sum(sellable.map(position => position.quantity))],
    ['Reserved', sum(sellable.map(position => position.reserved))],
    ['Available', sum(sellable.map(position => position.available))],
    ['Quarantine', sum(positions.filter(position => position.status === 'quarantine').map(position => position.quantity))],
    ['In transit', sum(positions.filter(position => position.status === 'transit').map(position => position.quantity))],
    ['Expected', expected],
  ]
  return <><section className="detail stock-detail" aria-label="Selected item details"><div className="detail-head"><div><h2>{item.name}</h2><p className="detail-variant">All bins · {item.unit} · pack {item.packSize}</p></div><button className="collapse" aria-label="Close item details" onClick={close}><Icon name="chevron" /></button></div><dl><dt>SKU</dt><dd>{item.sku}</dd><dt>Barcode</dt><dd>{item.barcode || '—'}</dd>{imported && <><dt>Opening</dt><dd><a className="nowrap" href={`#imports/${imported.id}`}>Imported {day(imported.exportedAt)}</a></dd></>}</dl><div className="metrics">{values.map(([label, value]) => <div className={label === 'Available' ? 'metric available' : 'metric'} key={label}><span className="metric-label">{label}</span><span className="metric-value">{value}</span><small>{item.unit}</small></div>)}</div><div className="detail-actions"><button className="button" onClick={() => history(item.id)}>View movements</button><button className="button" onClick={edit}>Edit item</button></div></section><CatalogueDetail item={item} state={state} />{run && <TracePanel key={item.id} item={item} state={state} run={run} busy={busy} />}{run && <KitPanel item={item} state={state} run={run} busy={busy} />}{run && <KitReturns item={item} state={state} run={run} busy={busy} />}{run && <ItemAgent item={item} state={state} run={run} busy={busy} />}</>
}
