import { cents, numeric, providerJson, requestJson, required, usd, validateDocument } from './types';
import type { BookDocument, BookResult, BooksAdapter, BooksAdapterConfig } from './types';

const endpoints = { item: 'Items', invoice: 'Invoices', bill: 'Invoices', journal: 'ManualJournals', receipt: 'Invoices' } as const;
const ids = { item: 'ItemID', invoice: 'InvoiceID', bill: 'InvoiceID', journal: 'ManualJournalID', receipt: 'InvoiceID' } as const;

function payload(document: BookDocument): object {
  const first = document.lines[0];
  if (document.kind === 'item') {
    if (document.lines.length !== 1) throw new Error('Xero item requires exactly one definition line');
    if (document.reference.length > 30 || first.description.length > 50) throw new Error('Xero item requires a code up to 30 and a name up to 50 characters; map these explicitly');
    return {
      Code: document.reference, Name: first.description, Description: first.description,
      IsTrackedAsInventory: false, IsSold: true, IsPurchased: false,
      SalesDetails: { AccountCode: first.account, UnitPrice: first.unitPrice === undefined ? undefined : numeric(first.unitPrice) },
    };
  }
  if (document.kind === 'journal') return {
    Date: document.date, Narration: document.reference, Status: 'POSTED', LineAmountTypes: 'NoTax',
    JournalLines: document.lines.map(line => ({
      Description: line.description, AccountCode: line.account,
      LineAmount: numeric(usd(cents(line.debit ?? '0.00') - cents(line.credit ?? '0.00'))),
    })),
  };
  if (document.party?.kind !== (document.kind === 'invoice' ? 'customer' : 'supplier')) throw new Error('Xero document requires the corresponding customer or supplier');
  return {
    Type: document.kind === 'invoice' ? 'ACCREC' : 'ACCPAY',
    Contact: { ContactID: required(document.party?.id, 'mapped Xero contact ID') },
    Date: document.date, InvoiceNumber: document.reference, Reference: document.reference,
    CurrencyCode: 'USD', Status: 'AUTHORISED', LineAmountTypes: 'NoTax',
    LineItems: document.lines.map(line => ({
      Description: line.description, ItemCode: line.itemId, AccountCode: line.account,
      Quantity: numeric(line.quantity, false),
      UnitAmount: numeric(required(line.unitPrice, 'Xero unit price')),
      LineAmount: numeric(line.amount),
    })),
  };
}

function result(entity: any, document: BookDocument): BookResult {
  if (document.kind === 'credit') throw new Error('Return credit posting is supported by the Pantry connector; Xero credit mapping requires separate acceptance.');
  if (entity?.HasErrors || entity?.ValidationErrors?.length) throw new Error('Xero rejected the accounting document');
  const id = required(entity?.[ids[document.kind]], 'Xero response ID');
  const mismatch = () => { throw new Error('Xero record differs from its Pier document; reconcile before continuing'); };
  if (document.remoteId && id !== document.remoteId) mismatch();
  if (document.kind === 'item') {
    if (entity.Code !== document.reference || entity.IsTrackedAsInventory !== false || entity.SalesDetails?.AccountCode !== document.lines[0]?.account) mismatch();
    return { id, status: 'active' };
  }
  const status = required(entity.Status, 'Xero document status').toLowerCase();
  const journal = document.kind === 'journal';
  if ((journal ? entity.Narration : entity.InvoiceNumber) !== document.reference) mismatch();
  const lines = entity[journal ? 'JournalLines' : 'LineItems'];
  if (!Array.isArray(lines) || lines.length !== document.lines.length) mismatch();
  for (const [index, line] of document.lines.entries()) {
    const remote = lines[index];
    const expected = journal ? cents(line.debit ?? '0.00') - cents(line.credit ?? '0.00') : cents(line.amount);
    if (cents(remote.LineAmount) !== expected || remote.AccountCode !== line.account || remote.Description !== line.description) mismatch();
  }
  if (journal) return { id, status };
  if (entity.Type !== (document.kind === 'invoice' ? 'ACCREC' : 'ACCPAY')) throw new Error('Xero returned a different invoice type');
  if (entity.CurrencyCode !== 'USD' || cents(entity.Total) !== cents(document.total) || entity.Contact?.ContactID !== document.party?.id) mismatch();
  const paid = cents(entity.AmountPaid);
  if (paid < 0n || paid > cents(entity.Total)) throw new Error('Xero returned inconsistent payment amounts');
  // AmountCredited and credit notes reduce AmountDue but are not cash paid.
  const state = ['authorised', 'paid'].includes(status)
    ? (status === 'paid' ? 'paid' : paid > 0n ? 'partial' : 'open') : status;
  return { id, status: state, paid: usd(paid) };
}

