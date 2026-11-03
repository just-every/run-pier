import { activeRule, publishedWarehouses } from '../routing';
import { available, decimal, format, id, type Row, type State } from '../model';
import { kitAvailability, kitDefinition } from '../kits';
import { canonicalJson, sha256 } from '../import-kit';

export function publicationQuantity(s: State, channel: Row, itemId: string, warehouses: string[]) {
  const kit = kitDefinition(s, itemId), buffer = decimal(channel.buffer ?? '0');
  const free = kit ? warehouses.reduce((n, w) => n + kitAvailability(s, kit, w), 0n)
    : s.locations.filter(l => l.kind === 'bin' && warehouses.includes(l.warehouse)).reduce((n, l) => n + available(s, itemId, l.id), 0n);
  return format(free > buffer ? free - buffer : 0n);
}

/** A listing identity remains independent of the locations to which it publishes. */
export function publicationTargets(s: State, channel: Row, listing: Row) {
  const rule = activeRule(s, `channel:${channel.id}`);
  const locations: (string | undefined)[] = channel.provider === 'shopify' && rule?.mode === 'channel-location'
    ? Object.keys(rule.locations) : [listing.locationId];
  return locations.flatMap(locationId => {
    const warehouses = publishedWarehouses(s, channel, locationId);
    if (!warehouses.length) return [];
    const quantity = publicationQuantity(s, channel, listing.itemId, warehouses);
    const target = { locationId: locationId ?? null, warehouses, quantity, ruleId: rule?.id ?? null, ruleVersion: rule?.version ?? null,
      channelVersion: channel.version, itemId: listing.itemId, inventoryItemId: listing.inventoryItemId ?? null };
    return [{ ...target, key: sha256(canonicalJson(target)) }];
  });
}

export function preparePublication(s: State, channel: Row, listing: Row, locationId: string | null, at: string) {
  const target = publicationTargets(s, channel, listing).find(t => t.locationId === locationId);
  if (!target) return;
  listing.publications ??= [];
  let publication = [...listing.publications].reverse().find((p: any) => p.locationId === target.locationId);
  if (publication?.key !== target.key) publication = undefined;
  if (!publication) {
    publication = { ...target, id: id(), status: 'uncertain', attemptedAt: at, acceptedAt: null,
      problem: 'Stock update has not yet been confirmed. Sync to reconcile its retained identity.' };
    listing.publications.push(publication);
    listing.version++;
  }
  return publication;
}
