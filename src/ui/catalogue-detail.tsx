import { label, records, type PierState, type RecordData } from './api'
import { Facts, Table } from './controls'

export function CatalogueDetail({ item, state, preview = false }: { item: RecordData; state: PierState; preview?: boolean }) {
  const terms = records(state, 'supplierItems').filter(term => term.itemId === item.id && term.code)
  const content = <>
    <Facts values={[
      { label: 'Base unit', value: item.unit },
      { label: 'Case conversion', value: `${item.packSize} ${item.unit}` },
      { label: 'Variant family', value: item.variantFamily || '—' },
      { label: 'Category', value: item.category || '—' },
      { label: 'Weight', value: item.weight ? `${item.weight} lb` : '—' },
      { label: 'Dimensions', value: item.dimensions ? `${item.dimensions.length} × ${item.dimensions.width} × ${item.dimensions.height} ${item.dimensions.unit}` : '—' },
      { label: 'Status', value: item.archived ? 'Archived' : 'Active' },
    ]} />
    {item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noreferrer"><img src={item.imageUrl} alt={item.name} loading="lazy" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} /></a>}
    <h3>Barcodes</h3><Table headings={['Code', 'Label', 'Quantity (base units)']}>
      {item.barcode && <tr><td>{item.barcode}</td><td>Unit</td><td>1 {item.unit}</td></tr>}
      {item.caseBarcode && <tr><td>{item.caseBarcode}</td><td>Case</td><td>{item.packSize} {item.unit}</td></tr>}
      {(item.barcodes || []).map((barcode: any, index: number) => <tr key={index}><td>{barcode.code}</td><td>{barcode.label || '—'}</td><td>{barcode.quantity} {item.unit}</td></tr>)}
    </Table>
    {!item.barcode && !item.caseBarcode && !item.barcodes?.length && <p className="muted">No barcodes recorded.</p>}
    <h3>Supplier and customer references</h3>
    {item.references?.length || terms.length ? <Table headings={['Supplier / customer', 'Code', 'Source']}>
      {(item.references || []).map((reference: any, index: number) => <tr key={index}><td>{label(records(state, 'parties'), reference.partyId)}</td><td>{reference.code}</td><td>Item reference</td></tr>)}
      {terms.map(term => <tr key={term.id}><td>{label(records(state, 'parties'), term.supplierId)}</td><td>{term.code}</td><td>Supplier terms</td></tr>)}
    </Table> : <p className="muted">No references recorded.</p>}
  </>
  return preview ? <div>{content}</div> : <details className="panel"><summary>Catalogue details · {item.sku}</summary>{content}</details>
}
