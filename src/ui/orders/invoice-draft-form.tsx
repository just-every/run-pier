import { useState } from 'react';
import { records, type PierState, type RunCommand } from '../api';
import { Field, Form, Select, text } from '../controls';

export function InvoiceDraftForm({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [orderId, setOrderId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const orders = records(state, 'orders'), order = orders.find(o => o.id === orderId);
  const convertToCad = currency === 'CAD' && !!order && (order.currency ?? 'USD') !== 'CAD';
  return <Form title="Prepare a customer invoice" submit="Create invoice draft" busy={busy}
    note="Shipment invoices contain exactly that shipment. Omit shipment for an accepted prepay order. External ledger and provider-tax posting remain separate pending connections."
    onSubmit={async data => {
      const saved = await run('invoice.draft', {
        orderId: text(data, 'orderId'),
        ...(text(data, 'shipmentId') ? { shipmentId: text(data, 'shipmentId') } : {}),
        invoiceDate: text(data, 'invoiceDate'), currency: text(data, 'currency'), usdRate: text(data, 'usdRate'),
        terms: { kind: text(data, 'terms') },
        ...(convertToCad ? {
          unitPrices: order!.lines.map((line: any) => ({ orderLineId: line.id, price: text(data, `cad-price:${line.id}`) })),
          priceReason: text(data, 'priceReason'),
        } : {}),
        charges: ['freight', 'handling', 'surcharge', 'discount'].filter(kind => text(data, kind)).map(kind => ({ kind, amount: text(data, kind), taxable: data.get('taxable') === 'on' })),
      });
      if (saved) { setOrderId(''); setCurrency('USD'); }
      return saved;
    }}>
    <Select label="Invoice order" name="orderId" rows={orders.map(o => ({ ...o, label: o.reference }))} value={orderId} onChange={setOrderId}/>
    <Select label="Invoice shipment" name="shipmentId" required={false} rows={records(state, 'shipments').map(s => ({ ...s, label: s.reference }))}/>
    <Field label="Invoice date" name="invoiceDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/>
    <label className="field"><span>Invoice payment terms</span><select name="terms" aria-label="Invoice payment terms"><option value="net30">Net 30</option><option value="dueReceipt">Due on receipt</option><option value="net15">Net 15</option><option value="net60">Net 60</option><option value="eom">End of month</option></select></label>
    <label className="field"><span>Invoice currency</span><select name="currency" aria-label="Invoice currency" value={currency} onChange={event => setCurrency(event.target.value)}><option value="USD">USD</option><option value="CAD">CAD</option></select></label>
    <Field label="Retained USD exchange rate" name="usdRate" defaultValue="1" hint={currency === 'CAD' ? 'USD value of one CAD, retained with this invoice.' : undefined}/>
    {convertToCad && <fieldset key={order.id}><legend>Reviewed CAD prices for {order.reference}</legend>
      <p>Enter the CAD price for each order line in its base unit and explain the conversion.</p>
      {order.lines.map((line: any, index: number) => {
        const item = records(state, 'items').find(i => i.id === line.itemId);
        return <Field key={line.id} label={`CAD unit price ${index + 1} · ${item?.sku ?? line.itemId}`} name={`cad-price:${line.id}`} inputMode="decimal" hint={`Per ${item?.unit ?? line.unit ?? 'base unit'}; source price ${order.currency ?? 'USD'} ${line.price ?? 'unpriced'}.`}/>;
      })}
      <Field label="CAD price review reason" name="priceReason"/>
    </fieldset>}
    {['freight', 'handling', 'surcharge', 'discount'].map(kind => <Field key={kind} label={`Invoice ${kind} amount`} name={kind} required={false} inputMode="decimal"/>)}
    <label className="field"><input type="checkbox" name="taxable"/> Tax these charge lines under the retained owner table</label>
  </Form>;
}
