import { fail } from '../model';

const object = (properties: Record<string, any>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nullable = { type: ['string', 'null'] };
const strings = { type: 'array', items: { type: 'string' } };
const citations = { type: 'array', items: object({ field: { type: 'string' }, page: { type: 'integer' }, quote: { type: 'string' } }) };
export const draftSchema = object({
  customer: nullable, customerPO: nullable,
  shipTo: { anyOf: [object({ line1: nullable, city: nullable, state: nullable, postalCode: nullable, country: nullable }), { type: 'null' }] },
  requestedDate: nullable, citations, ambiguities: strings,
  lines: { type: 'array', items: object({ itemCode: nullable, quantity: nullable, unit: nullable, price: nullable, description: nullable, citations, ambiguities: strings }) },
});
const invalid = () => fail('DOCUMENT_OUTPUT', 'OpenAI did not return a complete cited draft. No order was created.');
function keys(value: any, expected: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(k => !Object.hasOwn(value, k))) invalid();
}
function string(value: any, max = 2000, allowNull = false) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) invalid();
}
function flags(value: any) {
  if (!Array.isArray(value) || value.length > 40) invalid();
  value.forEach((flag: any) => string(flag, 500));
}
function cited(value: any, fields: string[], pageCount: number) {
  if (!Array.isArray(value.citations) || value.citations.length > 40) invalid();
  for (const citation of value.citations) {
    keys(citation, ['field', 'page', 'quote']);
    if (!fields.includes(citation.field) || !Number.isInteger(citation.page) || citation.page < 1 || citation.page > pageCount) invalid();
    string(citation.quote, 500);
  }
  flags(value.ambiguities);
  for (const field of fields) {
    if (field !== 'shipTo') string(value[field], 2000, true);
    if (value[field] !== null && !value.citations.some((citation: any) => citation.field === field)) invalid();
    if (value[field] === null && !value.ambiguities.some((flag: string) => flag.includes(`Missing ${field}`))) value.ambiguities.push(`Missing ${field}; human review is required.`);
  }
  flags(value.ambiguities);
}
/** Validate even strict output at the trust boundary. Citations are claims to review. */
export function validateDraft(value: any, pageCount: number) {
  keys(value, ['customer', 'customerPO', 'shipTo', 'requestedDate', 'citations', 'ambiguities', 'lines']);
  cited(value, ['customer', 'customerPO', 'shipTo', 'requestedDate'], pageCount);
  if (value.shipTo !== null) {
    keys(value.shipTo, ['line1', 'city', 'state', 'postalCode', 'country']);
    Object.values(value.shipTo).forEach(v => string(v, 300, true));
  }
  if (!Array.isArray(value.lines) || !value.lines.length || value.lines.length > 100) invalid();
  for (const line of value.lines) {
    keys(line, ['itemCode', 'quantity', 'unit', 'price', 'description', 'citations', 'ambiguities']);
    cited(line, ['itemCode', 'quantity', 'unit', 'price', 'description'], pageCount);
    // Preserve source wording. Never guess pack conversion from model text.
    const packReview = 'Pack/unit requires explicit human mapping to the selected item base unit or case.';
    if (line.unit !== null && !/^(each|ea|unit)$/i.test(line.unit) && !line.ambiguities.includes(packReview)) line.ambiguities.push(packReview);
    flags(line.ambiguities);
  }
  return value;
}