/** Xero Accounting API transport. No OAuth provisioning or production admission. */
export function createXeroAdapter(config: BooksAdapterConfig): BooksAdapter {
  const token = required(config.credentials.accessToken, 'Xero accessToken');
  const tenant = required(config.credentials.tenantId, 'Xero tenantId');
  const root = `${config.baseUrl.replace(/\/$/, '')}/api.xro/2.0/`;
  const headers = { Authorization: `Bearer ${token}`, 'Xero-tenant-id': tenant, Accept: 'application/json' };
  const request = (url: URL, init: RequestInit = {}, missing = false) => requestJson(config, 'Xero', url, { ...init, headers: { ...headers, ...init.headers } }, missing);
  const attachmentPath = (document: BookDocument) => {
    validateDocument(document);
    if (/[<>:"/\\|?*\0+]/.test(document.attachment!.name)) throw new Error('Unsupported Xero attachment filename');
    return `Invoices/${encodeURIComponent(document.remoteId!)}/Attachments`;
  };
  const receiptResult = (body: any, document: BookDocument): BookResult | null => {
    if (!Array.isArray(body?.Attachments)) throw new Error('Xero returned malformed attachment response');
    const rows = body.Attachments.filter((row: any) => row.FileName === document.attachment!.name &&
      String(row.ContentLength) === String(new TextEncoder().encode(document.attachment!.content).length));
    if (rows.some((row: any) => row.ValidationErrors?.length || row.HasErrors)) throw new Error('Xero rejected receipt evidence');
    if (rows.length > 1) throw new Error('Ambiguous Xero receipt attachments require reconciliation');
    if (rows.length) required(rows[0].AttachmentID, 'Xero attachment ID');
    return rows.length ? { id: document.remoteId!, status: 'attached', received: true } : null;
  };
  return {
    async post(document) {
      if (document.kind === 'credit') throw new Error('Return credit posting is supported by the Pantry connector; Xero credit mapping requires separate acceptance.');
      validateDocument(document);
      if (document.kind === 'receipt') {
        const url = new URL(`${attachmentPath(document)}/${encodeURIComponent(document.attachment!.name)}`, root);
        const body = await request(url, {
          method: 'PUT', headers: { 'Content-Type': 'text/plain', 'Idempotency-Key': document.key },
          body: document.attachment!.content,
        });
        const receipt = receiptResult(body, document);
        if (!receipt) throw new Error('Xero did not confirm receipt attachment on its bill');
        return receipt;
      }
      const endpoint = endpoints[document.kind];
      const body = await request(new URL(endpoint, root), {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': document.key },
        body: providerJson({ [endpoint]: [payload(document)] }),
      });
      const rows = body[endpoint];
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Xero returned malformed document response');
      return result(rows[0], document);
    },
    async read(document) {
      if (document.kind === 'credit') throw new Error('Return credit posting is supported by the Pantry connector; Xero credit mapping requires separate acceptance.');
      if (document.kind === 'receipt') {
        const body = await request(new URL(attachmentPath(document), root), {}, true);
        return body === null ? null : receiptResult(body, document);
      }
      const endpoint = endpoints[document.kind];
      const url = new URL(document.remoteId ? `${endpoint}/${encodeURIComponent(document.remoteId)}` : endpoint, root);
      if (!document.remoteId) {
        const field = document.kind === 'item' ? 'Code' : document.kind === 'journal' ? 'Narration' : 'InvoiceNumber';
        const type = document.kind === 'invoice' ? 'ACCREC' : 'ACCPAY';
        url.searchParams.set('where', `${field}==${JSON.stringify(document.reference)}${endpoint === 'Invoices' ? ` AND Type=="${type}"` : ''}`);
        // Unpaged invoice queries omit line details, which would prevent
        // detecting ledger-side account/line edits during reconciliation.
        if (endpoint === 'Invoices') { url.searchParams.set('page', '1'); url.searchParams.set('pageSize', '2'); }
      }
      const body = await request(url, {}, true);
      if (body === null) return null;
      const rows = body[endpoint];
      if (!Array.isArray(rows)) throw new Error('Xero returned malformed query response');
      if (rows.length > 1) throw new Error('Ambiguous Xero reference requires reconciliation');
      return rows.length ? result(rows[0], document) : null;
    },
  };
}
