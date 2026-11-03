import type { Bindings } from '../../auth.server';
// @ts-expect-error The vendored mail runtime does not publish inbound declarations.
import { normalizeInbound } from '../../modules/mail/src/inbound/index.mjs';
// @ts-expect-error Share the vendored bounded reader, including stream cancellation.
import { readStream } from '../../modules/mail/src/inbound/bytes.mjs';
// @ts-expect-error The vendored signature verifier has no TypeScript declarations.
import { verifyWebhook } from '../../modules/mail/src/events/verify.mjs';
import { credentials } from '../channels/secrets';
import { sha256 } from '../import-kit';
import { fail, Problem, row, type Context } from '../model';
import { load } from '../storage';
import { INBOUND_ID, retain } from './records';
import { encode } from './validation';

const limits = { maxRawBytes: 1400000, maxBodyBytes: 32000, maxAttachments: 4, maxAttachmentBytes: 1024 * 1024, maxTotalAttachmentBytes: 1024 * 1024 };
/** Signed transport only. Normalization is never permitted to associate a customer or act. */
export async function documentInbound(request: Request, env: Bindings): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/pier/documents/inbound') return null;
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const snapshot = await load(env.DB), config = snapshot.documentSettings.find(r => r.id === INBOUND_ID);
  if (!config?.enabled || !config.configured || config.installationScope !== sha256('pier-recurring-authority\0' + env.SESSION_SECRET)) throw new Problem('DOCUMENT_INBOUND', 'Document intake is not enabled for this installation.', null, 404);
  let raw: Uint8Array;
  try { raw = await readStream(request.body, limits.maxRawBytes); } catch { throw new Problem('DOCUMENT_SIZE', 'Inbound message exceeds the bounded intake limit.', null, 413); }
  const secret = await credentials(env, INBOUND_ID);
  if (!await verifyWebhook({ provider: 'sendgrid', rawBody: raw, headers: request.headers, key: secret.verificationKey, now: Date.now() })) throw new Problem('DOCUMENT_SIGNATURE', 'Invalid or stale inbound signature.', null, 401);
  let mail: any;
  try { mail = await normalizeInbound({ provider: 'sendgrid', rawBody: raw, contentType: request.headers.get('content-type') }, limits); }
  catch { throw new Problem('DOCUMENT_MAIL', 'The signed message could not be safely normalized.', null, 400); }
  if (mail.subject.length > 2000 || mail.from.length > 254 || mail.to.length > 30 || mail.to.some((address: string) => address.length > 254) || mail.references.length > 30 || [mail.messageId, mail.inReplyTo, ...mail.references].some(value => value && value.length > 2000)) fail('DOCUMENT_MAIL', 'Signed mail metadata exceeds the bounded intake limit.');
  if (!mail.to.some((address: string) => address.toLowerCase() === config.recipient)) throw new Problem('DOCUMENT_RECIPIENT', 'This signed message does not name the configured intake recipient.', null, 403);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(raw)))].map(n => n.toString(16).padStart(2, '0')).join('');
  const operationId = `document-inbound-${digest}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await load(env.DB), existing = before.documentInbox.find(r => r.sha256 === digest);
    if (existing) return Response.json({ accepted: true, inboxId: existing.id, duplicate: true }, { headers: { 'cache-control': 'no-store' } });
    if (mail.messageId && before.documentInbox.some(r => r.messageId === mail.messageId)) fail('DOCUMENT_MESSAGE_CONFLICT', 'This message identity was received with different original bytes. Review the retained inbox.');
    const c: Context = { s: structuredClone(before), actor: { id: 'mail:sendgrid', name: 'Verified inbound mail', role: 'inbound', sessionId: '', operatorVersion: 0 }, now: new Date().toISOString(), commandId: operationId };
    const inboxId = crypto.randomUUID(), documentIds: string[] = [];
    for (const file of mail.attachments) {
      const document = await retain(c, { name: file.filename, mimeType: file.contentType, base64: encode(file.content) }, { kind: 'email', inboxId, provider: 'sendgrid', signatureVerified: true });
      documentIds.push(document.id);
    }
    const inbox = row(c, 'documentInbox', { id: inboxId, status: 'retained', access: 'owner', provider: 'sendgrid', signatureVerified: true, sha256: digest, raw: encode(raw), rawContentType: request.headers.get('content-type'),
      messageId: mail.messageId, from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, inReplyTo: mail.inReplyTo, references: mail.references, documentIds, setupVersion: config.version,
      retention: 'Retained pending owner retention policy; no automatic customer association or action.',
    });
    if (new TextEncoder().encode(JSON.stringify(inbox)).length > 1950000) fail('DOCUMENT_SIZE', 'Retained message metadata and original exceed the inbox record budget.');
    const guardId = crypto.randomUUID();
    const statements = [env.DB.prepare(`INSERT INTO pier_guard(id,ok) VALUES(?,CASE WHEN (SELECT version FROM pier_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM pier_records WHERE kind='documentSettings' AND id=? AND version=? AND json_extract(data,'$.enabled')=1 AND json_extract(data,'$.installationScope')=?) AND EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN pier_records r ON r.kind='roles' AND r.id=o.id WHERE o.id=? AND o.status='active' AND CASE WHEN r.data IS NOT NULL THEN json_extract(r.data,'$.role') WHEN o.role='owner' THEN 'owner' ELSE 'viewer' END='owner') THEN 1 ELSE 0 END)`)
      .bind(guardId, before.version, INBOUND_ID, config.version, config.installationScope, config.consent.actorId)];
    for (const document of c.s.evidenceDocuments.filter(d => !before.evidenceDocuments.some(old => old.id === d.id))) statements.push(env.DB.prepare('INSERT INTO pier_records(kind,id,version,data) VALUES(?,?,?,?)').bind('evidenceDocuments', document.id, document.version, JSON.stringify(document)));
    statements.push(env.DB.prepare('INSERT INTO pier_records(kind,id,version,data) VALUES(?,?,?,?)').bind('documentInbox', inbox.id, inbox.version, JSON.stringify(inbox)));
    statements.push(env.DB.prepare('INSERT INTO pier_commands(id,actor_id,digest,result,created_at) VALUES(?,?,?,?,?)').bind(operationId, c.actor.id, digest, JSON.stringify({ ok: true, result: { inboxId, documentIds, signatureVerified: true }, version: before.version + 1 }), c.now));
    statements.push(env.DB.prepare('UPDATE pier_meta SET version=version+1 WHERE id=1'));
    statements.push(env.DB.prepare('DELETE FROM pier_guard WHERE id=?').bind(guardId));
    try {
      await env.DB.batch(statements);
      return Response.json({ accepted: true, inboxId, duplicate: false }, { headers: { 'cache-control': 'no-store' } });
    } catch {
      const latest = await load(env.DB);
      if (latest.version !== before.version) continue;
      fail('DOCUMENT_INBOUND', 'Intake authority changed or the signed message could not be retained. No order or stock action was taken.');
    }
  }
  return fail('BUSY', 'Document intake changed repeatedly. The sender may resend the signed message.');
}
