import { fail } from '../model';

/** EasyPost v2 is the only carrier transport. Test fixtures replace fetch at the edge. */
export class CarrierRefusal extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function easyPost(apiKey: string, expectedMode: string) {
  async function call(path: string, body?: object) {
    const response = await fetch(`https://api.easypost.com/v2/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { authorization: `Basic ${btoa(`${apiKey}:`)}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new CarrierRefusal(response.status, `EasyPost refused the request (${response.status}). Review the address, carrier account and account balance in EasyPost.`);
    const value: any = await response.json();
    if (path.startsWith('shipments') && value.mode !== expectedMode) throw new CarrierRefusal(409, 'EasyPost returned a shipment in another mode. Reconnect the intended account before purchasing a label.');
    return value;
  }
  return {
    verify: (address: object) => call('addresses', { address, verify: true }),
    rates: (from: object, to: object, carton: any, reference: string) => call('shipments', { shipment: {
      reference, from_address: from, to_address: to,
      parcel: { weight: Number(carton.weight) * 16, length: Number(carton.length), width: Number(carton.width), height: Number(carton.height) },
      options: { label_format: 'PDF', label_size: '4x6' },
    } }),
    read: (shipmentId: string) => call(`shipments/${encodeURIComponent(shipmentId)}`),
    buy: (shipmentId: string, rateId: string) => call(`shipments/${encodeURIComponent(shipmentId)}/buy`, { rate: { id: rateId } }),
    label: (shipmentId: string, format: 'PDF' | 'ZPL') => call(`shipments/${encodeURIComponent(shipmentId)}/label?file_format=${format}`),
    tracker: (trackerId: string) => call(`trackers/${encodeURIComponent(trackerId)}`),
  };
}
export function address(input: any) {
  const out: Record<string, string | boolean> = {};
  for (const field of ['name','street1','city','state','zip']) {
    if (typeof input?.[field] !== 'string' || !input[field].trim() || input[field].length > 200) fail('ADDRESS', `Enter the address ${field}.`);
    out[field] = input[field].trim();
  }
  for (const field of ['street2','phone']) if (input?.[field]) out[field] = String(input[field]).trim().slice(0, 200);
  if (input?.country && input.country !== 'US') fail('ADDRESS', 'This shipping connection supports US addresses.');
  out.country = 'US';
  if (typeof input?.residential === 'boolean') out.residential = input.residential;
  return out;
}
export const publicAddress = (value: any) => Object.fromEntries(['name','street1','street2','city','state','zip','country','phone','residential'].filter(k => value[k] !== undefined).map(k => [k, value[k]]));
export function rates(value: any[]) {
  const rows = value.filter(r => ['UPS','FedEx','USPS'].includes(r.carrier) && r.currency === 'USD' && Number.isFinite(Number(r.rate)) && Number(r.rate) >= 0).map(r => ({ id: r.id, carrier: r.carrier, service: r.service, rate: r.rate, currency: r.currency, delivery_days: r.delivery_days ?? r.est_delivery_days ?? null, delivery_date: r.delivery_date ?? null }));
  const cheapest = Math.min(...rows.map(r => Number(r.rate)));
  const days = rows.filter(r => r.delivery_days !== null).map(r => Number(r.delivery_days));
  const fastest = days.length ? Math.min(...days) : null;
  return rows.map(r => ({ ...r, cheapest: Number(r.rate) === cheapest, fastest: fastest !== null && r.delivery_days !== null && Number(r.delivery_days) === fastest }));
}
export function labelUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && !u.username && !u.password && (u.hostname.endsWith('.easypost.com') || /^easypost-files(?:\.[a-z0-9-]+)?\.s3[.-][a-z0-9.-]+\.amazonaws\.com$/.test(u.hostname) || u.hostname === 'easypost-files.s3.amazonaws.com')) return u.href;
  } catch { /* An invalid provider URL never becomes a download destination. */ }
  return null;
}
