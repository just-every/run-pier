import { Field, Form, Select, text } from '../controls'
import { records, type PierState, type RunCommand } from '../api'

export function EdiSettings({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const partners = records(state, 'ediPartners')
  return <details className="panel"><summary>Retailer settings and item mappings</summary>
    <p>Use the retailer’s implementation guide to set identifiers, units and deadlines. Target, Walmart and Home Depot each require their own onboarding and certification. AS2, SFTP or VAN selection and SPS Commerce / Orderful authorization are pending. Self-hosted installs can configure an authorized EDI bridge; RER Managed delivery is not available yet.</p>
    <p className="muted"><strong>Provider costs.</strong> SPS Commerce, Orderful or your EDI bridge/VAN provider bills any onboarding, subscription and document or transport charges under your agreement. GS1 bills for your licensed company prefix. Review these provider charges before enabling delivery or using a production retailer connection. Saving a retailer here does not activate a paid transport service. Pier charges no connection, license or per-seat fee.</p>
    <Form title="Add retailer" busy={busy} submit="Save retailer" onSubmit={d => run('edi.partner.save', { name: text(d, 'name'), customerId: text(d, 'customerId'), warehouse: text(d, 'warehouse'), senderId: text(d, 'senderId'), receiverId: text(d, 'receiverId'), gs1Prefix: text(d, 'gs1Prefix'), ackMinutes: Number(text(d, 'ackMinutes')), asnBeforeArrivalMinutes: Number(text(d, 'asnBeforeArrivalMinutes')), invoiceMinutes: Number(text(d, 'invoiceMinutes')), transport: 'pending', usageIndicator: text(d, 'usageIndicator') })}>
      <Field label="Retailer name" name="name" /><Select label="Customer" name="customerId" rows={records(state, 'parties').filter(p => p.kind === 'customer')} />
      <Field label="Fulfilment warehouse" name="warehouse" /><Field label="Our EDI identifier" name="senderId" maxLength={15} /><Field label="Retailer EDI identifier" name="receiverId" maxLength={15} />
      <label className="field"><span>EDI mode</span><select name="usageIndicator"><option value="T">Test — retailer certification</option><option value="P">Production — approved retailer connection</option></select></label>
      <Field label="Our licensed GS1 company prefix" name="gs1Prefix" hint="Use only a prefix assigned to your company by GS1." />
      <Field label="855 due after receipt (minutes)" name="ackMinutes" type="number" min="1" defaultValue="1440" />
      <Field label="856 lead before arrival (minutes)" name="asnBeforeArrivalMinutes" type="number" min="1" defaultValue="120" />
      <Field label="810 due after dispatch (minutes)" name="invoiceMinutes" type="number" min="1" defaultValue="1440" />
    </Form>
    <Form title="Map retailer item or UPC" busy={busy} disabled={!partners.length} submit="Save mapping" onSubmit={d => run('edi.mapping.save', { partnerId: text(d, 'partnerId'), buyerCode: text(d, 'buyerCode'), upc: text(d, 'upc'), itemId: text(d, 'itemId'), unit: text(d, 'unit'), packQuantity: text(d, 'packQuantity') })}>
      <Select label="Retailer" name="partnerId" rows={partners} /><Field label="Retailer item code (BP)" name="buyerCode" required={false} /><Field label="UPC (UP)" name="upc" required={false} />
      <Select label="Pier item" name="itemId" rows={records(state, 'items').filter(i => !i.archived)} /><Field label="EDI unit" name="unit" defaultValue="EA" /><Field label="Base units per EDI unit" name="packQuantity" defaultValue="1" />
    </Form>
  </details>
}
