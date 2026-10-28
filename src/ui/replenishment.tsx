import { ReplenishmentComparison } from './replenishment-comparison';
import { ReorderBatch, ReorderScope } from './reorder-batch';
import { useState } from 'react';
import { label, records, unit, type PierState, type RunCommand } from './api';
import { day, ItemName, reference } from './display';
import { Amount, Badge, Empty, Facts, Field, Form, Select, Table, text } from './controls';

type Props = { state: PierState; run: RunCommand; busy: boolean };
type ForecastRow = { itemId: string; warehouse: string; [key: string]: any };
const canBuy = (state: PierState) => ['buyer', 'owner'].includes(state.actor.role);
// Cover is an estimate from the sales rate; whole days read as one: "37 days", "1 day", "Under 1 day".
// A sales rate to one decimal, "33.3"; the exact rate stays in the record and the CSV.
const perDay = (value: string) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const coverDays = (value: string) => { const days = Math.round(Number(value)); return days < 1 ? 'Under 1 day' : `${days} ${days === 1 ? 'day' : 'days'}` };

const decimalZero = (value: unknown) => !/[1-9]/.test(String(value ?? '0'))
export function Replenishment({ state, run, busy }: Props) {
  const rows: ForecastRow[] = state.forecasts ?? [];
  const [selected, setSelected] = useState('');
  const current = rows.find(row => JSON.stringify([row.itemId, row.warehouse]) === selected);
  return <>
    <ReorderScope state={state} run={run} busy={busy} /><ReorderBatch state={state} run={run} busy={busy} />
    <section className="panel"><h2>Demand and replenishment</h2>
      <p className="muted">Observed demand proposes reorder points and quantities. A buyer applies the parameters; planning creates supplier purchase drafts for exact approval.</p>
      <div className="actions"><button className="primary" disabled={busy || !canBuy(state)} onClick={() => run('replenishment.plan', {})}>Create replenishment drafts</button></div>
      {!rows.length ? <Empty>Define an item and a warehouse bin to plan replenishment. Demand rates use native shipments and captured channel orders.</Empty> : <Table numeric={[1, 3, 5]} headings={['Item / warehouse', 'Demand per day', 'Cover / stockout', 'Supply position', 'Applied rule', 'Suggested purchase', '']}>
        {rows.map(row => <tr key={JSON.stringify([row.itemId, row.warehouse])}>
          <td><ItemName state={state} id={row.itemId} /><small>{row.warehouse}</small>{row.autoDraft && <Badge>Automatic drafts enabled</Badge>}</td>
          <td>{perDay(row.soldPerDay)} {unit(state, row.itemId)}<small>{row.observedSold} observed / {row.windowDays} days</small>{!row.hasHistory && <small>No observed demand in this window</small>}</td>
          <td>{row.daysOfCover === null ? 'No sales rate' : coverDays(row.daysOfCover)}<small>{row.projectedStockoutDate ? `Projected stockout ${day(row.projectedStockoutDate)}` : 'No stockout date projected'}</small></td>
          <td>{row.position} {unit(state, row.itemId)}<small>On hand {row.onHand} − demand {row.openDemand}</small><small>+ purchases {row.onOrder} + transit {row.inboundTransfers} − outbound {row.outboundTransfers}</small></td>
          <td>{row.configured ? <><Badge>{row.low ? 'At or below point' : 'Above point'}</Badge><small>Point {row.applied.reorderPoint}; {row.applied.method === 'upTo' ? `maximum ${row.applied.maximum}` : `fixed ${row.applied.reorderQuantity}`}</small></> : 'Awaiting buyer parameters'}</td>
          <td>{row.suggestedQuantity} {unit(state, row.itemId)}<small>Expected landed USD <Amount value={row.expectedLandedCost} unknown={decimalZero(row.suggestedQuantity) ? "None to buy yet" : "No supplier price"} /></small>{row.drafts.map((draft: any) => <small key={draft.poId}><a href={`#purchasing/${draft.poId}`}>{draft.reference}</a> · {draft.quantity} covered by draft</small>)}</td>
          <td><button onClick={() => setSelected(JSON.stringify([row.itemId, row.warehouse]))}>Review policy</button></td>
        </tr>)}
      </Table>}
    </section>
    {current && <PolicyEditor key={`${selected}-${current.policyVersion}`} state={state} run={run} busy={busy} forecast={current} />}
  </>;
}

