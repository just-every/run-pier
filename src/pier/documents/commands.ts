import type { Bindings } from '../../auth.server';
import { fail, fresh, get, requireRole, row, text, type Context } from '../model';
import { attachment, AI_ID, metadata, retain } from './records';
import { reviewExtraction } from './review';
import { validateDraft } from './schema';
import { settings } from './settings';

export async function documents(c: Context, type: string, p: any, env: Bindings) {
  if (!type.startsWith('document.')) return;
  requireRole(c, []);
  const config = await settings(c, type, p, env);
  if (config !== undefined) return config;
  if (type === 'document.upload') return retain(c, p);
  if (type === 'document.attach') {
    const document = get(c.s, 'evidenceDocuments', p.documentId); fresh(document, p.version);
    const link = attachment(c, p.record);
    if (!document.links.some((l: any) => l.kind === link.kind && l.id === link.id)) { document.links.push(link); document.version++; }
    return metadata(document);
  }
  if (type === 'document.begin') {
    const document = get(c.s, 'evidenceDocuments', p.documentId); fresh(document, p.version);
    if (p.consentOriginal !== true) fail('DOCUMENT_CONSENT', 'Explicitly approve sending this full original to OpenAI for this extraction.');
    const setup = c.s.documentSettings.find(r => r.id === AI_ID);
    if (!setup?.enabled || !setup.configured || setup.installationScope !== c.installationScope) return fail('DOCUMENT_SETUP', 'Configure a separate document processing connection for this installation. Item AI does not authorize document processing.');
    if (c.s.documentExtractions.some(e => e.operationId === p.operationId)) fail('DOCUMENT_UNCONFIRMED', 'This extraction is already claimed and will not be sent twice.');
    return row(c, 'documentExtractions', { documentId: document.id, documentVersion: document.version, sha256: document.sha256, pageCount: document.pageCount,
      operationId: text(p.operationId), requestDigest: text(p.requestDigest), claimId: text(p.claimId), status: 'requesting', requestedBy: c.actor.id, requestedAt: c.now,
      setupVersion: setup.version, model: setup.model, consent: { actorId: c.actor.id, at: c.now, documentId: document.id, sha256: document.sha256, scope: 'Full retained original, file name and MIME type to OpenAI Responses only.' },
    });
  }
  if (['document.complete', 'document.failed'].includes(type)) {
    const extraction = get(c.s, 'documentExtractions', p.extractionId);
    if (extraction.status !== 'requesting' || extraction.operationId !== p.operationId || extraction.claimId !== p.claimId) fail('DOCUMENT_STATE', 'This paid extraction claim is no longer current.');
    if (type === 'document.complete') Object.assign(extraction, { status: 'completed', draft: validateDraft(p.draft, extraction.pageCount), responseId: text(p.responseId), completedAt: c.now });
    else Object.assign(extraction, { status: 'failed', problem: text(p.problem), completedAt: c.now });
    extraction.version++;
    return extraction;
  }
  const reviewed = reviewExtraction(c, type, p);
  if (reviewed !== undefined) return reviewed;
  fail('COMMAND', 'Unknown document command. Originals are retained; deletion is unavailable.');
}
