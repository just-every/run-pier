import type { Bindings } from '../../auth.server';
import { operatorMail } from '../../mail.server.mjs';
import type { Row } from '../model';
export async function trackingMail(env: Bindings, job: Row) {
  if (env.RER_OWNER_CLAIM_ISSUER) return { status: 'not available', detail: 'Email is not available yet on RER Managed.' };
  if (env.RER_DEMO === '1') return { status: 'not sent', detail: 'This local installation does not send email.' };
  // Business mail uses the explicitly configured production provider, also on a local owner install.
  const sender = operatorMail({ ...env, AUTH_LOCAL: 'false' });
  if (!sender || !env.MAIL_FROM) return { status: 'not sent', detail: 'Set up the installation mail provider to send tracking.' };
  const text = `Your order has a shipping label.\n\nTracking number: ${job.trackingCode}\n${job.trackingUrl || ''}\n\n${job.mode === 'test' ? 'This is a test shipment, not valid postage.\n' : ''}A label does not confirm carrier pickup.`;
  try {
    const result = await sender.send({ deliveryId: `pier-tracking-${job.id}`, from: env.MAIL_FROM, to: [job.email], subject: `Pier shipment tracking · ${job.trackingCode}`, text, html: `<p>${text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)).replace(/\n/g, '<br>')}</p>`, headers: {} });
    return result.status === 'accepted' ? { status: 'sent', detail: 'Tracking email accepted by the mail provider.', sentAt: new Date().toISOString() } : { status: result.status === 'uncertain' ? 'uncertain' : 'failed', detail: `Mail provider outcome: ${result.status}.` };
  } catch { return { status: 'uncertain', detail: 'The mail request was not confirmed. Check the provider before sending another message.' }; }
}
