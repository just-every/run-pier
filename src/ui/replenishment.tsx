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

export function Replenishment({ state, run, busy }: Props) {
  const rows: ForecastRow[] = state.forecasts ?? [];
  const [selected, setSelected] = useState('');
  const current = rows.find(row => JSON.stringify([row.itemId, row.warehouse]) === selected);
  return <>
    <section className="panel"><h2>Demand and replenishment</h2>
      <p className="muted">Shipment history proposes reorder points and quantities. A buyer applies the parameters; planning creates supplier purchase drafts for exact approval.</p>
      <div className="actions"><button className="primary" disabled={busy || !canBuy(state)} onClick={() => run('replenishment.plan', {})}>Create replenishment drafts</button></div>
      {!rows.length ? <Empty>Define an item and a warehouse bin to plan replenishment. Sales rates use actual shipments.</Empty> : <Table numeric={[1, 3, 5]} headings={['Item / warehouse', 'Sales per day', 'Cover / stockout', 'Supply position', 'Applied rule', 'Suggested purchase', '']}>
        {rows.map(row => <tr key={JSON.stringify([row.itemId, row.warehouse])}>
          <td><ItemName state={state} id={row.itemId} /><small>{row.warehouse}</small>{row.autoDraft && <Badge>Automatic drafts enabled</Badge>}</td>
          <td>{perDay(row.soldPerDay)} {unit(state, row.itemId)}<small>{row.observedSold} shipped / {row.windowDays} days</small>{!row.hasHistory && <small>No shipments in this window</small>}</td>
          <td>{row.daysOfCover === null ? 'No sales rate' : coverDays(row.daysOfCover)}<small>{row.projectedStockoutDate ? `Projected stockout ${day(row.projectedStockoutDate)}` : 'No stockout date projected'}</small></td>
          <td>{row.position} {unit(state, row.itemId)}<small>On hand {row.onHand} − demand {row.openDemand}</small><small>+ purchases {row.onOrder} + transit {row.inboundTransfers} − outbound {row.outboundTransfers}</small></td>
          <td>{row.configured ? <><Badge>{row.low ? 'At or below point' : 'Above point'}</Badge><small>Point {row.applied.reorderPoint}; {row.applied.method === 'upTo' ? `maximum ${row.applied.maximum}` : `fixed ${row.applied.reorderQuantity}`}</small></> : 'Awaiting buyer parameters'}</td>
          <td>{row.suggestedQuantity} {unit(state, row.itemId)}<small>Expected landed USD <Amount value={row.expectedLandedCost} unknown="No supplier price" /></small>{row.drafts.map((draft: any) => <small key={draft.poId}><a href={`#purchasing/${draft.poId}`}>{draft.reference}</a> · {draft.quantity} covered by draft</small>)}</td>
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
      <h3>Observed sell-through</h3>
      <Table numeric={[0, 1, 2]} headings={['Window (days)', 'Shipped quantity', 'Average per day', 'Evidence']}>
        {f.windows.map((window: any) => <tr key={window.days}><td>{window.days}</td><td>{window.sold} {unit(state, f.itemId)}</td><td>{window.soldPerDay} {unit(state, f.itemId)}</td><td>{window.shipmentIds.length ? window.shipmentIds.map((id: string) => <small key={id}><a href={`#sales/${id}`}>{reference(records(state, 'shipments').find(shipment => shipment.id === id))}</a></small>) : 'No shipments in this window'}</td></tr>)}
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
      <p className="muted">Save changed lead time, safety stock or windows below to refresh this proposal before applying it. Demand calculations round up to six decimal places. With no shipment history, only the entered safety stock contributes.</p>
      {policy ? <div className="actions"><button disabled={busy || !canBuy(state)} onClick={() => run('replenishment.save', { ...policy, version: policy.version, applyLearned: true, stateVersion: state.version })}>Apply proposed points and quantities</button></div> : <p className="muted">Save supplier and planning settings before applying this proposal.</p>}
      {f.draftIds.length > 0 && <p>Purchase drafts: {f.draftIds.map((id: string) => <a key={id} href={`#purchasing/${id}`}>{reference(records(state, 'purchaseOrders').find(po => po.id === id))} </a>)}</p>}
    </section>
    <Form key={`${f.policyVersion}-${supplierId}`} title="Replenishment policy" submit="Save buyer policy" busy={busy} disabled={!canBuy(state)} note="Policies are versioned per item and warehouse. Enabling automatic drafts never approves or commits a purchase. Leave the point and quantity/maximum blank to save planning settings without a reorder trigger. Freight and duty are total USD estimates contributed by this item to each generated supplier draft."
      onSubmit={data => run('replenishment.save', {
        ...(policy ? { id: policy.id } : {}), version: f.policyVersion, itemId: f.itemId, warehouse: f.warehouse,
        supplierId: text(data, 'supplierId'), safetyStock: text(data, 'safetyStock'), leadDays: text(data, 'leadDays'),
        windowDays: text(data, 'windowDays'), reviewDays: text(data, 'reviewDays'), method: text(data, 'method'),
        reorderPoint: text(data, 'reorderPoint'), reorderQuantity: text(data, 'reorderQuantity'), maximum: text(data, 'maximum'),
        freight: text(data, 'freight'), duty: text(data, 'duty'), autoDraft: data.get('autoDraft') === 'on',
      })}>
      <Select label="Replenishment supplier" name="supplierId" rows={suppliers} value={supplierId} onChange={setSupplierId} />
      <Field label={`Safety stock (${unit(state, f.itemId)})`} name="safetyStock" defaultValue={policy?.safetyStock ?? '0'} inputMode="decimal" />
      <Field label="Lead time (days)" name="leadDays" defaultValue={String(policy?.leadDays ?? supplierTerms?.leadDays ?? 0)} inputMode="numeric" />
      <Field label="Sales window (days)" name="windowDays" defaultValue={String(f.windowDays)} inputMode="numeric" />
      <Field label="Review period (days)" name="reviewDays" defaultValue={String(f.reviewDays)} inputMode="numeric" />
      <Select label="Replenishment method" name="method" defaultValue={f.applied.method} rows={[{ id: 'fixed', version: 1, label: 'Fixed reorder quantity' }, { id: 'upTo', version: 1, label: 'Order up to maximum' }]} />
      <Field label="Applied reorder point" name="reorderPoint" defaultValue={policy?.reorderPoint ?? ''} required={false} inputMode="decimal" />
      <Field label="Applied reorder quantity" name="reorderQuantity" defaultValue={policy?.reorderQuantity ?? ''} required={false} inputMode="decimal" hint={supplierTerms?.reorderQuantity != null ? `Supplier reorder quantity ${supplierTerms.reorderQuantity} takes precedence.` : undefined} />
      <Field label="Applied order-up-to maximum" name="maximum" defaultValue={policy?.maximum ?? ''} required={false} inputMode="decimal" />
      <Field label="Freight estimate (USD total)" name="freight" defaultValue={policy?.freight ?? '0'} inputMode="decimal" />
      <Field label="Duty estimate (USD total)" name="duty" defaultValue={policy?.duty ?? '0'} inputMode="decimal" />
      <Field label="Automatically prepare purchase drafts" name="autoDraft" type="checkbox" defaultChecked={policy?.autoDraft === true} required={false} />
    </Form>
    <p className="muted">Supplier: {label(suppliers, supplierId)}. Policy version {f.policyVersion}. Buyer-applied parameters stay fixed when new shipments arrive.</p>
  </>;
}
