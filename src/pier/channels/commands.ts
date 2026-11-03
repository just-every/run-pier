import type { Bindings } from '../../auth.server';
import { available, decimal, fail, format, fresh, get, id, item, min, requireRole, row, text, type Context, type Row } from '../model';
import { activeRule } from '../routing';
import { orders } from '../orders';
import { preparePublication, publicationTargets } from './publications';
import { priceUnpricedLines } from '../pricing';
import { seal } from './secrets';
import { recordChannelPayment } from '../channel-payment';
import type { ChannelOrder, Listing } from './adapters/types';

function match(c: Context, listing: Row) {
  if (listing.itemId) return;
  const found = c.s.items.filter(i => !i.archived && i.sku === listing.sku);
  if (found.length === 1) { listing.itemId = found[0].id; listing.matchedBy = 'SKU'; }
}
function importOrders(c: Context, channel: Row) {
  for (const incoming of c.s.channelOrders.filter(o => o.channelId === channel.id && !o.orderId)) {
    const source = incoming.source as ChannelOrder;
    if (source.reservationId) {
      const existing = c.s.orders.find(o => o.id === source.reservationId);
      if (!existing) { incoming.problem = 'Stall reserved this order in another Pier installation. Reconnect the original stock system.'; continue; }
      if (!source.lines.every(l => existing.lines.some((x: any) => c.s.items.find(i => i.id === x.itemId)?.sku === l.sku && x.quantity === l.quantity))) { incoming.problem = 'The Stall reservation lines need review.'; continue; }
      Object.assign(existing, { channel: channel.provider, channelId: channel.id, channelOrderId: source.externalId, channelReference: source.reference });
      // A reservation made before Stall sent prices takes the prices Stall charged.
      const charged = existing.lines.filter((x: any) => x.price === null).flatMap((x: any) => {
        const price = source.lines.find(l => c.s.items.find(i => i.id === x.itemId)?.sku === l.sku)?.price;
        return price === undefined ? [] : [{ orderLineId: x.id, price }];
      });
      if (charged.length) priceUnpricedLines(c, existing, charged, 'channel');
      recordChannelPayment(c, existing, source.payment);
      incoming.orderId = existing.id; incoming.reservedAt = existing.createdAt; incoming.problem = null; incoming.version++; continue;
    }
    const lines = source.lines.map(line => ({ ...line, listing: c.s.channelListings.find(l => l.channelId === channel.id && l.externalId === line.externalId) ?? c.s.channelListings.find(l => l.channelId === channel.id && l.sku && l.sku === line.sku) }));
    incoming.problem = source.currency !== 'USD' ? 'Currency needs review: only USD orders can reserve stock.' : lines.some(l => !l.listing?.itemId) ? 'Awaiting SKU match. Match every order line to import and reserve.' : null;
    if (incoming.problem) continue;
    let customer = c.s.parties.find(p => p.channelId === channel.id && p.channelCustomer === source.customer);
    if (!customer) customer = row(c, 'parties', { name: source.customer || channel.name, kind: 'customer', channelId: channel.id, channelCustomer: source.customer });
    const order = orders(c, 'order.create', { customerId: customer.id, warehouse: channel.warehouse, channelId:channel.id,shipTo:source.shipTo,channelLocation:source.channelLocation, currency: 'USD', channel: channel.provider, lines: lines.map(l => ({ itemId: l.listing!.itemId, quantity: l.quantity, ...(l.price !== undefined ? { price: l.price } : {}) })) })!;
    const saved = get(c.s, 'orders', order.id);
    Object.assign(saved, { channelId: channel.id, channelOrderId: source.externalId, channelReference: source.reference });
    incoming.orderId = order.id;incoming.problem=saved.routing?.status==='waiting'?saved.routing.reason:null; incoming.reservedAt = c.now; incoming.version++;
  }
}
export async function channels(c: Context, type: string, p: any, env: Bindings): Promise<Row | undefined> {
  if (!type.startsWith('channel.')) return;
  if (type === 'channel.save') {
    requireRole(c, []);
    const old = p.id ? get(c.s, 'channels', p.id) : undefined;
    if (old) fresh(old, p.version);
    if (!['stall','woocommerce','shopify','amazon'].includes(p.provider)) fail('CHANNEL', 'Choose a supported channel.');
    let url: URL;
    try { url = new URL(p.baseUrl); } catch { return fail('CHANNEL_URL', 'Enter the store API origin.'); }
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) fail('CHANNEL_URL', 'Use HTTPS, or HTTP on localhost, without credentials in the URL.');
    if (old && (old.provider !== p.provider || old.baseUrl !== url.href.replace(/\/$/, ''))) fail('CHANNEL', 'Create another connection to change the provider or store address.');
    if (!c.s.locations.some(l => l.kind === 'bin' && l.warehouse === p.warehouse)) fail('WAREHOUSE', 'Choose the warehouse to publish and reserve.');
    const data = { name: text(p.name), provider: p.provider, baseUrl: url.href.replace(/\/$/, ''), warehouse: text(p.warehouse), buffer: format(decimal(p.buffer ?? '0')), enabled: p.enabled !== false, approvedBy: c.actor.id };
    const channel = old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'channels', data);
    if (p.credentials && Object.keys(p.credentials).length) c.channelSecrets = [{ channelId: channel.id, secret: await seal(env, channel.id, p.credentials) }];
    else if (!old) fail('CREDENTIALS', 'Enter the credentials for this connection.');
    return channel;
  }
  if (type === 'channel.hold') {
    requireRole(c, []);
    item(c.s, p.itemId);
    let remaining = decimal(p.quantity, true);
    const allocations = [];
    for (const loc of c.s.locations.filter(l => l.kind === 'bin' && l.warehouse === p.warehouse)) {
      const take = min(remaining, available(c.s, p.itemId, loc.id));
      if (take > 0n) { allocations.push({ locationId: loc.id, quantity: take.toString() }); remaining -= take; }
    }
    if (remaining) fail('HOLD_STOCK', 'The hold exceeds unreserved sellable stock in this warehouse.');
    return row(c, 'channelHolds', { itemId: p.itemId, warehouse: text(p.warehouse), quantity: format(decimal(p.quantity)), reason: text(p.reason), allocations, approvedBy: c.actor.id });
  }
  if (type === 'channel.release') {
    requireRole(c, []);
    const hold = get(c.s, 'channelHolds', p.holdId); fresh(hold, p.version);
    hold.releasedAt = c.now; hold.version++; return hold;
  }
  if (type === 'channel.match') {
    requireRole(c, []);
    const listing = get(c.s, 'channelListings', p.listingId); fresh(listing, p.version);
    const channel = get(c.s, 'channels', listing.channelId);
    if (c.s.channelOrders.some(o => o.orderId && o.channelId === channel.id && o.source.lines.some((l: any) => (l.externalId === listing.externalId || (l.sku && l.sku === listing.sku))))) fail('CHANNEL_MATCH', 'An imported order already uses this listing. Keep its established SKU mapping.');
    listing.itemId = item(c.s, p.itemId).id; listing.matchedBy = 'Owner'; listing.version++;
    importOrders(c, channel); return listing;
  }
  if (type === 'channel.stallLink' || type === 'channel.stallUnlink') {
    requireRole(c, []);
    const channel = get(c.s, 'channels', p.channelId); fresh(channel, p.version);
    if (channel.provider !== 'stall') fail('CHANNEL', 'Only a Stall connection takes a key to Pier.');
    if (type === 'channel.stallUnlink') channel.stallLink = null;
    else {
      // Pier keeps only the key's hash; the key itself is shown once to the owner (api.ts).
      if (!/^[a-f0-9]{64}$/.test(String(p.keyHash))) fail('CHANNEL_INTERNAL', 'Pier creates Stall keys itself.');
      if (get(c.s, 'parties', p.customerId).kind !== 'customer') fail('CUSTOMER', 'Choose the Pier customer that Stall\'s shop orders belong to.');
      channel.stallLink = { keyHash: p.keyHash, customerId: p.customerId, createdAt: c.now, createdBy: c.actor.id };
    }
    channel.version++;
    return channel;
  }
  // These commands are admitted only by the connector transport, never accepted from a client.
  if (!c.backgroundPolicy || c.backgroundPolicy.collection !== 'channels' || c.backgroundPolicy.id !== p.channelId) fail('CHANNEL_INTERNAL', 'Pier records channel traffic itself.');
  const channel = get(c.s, 'channels', p.channelId);
  if (type === 'channel.ingest') {
    for (const source of p.listings as Listing[]) {
      let listing = c.s.channelListings.find(l => l.channelId === channel.id && l.externalId === source.externalId);
      if (!listing) listing = row(c, 'channelListings', { ...source, channelId: channel.id, itemId: null, publishedQuantity: null, pendingSince: c.now });
      else Object.assign(listing, source);
      match(c, listing);
    }
    for (const source of p.orders as ChannelOrder[]) {
      const prior = c.s.channelOrders.find(o => o.channelId === channel.id && o.externalId === source.externalId);
      if (prior) {
        if (channel.provider === 'stall' && source.payment && prior.orderId) {
          const order = get(c.s, 'orders', prior.orderId);
          if (source.reservationId !== order.id) fail('CHANNEL_PAYMENT', 'The shop payment points to a different reservation.');
          recordChannelPayment(c, order, source.payment);
        }
        continue;
      }
      if (!source.lines.length) fail('CHANNEL_ORDER', 'The channel returned an order without lines.');
      for (const line of source.lines) { decimal(line.quantity, true); if (line.price !== undefined) decimal(line.price); }
      for (const line of source.lines) {
        if (!c.s.channelListings.some(l => l.channelId === channel.id && (l.externalId === line.externalId || (line.sku && l.sku === line.sku)))) {
          row(c, 'channelListings', { channelId: channel.id, externalId: line.externalId, sku: line.sku, title: `Order ${source.reference} line`, itemId: null, publishedQuantity: null, pendingSince: c.now, orderOnly: true });
        }
      }
      row(c, 'channelOrders', { channelId: channel.id, externalId: text(source.externalId), reference: text(source.reference), source, orderId: null });
    }
    importOrders(c, channel);
    channel.lastReceivedAt = c.now; channel.problem = null; return channel;
  }
  if (type === 'channel.publicationPrepare') {
    const listing = get(c.s, 'channelListings', p.listingId);
    if (listing.channelId !== channel.id) fail('CHANNEL', 'Listing belongs to another channel.');
    const publication = preparePublication(c.s, channel, listing, p.locationId ?? null, c.now);
    if (!publication) fail('CHANNEL_MAPPING', 'Publication mapping changed. Review current routing.');
    return { ...publication, version: listing.version };
  }
  if (type === 'channel.published') {
    const listing = get(c.s, 'channelListings', p.listingId);
    if (listing.channelId !== channel.id) fail('CHANNEL', 'Listing belongs to another channel.');
    if (p.publicationId) {
      const publication = listing.publications?.find((entry: any) => entry.id === p.publicationId);
      if (!publication || publication.quantity !== p.quantity) fail('CHANNEL_PUBLICATION', 'Publication identity or quantity differs.');
      const rule = activeRule(c.s, `channel:${channel.id}`);
      if (rule && c.automationActors?.[rule.activatedBy] !== 'owner') fail('CHANNEL_AUTHORITY', 'The routing approval no longer has current-owner authority.');
      if (!publicationTargets(c.s, channel, listing).some(target => target.key === publication.key)) fail('CHANNEL_MAPPING', 'Publication mapping or quantity changed before confirmation.');
      Object.assign(publication, { status: 'accepted', acceptedAt: c.now, acceptanceMs: p.acceptanceMs, problem: null });
    }
    Object.assign(listing, { publishedQuantity: p.publicationId && activeRule(c.s, `channel:${channel.id}`)?.mode === 'channel-location' ? null : p.quantity, acceptedAt: c.now, acceptanceMs: p.acceptanceMs, problem: null, pendingSince: c.now, version: listing.version + 1 });
    return listing;
  }
  if (type === 'channel.failed') {
    if (p.listingId) {
      const listing = get(c.s, 'channelListings', p.listingId);
      if (listing.channelId !== channel.id) fail('CHANNEL', 'Listing belongs to another channel.');
      if (p.publicationId) {
        const publication = listing.publications?.find((entry: any) => entry.id === p.publicationId);
        if (publication) { publication.status = 'uncertain'; publication.problem = text(p.problem); }
      }
      listing.problem = text(p.problem); listing.version++;
    } else { channel.problem = text(p.problem); channel.failedAt = c.now; }
    return channel;
  }
}
