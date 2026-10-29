import { activeRule, publishedWarehouses } from '../routing';
import { publicationQuantity, publicationTargets } from './publications';
import { type Context, type Row, type State } from '../model';
export function channelAvailability(s:State,channel:Row,itemId:string,listing?:Row){
  return publicationQuantity(s, channel, itemId, publishedWarehouses(s, channel, listing?.locationId));
}
export function channelState(s: State, actors?: Record<string, string>) {
  return { channelListings: s.channelListings.map(listing => {
    const channel = s.channels.find(c => c.id === listing.channelId);
    const rule = channel && activeRule(s, `channel:${channel.id}`);
    const authorized = Boolean(channel?.enabled && (!actors || actors[channel.approvedBy] === 'owner' && (!rule || actors[rule.activatedBy] === 'owner')));
    const targets = listing.itemId && channel && !listing.orderOnly ? publicationTargets(s, channel, listing) : [];
    const warehouses = new Set(targets.flatMap(t => t.warehouses));
    const holds = s.channelHolds.filter(h => !h.releasedAt && h.itemId === listing.itemId && warehouses.has(h.warehouse));
    const wanted = listing.itemId && channel && !listing.orderOnly ? channelAvailability(s, channel, listing.itemId, listing) : null;
    const latest = new Map((listing.publications ?? []).map((p: any) => [p.locationId, p.id]));
    const publications = (listing.publications ?? []).map((p: any) => {
      const current = authorized && targets.some(t => t.key === p.key) && latest.get(p.locationId) === p.id;
      return { ...p, current, invalidated: !current };
    });
    const locations = targets.map(target => ({ ...target, publication: [...publications].reverse().find((p: any) => p.locationId === target.locationId && p.key === target.key) ?? null }));
    const unconfirmedPublications = publications.filter((p: any) => p.status !== 'accepted' && !locations.some(t => t.publication?.id === p.id));
    const multiLocation = locations.length > 1 || rule?.mode === 'channel-location';
    const lag = channel?.provider === 'shopify' ? !authorized || !locations.length || unconfirmedPublications.length > 0 || locations.some(t => t.publication?.status !== 'accepted') : wanted !== null && wanted !== listing.publishedQuantity;
    return { ...listing, publications, publicationLocations: locations, unconfirmedPublications, multiLocation, publicationAuthorized: authorized,
      available: multiLocation ? null : wanted, holds: holds.map(h => ({ id: h.id, warehouse: h.warehouse, quantity: h.quantity, reason: h.reason })),
      lag, lagSeconds: lag ? Math.max(0, Math.floor((Date.now() - Date.parse(listing.pendingSince ?? listing.createdAt)) / 1000)) : 0 };
  }) };
}

export function markChannelPending(c: Context, before: State) {
  for (const listing of c.s.channelListings.filter(l => l.itemId)) {
    const channel = c.s.channels.find(ch => ch.id === listing.channelId);
    const old = before.channelListings.find(l => l.id === listing.id);
    const oldChannel = before.channels.find(ch => ch.id === listing.channelId);
    if (!channel) continue;
    const targets = publicationTargets(c.s, channel, listing);
    const oldKeys = old && oldChannel ? publicationTargets(before, oldChannel, old).map(t => t.key) : [];
    if (targets.some(t => !oldKeys.includes(t.key)) || oldKeys.length !== targets.length) {
      listing.pendingSince = c.now; listing.version++;
    }
  }
}
