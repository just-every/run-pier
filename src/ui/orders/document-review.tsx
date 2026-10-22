import { records, type PierState, type RecordData, type RunCommand } from '../api';
import { Field, Form, Select, Table, text, Amount } from '../controls';

function Citations({ rows }: { rows: any[] }) {
  return <ul>{rows.map((c, i) => <li key={i}>Page {c.page} · {c.field}: <q>{c.quote}</q></li>)}</ul>;
}
export function DocumentReview({ extraction, state, run, busy }: {
  extraction: RecordData; state: PierState; run: RunCommand; busy: boolean;
}) {
  const draft = extraction.draft;
  if (!draft) return <section className="panel"><h3>Extraction · {extraction.status}</h3><p>{extraction.problem ?? 'Awaiting a confirmed provider outcome. No order has been created.'}</p></section>;
  if (extraction.orderId) return <section className="panel"><h3>Approved document order</h3><p>Original and reviewed extraction retained. <a href={`#sales/${extraction.orderId}`}>Open created order</a></p></section>;
  const review = extraction.review;
  const items = records(state, 'items').filter(i => !i.archived);
  const warehouses = [...new Set(records(state, 'locations').filter(l => l.kind === 'bin').map(l => l.warehouse))];
  return <>
    {extraction.preview && <section className="panel"><h2>Reviewed order preview</h2>
      <p>Warehouse: {extraction.preview.warehouse ?? 'Unresolved'} · rule: {extraction.preview.routing?.source ?? 'No routing rule'} / {extraction.preview.routing?.mode ?? 'Unresolved'}</p>
      <p>{extraction.preview.routing?.reason}</p>
      <Table headings={['Item', 'Base quantity', 'Unit price USD']}>
        {extraction.preview.lines.map((l: any, i: number) => <tr key={i}><td>{items.find(item => item.id === l.itemId)?.sku ?? l.itemId}</td><td>{l.quantity}</td><td><Amount value={l.price}/></td></tr>)}
      </Table>
      <p>Total USD: <Amount value={extraction.preview.total}/>. Stock reserves only after approval.</p>
      {extraction.status === 'reviewed' && <button disabled={busy} onClick={() => run('document.approve', {extractionId:extraction.id,version:extraction.version})}>Approve reviewed order once</button>}
    </section>}
    <Form key={`${extraction.id}-${extraction.version}`} title="Review extracted order" submit="Preview corrected order" busy={busy}
    note="Source text is untrusted evidence. Check each page, item, pack, price and destination. No order, stock movement or payment exists until this explicit approval."
    onSubmit={d => run('document.review', { extractionId: extraction.id, version: extraction.version,
      reason: text(d, 'reason'), resolveAmbiguities: d.get('resolve') === 'on',
      review: { customerId: text(d, 'customerId'), customerPO: text(d, 'customerPO'), warehouse: text(d, 'warehouse'),
        shipTo: { line1: text(d, 'address1'), state: text(d, 'state'), postalCode: text(d, 'postalCode'), country: text(d, 'country') },
        promiseDate: text(d, 'promiseDate'), lines: draft.lines.map((_: any, i: number) => ({
          itemId: text(d, `item-${i}`), quantity: text(d, `quantity-${i}`), unit: text(d, `unit-${i}`),
          ...(text(d, `price-${i}`) ? { price: text(d, `price-${i}`) } : {}),
        })) },
    })}>
    <div><h3>Source header</h3><p>Customer: {draft.customer ?? 'Unresolved'} · PO: {draft.customerPO ?? 'Unresolved'}</p>
      <Citations rows={draft.citations} />
      {draft.ambiguities.length > 0 && <ul>{draft.ambiguities.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>}
    </div>
    <Select label="Reviewed document customer" name="customerId" rows={records(state, 'parties').filter(p => p.kind === 'customer')} defaultValue={review?.customerId} />
    <Field label="Reviewed customer PO" name="customerPO" defaultValue={review?.customerPO ?? draft.customerPO ?? ''} />
    <Select label="Reviewed document warehouse" name="warehouse" rows={warehouses.map(w => ({ id: w, version: 1, label: w }))} defaultValue={review?.warehouse} />
    <Field label="Reviewed ship-to address" name="address1" defaultValue={review?.shipTo?.line1 ?? draft.shipTo?.line1 ?? ''} required={false} />
    <Field label="Reviewed ship-to state" name="state" defaultValue={review?.shipTo?.state ?? draft.shipTo?.state ?? ''} required={false} />
    <Field label="Reviewed ship-to ZIP" name="postalCode" defaultValue={review?.shipTo?.postalCode ?? draft.shipTo?.postalCode ?? ''} required={false} />
    <Field label="Reviewed ship-to country" name="country" defaultValue={review?.shipTo?.country ?? draft.shipTo?.country ?? 'US'} />
    <Field label="Reviewed requested date" name="promiseDate" type="date" defaultValue={review?.promiseDate ?? draft.requestedDate ?? ''} required={false} />
    {draft.lines.map((line: any, i: number) => <div key={i}>
      <h3>Source line {i + 1} · {line.itemCode ?? 'Unknown item'}</h3>
      <p>{line.description} · {line.quantity ?? 'Unknown quantity'} {line.unit ?? 'Unknown pack'} · {line.price ?? 'Price not supplied'}</p>
      <Citations rows={line.citations} />
      {line.ambiguities.length > 0 && <ul>{line.ambiguities.map((a: string, n: number) => <li key={n}>{a}</li>)}</ul>}
      <Select label={`Reviewed document item ${i + 1}`} name={`item-${i}`} rows={items} defaultValue={review?.lines[i]?.itemId} />
      <Field label={`Reviewed document quantity ${i + 1}`} name={`quantity-${i}`} defaultValue={review?.lines[i]?.quantity ?? line.quantity ?? ''} inputMode="decimal" />
      <Field label={`Reviewed document unit ${i + 1}`} name={`unit-${i}`} defaultValue={review?.lines[i]?.unit ?? line.unit ?? ''} hint="Use case or the selected item's base unit. Confirm the pack conversion." />
      <Field label={`Reviewed document price ${i + 1}`} name={`price-${i}`} defaultValue={review?.lines[i]?.price ?? line.price ?? ''} inputMode="decimal" required={false} hint="USD per base unit. Blank applies the customer's price list." />
    </div>)}
    <label className="field"><input type="checkbox" name="resolve" required /> I checked the original pages and resolved every ambiguity in these corrected fields.</label>
    <Field label="Document approval reason" name="reason" />
  </Form></>;
}
