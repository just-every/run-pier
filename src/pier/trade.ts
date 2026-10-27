import type { Bindings } from '../auth.server';
import { sha256 } from './import-kit';
import { decimal, fail, format, fresh, get, item, positions, Problem, requireRole, text, type Actor, type Context, type Row } from './model';
import { orderPrice } from './pricing';
import { route } from './routing';
import { activeAutomationActors, load, policyAuthority } from './storage';
import { execute } from './api';

export const tradeKeyHash = (key: string) => sha256('pier-trade-buyer\0' + key);
const fields = (value: any, keys: string[]) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const response = (value: unknown) => Response.json(value, { headers: { 'cache-control': 'no-store' } });

export function trade(c: Context, type: string, p: any): Row | undefined {
  if (!['trade.grant', 'trade.revoke', 'trade.cart'].includes(type)) return;
  requireRole(c, []);
  const channel = get(c.s, 'channels', p.channelId);
  if (channel.provider !== 'stall') fail('TRADE_CHANNEL', 'Choose a Stall connection.');
  if (type !== 'trade.cart') {
    fresh(channel, p.version);
    const buyerId = text(p.buyerId, 'Buyer identity');
    channel.tradeBuyers ??= [];
    const old = channel.tradeBuyers.find((b: any) => b.buyerId === buyerId);
    if (type === 'trade.revoke') {
      if (!old) fail('TRADE_BUYER', 'Choose an approved buyer.');
      old.enabled = false;
      old.revokedAt = c.now;
    } else {
      if (!/^[a-f0-9]{64}$/.test(p.keyHash ?? '')) fail('TRADE_KEY', 'Supply the domain-separated SHA-256 hash of a fresh buyer credential.');
      if (c.s.channels.some(ch => (ch.tradeBuyers ?? []).some((b: any) => b !== old && b.keyHash === p.keyHash))) fail('TRADE_KEY', 'Use a different credential for every buyer.');
      if (get(c.s, 'parties', p.customerId).kind !== 'customer') fail('CUSTOMER', 'Choose a customer.');
      if (old && old.customerId !== p.customerId) fail('TRADE_BUYER', 'A buyer identity cannot be reassigned to another customer.');
      if (!Array.isArray(p.itemIds) || !p.itemIds.length || p.itemIds.length > 1000 || new Set(p.itemIds).size !== p.itemIds.length) fail('TRADE_ITEMS', 'Approve a distinct nonempty item list, at most 1,000 items.');
      p.itemIds.forEach((id: string) => item(c.s, id));
      const address = fields(p.shipTo ?? {}, ['country', 'state', 'postalCode']);
      for (const value of Object.values(address)) text(value, 'Destination');
      if (p.followupConsent !== undefined && (!p.followupConsent || typeof p.followupConsent.at !== 'string' || !Number.isFinite(Date.parse(p.followupConsent.at)) || Date.parse(p.followupConsent.at) > Date.parse(c.now))) fail('TRADE_CONSENT', 'Record prior explicit consent with its source and time.');
      const consent = p.followupConsent ? { recipient: text(p.followupConsent.recipient, 'Consent recipient'), purpose: text(p.followupConsent.purpose, 'Consent purpose'), source: text(p.followupConsent.source, 'Consent source'), at: p.followupConsent.at, approvedBy: c.actor.id } : null;
      if (consent && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(consent.recipient)) fail('TRADE_CONSENT', 'Record one explicitly authorized recipient.');
      const grant = { buyerId, customerId: p.customerId, keyHash: p.keyHash, itemIds: p.itemIds, shipTo: address, enabled: true, approvedAt: c.now, approvedBy: c.actor.id, followupConsent: consent, suppressed: old?.suppressed ?? false, carts: old?.carts ?? [] };
      if (old) Object.assign(old, grant); else channel.tradeBuyers.push(grant);
    }
    channel.version++;
    return channel;
  }
  if (c.backgroundPolicy?.collection !== 'channels' || c.backgroundPolicy.id !== channel.id) fail('TRADE_INTERNAL', 'Cart events enter through the buyer-scoped door.');
  const buyer = channel.tradeBuyers?.find((b: any) => b.buyerId === p.buyerId && b.enabled);
  if (!buyer) fail('TRADE_BUYER', 'The buyer grant is inactive.');
  const cartId = text(p.cartId, 'Cart identity');
  if (!['abandoned', 'purchased', 'unsubscribed'].includes(p.event)) fail('TRADE_EVENT', 'Choose abandoned, purchased or unsubscribed.');
  // No cart body, email address or provider instruction is accepted here.
  if (p.event === 'unsubscribed') {
    buyer.suppressed = true;
    for (const cart of buyer.carts) { cart.status = 'suppressed'; cart.version++; }
  }
  let cart = buyer.carts.find((cart: any) => cart.cartId === cartId);
  if (!cart) {
    if (buyer.carts.length >= 1000) fail('TRADE_CART_LIMIT', 'Review retained cart events before accepting more carts.');
    cart = { id: crypto.randomUUID(), version: 1, cartId, status: 'received', createdAt: c.now };
    buyer.carts.push(cart);
  }
  if (p.event === 'purchased') cart.purchasedAt = c.now;
  cart.status = buyer.suppressed ? 'suppressed' : cart.purchasedAt ? 'purchased' : !buyer.followupConsent ? 'no-consent' : 'pending-owner-review';
  cart.lastEvent = p.event;
  cart.updatedAt = c.now;
  cart.version++;
  // The channel version is a grant revision. The state CAS serializes cart events
  // without needlessly revoking concurrent reads of the unchanged grant.
  return { id: cart.id, version: cart.version, cartId, status: cart.status, reminderSent: false };
}

