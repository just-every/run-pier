import { decimal, fail, format, row, SCALE, type Context, type Row } from '../model';
import { buildX12, type X12Input } from './x12';

export const addMinutes = (at: string, minutes: number) => new Date(Date.parse(at) + minutes * 60_000).toISOString();
export function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail('EDI_DATE', `Enter ${label} with an explicit time zone.`);
  const calendar = (value as string).slice(0, 10);
  if (new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) fail('EDI_DATE', `Enter a valid calendar date for ${label}.`);
  return new Date(Date.parse(value as string)).toISOString();
}
export function minutes(value: unknown, label: string, positive = false): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < (positive ? 1 : 0) || n > 525600) fail('EDI_WINDOW', `${label} must be whole minutes within one year.`);
  return n as number;
}
export function exactProduct(quantity: string, pack: string): string {
  const n = decimal(quantity, true) * decimal(pack, true);
  if (n % SCALE) fail('EDI_PACK', 'The mapped pack conversion exceeds six decimal places.');
  const result = format(n / SCALE); decimal(result, true); return result;
}
export function exactPrice(price: string, pack: string): string {
  const n = decimal(price) * SCALE, divisor = decimal(pack, true);
  if (n % divisor) fail('EDI_PRICE', 'The mapped base-unit price exceeds six decimal places.');
  const result = format(n / divisor); decimal(result); return result;
}
/** Allocate controls from persisted documents; allocation and the source effect share admission. */
export function document(c: Context, partner: Row, kind: '997'|'855'|'856'|'810', input: X12Input, links: Record<string, any>): Row {
  const previous = c.s.ediDocuments.filter(d => d.partnerId === partner.id && d.direction === 'outbound');
  const ordinal = previous.reduce((n, d) => Math.max(n, Number(d.control)), 0) + 1;
  if (ordinal > 999999999) fail('EDI_CONTROL', 'EDI control numbers are exhausted. Review the partner connection.');
  const control = String(ordinal).padStart(9, '0');
  const x12 = buildX12(kind, { ...input, senderId: partner.senderId, receiverId: partner.receiverId, usageIndicator: partner.usageIndicator ?? 'T' }, c.now, control);
  return row(c, 'ediDocuments', { ...links, partnerId: partner.id, kind, direction: 'outbound', control, groupControl: String(ordinal), transactionControl: control, x12, status: 'prepared', preparedBy: c.actor.id, commandId: c.commandId, sentAt: null, functionalAcknowledgment: null, attempts: [] });
}
export function ediLines(incoming: Row, nativeLines: any[]) {
  return nativeLines.map(line => {
    const source = incoming.lines.find((l: any) => l.orderLineId === line.orderLineId);
    if (!source) fail('EDI_LINE', 'The packed line has no retained retailer purchase-order line.');
    const n = decimal(line.quantity) * SCALE, pack = decimal(source.packQuantity, true);
    if (n % pack) fail('EDI_PACK', 'Packed quantity is not an exact retailer pack quantity.');
    return { lineNumber: source.lineNumber, quantity: format(n / pack), unit: source.unit, unitPrice: source.unitPrice, identifiers: source.identifiers };
  });
}
