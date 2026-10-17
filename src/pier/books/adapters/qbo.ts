import { cents, numeric, providerJson, requestJson, required, usd, validateDocument } from './types';
import type { BookDocument, BookResult, BooksAdapter, BooksAdapterConfig } from './types';

const entities = { item: 'Item', invoice: 'Invoice', bill: 'Bill', journal: 'JournalEntry', receipt: 'Attachable' } as const;
const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function payload(document: BookDocument): object {
  const first = document.lines[0];
  if (document.kind === 'item') {
    if (document.lines.length !== 1) throw new Error('QBO item requires exactly one definition line');
    return {
      Name: document.reference, Sku: document.reference, Type: 'NonInventory',
      Description: first.description, TrackQtyOnHand: false,
      IncomeAccountRef: { value: first.account },
      UnitPrice: first.unitPrice === undefined ? undefined : numeric(first.unitPrice),
    };
  }
  if (document.reference.length > 21) throw new Error('QBO transaction reference exceeds its 21-character DocNumber limit; map an explicit ledger reference');
  const base = { TxnDate: document.date, DocNumber: document.reference, CurrencyRef: { value: 'USD' } };
  if (document.kind === 'journal') return {
    ...base,
    Line: document.lines.map(line => ({
      Description: line.description, Amount: numeric(line.amount), DetailType: 'JournalEntryLineDetail',
      JournalEntryLineDetail: { PostingType: cents(line.debit ?? '0.00') > 0n ? 'Debit' : 'Credit', AccountRef: { value: line.account } },
    })),
  };
  const party = required(document.party?.id, 'mapped QBO party ID');
  if (document.kind === 'invoice') {
    if (document.party?.kind !== 'customer') throw new Error('QBO invoice requires a customer');
    return {
      ...base, CustomerRef: { value: party },
      Line: document.lines.map(line => ({
        Description: line.description, Amount: numeric(line.amount), DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: required(line.itemId, 'mapped QBO invoice item ID') },
          Qty: numeric(line.quantity, false), UnitPrice: numeric(required(line.unitPrice, 'invoice unit price')),
          TaxCodeRef: { value: 'NON' },
        },
      })),
    };
  }
  if (document.party?.kind !== 'supplier') throw new Error('QBO bill requires a supplier');
  return {
    ...base, VendorRef: { value: party },
    // Pier owns physical quantities. Asset/expense account lines avoid QBO
    // inventory quantity movements and the implicit inventory COGS posting.
    Line: document.lines.map(line => ({
      Description: line.description, Amount: numeric(line.amount), DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: { AccountRef: { value: line.account } },
    })),
  };
}

function result(entity: any, document: BookDocument): BookResult {
  const kind = document.kind;
  const id = required(entity?.Id, 'QBO response ID');
  const mismatch = () => { throw new Error('QBO record differs from its Pier document; reconcile before continuing'); };
  if (document.remoteId && id !== document.remoteId) mismatch();
  if (kind === 'item') {
    if (entity.Name !== document.reference || entity.Type !== 'NonInventory' || entity.IncomeAccountRef?.value !== document.lines[0]?.account) mismatch();
    return { id, status: entity.Active === false ? 'inactive' : 'active' };
  }
  if (entity.DocNumber !== document.reference || entity.TxnDate !== document.date || entity.CurrencyRef?.value !== 'USD') mismatch();
  const detail = kind === 'invoice' ? 'SalesItemLineDetail' : kind === 'bill' ? 'AccountBasedExpenseLineDetail' : 'JournalEntryLineDetail';
  const lines = entity.Line?.filter((line: any) => line.DetailType === detail);
  if (!Array.isArray(lines) || lines.length !== document.lines.length) mismatch();
  for (const [index, line] of document.lines.entries()) {
    const remote = lines[index];
    if (cents(remote.Amount) !== cents(line.amount) || remote.Description !== line.description) mismatch();
    if (kind === 'invoice' && remote[detail]?.ItemRef?.value !== line.itemId) mismatch();
    if (kind !== 'invoice' && remote[detail]?.AccountRef?.value !== line.account) mismatch();
    if (kind === 'journal' && remote[detail]?.PostingType !== (cents(line.debit ?? '0.00') > 0n ? 'Debit' : 'Credit')) mismatch();
  }
  if (kind === 'journal') return { id, status: 'posted' };
  if (entity[kind === 'invoice' ? 'CustomerRef' : 'VendorRef']?.value !== document.party?.id || cents(entity.TotalAmt) !== cents(document.total)) mismatch();
  const total = cents(entity.TotalAmt), balance = cents(entity.Balance);
  if (total < 0n || balance < 0n || balance > total) throw new Error('QBO returned inconsistent transaction balances');
  return { id, status: balance === 0n ? 'paid' : balance === total ? 'open' : 'partial', paid: usd(total - balance) };
}

