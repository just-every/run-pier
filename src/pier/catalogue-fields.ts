import { decimal, fail, format, get, text, type Context, type Row, type State } from './model';
import { barcodesOf, clean, same } from './floor/codes';

const optional = (v: unknown) => v === '' || v === null ? null : text(v);
export function catalogueFields(c: Context, p: any, old?: Row) {
  const data: Record<string, any> = {};
  for (const key of ['variantFamily', 'category', 'imageUrl'])
    data[key] = p[key] === undefined ? old?.[key] ?? null : optional(p[key]);
  if (data.imageUrl) {
    let url: URL;
    try { url = new URL(data.imageUrl); } catch { return fail('IMAGE_URL', 'Use an HTTPS image URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) fail('IMAGE_URL', 'Use an HTTPS image URL without credentials.');
  }
  data.weight = p.weight === undefined ? old?.weight ?? null : p.weight === '' || p.weight === null ? null : format(decimal(p.weight));
  data.dimensions = p.dimensions === undefined ? old?.dimensions ?? null : p.dimensions;
  if (data.dimensions !== null) {
    const d = data.dimensions;
    if (!d || !['in', 'cm'].includes(d.unit)) fail('DIMENSIONS', 'Choose inches or centimeters and all three dimensions.');
    data.dimensions = { length: format(decimal(d.length, true)), width: format(decimal(d.width, true)), height: format(decimal(d.height, true)), unit: d.unit };
  }
  const barcodes = p.barcodes === undefined ? old?.barcodes ?? [] : p.barcodes;
  if (!Array.isArray(barcodes) || barcodes.length > 30) fail('BARCODES', 'Use up to 30 additional barcodes.');
  data.barcodes = barcodes.map((b: any) => ({ code: text(b?.code, 'Barcode'), quantity: format(decimal(b?.quantity, true)), label: optional(b?.label ?? '') }));
  const references = p.references === undefined ? old?.references ?? [] : p.references;
  if (!Array.isArray(references) || references.length > 50) fail('REFERENCES', 'Use up to 50 customer or supplier references.');
  data.references = references.map((r: any) => {
    const party = get(c.s, 'parties', r?.partyId);
    return { partyId: party.id, code: text(r?.code, 'Item reference') };
  });
  if (data.references.some((r: any, index: number) => data.references.slice(0, index).some((other: any) => r.partyId === other.partyId && same(r.code, other.code))))
    fail('REFERENCES', 'A party reference must appear only once on an item.');
  return data;
}

/** Names used as scan doors share the barcode namespace, including archived goods. */
export function codeOwners(s: State, code: string, exceptItem?: string, exceptLocation?: string) {
  return [
    ...s.items.filter(i => i.id !== exceptItem && [i.sku, ...barcodesOf(i).map(b => b.code)].some(b => same(code, b))).map(i => ({ kind: 'item', id: i.id, name: i.sku })),
    ...s.locations.filter(l => l.id !== exceptLocation && [l.barcode, l.name].some(b => same(code, b))).map(l => ({ kind: 'bin', id: l.id, name: `${l.warehouse}/${l.name}` })),
    ...s.shipments.filter(r => [r.id, r.reference].some(b => same(code, b))).map(r => ({ kind: 'shipment', id: r.id, name: r.reference })),
    ...s.ediDocuments.filter(d => d.cartons?.some((x: any) => same(code, x.sscc))).map(d => ({ kind: 'carton', id: d.id, name: d.id })),
  ];
}
export function uniqueItemCodes(s: State, candidate: Row, old?: Row) {
  const codes = barcodesOf(candidate);
  for (const [index, b] of codes.entries()) {
    clean(b.code);
    if (same(b.code, candidate.sku) && b.quantity !== '1') fail('DUPLICATE', `SKU ${candidate.sku} is a one-unit scan and cannot also identify a pack.`);
    const other = codes.slice(0, index).find(x => same(x.code, b.code));
    if (other) fail('DUPLICATE', `Barcode ${b.code} is repeated on SKU ${candidate.sku}.`, { proposed: candidate.sku, code: b.code });
    const owners = codeOwners(s, b.code, old?.id);
    if (owners.length) fail('DUPLICATE', `SKU ${candidate.sku}: barcode ${b.code} already belongs to ${owners.map(o => `${o.kind} ${o.name}`).join(', ')}.`, { proposed: candidate.sku, code: b.code, owners });
  }
  const owners = codeOwners(s, candidate.sku, old?.id);
  if (owners.length) fail('DUPLICATE', `SKU ${candidate.sku} already belongs to ${owners.map(o => `${o.kind} ${o.name}`).join(', ')}.`, { proposed: candidate.sku, owners });
}