function PolicyEditor({ state, run, busy, forecast: f }: Props & { forecast: ForecastRow }) {
  const policy = f.policy;
  const [supplierId, setSupplierId] = useState<string>(f.supplierId ?? '');
  const terms = records(state, 'supplierItems').filter(term => term.itemId === f.itemId);
  const supplierTerms = terms.find(term => term.supplierId === supplierId);
  const suppliers = records(state, 'parties').filter(party => party.kind === 'supplier' && terms.some(term => term.supplierId === party.id));
  const learned = f.learned;
  return <>
    <section className="panel"><h2><ItemName state={state} id={f.itemId} /> · {f.warehouse}</h2>
      <Facts values={[
        { label: 'Sellable on hand', value: `${f.onHand} ${unit(state, f.itemId)}` },
        { label: 'Reserved', value: f.reserved }, { label: 'Unfilled backorders', value: f.backorders },
        { label: 'Committed purchases', value: f.onOrder }, { label: 'Inbound transfers', value: f.inboundTransfers },
        { label: 'Committed outbound transfers', value: f.outboundTransfers }, { label: 'Net position', value: f.position },
        { label: 'Unrounded need', value: f.unroundedNeed }, { label: 'Supplier case pack', value: f.packSize ?? 'No terms selected' },
        { label: 'Supplier minimum', value: f.minimum ?? 'No terms selected' }, { label: 'Rounding / minimum added', value: f.roundingAdded },
        { label: 'Rounded total need', value: f.roundedQuantity }, { label: 'Existing draft coverage', value: f.draftQuantity },
        { label: 'Remaining suggestion', value: f.suggestedQuantity }, { label: 'Unit price USD', value: <Amount value={f.unitPrice} /> },
        { label: 'Product subtotal USD', value: <Amount value={f.productCost} /> },
        { label: 'Freight estimate USD', value: <Amount value={f.freight} /> }, { label: 'Duty estimate USD', value: <Amount value={f.duty} /> },
        { label: 'Expected landed total USD', value: <Amount value={f.expectedLandedCost} /> },
      ]} />
      {f.blockedReason && <p className="muted">{f.blockedReason}</p>}
      {f.minimumValueUnmet && <p>Supplier minimum order value of <Amount value={f.minimumValue} /> USD is unmet by this line. Review the grouped purchase draft; quantities are not padded to meet a spend target.</p>}
      <h3>Observed demand</h3>
      <Table numeric={[0, 1, 2]} headings={['Window (days)', 'Demand quantity', 'Average per day', 'Evidence']}>
        {f.windows.map((window: any) => <tr key={window.days}><td>{window.days}</td><td>{window.sold} {unit(state, f.itemId)}</td><td>{window.soldPerDay} {unit(state, f.itemId)}</td><td>{<>Native shipped: {window.nativeShippedQuantity}; channel ordered: {window.channelOrderedQuantity}{window.shipmentIds.map((id: string) => <small key={id}><a href={`#sales/${id}`}>{reference(records(state, 'shipments').find(shipment => shipment.id === id))}</a></small>)}{window.channelOrderIds.map((id: string) => { const source = records(state, 'channelOrders').find(order => order.id === id); return <small key={id}><a href={`#sales/${source?.orderId}`}>Channel order {source?.reference ?? id}</a></small> })}</>}</td></tr>)}
      </Table>
      <p className="muted">{f.projectionBasis}</p><p className="muted">{f.assumption}</p>
      {f.receipts.length > 0 && <><h3>Expected purchase receipts in the position</h3><Table headings={['Purchase order', 'Remaining quantity', 'Expected date', 'Supplier confirmation']}>
        {f.receipts.map((receipt: any) => <tr key={receipt.poId}><td><a href={`#purchasing/${receipt.poId}`}>{reference(records(state, 'purchaseOrders').find(po => po.id === receipt.poId))}</a></td><td>{receipt.quantity} {unit(state, f.itemId)}</td><td>{day(receipt.promiseDate)}</td><td>{receipt.confirmed ? 'Confirmed by supplier' : 'Unconfirmed estimate'}</td></tr>)}
      </Table></>}
      <h3>Proposed from the saved planning settings</h3>
      <Facts values={[
        { label: 'Lead-time demand', value: learned.leadDemand }, { label: 'Buyer safety stock', value: f.safetyStock },
        { label: 'Proposed reorder point', value: learned.reorderPoint }, { label: 'Proposed reorder quantity', value: learned.reorderQuantity },
        { label: 'Proposed order-up-to maximum', value: learned.maximum }, { label: 'Sales window / review period', value: `${f.windowDays} / ${f.reviewDays} days` },
      ]} />
      <p className="muted">Save changed lead time, safety stock or windows below to refresh this proposal before applying it. Demand calculations round up to six decimal places. With no observed demand, only the entered safety stock contributes.</p>
      {policy ? <div className="actions"><button disabled={busy || !canBuy(state)} onClick={() => { const target = f.scope === 'company' ? f.defaults : f.localPolicy; return run('replenishment.save', { ...policy, id: target?.id, version: target?.version ?? 0, warehouse: f.warehouse, scope: f.scope === 'company' ? 'sku' : 'location', applyLearned: true, stateVersion: state.version }) }}>Apply proposed points and quantities</button></div> : <p className="muted">Save supplier and planning settings before applying this proposal.</p>}
      {f.draftIds.length > 0 && <p>Purchase drafts: {f.draftIds.map((id: string) => <a key={id} href={`#purchasing/${id}`}>{reference(records(state, 'purchaseOrders').find(po => po.id === id))} </a>)}</p>}
    </section>
    <ReplenishmentComparison state={state} run={run} busy={busy} forecast={f} />
    <Form key={`${f.policyVersion}-${supplierId}`} title="Replenishment policy" submit="Save buyer policy" busy={busy} disabled={!canBuy(state)} note="Policies are versioned per item and warehouse. Enabling automatic drafts never approves or commits a purchase. Leave the point and quantity/maximum blank to save planning settings without a reorder trigger. Freight and duty are total USD estimates contributed by this item to each generated supplier draft."
      onSubmit={data => { const asDefault = data.get('skuDefault') === 'on', saved = asDefault ? f.defaults : f.localPolicy; return run('replenishment.save', {
        ...(saved ? { id: saved.id } : {}), version: saved?.version ?? 0, itemId: f.itemId, warehouse: f.warehouse, scope: asDefault ? 'sku' : 'location', companyReorderPoint: text(data, 'companyReorderPoint'),
        supplierId: text(data, 'supplierId'), safetyStock: text(data, 'safetyStock'), leadDays: text(data, 'leadDays'),
        windowDays: text(data, 'windowDays'), reviewDays: text(data, 'reviewDays'), method: text(data, 'method'),
        reorderPoint: text(data, 'reorderPoint'), reorderQuantity: text(data, 'reorderQuantity'), maximum: text(data, 'maximum'),
        freight: text(data, 'freight'), duty: text(data, 'duty'), autoDraft: data.get('autoDraft') === 'on',
        forecastAssumptions: data.get('useForecastFactors') === 'on' ? Object.fromEntries(['seasonality', 'promotion'].map(factor => [factor,
          Object.fromEntries(['low', 'expected', 'high', 'source'].map(bound => [bound, text(data, `${factor}-${bound}`)]))])) : null,
      }) }}>
      <Select label="Replenishment supplier" name="supplierId" rows={suppliers} value={supplierId} onChange={setSupplierId} />
      <Field label={`Safety stock (${unit(state, f.itemId)})`} name="safetyStock" defaultValue={policy?.safetyStock ?? '0'} inputMode="decimal" />
      <Field label="Lead time (days)" name="leadDays" defaultValue={String(policy?.leadDays ?? supplierTerms?.leadDays ?? 0)} inputMode="numeric" />
      <Field label="Sales window (days)" name="windowDays" defaultValue={String(f.windowDays)} inputMode="numeric" />
      <Field label="Review period (days)" name="reviewDays" defaultValue={String(f.reviewDays)} inputMode="numeric" />
      <Select label="Replenishment method" name="method" defaultValue={f.applied.method} rows={[{ id: 'fixed', version: 1, label: 'Fixed reorder quantity' }, { id: 'upTo', version: 1, label: 'Order up to maximum' }]} />
      <Field label="Save as SKU default for locations without overrides" name="skuDefault" type="checkbox" required={false} /><Field label="Company reorder point (SKU default only; blank sums location points)" name="companyReorderPoint" defaultValue={f.defaults?.companyReorderPoint ?? ''} required={false} inputMode="decimal" />
      <Field label="Applied reorder point" name="reorderPoint" defaultValue={policy?.reorderPoint ?? ''} required={false} inputMode="decimal" />
      <Field label="Applied reorder quantity" name="reorderQuantity" defaultValue={policy?.reorderQuantity ?? ''} required={false} inputMode="decimal" hint={supplierTerms?.reorderQuantity != null ? `Supplier reorder quantity ${supplierTerms.reorderQuantity} takes precedence.` : undefined} />
      <Field label="Applied order-up-to maximum" name="maximum" defaultValue={policy?.maximum ?? ''} required={false} inputMode="decimal" />
      <Field label="Freight estimate (USD total)" name="freight" defaultValue={policy?.freight ?? '0'} inputMode="decimal" />
      <Field label="Duty estimate (USD total)" name="duty" defaultValue={policy?.duty ?? '0'} inputMode="decimal" />
      <details className="line-editor"><summary>Forecast settings</summary>
        <Field label="Use reviewed forecast factors" name="useForecastFactors" type="checkbox" required={false} defaultChecked={Boolean(policy?.forecastAssumptions)} />
        {['seasonality', 'promotion'].map(factor => <fieldset key={factor}><legend>{factor === 'seasonality' ? 'Seasonality' : 'Promotion'}</legend>
          {['low', 'expected', 'high', 'source'].map(bound => <Field key={bound} label={`${factor === 'seasonality' ? 'Seasonality' : 'Promotion'} ${bound}`} name={`${factor}-${bound}`} required={false}
            defaultValue={policy?.forecastAssumptions?.[factor]?.[bound] ?? (bound === 'source' ? '' : '1')} />)}
        </fieldset>)}
        <p>Positive factors from low to high, at most ten. Record the source you reviewed. These bounds express uncertainty; they do not promise a service level.</p>
      </details>
      <Field label="Automatically prepare purchase drafts" name="autoDraft" type="checkbox" defaultChecked={policy?.autoDraft === true} required={false} />
    </Form>
    <p className="muted">Supplier: {label(suppliers, supplierId)}. Policy version {f.policyVersion}. Buyer-applied parameters stay fixed when new demand arrives.</p>
  </>;
}
