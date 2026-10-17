import type { State } from '../model';
import { sha256 } from '../import-kit';
import { supplierReceiptState } from './supplier-bills';
import type { BookDocument } from './adapters/types';

/** Pantry v0.2 exposes linked documents, but no native payable receiving field. */
export function withReceiptState(s: State, sourceId: string, document: BookDocument): BookDocument {
  const bill = s.supplierBills.find(b => b.id === sourceId);
  if (!bill) throw new Error('The approved supplier invoice is missing. Review its source before syncing.');
  const current = supplierReceiptState(s, bill);
  const content = JSON.stringify({
    source: 'Pier supplier invoice receipt state', invoiceReference: bill.reference,
    purchaseOrderId: bill.poId, received: current.received, readyToPay: current.readyToPay,
    receiptEvidence: JSON.parse(current.evidence),
    meaning: 'Goods receipt readiness only. Payments and the open payable balance are recorded separately in Pantry.',
  }, null, 2);
  return { ...document, receiptState: {
    received: current.received, readyToPay: current.readyToPay,
    attachment: { name: `${document.reference}-receipt-state-${sha256(content).slice(0, 20)}.txt`, content },
  } };
}
