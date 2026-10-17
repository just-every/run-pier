import type { Adapter, ChannelConfig, ChannelOrder, Listing } from './types';

/** Stall already reads Pier live and reserves paid orders through Pier's command door. */
export function createStallAdapter(config: ChannelConfig): Adapter {
  const read = async (path: string, authenticated = true) => {
    const response = await fetch(config.baseUrl + path, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { ...(authenticated ? { authorization: `Bearer ${config.credentials.accessToken}` } : {}), ...(config.credentials.devKey ? { 'x-rer-dev-key': config.credentials.devKey } : {}) } });
    if (!response.ok) throw new Error('Stall refused API access.');
    return response.json() as Promise<any>;
  };
  return {
    async listings(): Promise<Listing[]> {
      const state = await read('/api/stall/state');
      return state.products.filter((p: any) => p.value.active).map((p: any) => ({ externalId: p.id, sku: p.value.sku, title: p.value.name }));
    },
    async orders(): Promise<ChannelOrder[]> {
      const state = await read('/api/stall/state');
      // Payment and reservation stay with Stall. Never import an unpaid cart or
      // race its reservation request; link the existing Pier order by identity.
      return state.orders.filter((o: any) => o.payment && o.reservation?.id).map((o: any) => ({ externalId: o.id, reference: o.id, customer: o.customerEmail ?? 'Erased Stall customer', currency: o.currency.toUpperCase(), reservationId: o.reservation.id, lines: o.lines.map((l: any) => ({ externalId: l.sku, sku: l.sku, quantity: String(l.quantity), price: (l.unitCents / 100).toFixed(2) })) }));
    },
    async stock(listing: Listing, quantity: string) {
      const catalogue = await read('/api/stall/catalogue', false);
      const observed = catalogue.items.find((i: any) => i.sku === listing.sku);
      if (!observed || observed.available !== quantity) throw new Error('Stall live availability does not match this channel allocation. Check its Pier connection and warehouse scope.');
    },
  };
}
