import { decimal, fail, format, fresh, get, requireRole, row, SCALE, text, type Context, type Row } from './model';
import { amount, CENT, money, toCents } from './money';

const percent = (value: unknown) => {
  const rate = decimal(value);
  if (rate > 100n * SCALE) fail('TAX_TABLE', 'Tax percentages must be from zero to 100.');
  return format(rate);
};
const stateCode = (value: unknown) => {
  const state = text(value, 'State').toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) fail('TAX_TABLE', 'Use a two-letter US state.');
  return state;
};
export function saveTaxRules(c: Context, type: string, p: any): Row | undefined {
  if (!['sales.taxTable', 'sales.taxProduct'].includes(type)) return;
  requireRole(c, []);
  if (type === 'sales.taxProduct') {
    const item = get(c.s, 'items', p.itemId);
    const old = c.s.salesPolicies.find(r => r.kind === 'product-tax-code' && r.itemId === item.id);
    if (old) fresh(old, p.version);
    const data = { kind: 'product-tax-code', itemId: item.id, taxCode: text(p.taxCode, 'Product tax code'), reason: text(p.reason), approvedBy: c.actor.id, at: c.now };
    return old ? Object.assign(old, data, { version: old.version + 1, history: [...(old.history ?? []), structuredClone({ ...old, history: undefined })] }) : row(c, 'salesPolicies', data);
  }
  const state = stateCode(p.state), rate = percent(p.rate);
  const old = c.s.salesPolicies.find(r => r.kind === 'tax-table' && r.state === state);
  if (old) fresh(old, p.version);
  let rules = old?.rules ?? null;
  if (p.rules !== undefined) {
    const r = p.rules;
    if (!r || !['destination', 'origin'].includes(r.basis) || typeof r.freightTaxable !== 'boolean' || typeof r.handlingTaxable !== 'boolean' || !Array.isArray(r.products) || !r.products.length || r.products.length > 100)
      fail('TAX_TABLE', 'Review jurisdiction basis, freight, handling and explicit product code rates.');
    const products = r.products.map((product: any) => ({ code: text(product.code, 'Product tax code'), rate: percent(product.rate) }));
    if (new Set(products.map((product: any) => product.code)).size !== products.length) fail('TAX_TABLE', 'Each product tax code must appear once.');
    const originState = r.basis === 'origin' ? stateCode(r.originState) : null;
    const originWarehouse = r.basis === 'origin' ? text(r.originWarehouse, 'Reviewed origin warehouse') : null;
    if (originWarehouse && !c.s.locations.some(l => l.kind === 'bin' && l.warehouse === originWarehouse)) fail('TAX_TABLE', 'Choose an existing origin warehouse.');
    rules = { basis: r.basis, originState, originWarehouse, freightTaxable: r.freightTaxable, handlingTaxable: r.handlingTaxable, products };
  }
  const data = { kind: 'tax-table', state, country: 'US', rate, rules, reason: text(p.reason), approvedBy: c.actor.id, at: c.now };
  return old ? Object.assign(old, data, { version: old.version + 1, history: [...(old.history ?? []), structuredClone({ ...old, history: undefined })] }) : row(c, 'salesPolicies', data);
}

