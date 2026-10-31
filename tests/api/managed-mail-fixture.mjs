import { installation } from './harness.mjs';

export const supplierRecipient = ['supplier', 'example.test'].join('@');
export const relayMessageId = ['<synthetic-pier-2', 'relay.example.test>'].join('@');
export const attachmentNotice = 'PDF attachment unavailable: this Managed relay sends the text copy only. The retained purchase document has not been delivered.';

// Only the external mail edge is simulated. Commands, authentication, durable
// claims, scheduling and restart use the real Worker and persistent D1.
export async function managedMailInstallation() {
  const calls = [];
  let ambiguous = false;
  const h = await installation({
    bindings: {
      RER_MANAGEMENT_ORIGIN: 'https://managed.example.test', MAIL_PROVIDER: 'rer',
      MAIL_FROM: ['purchasing', 'example.test'].join('@'),
      MAIL_RELAY_URL: 'https://relay.example.test/send', MAIL_API_KEY: 'synthetic-pier-1',
    },
    outboundService: async request => {
      if (request.url !== 'https://relay.example.test/send' || request.method !== 'POST' ||
          request.headers.get('authorization') !== 'Bearer synthetic-pier-1') throw new Error('Unexpected mail edge request');
      calls.push(await request.json());
      return ambiguous ? new Response(null, { status: 503 })
        : Response.json({ messageId: relayMessageId }, { status: 202 });
    },
  });
  return Object.assign(h, { calls, ambiguous: () => { ambiguous = true; } });
}

export async function managedPurchase(h) {
  const state = await h.state();
  const item = state.items.find(item => item.sku === 'SYNTHETIC-PIER-1') ?? await h.command('item.save', { sku: 'SYNTHETIC-PIER-1', name: 'Synthetic bolts', unit: 'each', packSize: '1' });
  if (!state.locations.some(location => location.warehouse === 'North')) await h.command('location.save', { name: 'Synthetic receiving', warehouse: 'North', kind: 'bin' });
  const supplier = state.parties.find(party => party.name === 'Synthetic supplier') ?? await h.command('party.save', { name: 'Synthetic supplier', kind: 'supplier' });
  if (!state.businessProfile.length) await h.command('business.save', { name: 'Synthetic Pier warehouse', address: '1 Dock St', shipTo: { North: '2 Dock St' } });
  let po = await h.command('po.draft', { supplierId: supplier.id, destinationWarehouse: 'North', promiseDate: '2026-11-01',
    reason: 'Reviewed supplier purchase', lines: [{ itemId: item.id, quantity: '12', price: '0.25' }] });
  await h.command('po.approve', { poId: po.id, version: po.version });
  po = await h.command('po.commit', { poId: po.id, version: po.version });
  return po;
}

export function expectedManagedText(reference) {
  return `Purchase order ${reference} from Synthetic Pier warehouse\nSupplier: Synthetic supplier\nShip to: Synthetic Pier warehouse, North\n2 Dock St\nRequested delivery: November 1, 2026\nSYNTHETIC-PIER-1: 12 each at USD 0.25\nGoods USD 3.00; estimated freight USD 0.00; duty USD 0.00; expected landed total USD 3.00.\nPlease reply with confirmation, expected delivery date and our purchase order reference.\n\nSynthetic Pier warehouse\n\n${attachmentNotice}`;
}
