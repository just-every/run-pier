import type { Row, State } from '../model';
import { addMinutes } from './records';

export function ediState(s: State, now: string) {
  const partners = s.ediPartners, orders = s.ediOrders, documents = s.ediDocuments;
  const exceptions: any[] = [];
  const requirements: any[] = documents.filter(d => d.direction === 'outbound').map(d => ({ id: `document:${d.id}`, partnerId: d.partnerId, ediOrderId: d.ediOrderId, kind: d.kind, deadline: d.deadline ?? null, documentId: d.id, status: d.status, sentAt: d.sentAt ?? null, onTime: d.onTime ?? null, packId: d.packId ?? null, shipmentId: d.shipmentId ?? null }));
  function due(id: string, partner: Row, deadline: string | null, detail: string, links: Record<string, any>, sentAt: string | null = null) {
    if (!deadline) return;
    const late = sentAt ? Date.parse(sentAt) > Date.parse(deadline) : Date.parse(now) > Date.parse(deadline);
    const warning = !sentAt && Date.parse(now) >= Date.parse(addMinutes(deadline, -partner.warningMinutes));
    if (late || warning) exceptions.push({ id, partnerId: partner.id, kind: late ? 'missed deadline' : 'deadline approaching', severity: late ? 'error' : 'warning', deadline, detail, ...links });
  }
  for (const incoming of orders) {
    const partner = partners.find(p => p.id === incoming.partnerId)!;
    if (incoming.blockers?.length) exceptions.push({ id: `order:${incoming.id}:mapping`, partnerId: partner.id, ediOrderId: incoming.id, kind: 'order blocked', severity: 'error', detail: incoming.blockers.join(' ') });
    if (!documents.some(d => d.ediOrderId === incoming.id && d.kind === '855' && d.direction === 'outbound')) {
      requirements.push({ id: `order:${incoming.id}:855`, partnerId: partner.id, ediOrderId: incoming.id, kind: '855', deadline: incoming.ackDeadline, documentId: null, status: 'required', sentAt: null });
      due(`order:${incoming.id}:855`, partner, incoming.ackDeadline, `Purchase order ${incoming.poNumber} needs its reviewed 855 acknowledgment.`, { ediOrderId: incoming.id, kindRequired: '855' });
    }
    for (const pack of s.packs.filter(p => p.orderId === incoming.orderId && ['packed','shipped'].includes(p.status))) {
      if (documents.some(d => d.kind === '856' && d.packId === pack.id)) continue;
      requirements.push({ id: `pack:${pack.id}:856`, partnerId: partner.id, ediOrderId: incoming.id, kind: '856', deadline: null, documentId: null, status: 'required', sentAt: null, packId: pack.id });
      exceptions.push({ id: `pack:${pack.id}:856`, partnerId: partner.id, ediOrderId: incoming.id, packId: pack.id, kind: 'ASN required', severity: 'warning', deadline: null, detail: `Closed pack for ${incoming.poNumber} needs an 856 and explicit pickup and arrival times.` });
    }
    for (const shipment of s.shipments.filter(sh => sh.orderId === incoming.orderId)) {
      if (!documents.some(d => d.kind === '810' && d.shipmentId === shipment.id)) {
        const deadline = addMinutes(shipment.createdAt, partner.invoiceMinutes);
        requirements.push({ id: `shipment:${shipment.id}:810`, partnerId: partner.id, ediOrderId: incoming.id, kind: '810', deadline, documentId: null, status: 'required', sentAt: null, shipmentId: shipment.id });
        due(`shipment:${shipment.id}:810`, partner, deadline, `Shipment ${shipment.reference} needs its 810 invoice.`, { ediOrderId: incoming.id, shipmentId: shipment.id, kindRequired: '810' });
      }
    }
  }
  for (const doc of documents) {
    const partner = partners.find(p => p.id === doc.partnerId)!;
    if (doc.direction === 'outbound') {
      due(`document:${doc.id}:deadline`, partner, doc.deadline, `${doc.kind} for ${orders.find(o => o.id === doc.ediOrderId)?.poNumber ?? 'retailer'} ${doc.sentAt ? 'was transmitted after its window.' : 'has not been transmitted inside its window.'}`, { documentId: doc.id, ediOrderId: doc.ediOrderId }, doc.sentAt);
      if (doc.status === 'uncertain') exceptions.push({ id: `document:${doc.id}:uncertain`, partnerId: partner.id, documentId: doc.id, kind: 'delivery uncertain', severity: 'error', detail: doc.problem });
      if (doc.functionalAcknowledgment && doc.functionalAcknowledgment.status !== 'A') exceptions.push({ id: `document:${doc.id}:997`, partnerId: partner.id, documentId: doc.id, kind: 'functional acknowledgment rejected', severity: 'error', detail: `The retailer returned ${doc.functionalAcknowledgment.status}. Review the retained 997; bridge acceptance did not establish retailer acceptance.` });
    } else if (['unmatched','conflict'].includes(doc.status)) exceptions.push({ id: `document:${doc.id}:review`, partnerId: partner.id, documentId: doc.id, kind: 'acknowledgment needs review', severity: 'error', detail: doc.problem ?? 'No unique outbound document matches this retailer acknowledgment.' });
  }
  return { edi: { partners, mappings: s.ediMappings, orders, documents, labelEvents: s.ediLabelEvents, due: requirements, exceptions } };
}