/** Actual QBO Accounting API transport; connection admission belongs to Pier. */
export function createQboAdapter(config: BooksAdapterConfig): BooksAdapter {
  const token = required(config.credentials.accessToken, 'QBO accessToken');
  const realm = required(config.credentials.realmId, 'QBO realmId');
  const root = `${config.baseUrl.replace(/\/$/, '')}/v3/company/${encodeURIComponent(realm)}/`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const request = (url: URL, init: RequestInit = {}, missing = false) => requestJson(config, 'QBO', url, { ...init, headers: { ...headers, ...init.headers } }, missing);
  const query = async (sql: string) => {
    const url = new URL('query', root); url.searchParams.set('query', sql);
    return request(url);
  };
  const receiptRows = (body: any, document: BookDocument): any[] => {
    const rows = body?.QueryResponse?.Attachable ?? body?.AttachableResponse?.map((entry: any) => entry.Attachable);
    if (!Array.isArray(rows)) throw new Error('QBO returned malformed attachment response');
    return rows.filter((row: any) => row?.FileName === document.attachment?.name && row.Note === `Pier receipt ${document.key}` &&
      row.AttachableRef?.some((ref: any) => ref.EntityRef?.type === 'Bill' && ref.EntityRef.value === document.remoteId));
  };
  return {
    async post(document) {
      if (document.kind === 'credit') throw new Error('Return credit posting is supported by the Pantry connector; QBO credit mapping requires separate acceptance.');
      validateDocument(document);
      // A deterministic digest fits the provider request-ID field even when a
      // durable Pier command key is long or contains arbitrary Unicode.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document.key));
      const requestId = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 48);
      if (document.kind === 'receipt') {
        const file = document.attachment!;
        const metadata = {
          FileName: file.name, ContentType: 'text/plain', Note: `Pier receipt ${document.key}`,
          AttachableRef: [{ EntityRef: { type: 'Bill', value: document.remoteId } }],
        };
        const form = new FormData();
        form.append('file_metadata_0', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
        form.append('file_content_0', new Blob([file.content], { type: 'text/plain' }), file.name);
        const url = new URL('upload', root); url.searchParams.set('requestid', requestId);
        const body = await request(url, { method: 'POST', body: form });
        if (receiptRows(body, document).length !== 1) throw new Error('QBO did not confirm the receipt attachment on its bill');
        return { id: document.remoteId!, status: 'attached', received: true };
      }
      const entity = entities[document.kind];
      const url = new URL(entity.toLowerCase(), root); url.searchParams.set('requestid', requestId);
      const body = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: providerJson(payload(document)) });
      return result(body[entity], document);
    },
    async read(document) {
      if (document.kind === 'credit') throw new Error('Return credit posting is supported by the Pantry connector; QBO credit mapping requires separate acceptance.');
      if (document.kind === 'receipt') {
        validateDocument(document);
        const body = await query(`select * from Attachable where AttachableRef.EntityRef.value = ${quote(document.remoteId!)} and AttachableRef.EntityRef.type = 'Bill'`);
        // Empty query results omit the entity collection in QBO.
        if (body.QueryResponse && body.QueryResponse.Attachable === undefined) return null;
        const rows = receiptRows(body, document);
        if (rows.length > 1) throw new Error('Ambiguous QBO receipt attachments require reconciliation');
        return rows.length ? { id: document.remoteId!, status: 'attached', received: true } : null;
      }
      const entity = entities[document.kind];
      if (document.remoteId) {
        const body = await request(new URL(`${entity.toLowerCase()}/${encodeURIComponent(document.remoteId)}`, root), {}, true);
        return body === null ? null : result(body[entity], document);
      }
      const body = await query(`select * from ${entity} where ${document.kind === 'item' ? 'Name' : 'DocNumber'} = ${quote(document.reference)} maxresults 2`);
      if (!body.QueryResponse || typeof body.QueryResponse !== 'object') throw new Error('QBO returned malformed query response');
      const rows = body.QueryResponse[entity] ?? [];
      if (!Array.isArray(rows)) throw new Error('QBO returned malformed query collection');
      if (rows.length > 1) throw new Error('Ambiguous QBO reference requires reconciliation');
      return rows.length ? result(rows[0], document) : null;
    },
  };
}
