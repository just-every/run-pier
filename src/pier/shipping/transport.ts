import type { Bindings } from '../../auth.server';
import { fail, fresh, get, requireRole, type Actor, type Row } from '../model';
import { load, saved } from '../storage';
import { canonicalJson, sha256 } from '../import-kit';
import { credentials } from '../channels/secrets';
import { SETTINGS, bought, unavailable } from './commands';
import { CarrierRefusal, easyPost, publicAddress, rates } from './easypost';
import { trackingMail } from './mail';
import { execute } from '../api';

async function perform(env: Bindings, actor: Actor, commandId: string, type: string, p: any) {
  const initial = await load(env.DB), job = get(initial, 'shippingJobs', p.jobId);
  requireRole({ actor } as any, ['warehouse']); fresh(job, p.version);
  const blocked = unavailable(env);
  if (blocked) fail('SHIPPING_UNAVAILABLE', blocked);
  const settings = initial.shippingSettings.find(s => s.id === SETTINGS);
  if (!settings) return fail('SHIPPING_KEY', 'Connect EasyPost in Shipping setup first.');
  if (job.mode !== settings.mode) fail('SHIPPING_MODE', 'Reconnect the EasyPost mode used by this carton before continuing.');
  const client = easyPost((await credentials(env, SETTINGS)).apiKey);
  let step = 0;
  const record = async (change: object) => {
    const out = await execute(env, actor, `${commandId}-${++step}`, 'shipping.record', { jobId: job.id, version: job.version, change });
    Object.assign(job, out.result); return out;
  };
  if (type === 'shipping.verify') {
    if (!['draft','address_review','verified','verification_failed'].includes(job.status)) fail('SHIPPING_STATE', 'Edit the destination before verifying again.');
    const result = await client.verify(job.originalAddress), verification = result.verifications?.delivery;
    const verified = verification?.success === true;
    return record({ verified, suggestedAddress: publicAddress(result), verificationErrors: (verification?.errors ?? []).map((e: any) => String(e.message ?? e.code)), addressChoice: null, status: verified ? 'address_review' : 'verification_failed' });
  }
  if (type === 'shipping.rates') {
    if (!job.verified || !job.addressChoice || !['verified','rated'].includes(job.status)) fail('ADDRESS', 'Verify and accept or keep the address before comparing rates.');
    const pack = get(initial, 'packs', job.packId);
    if (pack.status !== 'packed') fail('PACK_STATE', 'This pack has already dispatched.');
    const carton = pack.cartons.find((c: any) => c.number === job.carton);
    const shipment = await client.rates(settings.fromAddress, job.addressChoice === 'suggested' ? job.suggestedAddress : job.originalAddress, carton, `pier-${job.id}`);
    return record({ providerShipmentId: shipment.id, rates: rates(shipment.rates ?? []), rateMessages: (shipment.messages ?? []).map((m: any) => `${m.carrier ?? 'Carrier'}: ${m.message ?? 'No rate returned'}`), status: 'rated' });
  }
  const email = async () => {
    if (!job.trackingCode) fail('SHIPPING_STATE', 'Buy a label before sending tracking.');
    if (['sent','sending','uncertain'].includes(job.mail?.status)) return record({ mail: job.mail });
    await record({ mail: { status: 'sending', detail: 'Tracking email submission started.' } });
    return record({ mail: await trackingMail(env, job) });
  };
  if (type === 'shipping.email') return email();
  if (type === 'shipping.buy' || type === 'shipping.reconcile') {
    if (!job.providerShipmentId) fail('SHIPPING_STATE', 'Compare rates first.');
    if (['labelled','delivered'].includes(job.status)) return record({ status: job.status });
    if (type === 'shipping.buy' && (job.status !== 'rated' || job.buyAttempted)) fail('SHIPPING_STATE', 'Check the existing label request before any further purchase.');
    if (type === 'shipping.buy' && !job.rates.some((r: any) => r.id === p.rateId)) fail('RATE', 'Choose a rate returned for this carton.');
    // Durable intent prevents concurrent purchases and any blind replay after response loss.
    if (type === 'shipping.buy') await record({ status: 'buying', selectedRateId: p.rateId, buyAttempted: true });
    let shipment: any;
    try {
      shipment = await client.read(job.providerShipmentId);
      if (!bought(shipment)) {
        if (type === 'shipping.reconcile') return record({ status: 'uncertain', problem: 'EasyPost has not confirmed a label. Check this shipment in EasyPost; Pier will not repeat an uncertain purchase.' });
        shipment = await client.buy(job.providerShipmentId, job.selectedRateId);
      }
    } catch (error) {
      return record({ status: 'uncertain', problem: error instanceof CarrierRefusal ? error.message : 'EasyPost did not confirm the label request. Check the existing shipment before any further purchase.' });
    }
    const label = bought(shipment);
    if (!label) return record({ status: 'uncertain', problem: 'EasyPost returned no purchased label. Check the existing shipment in EasyPost.' });
    await record({ ...label, problem: null });
    for (const format of ['PDF','ZPL'] as const) {
      if (format === 'PDF' ? job.labelPdfUrl : job.labelZplUrl) continue;
      try { const converted = bought(await client.label(job.providerShipmentId, format)); if (converted) await record({ ...converted, labelPdfUrl: converted.labelPdfUrl ?? job.labelPdfUrl, labelZplUrl: converted.labelZplUrl ?? job.labelZplUrl }); }
      catch { await record({ problem: 'This carrier did not provide both PDF and ZPL. Use the available format or check label settings in EasyPost.' }); }
    }
    return email();
  }
  if (type === 'shipping.track') {
    if (!job.trackerId) fail('TRACKER', 'The label has no EasyPost tracker yet.');
    const tracker = await client.tracker(job.trackerId);
    return record(trackingChange(job, tracker));
  }
  return fail('COMMAND', 'Unknown shipping action.');
}
export function trackingChange(job: Row, tracker: any, eventId?: string) {
  if (tracker.id !== job.trackerId || tracker.tracking_code !== job.trackingCode) fail('TRACKER', 'The tracker does not match this label.');
  const events = [...job.events];
  for (const detail of tracker.tracking_details ?? []) {
    const key = `${tracker.id}:${detail.datetime}:${detail.status}:${detail.message}`;
    if (!events.some(e => e.id === key)) events.push({ id: key, status: detail.status, datetime: detail.datetime, message: detail.message });
  }
  events.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  const delivered = job.status === 'delivered' || tracker.status === 'delivered';
  return { events, eventIds: [...new Set([...(job.eventIds ?? []), ...(eventId ? [eventId] : [])])], trackingStatus: delivered ? 'delivered' : tracker.status, status: delivered ? 'delivered' : job.status, lastTrackingAt: new Date().toISOString() };
}

/** Public command replay returns its durable final result; incomplete purchases reconcile by provider ID. */
export async function performShipping(env: Bindings, actor: Actor, commandId: string, type: string, p: any) {
  requireRole({ actor } as any, ['warehouse']);
  const payload = { jobId: p.jobId, request: { type, payload: p } };
  const prior = await saved(env.DB, commandId, sha256(canonicalJson({ type: 'shipping.complete', payload })), actor);
  if (prior) return prior;
  await perform(env, actor, commandId, type, p);
  return execute(env, actor, commandId, 'shipping.complete', payload);
}
