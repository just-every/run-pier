import type { BooksAdapterConfig, BookDocument } from './adapters/types';
import { cents, numeric, providerJson, requestJson, usd } from './adapters/types';
import { qboClient } from './qbo-session';
import { sha256 } from '../import-kit';

/** A zero-cash Payment explicitly links a retained credit to its named invoice. */
export async function applyQboCredit(config: BooksAdapterConfig, doc: BookDocument, creditId: string) {
  const client = qboClient(config.baseUrl, config.credentials, config.fetch);
  const reference = doc.creditForReference!;
  const invoices = await client.query(`select * from Invoice where DocNumber = '${reference.replace(/'/g, "\\'")}' maxresults 2`, 'Invoice');
  if (invoices.length !== 1 || invoices[0].CustomerRef?.value !== doc.party?.id) throw new Error('Resolve the exact original QuickBooks invoice before applying its credit.');
  const invoice = invoices[0], identity = `P-${sha256(`${doc.key}:application`).slice(0, 19)}`;
  const root = `${config.baseUrl}/v3/company/${encodeURIComponent(config.credentials.realmId)}/`;
  const note = `Pier credit ${creditId} for invoice ${invoice.Id}`;
  const matches = (payment: any) => {
    const lines = payment.Line ?? [];
    return payment.CustomerRef?.value === doc.party?.id && cents(payment.TotalAmt) === 0n && lines.length === 2
      && lines.every((line: any) => cents(line.Amount) === cents(doc.total) && line.LinkedTxn?.length === 1)
      && lines.some((line: any) => line.LinkedTxn[0].TxnType === 'Invoice' && line.LinkedTxn[0].TxnId === invoice.Id)
      && lines.some((line: any) => line.LinkedTxn[0].TxnType === 'CreditMemo' && line.LinkedTxn[0].TxnId === creditId);
  };
  const payments = await client.query(`select * from Payment where CustomerRef = '${doc.party!.id}' maxresults 1000`, 'Payment');
  const applications = payments.filter(matches);
  if (applications.length > 1) throw new Error('QuickBooks has duplicate credit applications. Reconcile them before continuing.');
  if (applications.length === 1) return { id: applications[0].Id, amount: usd(cents(doc.total)) };
  if (payments.length === 1000) throw new Error('Review this customer credit history before applying another credit.');
  const credit = (await client.request(`creditmemo/${encodeURIComponent(creditId)}`)).CreditMemo;
  if (cents(invoice.Balance) < cents(doc.total) || credit.RemainingCredit !== undefined && cents(credit.RemainingCredit) !== cents(doc.total)) throw new Error('The named invoice or credit no longer has its approved open amount. Reconcile in QuickBooks.');
  const body = { TxnDate: doc.date, PaymentRefNum: identity, PrivateNote: note, TotalAmt: 0, CustomerRef: { value: doc.party!.id }, Line: [
    { Amount: numeric(doc.total), LinkedTxn: [{ TxnId: invoice.Id, TxnType: 'Invoice' }] },
    { Amount: numeric(doc.total), LinkedTxn: [{ TxnId: creditId, TxnType: 'CreditMemo' }] },
  ] };
  const url = new URL('payment', root); url.searchParams.set('requestid', sha256(`${doc.key}:application`).slice(0, 48));
  const response = await requestJson(config, 'QBO', url, { method: 'POST', headers: { Authorization: `Bearer ${config.credentials.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: providerJson(body) });
  if (!matches(response.Payment) || response.Payment.PaymentRefNum !== identity || response.Payment.PrivateNote !== note) throw new Error('QuickBooks did not confirm the exact credit application.');
  return { id: response.Payment.Id, amount: usd(cents(doc.total)) };
}
