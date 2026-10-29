import type { Bindings } from '../../auth.server';
import { decimal, fail, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { seal, credentials } from '../channels/secrets';
import { address, labelUrl } from './easypost';
export const SETTINGS = 'shipping:easypost';
export const unavailable = (env: Bindings) => env.RER_OWNER_CLAIM_ISSUER && env.RER_DEMO !== '1' ? 'Shipping provider calls are not available yet on RER Managed.' : null;
export async function shipping(c: Context, type: string, p: any, env: Bindings): Promise<Row | undefined> {
  if (!type.startsWith('shipping.')) return;
  if (type === 'shipping.disconnect') {
    requireRole(c, []);
    const settings = get(c.s, 'shippingSettings', SETTINGS); fresh(settings, p.version);
    settings.enabled = false; settings.connected = false; settings.webhookConfigured = false; settings.version++;
    c.channelSecrets = [{ channelId: SETTINGS, secret: await seal(env, SETTINGS, {}) }];
    return settings;
  }
  if (type === 'shipping.save') {
    requireRole(c, []);
    if (!['test','production'].includes(p.mode)) fail('SHIPPING_MODE', 'Choose test or production.');
    const old = c.s.shippingSettings.find(s => s.id === SETTINGS);
    if (!old && !p.apiKey) fail('SHIPPING_KEY', 'Paste your EasyPost Test API key (EZTK…) to connect.');
    if (p.apiKey && (/\s/.test(String(p.apiKey)) || String(p.apiKey).length > 1000 || /^(EZTK|EZAK)/.test(String(p.apiKey)) && !String(p.apiKey).startsWith(p.mode === 'test' ? 'EZTK' : 'EZAK'))) fail('SHIPPING_KEY', 'Paste the EasyPost API key for the chosen mode.');
    if (old && old.mode !== p.mode && !p.apiKey) fail('SHIPPING_KEY', 'Paste the API key for the new mode.');
    const value = { mode: p.mode, fromAddress: address(p.fromAddress), connected: true, webhookConfigured: !!p.webhookSecret || !!old?.webhookConfigured, enabled: true, approvedBy: c.actor.id };
    const settings = old ? Object.assign(old, value, { version: old.version + 1 }) : row(c, 'shippingSettings', { ...value, id: SETTINGS });
    if (p.apiKey || p.webhookSecret) {
      const stored = await env.DB.prepare('SELECT channel_id FROM pier_channel_secrets WHERE channel_id=?').bind(SETTINGS).first();
      // An explicit complete replacement does not need the old encryption key.
      const replacing = p.apiKey && (p.webhookSecret || !old?.webhookConfigured);
      const before = stored && !replacing ? await credentials(env, SETTINGS) : {};
      if (!stored && !p.apiKey) fail('SHIPPING_KEY', 'Paste your EasyPost API key to reconnect this restored installation.');
      c.channelSecrets = [{ channelId: SETTINGS, secret: await seal(env, SETTINGS, { ...before, ...(p.apiKey ? { apiKey: text(p.apiKey) } : {}), ...(p.webhookSecret ? { webhookSecret: text(p.webhookSecret) } : {}) }) }];
    }
    return settings;
  }
  requireRole(c, ['warehouse']);
  if (type === 'shipping.prepare') {
    const pack = get(c.s, 'packs', p.packId);
    if (pack.status !== 'packed') fail('PACK_STATE', 'Mark the order packed before preparing its labels.');
    if (c.s.ltlManifests.some(m => m.packId === pack.id)) fail('LTL_EXISTS', 'This pack has retained LTL freight work.');
    const carton = pack.cartons.find((r: any) => r.number === Number(p.carton));
    if (!carton) fail('CARTON', 'Choose a measured carton from this pack.');
    const existing = c.s.shippingJobs.find(j => j.packId === pack.id && j.carton === carton.number);
    if (existing?.buyAttempted) fail('SHIPPING_EXISTS', 'This carton already has a label request. Reconcile it before changing the address.');
    const email = text(p.email, 'Customer email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('EMAIL', 'Enter the customer email address.');
    const data = { mode: c.s.shippingSettings.find(s => s.id === SETTINGS)?.mode ?? 'test', packId: pack.id, orderId: pack.orderId, carton: carton.number, originalAddress: address(p.address), email, addressChoice: null, verified: false, verificationErrors: [], status: 'draft', rates: [], events: [], mail: null, shipmentId: null };
    return existing ? Object.assign(existing, data, { version: existing.version + 1, suggestedAddress: null, providerShipmentId: null }) : row(c, 'shippingJobs', data);
  }
  const job = get(c.s, 'shippingJobs', p.jobId);
  if (type === 'shipping.complete') return job;
  fresh(job, p.version);
  if (type === 'shipping.address') {
    if (job.status !== 'address_review' || !job.verified || !['suggested','original'].includes(p.choice)) fail('ADDRESS', 'Verify a deliverable address and review its suggestion first.');
    job.addressChoice = p.choice; job.status = 'verified';
    const order = get(c.s, 'orders', job.orderId);
    order.shippingAddress = { original: job.originalAddress, suggested: job.suggestedAddress, choice: p.choice, reviewedBy: c.actor.id, reviewedAt: c.now }; order.version++;
  } else if (type === 'shipping.record') {
    // The public endpoint rejects internal result commands; transport owns these fields.
    Object.assign(job, p.change);
    if (job.status === 'delivered') {
      if (job.shipmentId) { const shipment = get(c.s, 'shipments', job.shipmentId); const complete = c.s.shippingJobs.filter(j => j.shipmentId === shipment.id).every(j => j.status === 'delivered'); shipment.deliveryStatus = complete ? 'delivered' : 'partially_delivered'; if (complete) shipment.closedAt = c.now; shipment.version++; }
      const order = get(c.s, 'orders', job.orderId);
      const siblings = c.s.shippingJobs.filter(j => j.orderId === job.orderId);
      order.deliveryStatus = siblings.every(j => j.status === 'delivered') && order.lines.every((l: any) => decimal(l.dispatched) + decimal(l.cancelled) >= decimal(l.quantity)) ? 'delivered' : 'partially_delivered'; order.version++;
    }
  } else return fail('COMMAND', 'Unknown shipping command.');
  job.version++;
  return job;
}
export function bought(shipment: any) {
  const postage = shipment.postage_label;
  if (!shipment.tracking_code || !postage) return null;
  return { status: 'labelled', trackingCode: shipment.tracking_code, trackingUrl: shipment.tracker?.public_url ?? null, trackerId: typeof shipment.tracker === 'string' ? shipment.tracker : shipment.tracker?.id, labelPdfUrl: labelUrl(postage.label_pdf_url ?? (postage.label_file_type === 'application/pdf' ? postage.label_url : null)), labelZplUrl: labelUrl(postage.label_zpl_url), selectedRateId: shipment.selected_rate?.id, labelBoughtAt: new Date().toISOString() };
}
