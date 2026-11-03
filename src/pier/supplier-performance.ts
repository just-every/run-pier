import { decimal, format, SCALE, type Row, type State } from './model';

export const receiptConfirmation = (po: Row) => po.confirmation ? structuredClone({ ...po.confirmation, reply: po.supplierReplies?.find((reply: any) => reply.id === po.confirmation.replyId) ?? null }) : null;

const sum = (values: string[]) => values.reduce((total, value) => total + decimal(value), 0n);
// Exact decimal percentages, truncated (never rounded up) at six decimal places.
const percent = (part: bigint, total: bigint) => total ? format(part * 100n * SCALE / total) : null;

/** Current source-backed receipt performance, not a forecast or a supplier rating. */
export function supplierPerformance(s: State) {
  const committed = s.purchaseOrders.filter(po => po.status === 'committed');
  const suppliers = s.parties.filter(party => party.kind === 'supplier').map(supplier => {
    const orders = committed.filter(po => po.supplierId === supplier.id);
    const itemIds = [...new Set<string>(orders.flatMap(po => po.lines.map((line: any) => line.itemId)))];
    const items = itemIds.map(itemId => {
      const item = s.items.find(item => item.id === itemId)!;
      const purchaseLines = orders.flatMap(po => po.lines.filter((line: any) => line.itemId === itemId).map((line: any) => ({ poId: po.id, reference: po.reference, poLineId: line.id, quantity: line.quantity, unitPrice: line.price })));
      const receipts = orders.flatMap(po => s.receipts.filter(receipt => receipt.poId === po.id).flatMap(receipt => receipt.lines.filter((line: any) => line.itemId === itemId).map((line: any) => {
        const purchaseLine = po.lines.find((source: any) => source.id === line.poLineId)!;
        // Never infer an old receipt's promise from today's editable PO date.
        const confirmation = receipt.supplierConfirmation ?? null;
        const receivedDate = receipt.createdAt.slice(0, 10);
        const timing = receipt.status !== 'posted' ? 'excluded' : !confirmation ? 'unknown' : receivedDate <= confirmation.promiseDate ? 'on-time' : 'late';
        return { receiptId: receipt.id, receiptLineId: line.id, supplierReference: receipt.supplierReference, poId: po.id, poLineId: line.poLineId, status: receipt.status, receivedAt: receipt.createdAt, receivedDate, confirmation, quantity: line.quantity, unitPrice: line.cost, poUnitPrice: purchaseLine.price, priceDifference: format(decimal(line.cost) - decimal(purchaseLine.price)), timing,
          exclusion: receipt.status !== 'posted' ? 'Receipt reversed; retained for traceability, excluded from all quantities.' : !confirmation ? 'No supplier confirmation retained at receipt; excluded from on-time denominator.' : null,
          corrections: receipt.corrections ?? [], inspections: (receipt.inspections ?? []).filter((inspection: any) => inspection.receiptLineId === line.id) };
      })));
      const posted = receipts.filter(receipt => receipt.status === 'posted');
      const ordered = sum(purchaseLines.map(line => line.quantity));
      const received = sum(posted.map(receipt => receipt.quantity));
      const onTime = sum(posted.filter(receipt => receipt.timing === 'on-time').map(receipt => receipt.quantity));
      const late = sum(posted.filter(receipt => receipt.timing === 'late').map(receipt => receipt.quantity));
      const unknown = received - onTime - late;
      // Defects come only from recorded inspections of posted receipts; uninspected goods are not assumed good.
      const inspections = posted.flatMap(receipt => receipt.inspections);
      const inspected = sum(inspections.map((i: any) => i.inspectedQuantity)), defective = sum(inspections.map((i: any) => i.defectiveQuantity));
      return { itemId, sku: item.sku, unit: item.unit, orderedQuantity: format(ordered), receivedQuantity: format(received), outstandingQuantity: format(ordered > received ? ordered - received : 0n), excessQuantity: format(received > ordered ? received - ordered : 0n), fillPercent: percent(received, ordered), onTimeQuantity: format(onTime), lateQuantity: format(late), unknownTimingQuantity: format(unknown), onTimePercent: percent(onTime, onTime + late), inspectedQuantity: format(inspected), defectiveQuantity: format(defective), uninspectedQuantity: format(received - inspected), defectPercent: percent(defective, inspected), purchaseLines, receipts };
    });
    return { supplierId: supplier.id, name: supplier.name, items };
  });
  return { basis: 'Current committed purchase lines and unreversed posted receipts, grouped by supplier and SKU in base units.', timezone: 'UTC', percentageRounding: 'Truncated to six decimal places; null when the denominator is zero.', defectBasis: 'Defective quantity divided by inspected quantity from recorded inspections of unreversed posted receipts; uninspected quantity is reported, not assumed good. Stock corrections and customer returns are never counted as supplier defects.', suppliers };
}
