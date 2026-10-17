import type { Bindings } from '../../auth.server';
import { fail, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { validateGs1Prefix } from './sscc';
import { minutes } from './records';
import { receive, receive997, resolveOrder, saveMapping } from './intake';
import { acknowledge, labelEvent, prepareAsn, prepareInvoice } from './outbound';
import { deliveryCommand } from './dispatch';

function savePartner(c: Context, p: any): Row {
  const old = p.id ? get(c.s, 'ediPartners', p.id) : undefined;
  if (old) fresh(old, p.version);
  if (get(c.s, 'parties', p.customerId).kind !== 'customer') fail('EDI_CUSTOMER', 'Choose an existing customer for this retailer.');
  if (!c.s.locations.some(l => l.kind === 'bin' && l.warehouse === p.warehouse)) fail('EDI_WAREHOUSE', 'Choose an existing warehouse for retailer orders.');
  const senderId = text(p.senderId, 'Pier X12 sender ID'), receiverId = text(p.receiverId, 'Retailer X12 receiver ID');
  if (!/^[A-Za-z0-9._ -]{1,15}$/.test(senderId) || !/^[A-Za-z0-9._ -]{1,15}$/.test(receiverId) || senderId === receiverId) fail('EDI_IDS', 'Enter distinct X12 sender and receiver IDs, each at most 15 characters.');
  if (!validateGs1Prefix(p.gs1Prefix)) fail('EDI_PREFIX', 'Enter the licensed GS1 company prefix as 4–12 digits.');
  if (!['pending','as2','sftp','van'].includes(p.transport)) fail('EDI_TRANSPORT', 'Choose the retailer transport, or leave the choice pending.');
  if (c.s.ediPartners.some(partner => partner.id !== old?.id && partner.senderId === senderId && partner.receiverId === receiverId)) fail('EDI_PARTNER_DUPLICATE', 'This retailer sender and receiver pair already exists.');
  if (p.usageIndicator !== undefined && !['T','P'].includes(p.usageIndicator)) fail('EDI_MODE', 'Choose test or production EDI mode.');
  const used = old && c.s.ediOrders.some(o => o.partnerId === old.id);
  if (used && (old.senderId !== senderId || old.receiverId !== receiverId || old.customerId !== p.customerId || old.gs1Prefix !== p.gs1Prefix)) fail('EDI_PARTNER_USED', 'Retain the customer, envelope IDs and GS1 prefix used by existing EDI orders. Create another connection for a different identity.');
  const data = { usageIndicator: p.usageIndicator ?? 'T', name: text(p.name, 'Retailer name'), customerId: p.customerId, warehouse: text(p.warehouse, 'Warehouse'), senderId, receiverId, gs1Prefix: p.gs1Prefix, transport: p.transport, ackMinutes: minutes(p.ackMinutes, '855 acknowledgment window', true), asnBeforeArrivalMinutes: minutes(p.asnBeforeArrivalMinutes, 'ASN lead before arrival'), asnAfterPickupMinutes: minutes(p.asnAfterPickupMinutes ?? 0, 'ASN window after pickup'), invoiceMinutes: minutes(p.invoiceMinutes, '810 invoice window', true), warningMinutes: minutes(p.warningMinutes ?? 60, 'Deadline warning', true), enabled: p.enabled !== false, configuredBy: c.actor.id, updatedAt: c.now };
  return old ? Object.assign(old, data, { version: old.version + 1 }) : row(c, 'ediPartners', { ...data, ssccSequence: '0' });
}
/** Commands only mutate the cloned Context; the caller admits the whole write atomically. */
export async function edi(c: Context, type: string, p: any, _env: Bindings): Promise<any> {
  if (!type.startsWith('edi.')) return undefined;
  if (type === 'edi.partner.save' || type === 'edi.mapping.save') {
    requireRole(c, []);
    return type === 'edi.partner.save' ? savePartner(c, p) : saveMapping(c, p);
  }
  if (type.startsWith('edi.send.')) return deliveryCommand(c, type, p);
  if (type === 'edi.label.print' || type === 'edi.label.reprint') { requireRole(c, ['warehouse']); return labelEvent(c, type, p); }
  if (type === 'edi.asn.prepare') { requireRole(c, ['warehouse']); return prepareAsn(c, p); }
  requireRole(c, ['operator']);
  if (type === 'edi.receive') return receive(c, p);
  if (type === 'edi.997.receive') return receive997(c, p);
  if (type === 'edi.order.resolve') {
    const incoming = get(c.s, 'ediOrders', p.ediOrderId); fresh(incoming, p.version);
    resolveOrder(c, incoming); incoming.version++; return incoming;
  }
  if (type === 'edi.acknowledge') return acknowledge(c, p);
  if (type === 'edi.invoice.prepare') return prepareInvoice(c, p);
  return fail('COMMAND', 'Unknown EDI command.');
}
