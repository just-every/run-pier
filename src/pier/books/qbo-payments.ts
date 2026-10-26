import { cents, usd } from './adapters/types';
import type { BookDocument } from './adapters/types';
import { qboClient } from './qbo-session';

/** Read actual cash allocations, never infer payment from a reduced invoice balance. */
export async function qboPayments(client: ReturnType<typeof qboClient>, doc: BookDocument, invoiceId: string, creditIds: string[] = []) {
  const customer = doc.party?.id;
  if (!customer || !/^\d+$/.test(customer)) throw new Error('Map the QuickBooks customer before reading payments.');
  const payments: { id: string; amount: string; date: string; source: string }[] = [];
  for (let start = 1; ; start += 1000) {
    const rows = await client.query(`select * from Payment where CustomerRef = '${customer}' startposition ${start} maxresults 1000`, 'Payment');
    for (const row of rows) {
      const lines = (row.Line ?? []).filter((line: any) => line.LinkedTxn?.some((link: any) => link.TxnId === invoiceId && link.TxnType === 'Invoice'));
      if (!lines.length) continue;
      if (row.CustomerRef?.value !== customer || !/^\d+$/.test(row.Id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.TxnDate)) throw new Error('QuickBooks returned inconsistent payment identity.');
      if(cents(row.TotalAmt)===0n){
        const creditLines=row.Line.filter((line:any)=>line.LinkedTxn?.length===1&&line.LinkedTxn[0].TxnType==='CreditMemo'&&creditIds.includes(line.LinkedTxn[0].TxnId));
        if(row.Line.length===2&&lines.length===1&&creditLines.length===1&&cents(lines[0].Amount)===cents(creditLines[0].Amount))continue;
        throw new Error('QuickBooks has an unrecognized non-cash credit allocation; reconcile its linked credit before continuing.');
      }
      if (row.Line.some((line: any) => line.LinkedTxn?.some((link: any) => link.TxnType !== 'Invoice'))) throw new Error('QuickBooks mixed cash and credit allocations need accountant review; no payment balance was inferred.');
      const total = cents(row.TotalAmt), allocated = row.Line.reduce((n: bigint, line: any) => n + cents(line.Amount), 0n);
      const value = lines.reduce((n: bigint, line: any) => n + cents(line.Amount), 0n);
      if (total <= 0n || allocated > total || value <= 0n || value > total || lines.some((line: any) => line.LinkedTxn.length !== 1)) throw new Error('QuickBooks payment allocation cannot be reconciled without review.');
      payments.push({ id: row.Id, amount: usd(value), date: row.TxnDate, source: typeof row.PrivateNote === 'string' ? row.PrivateNote : '' });
    }
    if (rows.length < 1000) break;
    if (start >= 100000) throw new Error('QuickBooks payment history exceeds this synchronization window; accountant review is required.');
  }
  return payments;
}
