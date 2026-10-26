import { cents, usd } from './adapters/types';
import { qboClient } from './qbo-session';

/** Expenses have no reliable Account.CurrentBalance; use the accrual report. */
export async function qboCogs(client: ReturnType<typeof qboClient>, accountId: string, from: string, through: string) {
  const report = await client.request('./reports/ProfitAndLoss?' + new URLSearchParams({ start_date: from, end_date: through, accounting_method: 'Accrual', summarize_column_by: 'Total' }));
  if (report.Header?.ReportBasis !== 'Accrual' || report.Header?.Currency !== 'USD' || report.Header?.StartPeriod !== from || report.Header?.EndPeriod !== through) throw new Error('QuickBooks returned a different report basis, currency or period.');
  const columns = report.Columns?.Column;
  if (!Array.isArray(columns)) throw new Error('QuickBooks returned no report columns.');
  const money = columns.flatMap((column: any, index: number) => column.ColType === 'Money' ? [index] : []);
  if (money.length !== 1) throw new Error('QuickBooks report must contain one total money column.');
  const rows: any[] = [];
  const visit = (items: any) => {
    if (!Array.isArray(items)) throw new Error('QuickBooks returned malformed report rows.');
    for (const row of items) {
      if (row.type === 'Data' && row.ColData?.[0]?.id === accountId) rows.push(row);
      if (row.Rows) visit(row.Rows.Row);
    }
  };
  visit(report.Rows?.Row);
  if (rows.length !== 1) throw new Error('The mapped cost-of-goods account has no unique report total. Review it in QuickBooks.');
  return usd(cents(rows[0].ColData[money[0]]?.value));
}
