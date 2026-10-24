import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal';
import type { Bindings } from '../auth.server';
import { canonicalJson, sha256 } from './import-kit';
import { contains } from './privacy-plan';
import { anonymizeSubject, personalValues } from './privacy-state';
import { eraseNativeIdentity } from './privacy-auth';
import { inspectSubject, remoteGuards } from './privacy-remote';
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
    limitation: kind === 'attachment' ? 'Only the selected original, its extraction drafts and containing raw inbox copies are erased. Other attachments and approved business documents are retained.' : 'Use the subject dependency preview with current native identity and provider state before confirming local anonymization.' };
}
export async function privacySubjectPreview(s: State, kind: string, id: string, env: Bindings) {
  if (kind === 'attachment') return privacyPreview(s, kind, id);
  const { plan } = await inspectSubject(s, kind, id, env);
  return { ...plan.preview, planHash: sha256(canonicalJson({ dependencies: plan.preview.planHash, blockers: plan.blockers })) };
}

async function eraseSubject(c: Context, p: any, env: Bindings) {
  const { plan, native } = await inspectSubject(c.s, p.kind, p.subjectId, env);
  const preview = { ...plan.preview, planHash: sha256(canonicalJson({ dependencies: plan.preview.planHash, blockers: plan.blockers })) };
  if (p.planHash !== preview.planHash) fail('STALE', 'Dependencies, identity or holds changed. Inspect a fresh erasure preview.');
  if (plan.holds.length) fail('PRIVACY_HOLD', 'Every active legal or accounting hold in these dependencies must be resolved before erasure.');
  if (!preview.allowed) fail('PRIVACY_DEPENDENCY', 'Resolve the listed source custody or remote dependencies before erasure.', { blockers: plan.blockers });
  if (native?.id === c.actor.id) fail('PRIVACY_OWNER', 'Another owner must review and confirm erasure of this operator. Self-erasure is unavailable.');
  if (p.confirm !== true) fail('PRIVACY_CONSENT', 'Explicitly confirm irreversible local anonymization, deletion of the listed private copies and cancellation of queued correspondence.');
  const values = personalValues(plan.target, native);
  const statements = remoteGuards(env, plan, p.kind, p.subjectId);
  if (native) statements.push(...eraseNativeIdentity(c, env, native));
  anonymizeSubject(c, p.kind, p.subjectId, native);
  // Recovery retains command identity and digest, never a pre-erasure snapshot.
  const commands = await env.DB.prepare('SELECT id,actor_id,result FROM pier_commands').all<{ id:string; actor_id:string; result:string }>();
  for (const command of commands.results) {
    const result = JSON.parse(command.result);
    if (contains(result, plan.ids) || contains(result, values) || native && command.actor_id === native.id)
      statements.push(env.DB.prepare('UPDATE pier_commands SET result=? WHERE id=?').bind(JSON.stringify({ ok:true, result:{ erased:true }, version:result.version }),command.id));
  }
  // The development transport is a real retained local mail copy. Match its
  // explicit recipient or delivery identity, never arbitrary body substrings.
  const recipients = [...values].filter(v => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v));
  statements.push(env.DB.prepare(`DELETE FROM rer_mail_development_outbox WHERE json_extract(message,'$.deliveryId') IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(message,'$.to') recipient JOIN json_each(?) target ON lower(recipient.value)=lower(target.value))`).bind(JSON.stringify([...plan.ids]),JSON.stringify(recipients)));
  const secretIds = [...c.s.channels, ...c.s.bookConnections.map(r => ({ ...r, id:'books:' + r.id })), ...c.s.paymentConnections, ...c.s.shippingSettings, ...c.s.documentSettings].filter(r => plan.ids.has(r.id) || r.id.startsWith('books:') && plan.ids.has(r.id.slice(6))).map(r => r.id);
  for (const id of secretIds) statements.push(env.DB.prepare('DELETE FROM pier_channel_secrets WHERE channel_id=?').bind(id));
  statements.push(...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB));
  c.privacyStatements = statements;
  return row(c, 'privacyReceipts', { kind:p.kind, subjectId:p.subjectId, subjectVersion:plan.target.version, nativeBeforeVersion:native?.version ?? null, counts:preview.counts, completedAt:c.now, approvedBy:c.actor.id, outcome:'complete', retained:preview.retained, beyondLocalDeletion:preview.beyondLocalDeletion });
}

export async function privacy(c: Context, type: string, p: any, env: Bindings) {
  if (!type.startsWith('privacy.')) return;
  requireRole(c, []);
  if (c.backgroundPolicy) fail('PRIVACY_CONSENT', 'Privacy writes require a current native owner session and explicit consent.');
  if (type === 'privacy.hold') {
    if (!['attachment','customer','supplier','operator'].includes(p.kind) || !['legal','accounting'].includes(p.category)) fail('PRIVACY_HOLD', 'Choose a subject and legal or accounting hold.');
    await privacySubjectPreview(c.s, p.kind, p.subjectId, env);
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
  if (type === 'privacy.eraseSubject') return eraseSubject(c, p, env);
  if (type !== 'privacy.eraseAttachment') fail('PRIVACY_KIND', 'Choose explicit attachment erasure or subject anonymization.');
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
