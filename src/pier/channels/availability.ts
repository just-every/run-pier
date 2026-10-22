import { publishedWarehouses } from '../routing';
import { kitDefinition, kitAvailability } from '../kits';
import { available, decimal, format, type Context, type Row, type State } from '../model';
export function channelAvailability(s:State,channel:Row,itemId:string,listing?:Row){
  const warehouses=publishedWarehouses(s,channel,listing?.locationId),kit=kitDefinition(s,itemId),buffer=decimal(channel.buffer??'0');
  const free=kit?warehouses.reduce((n:bigint,w:string)=>n+kitAvailability(s,kit,w),0n):s.locations.filter(l=>l.kind==='bin'&&warehouses.includes(l.warehouse)).reduce((n,l)=>n+available(s,itemId,l.id),0n);
  return format(free>buffer?free-buffer:0n);
}
export function channelState(s: State) {
  return { channelListings: s.channelListings.map(listing => {
    const channel = s.channels.find(c => c.id === listing.channelId);
    const holds = s.channelHolds.filter(h => !h.releasedAt && h.itemId === listing.itemId && h.warehouse === channel?.warehouse);
    const wanted = listing.itemId && channel && !listing.orderOnly ? channelAvailability(s, channel, listing.itemId,listing) : null;
    const lag = wanted !== null && wanted !== listing.publishedQuantity;
    return { ...listing, available: wanted, holds: holds.map(h => ({ id: h.id, quantity: h.quantity, reason: h.reason })), lag, lagSeconds: lag ? Math.max(0, Math.floor((Date.now() - Date.parse(listing.pendingSince ?? listing.createdAt)) / 1000)) : 0 };
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
