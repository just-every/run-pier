import { decimal, format, type Row, type State } from '../model';
import { supplierBillViews } from './supplier-bills';

/** Follow every posted receipt, including the ones that have no invoice/job yet. */
export function receiptBookViews(s: State, connected: boolean) {
  const invoices = supplierBillViews(s);
  return s.receipts.map(receipt => {
    const approved = invoices.filter(bill => bill.poId === receipt.poId && ['approved', 'paid'].includes(bill.status));
    const allocations = approved.flatMap(bill => bill.match.lines.flatMap(line => line.receiptAllocations));
    const unbilled = receipt.lines.flatMap((line: Row) => {
      const covered = allocations.filter(a => a.receiptId === receipt.id && a.receiptLineId === line.id).reduce((n, a) => n + decimal(a.quantity), 0n);
      const remaining = decimal(line.quantity) - covered;
      return remaining > 0n ? [{ itemId: line.itemId, quantity: format(remaining) }] : [];
    });
    const bills = approved.filter(bill => bill.match.lines.some(line => line.receiptAllocations.some(a => a.receiptId === receipt.id)));
    const jobs = bills.map(bill => s.bookJobs.find(job => job.sourceKind === 'supplierBill' && job.sourceId === bill.id && job.kind === 'bill'));
    // Older receipt-generated obligations retain their actual ledger identity.
    const legacy = s.bookJobs.find(job => job.sourceKind === 'receipt' && job.sourceId === receipt.id && job.kind === 'bill' && job.key === `bill:${receipt.id}` && job.attempted);
    if (legacy) { unbilled.length = 0; jobs.push(legacy); }
    const hasReview = invoices.some(bill => bill.poId === receipt.poId && ['review', 'held'].includes(bill.status));
    const lateJobs = s.bookJobs.filter(j => j.sourceKind === 'receipt' && j.sourceId === receipt.id && j.key.startsWith('late-bill:'));
    jobs.push(...lateJobs);
    const receiptJournals = s.bookJobs.filter(job => job.sourceKind === 'receipt' && job.sourceId === receipt.id && job.kind === 'journal');
    const journalsPosted = receiptJournals.every(job => ['posted', 'reconciled'].includes(job.status));
    const postingProblem = [...jobs, ...receiptJournals].some(job => job && ['review', 'uncertain', 'skipped'].includes(job.status));
    const allPaid = jobs.length > 0 && jobs.every(job => job?.status === 'reconciled' && (lateJobs.includes(job) || job.received) && job.open === '0.00');
    const allReady = jobs.length > 0 && jobs.every(job => job && ['posted', 'reconciled'].includes(job.status) && (lateJobs.includes(job) || job.received) && (lateJobs.includes(job) || job.readyToPay || job.open === '0.00'));
    const status = receipt.status !== 'posted' ? 'reversed' : !connected ? 'connection' : unbilled.length ? hasReview ? 'review' : 'invoice' : postingProblem ? 'review' : bills.some(bill => !bill.received || !bill.match.withinTolerance) ? 'receiving' : allPaid && journalsPosted ? 'closed' : allReady && journalsPosted ? 'payment' : 'sync';
    return { id: receipt.id, poId: receipt.poId, reference: receipt.supplierReference, status, unbilled, invoiceIds: bills.map(bill => bill.id), jobIds: [...jobs.filter(Boolean), ...receiptJournals].map(job => job!.id), checkedAt: jobs.length && jobs.every(job => job?.checkedAt) ? jobs.map(job => job!.checkedAt).sort()[0] : null };
  });
}
