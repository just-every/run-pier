import { useState } from 'react'
import { records, type PierState, type RecordData, type RunCommand } from './api'
import { Field, Form, Select, text } from './controls'

type Barcode = { code: string; quantity: string; label: string }
type Reference = { partyId: string; code: string }
const decimal = '[0-9]+([.][0-9]{1,6})?'

export function CatalogueEditor({ item, state, run, busy, done, cancel }: { item: RecordData | null; state: PierState; run: RunCommand; busy: boolean; done: () => void; cancel: () => void }) {
  const [barcodes, setBarcodes] = useState<Barcode[]>((item?.barcodes || []).map((row: Barcode) => ({ ...row, label: row.label || '' })))
  const [references, setReferences] = useState<Reference[]>(item?.references || [])
  const parties = records(state, 'parties').filter(party => ['supplier', 'customer'].includes(party.kind)).map(party => ({ ...party, label: `${party.name} · ${party.kind}` }))
  return <div id="item-editor"><Form title={item ? `Edit ${item.name}` : 'Add item'} busy={busy} onSubmit={async data => {
    const length = text(data, 'length'), width = text(data, 'width'), height = text(data, 'height')
    const saved = await run('item.save', {
      ...(item ? { id: item.id, version: item.version } : {}),
      sku: text(data, 'sku'), name: text(data, 'name'), barcode: text(data, 'barcode'), caseBarcode: text(data, 'caseBarcode'),
      unit: text(data, 'unit'), packSize: text(data, 'packSize'), archived: data.get('archived') === 'on',
      variantFamily: text(data, 'variantFamily'), category: text(data, 'category'), imageUrl: text(data, 'imageUrl'), weight: text(data, 'weight'),
      dimensions: length || width || height ? { length, width, height, unit: text(data, 'dimensionUnit') } : null,
      barcodes, references,
    })
    if (saved) done()
    return saved
  }}>
    <Field label="SKU" name="sku" defaultValue={item?.sku} />
    <Field label="Product name" name="name" defaultValue={item?.name} />
    <Field label="Barcode" name="barcode" required={false} defaultValue={item?.barcode} hint="The unit barcode (UPC-A or EAN-13); a scan counts one base unit." />
    <Field label="Case barcode" name="caseBarcode" required={false} defaultValue={item?.caseBarcode} hint="GTIN-14 or ITF-14 on the case; a scan counts one pack." />
    <Field label="Base unit" name="unit" defaultValue={item?.unit} hint="All stock commands use this unit." />
    <Field label="Exact pack conversion" name="packSize" defaultValue={item?.packSize || '1'} inputMode="decimal" pattern={decimal} hint="Number of base units in a pack; up to six decimal places." />
    <Field label="Variant family" name="variantFamily" defaultValue={item?.variantFamily} required={false} />
    <Field label="Category" name="category" defaultValue={item?.category} required={false} />
    <Field label="Image URL" name="imageUrl" type="url" pattern="https://.*" defaultValue={item?.imageUrl} required={false} hint="A public HTTPS image address." />
    <Field label="Weight (lb)" name="weight" defaultValue={item?.weight} required={false} inputMode="decimal" pattern={decimal} />
    <fieldset><legend>Dimensions</legend><div className="form-grid">
      <Field label="Length" name="length" defaultValue={item?.dimensions?.length} required={false} inputMode="decimal" pattern={decimal} />
      <Field label="Width" name="width" defaultValue={item?.dimensions?.width} required={false} inputMode="decimal" pattern={decimal} />
      <Field label="Height" name="height" defaultValue={item?.dimensions?.height} required={false} inputMode="decimal" pattern={decimal} />
      <label className="field"><span>Dimension unit</span><select name="dimensionUnit" aria-label="Dimension unit" defaultValue={item?.dimensions?.unit || 'in'}><option value="in">Inches</option><option value="cm">Centimeters</option></select></label>
    </div><p className="muted">Enter all three dimensions, or leave all three blank to clear them.</p></fieldset>
    <fieldset><legend>Additional barcodes</legend><div className="line-editor">
      <small>Each code counts its exact quantity in base units. Unit and case barcodes above remain separate.</small>
      {barcodes.map((barcode, index) => <div className="line-row" key={index}>
        <Field label={`Additional barcode ${index + 1}`} value={barcode.code} onChange={code => setBarcodes(rows => rows.map((row, i) => i === index ? { ...row, code } : row))} />
        <Field label={`Barcode ${index + 1} quantity (base units)`} value={barcode.quantity} inputMode="decimal" pattern={decimal} onChange={quantity => setBarcodes(rows => rows.map((row, i) => i === index ? { ...row, quantity } : row))} />
        <Field label={`Barcode ${index + 1} label`} required={false} value={barcode.label} onChange={label => setBarcodes(rows => rows.map((row, i) => i === index ? { ...row, label } : row))} />
        <button type="button" aria-label={`Remove additional barcode ${index + 1}`} onClick={() => setBarcodes(rows => rows.filter((_, i) => i !== index))}>Remove</button>
      </div>)}
      <button type="button" disabled={barcodes.length >= 30} onClick={() => setBarcodes(rows => [...rows, { code: '', quantity: '1', label: '' }])}>+ Add barcode</button>
    </div></fieldset>
    <fieldset><legend>Supplier and customer references</legend><div className="line-editor">
      {references.map((reference, index) => <div className="line-row" key={index}>
        <Select label={`Reference ${index + 1} supplier or customer`} rows={parties} value={reference.partyId} onChange={partyId => setReferences(rows => rows.map((row, i) => i === index ? { ...row, partyId } : row))} />
        <Field label={`Reference ${index + 1} code`} value={reference.code} onChange={code => setReferences(rows => rows.map((row, i) => i === index ? { ...row, code } : row))} />
        <button type="button" aria-label={`Remove reference ${index + 1}`} onClick={() => setReferences(rows => rows.filter((_, i) => i !== index))}>Remove</button>
      </div>)}
      {!parties.length && <small>Add a supplier or customer below before adding a reference.</small>}
      <button type="button" disabled={!parties.length || references.length >= 50} onClick={() => setReferences(rows => [...rows, { partyId: '', code: '' }])}>+ Add reference</button>
    </div></fieldset>
    <label className="check"><input type="checkbox" name="archived" defaultChecked={item?.archived} />Archive item; keep its history</label>
    <button type="button" onClick={cancel}>Cancel</button>
  </Form></div>
}
