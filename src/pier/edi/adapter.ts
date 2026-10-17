import type { Bindings } from '../../auth.server';
import type { Row } from '../model';

export type EdiEnv = Bindings & { EDI_BRIDGE_URL?: string; EDI_BRIDGE_TOKEN?: string };
export type Delivery = { status: 'accepted'|'uncertain'; providerId?: string; detail: string };
export const ediUnavailable = 'EDI delivery is not available yet.';

/** One real, installation-configured HTTP bridge. Its operator owns AS2/SFTP/VAN onward delivery. */
export function bridgeUrl(env: EdiEnv): URL | null {
  if (env.RER_DEMO === '1' || env.RER_OWNER_CLAIM_ISSUER || env.RER_MANAGEMENT_ORIGIN || env.RER_INSTALLATION_ID || !env.EDI_BRIDGE_URL || !env.EDI_BRIDGE_TOKEN) return null;
  let url: URL;
  try { url = new URL(env.EDI_BRIDGE_URL); } catch { return null; }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && env.AUTH_LOCAL === 'true'))) return null;
  return url;
}
export async function sendEdi(env: EdiEnv, partner: Row, doc: Row): Promise<Delivery> {
  const url = bridgeUrl(env);
  if (!url) return { status: 'uncertain', detail: ediUnavailable };
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${env.EDI_BRIDGE_TOKEN}`, 'content-type': 'application/json', 'idempotency-key': doc.id },
      body: JSON.stringify({ documentId: doc.id, kind: doc.kind, control: doc.control, partner: { id: partner.id, name: partner.name, senderId: partner.senderId, receiverId: partner.receiverId, transport: partner.transport }, x12: doc.x12 }),
    });
    if (!response.ok) return { status: 'uncertain', detail: `The EDI bridge returned HTTP ${response.status}. Check document ${doc.id} at the bridge before any further send.` };
    let body: any;
    try { body = await response.json(); } catch { return { status: 'uncertain', detail: 'The EDI bridge returned no verifiable receipt. Reconcile this document at the bridge.' }; }
    if (body.documentId !== doc.id || body.status !== 'accepted' || typeof body.providerId !== 'string' || !body.providerId.trim() || body.providerId.length > 200) return { status: 'uncertain', detail: 'The EDI bridge did not confirm the exact document identity. Reconcile its receipt before sending again.' };
    return { status: 'accepted', providerId: body.providerId, detail: 'The bridge accepted this document. Retailer functional acceptance is recorded separately.' };
  } catch { return { status: 'uncertain', detail: 'The EDI bridge did not confirm receipt. Reconcile this document at the bridge before sending again.' }; }
}
