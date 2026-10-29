import { type RecordData } from '../api';
import { Amount, Table } from '../controls';

export function TaxEvidence({ tax, title = 'Retained tax estimate' }: { tax: any; title?: string }) {
  if (!tax) return null;
  return <section className="panel" aria-label={title}><h2>{title}</h2>
    <p>{tax.status} · {tax.source} · Provider: {tax.providerCommit ?? 'not-configured'}</p>
    {tax.table && <p>Destination {tax.destination?.state} · table {tax.table.state} version {tax.table.version} · {tax.basis ?? 'destination'} basis{tax.originState ? ` · origin ${tax.originWarehouse}, ${tax.originState} · rate table version ${tax.rateTable?.version}` : ''}</p>}
    {tax.certificate && <p>Certificate {tax.certificate.number} · {tax.certificate.state} · expires {tax.certificate.expires}</p>}
    {tax.status === 'review' && <p role="status">Resolve the certificate, product code or jurisdiction in Settings, then revise this quote or prepare a new invoice draft.</p>}
    {!!tax.lines?.length && <Table className="tax-calculation" headings={['Line or charge', 'Product code', 'Taxable amount', 'Rate', 'Tax']} numeric={[2, 3, 4]}>
      {tax.lines.map((line: RecordData, index: number) => <tr key={line.lineId}><td>{line.kind === 'product' ? line.description ?? `Product ${index + 1}` : line.kind}</td><td>{line.taxCode ?? '—'}{line.exempt && <p>Exempt calculation</p>}</td><td><Amount value={line.taxableAmount}/></td><td>{line.rate}%</td><td><Amount value={line.amount}/></td></tr>)}
    </Table>}
    <p>Tax estimate <Amount value={tax.amount} unknown="Needs review"/>. This is not verified provider tax.</p>
  </section>;
}
