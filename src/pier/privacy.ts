import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal';
import type { Bindings } from '../auth.server';
import { canonicalJson, sha256 } from './import-kit';
import { fail, fresh, get, requireRole, row, text, type Context, type State } from './model';

function documentSubjects(s: State, document: any) {
  const related = new Set<string>([document.id, ...document.links.map((link: any) => link.id)]);
  for (const order of s.orders.filter(order => order.evidenceDocumentId === document.id)) related.add(order.id);
  for (const extraction of s.documentExtractions.filter(extraction => extraction.documentId === document.id)) if (extraction.orderId) related.add(extraction.orderId);
  const parents = new Map(Object.values(s).filter(Array.isArray).flat().filter((row: any) => row && typeof row.id === 'string').map((row: any) => [row.id, row]));
  for (const id of related) {
    const record: any = parents.get(id);
    for (const field of ['customerId','supplierId','orderId','poId','receiptId','recordId']) if (typeof record?.[field] === 'string') related.add(record[field]);
  }
  return related;
}

export function privacyPreview(s: State, kind: string, id: string) {
  if (!['attachment','customer','supplier','operator'].includes(kind)) fail('PRIVACY_KIND', 'Choose attachment, customer, supplier or operator.');
  const collection = kind === 'attachment' ? 'evidenceDocuments' : kind === 'operator' ? 'roles' : 'parties';
  const target = get(s, collection, id);
  if (['customer','supplier'].includes(kind) && target.kind !== kind) fail('PRIVACY_KIND', 'The subject must match the requested customer or supplier kind.');
  const documents = kind === 'attachment' ? [target] : s.evidenceDocuments.filter(d => documentSubjects(s, d).has(id));
  const originals = documents.map(d => d.id), extractions = s.documentExtractions.filter(e => originals.includes(e.documentId));
  const inbox = s.documentInbox.filter(mail => mail.documentIds.some((key: string) => originals.includes(key)));
  const holds = s.privacyHolds.filter(h => h.active && (h.subjectId === id || documents.some(d => documentSubjects(s, d).has(h.subjectId))));
  const pending = extractions.filter(e => e.status === 'requesting').length;
  const counts = { originals: documents.length, extractions: extractions.length, inboxCopies: inbox.length, pendingRequests: pending,
    orders: s.orders.filter(o => o.customerId === id).length, purchases: s.purchaseOrders.filter(po => po.supplierId === id).length };
  return { kind, subjectId: id, version: target.version, counts, holds: holds.map(h => ({ id: h.id, reason: h.reason, category: h.category })),
    planHash: sha256(canonicalJson({ kind, id, stateVersion: s.version, counts, documentIds: originals, extractions: extractions.map(e => [e.id,e.version]), inbox: inbox.map(m => [m.id,m.version]), holds })),
    allowed: kind === 'attachment' && !holds.length && !pending,
    retained: ['Opaque source identities and append-only stock/accounting evidence; deleting an attachment is not customer/supplier/operator erasure.'],
    beyondLocalDeletion: ['Offline backups require the later erasure-journal archive. Already delivered messages and provider-retained requests cannot be deleted by Pier.'],
    limitation: kind === 'attachment' ? 'Only the selected original, its extraction drafts and containing raw inbox copies are erased. Other attachments and approved business documents are retained.' : 'Complete subject erasure is not implemented. Review dependencies and holds; no deletion is authorized by this preview.' };
}
export async function privacy(c: Context, type: string, p: any, env: Bindings) {
  if (!type.startsWith('privacy.')) return;
  requireRole(c, []);
  if (type === 'privacy.hold') {
    if (!['attachment','customer','supplier','operator'].includes(p.kind) || !['legal','accounting'].includes(p.category)) fail('PRIVACY_HOLD', 'Choose a subject and legal or accounting hold.');
    privacyPreview(c.s, p.kind, p.subjectId);
    const old = p.id ? get(c.s, 'privacyHolds', p.id) : undefined;
    if (old) { fresh(old, p.version); if (old.subjectId !== p.subjectId || old.kind !== p.kind) fail('PRIVACY_HOLD', 'A hold cannot change its subject.'); }
    const data = { subjectId: p.subjectId, kind: p.kind, category: p.category, reason: text(p.reason), active: p.active !== false, approvedBy: c.actor.id, at: c.now };
    return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'privacyHolds', data);
  }
  if (type === 'privacy.retention') {
    if (p.automaticDeletion !== false) fail('PRIVACY_POLICY', 'Retention is inspection-only; automatic destructive sweeps are disabled pending policy approval.');
    if (!Number.isSafeInteger(p.reviewAfterDays) || p.reviewAfterDays < 1 || p.reviewAfterDays > 36500) fail('PRIVACY_POLICY', 'Use one to 36500 UTC days before review.');
    const old = c.s.privacyPolicies[0]; if (old) fresh(old, p.version); else if (p.version !== 0) fail('STALE', 'Reload retention policy.');
    const data = { automaticDeletion: false, reviewAfterDays: p.reviewAfterDays, approvedBy: c.actor.id, at: c.now, consent: text(p.reason) };
    return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'privacyPolicies', data);
  }
  if (type !== 'privacy.eraseAttachment') fail('PRIVACY_KIND', 'Only explicit attachment erasure is available; subject deletion remains unavailable.');
  const preview = privacyPreview(c.s, 'attachment', p.documentId);
  if (p.planHash !== preview.planHash) fail('STALE', 'Dependencies or holds changed. Inspect a fresh erasure preview.');
  if (!preview.allowed) fail('PRIVACY_HOLD', 'A legal/accounting hold or an unfinished provider request prevents erasure.');
  if (p.confirm !== true) fail('PRIVACY_CONSENT', 'Explicitly confirm irreversible deletion of this attachment and its listed local copies.');
  const ids = new Set([p.documentId, ...c.s.documentExtractions.filter(e => e.documentId === p.documentId).map(e => e.id), ...c.s.documentInbox.filter(m => m.documentIds.includes(p.documentId)).map(m => m.id)]);
  c.s.evidenceDocuments = c.s.evidenceDocuments.filter(d => d.id !== p.documentId);
  c.s.documentExtractions = c.s.documentExtractions.filter(e => !ids.has(e.id));
  c.s.documentInbox = c.s.documentInbox.filter(m => !ids.has(m.id));
  // Command recovery keeps its identity/digest but never restores removed bytes.
  const commands = await env.DB.prepare('SELECT id,result FROM pier_commands').all<{id:string;result:string}>();
  const contains = (value: any): boolean => typeof value === 'string' ? ids.has(value) : !!value && typeof value === 'object' && Object.values(value).some(contains);
  const statements: D1PreparedStatement[] = [];
  for (const command of commands.results) {
    const result = JSON.parse(command.result);
    if (contains(result)) statements.push(env.DB.prepare('UPDATE pier_commands SET result=? WHERE id=?').bind(JSON.stringify({ ok: true, result: { erased: true }, version: result.version }), command.id));
  }
  statements.push(...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB));
  c.privacyStatements = statements;
  return row(c, 'privacyReceipts', { counts: preview.counts, completedAt: c.now, approvedBy: c.actor.id, kind: 'attachment', outcome: 'complete', beyondLocalDeletion: preview.beyondLocalDeletion });
}
