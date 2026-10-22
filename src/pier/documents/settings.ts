import type { Bindings } from '../../auth.server';
import { seal } from '../channels/secrets';
import { fail, fresh, row, text, type Context } from '../model';
import { AI_ID, INBOUND_ID } from './records';

export async function settings(c: Context, type: string, p: any, env: Bindings) {
  if (!['document.configure', 'document.revoke', 'document.inboundConfigure', 'document.inboundRevoke'].includes(type)) return;
  const inbound = type.startsWith('document.inbound'), id = inbound ? INBOUND_ID : AI_ID;
  const old = c.s.documentSettings.find(r => r.id === id);
  if (old) fresh(old, p.version);
  else if (p.version !== 0) fail('STALE', 'Reload document setup before saving.');
  if (type.endsWith('Revoke') || type === 'document.revoke') {
    if (!old) return fail('DOCUMENT_SETUP', 'No document connection is configured.');
    c.channelSecrets = [{ channelId: id, secret: await seal(env, id, {}) }];
    return Object.assign(old, { enabled: false, configured: false, updatedBy: c.actor.id, updatedAt: c.now, version: old.version + 1 });
  }
  if (p.consent !== true) fail('DOCUMENT_CONSENT', inbound ? 'Approve retaining signed inbound mail in the owner inbox.' : 'Approve this separate document processing connection to OpenAI. Item AI consent does not authorize documents.');
  let config: any;
  if (inbound) {
    if (p.provider !== 'sendgrid') fail('DOCUMENT_PROVIDER', 'Inbound documents currently use signed SendGrid Inbound Parse.');
    const recipient = text(p.recipient, 'Exact intake email address').toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(recipient) || recipient.length > 254) fail('DOCUMENT_RECIPIENT', 'Enter the exact intake email address.');
    // Import the real public verifier now; malformed keys cannot enable an inbox.
    try {
      if (typeof p.verificationKey !== 'string' || p.verificationKey.length > 256) throw new Error();
      const key = Uint8Array.from(atob(p.verificationKey), c => c.charCodeAt(0));
      await crypto.subtle.importKey('spki', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    } catch { fail('DOCUMENT_KEY', 'Enter the SendGrid ECDSA P-256 public verification key as base64 SPKI.'); }
    c.channelSecrets = [{ channelId: id, secret: await seal(env, id, { verificationKey: p.verificationKey }) }];
    config = { provider: 'sendgrid', recipient, consent: { actorId: c.actor.id, at: c.now, scope: 'Retain verified mail and bounded safe originals in the owner-only inbox; no automatic association, processing or outbound action.' } };
  } else {
    const model = text(p.model, 'Exact OpenAI model ID');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) fail('DOCUMENT_MODEL', 'Enter the exact PDF/image-capable OpenAI model ID from your account.');
    if (p.apiKey !== undefined && p.apiKey !== '') {
      if (typeof p.apiKey !== 'string' || p.apiKey.length < 12 || p.apiKey.length > 500 || /\s/.test(p.apiKey)) fail('DOCUMENT_KEY', 'Enter an OpenAI API key without spaces.');
      c.channelSecrets = [{ channelId: id, secret: await seal(env, id, { apiKey: p.apiKey }) }];
    } else if (!old?.configured || old.installationScope !== c.installationScope) fail('DOCUMENT_KEY', 'Enter a document processing API key for this installation.');
    config = { provider: 'openai', destination: 'https://api.openai.com/v1/responses', model, consent: { actorId: c.actor.id, at: c.now, scope: 'Document extraction only. Each request separately approves sending the full selected original to OpenAI. No other business records or connector credentials are sent.' } };
  }
  const data = { ...config, enabled: true, configured: true, installationScope: c.installationScope, updatedBy: c.actor.id, updatedAt: c.now };
  return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'documentSettings', { id, ...data });
}