export async function tradeResponse(request: Request, env: Bindings): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/pier/trade')) return null;
  const key = /^Bearer ([^\s]{32,200})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!key) throw new Problem('TRADE_AUTH', 'A buyer-scoped bearer credential is required.', null, 401);
  const s = await load(env.DB), hash = tradeKeyHash(key);
  const channel = s.channels.find(ch => ch.provider === 'stall' && ch.enabled && ch.tradeBuyers?.some((b: any) => b.enabled && b.keyHash === hash));
  const buyer = channel?.tradeBuyers.find((b: any) => b.enabled && b.keyHash === hash);
  if (!channel || !buyer || (await activeAutomationActors(env.DB))[channel.approvedBy] !== 'owner' || buyer.approvedBy !== channel.approvedBy) throw new Problem('TRADE_AUTH', 'This buyer grant is inactive.', null, 403);
  const op = await env.DB.prepare('SELECT version,display_name FROM oa_operators WHERE id=?').bind(channel.approvedBy).first<any>();
  const actor: Actor = { id: channel.approvedBy, role: 'owner', name: op.display_name, operatorVersion: op.version, sessionId: 'trade-buyer' };
  const policy = { collection: 'channels' as const, id: channel.id, version: channel.version };
  if (request.method === 'POST' && url.pathname === '/api/pier/trade/cart-events') {
    if (!request.headers.get('content-type')?.includes('application/json')) throw new Problem('INPUT', 'Use JSON cart events.', null, 400);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 16384) throw new Problem('INPUT', 'Cart event exceeds 16 KiB.', null, 413);
    let p: any;
    try { p = JSON.parse(raw); } catch { throw new Problem('INPUT', 'Use a valid JSON cart event.', null, 400); }
    const eventId = text(p?.eventId, 'Event identity');
    const outcome = await execute(env, actor, 'trade-' + sha256(JSON.stringify([channel.id, buyer.buyerId, eventId])), 'trade.cart', { channelId: channel.id, buyerId: buyer.buyerId, cartId: p.cartId, event: p.event }, undefined, policy);
    if (!outcome) throw new Problem('BUSY', 'Retry the same event identity.');
    // Replays report current suppression, never an obsolete pending reminder.
    const latest = await load(env.DB);
    const currentBuyer = latest.channels.find(ch => ch.id === channel.id)?.tradeBuyers?.find((b: any) => b.buyerId === buyer.buyerId);
    if (!latest.channels.some(ch => ch.id === channel.id && ch.enabled && ch.version === channel.version) || !currentBuyer?.enabled) throw new Problem('TRADE_AUTH', 'The buyer grant changed.', null, 403);
    const cart = currentBuyer?.carts.find((cart: any) => cart.cartId === p.cartId);
    return response({ ok: true, cart: fields(cart, ['cartId', 'status']), reminderSent: false });
  }
  if (request.method !== 'GET' || url.pathname !== '/api/pier/trade/catalog') throw new Problem('TRADE_SCOPE', 'This credential reads its catalog and submits its cart events only.', null, 403);
  const customer = get(s, 'parties', buyer.customerId);
  const now = new Date().toISOString(), c = { s, actor, commandId: '', now };
  const decision = route(s, `channel:${channel.id}`, buyer.shipTo, undefined, channel.warehouse);
  const stock = positions(s).filter(p => decision.eligible.includes(s.locations.find(l => l.id === p.locationId)?.warehouse) && p.status === 'sellable');
  const items = s.items.filter(i => buyer.itemIds.includes(i.id) && !i.archived).flatMap(i => {
    const tiers = s.priceLists.filter(p => p.customerId === customer.id && p.itemId === i.id && (!p.validFrom || p.validFrom <= now.slice(0, 10)) && (!p.validTo || p.validTo >= now.slice(0, 10)));
    if (!tiers.length) return [];
    const quantities = [...new Set<string>(tiers.map(p => p.minimumQuantity))].sort((a, b) => decimal(a) < decimal(b) ? -1 : decimal(a) > decimal(b) ? 1 : 0);
    const available = stock.filter(p => p.itemId === i.id).reduce((sum, p) => sum + decimal(p.available), 0n) - decimal(channel.buffer ?? '0');
    return [{ ...fields(i, ['id', 'sku', 'name', 'unit', 'packSize']), availability: format(available > 0n ? available : 0n), prices: quantities.map(quantity => ({ minimumQuantity: quantity, price: orderPrice(c, customer.id, i.id, decimal(quantity), undefined).price, currency: 'USD' })) }];
  });
  // A mixed order's total and shipment status also reveal unapproved items.
  // Omit the entire document rather than relabeling a partial total as its total.
  const orders = s.orders.filter(o => o.customerId === customer.id && o.documentType !== 'quote' && o.lines.length > 0 && o.lines.every((l: any) => buyer.itemIds.includes(l.itemId))).map(o => ({ ...fields(o, ['id', 'reference', 'createdAt', 'currency', 'total', 'promiseDate']), lines: o.lines.map((l: any) => fields(l, ['itemId', 'quantity', 'price', 'dispatched', 'cancelled'])), shipments: s.shipments.filter(sh => sh.orderId === o.id).map(sh => ({ ...fields(sh, ['id', 'reference', 'createdAt', 'deliveryStatus']), tracking: s.shippingJobs.filter(job => job.orderId === o.id && job.shipmentId === sh.id).map(job => fields(job, ['trackingCode', 'trackingStatus', 'mode'])) })) }));
  const gate = policyAuthority({ actor, backgroundPolicy: policy });
  const admitted = await env.DB.prepare(`SELECT CASE WHEN (${gate.sql}) AND (SELECT version FROM pier_meta WHERE id=1)=? THEN 1 ELSE 0 END AS ok`).bind(...gate.params, s.version).first<any>();
  if (!admitted?.ok) throw new Problem('TRADE_AUTH', 'Authority or catalog changed. Retry with current authority.', null, 403);
  return response({ customerId: customer.id, items, terms: { paymentTerms: customer.paymentTerms ?? null, credit: { status: customer.creditClearance?.status ?? 'not-configured', validThrough: customer.creditClearance?.validThrough ?? null, checkout: 'owner-review-required' } }, routing: { status: decision.status, warehouses: decision.eligible }, orders, historyCoverage: 'native-orders-only', followupSuppressed: buyer.suppressed });
}
