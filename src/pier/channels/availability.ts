import { activeRule, publishedWarehouses } from '../routing';
import { publicationQuantity, publicationTargets } from './publications';
import { type Context, type Row, type State } from '../model';
export function channelAvailability(s:State,channel:Row,itemId:string,listing?:Row){
  return publicationQuantity(s, channel, itemId, publishedWarehouses(s, channel, listing?.locationId));
}
export function channelState(s: State) {
  return { channelListings: s.channelListings.map(listing => {
    const channel = s.channels.find(c => c.id === listing.channelId);
    const holds = s.channelHolds.filter(h => !h.releasedAt && h.itemId === listing.itemId && Boolean(channel && publicationTargets(s, channel, listing).some(t => t.warehouses.includes(h.warehouse))));
    const wanted = listing.itemId && channel && !listing.orderOnly ? channelAvailability(s, channel, listing.itemId,listing) : null;
    const targets = listing.itemId && channel && !listing.orderOnly ? publicationTargets(s, channel, listing) : [];
    const publications = (listing.publications ?? []).map((p: any) => ({ ...p, current: targets.some(t => t.key === p.key),
      invalidated: !targets.some(t => t.key === p.key) }));
    const locations = targets.map(target => ({ ...target, publication: [...publications].reverse().find((p: any) => p.locationId === target.locationId && p.key === target.key) ?? null }));
    const multiLocation = locations.length > 1 || Boolean(channel && activeRule(s, `channel:${channel.id}`)?.mode === 'channel-location');
    const lag = multiLocation ? !locations.length || locations.some(t => t.publication?.status !== 'accepted') : wanted !== null && wanted !== listing.publishedQuantity;
    return { ...listing, publications, publicationLocations: locations, multiLocation, available: multiLocation ? null : wanted, holds: holds.map(h => ({ id: h.id, warehouse: h.warehouse, quantity: h.quantity, reason: h.reason })), lag, lagSeconds: lag ? Math.max(0, Math.floor((Date.now() - Date.parse(listing.pendingSince ?? listing.createdAt)) / 1000)) : 0 };
  }) };
}

export function markChannelPending(c: Context, before: State) {
  for (const listing of c.s.channelListings.filter(l => l.itemId)) {
    const channel = c.s.channels.find(ch => ch.id === listing.channelId);
    const old = before.channelListings.find(l => l.id === listing.id);
    const oldChannel = before.channels.find(ch => ch.id === listing.channelId);
    if (!channel) continue;
    const wanted = channelAvailability(c.s, channel, listing.itemId,listing);
    if (wanted !== listing.publishedQuantity && (!old || !oldChannel || channelAvailability(before, oldChannel, old.itemId,old) !== wanted)) {
      listing.pendingSince = c.now; listing.version++;
    }
  }
}