export function quoteCharges(p: any) {
  return ['freight', 'handling'].filter(kind => p[kind] !== undefined && p[kind] !== '').map(kind => {
    const value = decimal(String(p[kind]).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')) * SCALE;
    if (value % CENT) fail('QUOTE_CHARGES', 'Freight and handling must be whole cents.');
    return { id: crypto.randomUUID(), kind, description: kind, amount: money(value), taxable: false };
  });
}

/** The owner's reviewed tables are estimates, never provider validation. */
export function estimateTax(c: Context, customerId: string, destination: any, warehouse: string | null, lines: any[], charges: any[]) {
  const table = c.s.salesPolicies.find(r => r.kind === 'tax-table' && r.state === destination?.state && r.country === (destination?.country ?? 'US'));
  const customer = get(c.s, 'parties', customerId), certificates = customer.resaleCertificates ?? [];
  const certificate = certificates.find((r: any) => r.state === destination?.state) ?? null;
  const base = { source: 'Owner-maintained jurisdiction table', providerCommit: 'not-configured', destination: structuredClone(destination ?? null), table: structuredClone(table ?? null), certificate: structuredClone(certificate), lines: [] as any[], amount: null as string | null };
  const review = (source: string) => ({ ...base, status: 'review', source });
  if (certificates.length && !certificate) return review('Missing exemption certificate for this destination');
  if (certificate && certificate.expires < c.now.slice(0, 10)) return review('Expired exemption certificate');
  if (!table) return { ...base, status: 'pending', source: 'No owner tax table for this destination' };
  let rateTable = table;
  if (table.rules?.basis === 'origin') {
    if (warehouse !== table.rules.originWarehouse) return review('Review the origin warehouse before estimating tax');
    const origin = c.s.salesPolicies.find(r => r.kind === 'tax-table' && r.state === table.rules.originState && r.country === 'US');
    if (!origin?.rules) return review('Configure explicit product rates for the reviewed origin state');
    rateTable = origin;
  }
  const evidence: any[] = [];
  for (const line of lines) {
    if (line.price === null || line.amount === null) return review('Price every line before estimating tax');
    const product = c.s.salesPolicies.find(r => r.kind === 'product-tax-code' && r.itemId === line.itemId);
    const rule = rateTable.rules?.products.find((r: any) => r.code === product?.taxCode);
    if (table.rules && (!product || !rule)) return review('Review the product tax code and its jurisdiction rate');
    const basis = amount(line.amount), rate = certificate ? '0' : rule?.rate ?? rateTable.rate;
    evidence.push({ lineId: line.id, itemId: line.itemId, kind: 'product', taxCode: product?.taxCode ?? null, product: structuredClone(product ?? null), taxableAmount: money(basis), rate, amount: money(toCents(basis * decimal(rate) / (100n * SCALE))), exemption: certificate ? certificate.number : null });
  }
  for (const charge of charges) {
    const taxable = table.rules && ['freight', 'handling'].includes(charge.kind) ? table.rules[charge.kind + 'Taxable'] : charge.taxable;
    const basis = taxable ? amount(charge.amount) : 0n, rate = certificate ? '0' : rateTable.rate;
    evidence.push({ lineId: charge.id, kind: charge.kind, taxable, taxableAmount: money(basis), rate, amount: money(toCents(basis * decimal(rate) / (100n * SCALE))), exemption: certificate ? certificate.number : null });
  }
  return { ...base, status: 'estimate', basis: table.rules?.basis ?? 'destination', originState: table.rules?.originState ?? null, originWarehouse: table.rules?.originWarehouse ?? null, rateTable: structuredClone(rateTable), rate: certificate ? '0' : rateTable.rate, lines: evidence, taxableAmount: money(evidence.reduce((n, l) => n + amount(l.taxableAmount), 0n)), amount: money(evidence.reduce((n, l) => n + amount(l.amount), 0n)) };
}

export function currentTax(c: Context, tax: any, customerId: string, code: string, warehouse?: string | null) {
  if (tax?.basis === 'origin' && warehouse !== tax.originWarehouse) fail(code, 'The tax origin changed. Review the warehouse and prepare a new estimate.');
  if (tax?.status === 'review') fail(code, 'Resolve the tax review and prepare a new estimate.');
  for (const table of [tax?.table, tax?.rateTable].filter(Boolean)) {
    if (get(c.s, 'salesPolicies', table.id).version !== table.version) fail(code, 'The owner tax table changed. Prepare a new estimate.');
  }
  for (const line of tax?.lines ?? []) {
    if (line.kind !== 'product') continue;
    const product = c.s.salesPolicies.find(r => r.kind === 'product-tax-code' && r.itemId === line.itemId);
    if ((product?.version ?? null) !== (line.product?.version ?? null)) fail(code, 'The product tax code changed. Prepare a new estimate.');
  }
  const certificates = get(c.s, 'parties', customerId).resaleCertificates ?? [];
  const certificate = certificates.find((r: any) => r.state === tax?.destination?.state) ?? null;
  if (JSON.stringify(certificate) !== JSON.stringify(tax?.certificate ?? null) || certificate && certificate.expires < c.now.slice(0, 10) || certificates.length && !certificate)
    fail(code, 'The exemption changed, is missing or expired. Review the tax again.');
}
