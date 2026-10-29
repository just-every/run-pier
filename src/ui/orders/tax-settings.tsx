import { useState } from 'react';
import { records, type PierState, type RunCommand } from '../api';
import { Field, Form, Select, Table, text } from '../controls';

export function TaxSettings({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [selected, setSelected] = useState(''), tables = records(state, 'salesPolicies').filter(r => r.kind === 'tax-table');
  if (state.actor.role !== 'owner') return <p>Tax settings require the current owner.</p>;
  const old = tables.find(r => r.state === selected), rules = old?.rules;
  return <><h1>Settings</h1><p>Sales tax rules are owner-maintained estimates. Provider verification, certificate validation and filing remain separate.</p>
    <Form key={selected + ':' + (old?.version ?? 0)} title="Owner tax estimate table" submit="Save jurisdiction estimate" busy={busy}
      note="Detailed rules remain required once configured, with a reviewed code for every product. Origin rules apply only to the named warehouse and use that origin state's saved rates."
      onSubmit={d => {
        const stateCode = text(d, 'state').toUpperCase(), prior = tables.find(r => r.state === stateCode);
        return run('sales.taxTable', { state: stateCode, rate: text(d, 'rate'), reason: text(d, 'reason'), ...(prior ? { version: prior.version } : {}),
          ...(rules || d.get('detailed') === 'on' ? { rules: { basis: text(d, 'basis'), originState: text(d, 'originState'), originWarehouse: text(d, 'originWarehouse'), freightTaxable: d.get('freightTaxable') === 'on', handlingTaxable: d.get('handlingTaxable') === 'on', products: text(d, 'products').split('\n').filter(line => line.trim()).map(line => { const [code, rate] = line.split(','); return { code: code?.trim(), rate: rate?.trim() }; }) } } : {}) });
      }}>
      <label className="field"><span>Load state rules</span><select aria-label="Load state rules" value={selected} onChange={e => setSelected(e.target.value)}><option value="">New state</option>{tables.map(t => <option key={t.id} value={t.state}>{t.state} · version {t.version}</option>)}</select></label>
      <Field label="Tax state (two letters)" name="state" defaultValue={selected}/>
      <Field label="Estimated tax percent" name="rate" inputMode="decimal" defaultValue={old?.rate}/>
      <label className="field"><input type="checkbox" name="detailed" defaultChecked={!!rules} disabled={!!rules}/> Use explicit product and charge rules</label>
      <label className="field"><span>Jurisdiction basis</span><select name="basis" aria-label="Jurisdiction basis" defaultValue={rules?.basis ?? 'destination'}><option value="destination">Destination state rates</option><option value="origin">Reviewed origin state rates</option></select></label>
      <Field label="Reviewed origin state" name="originState" required={false} defaultValue={rules?.originState ?? ''}/>
      <Select label="Reviewed origin warehouse" name="originWarehouse" required={false} rows={[...new Set(records(state, 'locations').filter(l => l.kind === 'bin').map(l => l.warehouse))].map(id => ({ id, version: 1, label: id }))} defaultValue={rules?.originWarehouse ?? ''}/>
      <label className="field"><input type="checkbox" name="freightTaxable" defaultChecked={rules?.freightTaxable}/> Freight is taxable</label>
      <label className="field"><input type="checkbox" name="handlingTaxable" defaultChecked={rules?.handlingTaxable}/> Handling is taxable</label>
      <label className="field"><span>Product code rates (code, percent per line)</span><textarea aria-label="Product code rates (code, percent per line)" name="products" rows={4} defaultValue={rules?.products.map((p: any) => `${p.code}, ${p.rate}`).join('\n') ?? ''}/></label>
      <Field label="Tax table review reason" name="reason"/>
    </Form>
    <Form title="Assign product tax code" submit="Save product tax code" busy={busy} onSubmit={d => { const itemId = text(d, 'itemId'), prior = records(state, 'salesPolicies').find(r => r.kind === 'product-tax-code' && r.itemId === itemId); return run('sales.taxProduct', { itemId, taxCode: text(d, 'taxCode'), reason: text(d, 'reason'), ...(prior ? { version: prior.version } : {}) }); }}>
      <Select label="Tax product" name="itemId" rows={records(state, 'items')}/><Field label="Product tax code" name="taxCode"/><Field label="Product tax review reason" name="reason"/>
    </Form>
    <Table className="tax-calculation" headings={['Product', 'Tax code', 'Version']}>{records(state, 'salesPolicies').filter(r => r.kind === 'product-tax-code').map(r => <tr key={r.id}><td>{records(state, 'items').find(i => i.id === r.itemId)?.sku}</td><td>{r.taxCode}</td><td>{r.version}</td></tr>)}</Table>
    <Form title="Review destination certificate reference" submit="Save certificate reference" busy={busy} note="A customer with certificate references enters review if the destination reference is missing or expired. This retains an owner reference, not a validated original."
      onSubmit={d => { const customer = records(state, 'parties').find(r => r.id === text(d, 'customerId'))!; return run('customer.resaleCertificate', { customerId: customer.id, version: customer.version, state: text(d, 'state'), number: text(d, 'number'), document: text(d, 'document'), expires: text(d, 'expires'), reason: text(d, 'reason') }); }}>
      <Select label="Certificate customer" name="customerId" rows={records(state, 'parties').filter(r => r.kind === 'customer')}/><Field label="Certificate state" name="state"/><Field label="Certificate number" name="number"/><Field label="Certificate document reference" name="document"/><Field label="Certificate expiry" name="expires" type="date"/><Field label="Certificate review reason" name="reason"/>
    </Form>
  </>;
}
