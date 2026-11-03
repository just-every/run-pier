import { fail, get, row, type Context, type Row, type State } from '../model';
import { validateOriginal } from './validation';

export const AI_ID = 'pier-document-ai';
export const INBOUND_ID = 'pier-document-inbound';
export const metadata = ({ original: _original, ...document }: Row) => document;
export function attachment(c: Context, value: any) {
  if (!value || !['parties', 'orders', 'purchaseOrders', 'receipts', 'shipments', 'supplierBills'].includes(value.kind)) fail('DOCUMENT_RECORD', 'Choose an existing customer, supplier, order, purchase, receipt, shipment or supplier bill.');
  const record = get(c.s, value.kind, value.id);
  return { kind: value.kind as string, id: record.id, actorId: c.actor.id, at: c.now };
}
export async function retain(c: Context, p: any, source: any = { kind: 'upload', actorId: c.actor.id }) {
  const valid = await validateOriginal(p);
  const existing = c.s.evidenceDocuments.find(d => d.sha256 === valid.sha256);
  if (existing) return { ...metadata(existing), duplicate: true, duplicateOf: existing.id };
  const links = p.record ? [attachment(c, p.record)] : [];
  return metadata(row(c, 'evidenceDocuments', { ...valid, status: 'retained', access: 'owner', retention: 'Retained pending owner retention policy; deletion is unavailable.', source, links }));
}
export function documentViews(s: State) {
  return {
    documents: s.evidenceDocuments.map(metadata),
    extractions: s.documentExtractions,
    inbox: s.documentInbox.map(({ raw: _raw, ...inbox }) => inbox),
    settings: s.documentSettings.find(r => r.id === AI_ID) ?? { version: 0, enabled: false, configured: false, model: '', consent: null },
    inboundSettings: s.documentSettings.find(r => r.id === INBOUND_ID) ?? { version: 0, enabled: false, configured: false, provider: 'sendgrid', recipient: '', consent: null },
  };
}
