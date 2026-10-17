export type BookDocument = {
  key: string;
  kind: 'item' | 'invoice' | 'credit' | 'bill' | 'journal' | 'receipt';
  date: string;
  reference: string;
  party?: { id: string; name: string; kind: 'customer' | 'supplier' };
  lines: {
    itemId?: string;
    description: string;
    quantity: string;
    unitPrice?: string;
    amount: string;
    account: string;
    debit?: string;
    credit?: string;
  }[];
  total: string;
  remoteId?: string;
  receiptState?: { received: boolean; readyToPay: boolean; attachment: { name: string; content: string } };
  creditForReference?: string;
  payment?: { reference: string; sourceReference: string; amount: string; date: string; bankAccountId: string };
  /** UTF-8 source evidence; binary files require a future explicit encoding contract. */
  attachment?: { name: string; content: string };
};

export type BookResult = { id: string; status: string; paid?: string; open?: string; received?: boolean; readyToPay?: boolean; evidenceCurrent?: boolean; paymentCurrent?: boolean };
export interface BooksAdapter {
  post(document: BookDocument): Promise<BookResult>;
  read(document: BookDocument): Promise<BookResult | null>;
}
export type BooksAdapterConfig = {
  /** Provider origin, e.g. https://quickbooks.api.intuit.com or https://api.xero.com. */
  baseUrl: string;
  credentials: Record<string, string>;
  fetch?: typeof fetch;
};

// Provider JSON schemas use numbers. Keep exact decimal lexemes on the wire,
// without converting money or quantities through binary floating point.
class DecimalLiteral { constructor(readonly value: string) {} }
export function numeric(value: string, money = true): DecimalLiteral {
  const pattern = money ? /^-?(0|[1-9]\d*)\.\d{2}$/ : /^-?(0|[1-9]\d*)(?:\.\d{1,6})?$/;
  if (!pattern.test(value)) throw new Error(`Books requires ${money ? 'two-place USD' : 'exact decimal'} values`);
  return new DecimalLiteral(value);
}
export function providerJson(value: unknown): string {
  if (value instanceof DecimalLiteral) return value.value;
  if (Array.isArray(value)) return `[${value.map(providerJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}:${providerJson(v)}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Invalid books JSON value');
  return result;
}
export function cents(value: unknown): bigint {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Invalid provider monetary amount');
  }
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  // JSON.parse must not silently lose a cent on an out-of-range response number.
  if (typeof value === 'number' && Math.abs(value) >= 1e12) throw new Error('Provider amount exceeds supported precision');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n);
}
export function usd(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
export function validateDocument(document: BookDocument): void {
  if (!document.key || !document.reference || !/^\d{4}-\d{2}-\d{2}$/.test(document.date)) throw new Error('Books document requires identity, reference and date');
  numeric(document.total);
  if (document.kind === 'receipt') {
    if (!document.remoteId || !document.attachment?.name || !document.attachment.content) throw new Error('Receipt evidence requires an existing bill ID and UTF-8 attachment');
    return;
  }
  if (!document.lines.length) throw new Error('Books document requires lines');
  for (const line of document.lines) {
    if (!line.account) throw new Error('Books line requires an explicitly mapped account');
    numeric(line.amount); numeric(line.quantity, false);
    if (line.unitPrice !== undefined) numeric(line.unitPrice);
  }
  if (document.kind === 'journal') {
    let debits = 0n, credits = 0n;
    for (const line of document.lines) {
      if (line.debit !== undefined) numeric(line.debit);
      if (line.credit !== undefined) numeric(line.credit);
      const debit = cents(line.debit ?? '0.00'), credit = cents(line.credit ?? '0.00');
      if (debit < 0n || credit < 0n || (debit > 0n) === (credit > 0n) || cents(line.amount) !== debit + credit) throw new Error('Journal line requires one positive debit or credit matching its amount');
      debits += debit; credits += credit;
    }
    if (debits !== credits || debits === 0n || debits !== cents(document.total)) throw new Error('Journal must balance to its document total');
  } else if (document.kind !== 'item' && document.lines.reduce((sum, line) => sum + cents(line.amount), 0n) !== cents(document.total)) {
    throw new Error('Books line amounts must equal the document total');
  }
}

export class BooksProviderError extends Error {
  constructor(provider: string, readonly status: number) { super(`${provider} HTTP ${status}`); }
}
export async function requestJson(config: BooksAdapterConfig, provider: string, url: URL, init: RequestInit, missing = false): Promise<any> {
  const response = await (config.fetch ?? fetch)(url, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) throw new BooksProviderError(provider, response.status);
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new BooksProviderError(provider, response.status);
  const body: any = await response.json();
  if (!body || typeof body !== 'object' || body.Fault || body.ErrorNumber) throw new Error(`${provider} rejected the accounting request`);
  return body;
}
export function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Books requires ${label}`);
  return value;
}
