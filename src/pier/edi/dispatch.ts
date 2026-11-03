import { fail, fresh, get, requireRole, text, type Actor, type Context, type Row } from '../model';
import { load } from '../storage';
import { bridgeUrl, ediUnavailable, sendEdi, type EdiEnv } from './adapter';
import { timestamp } from './records';
import { providerOperation } from '../provider-audit';

function outbound(c: Context, p: any): Row {
  const doc = get(c.s, 'ediDocuments', p.documentId); fresh(doc, p.version);
  if (doc.direction !== 'outbound') fail('EDI_SEND', 'Only prepared outbound documents can be sent.');
  return doc;
}
export function deliveryCommand(c: Context, type: string, p: any): Row {
  const doc = outbound(c, p);
  requireRole(c, doc.kind === '997' && type !== 'edi.send.reconcile' ? ['operator'] : []);
  if (type === 'edi.send.unavailable') {
    if (!doc.attempted) { doc.status = 'unavailable'; doc.problem = ediUnavailable; doc.version++; }
    return doc;
  }
  if (type === 'edi.send.begin') {
    if (doc.attempted || !['prepared','unavailable'].includes(doc.status)) fail('EDI_UNCERTAIN', 'This document was already attempted. Reconcile the bridge receipt before another send.');
    const partner = get(c.s, 'ediPartners', doc.partnerId);
    if (partner.enabled === false) fail('EDI_PARTNER', 'This retailer connection is disabled.');
    if (doc.kind === '856' && Date.parse(c.now) >= Date.parse(doc.arrivalAt)) fail('EDI_ARRIVAL', 'The retailer arrival time has passed. Review the late ASN exception before any delivery.');
    doc.attempted = true; doc.status = 'uncertain'; doc.attemptToken = text(p.attemptToken);
    doc.problem = 'Delivery was started. Check the bridge receipt before any repeated send.';
    doc.attempts.push({ token: doc.attemptToken, at: c.now, actorId: c.actor.id, commandId: c.commandId, status: 'uncertain' });
    doc.version++; return doc;
  }
  if (type === 'edi.send.result') {
    if (!doc.attempted || doc.attemptToken !== p.attemptToken || doc.status !== 'uncertain') fail('EDI_SEND_RESULT', 'This result does not match the current delivery attempt.');
    if (!['accepted','uncertain'].includes(p.status)) fail('EDI_SEND_RESULT', 'The bridge must explicitly accept this document or leave it uncertain.');
    doc.status = p.status === 'accepted' ? 'sent' : 'uncertain';
    doc.problem = text(p.detail, 'Delivery result');
    if (p.status === 'accepted') { doc.providerId = text(p.providerId, 'Bridge receipt identity'); doc.sentAt = c.now; doc.onTime = doc.deadline ? Date.parse(c.now) <= Date.parse(doc.deadline) : null; }
    Object.assign(doc.attempts.at(-1), { status: p.status, recordedAt: c.now, providerId: doc.providerId ?? null });
    doc.version++; return doc;
  }
  if (type === 'edi.send.reconcile') {
    if (!doc.attempted || doc.status !== 'uncertain') fail('EDI_RECONCILE', 'Only an uncertain delivery needs bridge reconciliation.');
    const reason = text(p.reason, 'Bridge reconciliation evidence');
    if (!['accepted','not_received'].includes(p.outcome)) fail('EDI_RECONCILE', 'Record the verified bridge receipt or verified absence.');
    doc.reconciliations = [...(doc.reconciliations ?? []), { actorId: c.actor.id, at: c.now, commandId: c.commandId, outcome: p.outcome, reason }];
    if (p.outcome === 'accepted') {
      const sentAt = timestamp(p.sentAt, 'verified transmission time');
      if (Date.parse(sentAt) > Date.parse(c.now) || Date.parse(sentAt) < Date.parse(doc.createdAt)) fail('EDI_RECONCILE', 'The verified transmission time must fall between preparation and now.');
      doc.status = 'sent'; doc.sentAt = sentAt; doc.providerId = text(p.providerId, 'Verified bridge receipt'); doc.onTime = doc.deadline ? Date.parse(sentAt) <= Date.parse(doc.deadline) : null;
    } else { doc.status = 'prepared'; doc.attempted = false; doc.attemptToken = null; }
    doc.problem = reason; doc.version++; return doc;
  }
  return fail('COMMAND', 'Unknown EDI delivery command.');
}
type Execute = (env: EdiEnv, actor: Actor, commandId: string, type: string, payload: any) => Promise<any>;
/** Admission persists a unique intent before the network call. A replay never repeats an uncertain send. */
export async function deliverEdi(env: EdiEnv, actor: Actor, commandId: string, payload: { documentId: string; version: number }, execute: Execute): Promise<any> {
  const s = await load(env.DB), doc = get(s, 'ediDocuments', payload.documentId), partner = get(s, 'ediPartners', doc.partnerId);
  if (actor.role !== 'owner' && !(actor.role === 'operator' && doc.kind === '997')) fail('FORBIDDEN', 'Only the owner can send retailer business documents. Operators may send their syntax acknowledgments.');
  if (doc.attempted || doc.status === 'sent') return { ok: true, result: doc, version: s.version };
  if (!bridgeUrl(env)) return execute(env, actor, `${commandId}-unavailable`, 'edi.send.unavailable', payload);
  const token = crypto.randomUUID();
  const begun = await execute(env, actor, `${commandId}-begin-${token}`, 'edi.send.begin', { ...payload, attemptToken: token });
  const admitted = begun.result as Row;
  const state = await load(env.DB), order = state.orders.find(row => row.id === admitted.orderId);
  const result = await providerOperation(env.DB, { actor, commandId, connectorId: partner.id, operation: 'edi.send', direction: 'outbound', state,
    sources: [{ collection: 'ediDocuments', row: admitted }, { collection: 'ediPartners', row: partner }],
    itemIds: order?.lines.map((line: Row) => line.itemId) ?? [],
    documentIds: [admitted.orderId, admitted.ediOrderId, admitted.packId, admitted.shipmentId].filter(Boolean), requestId: admitted.id, providerAttemptId: token,
  }, () => sendEdi(env, partner, admitted), outcome => ({ outcome: outcome.status, externalIds: [outcome.providerId] }));
  return execute(env, actor, `${commandId}-result-${token}`, 'edi.send.result', { documentId: admitted.id, version: admitted.version, attemptToken: token, ...result });
}
