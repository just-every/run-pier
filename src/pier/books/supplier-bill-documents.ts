import { decimal, fail, format, get, SCALE, text, type Row, type State } from '../model';

/** Operator-transcribed evidence stays beside the original, never inferred from it. */
export function billDocuments(p: any, po: Row) {
  if (p.documents == null) return null;
  const documents: Record<string, any> = {};
  for (const kind of ['invoice', 'bol']) {
    const source = p.documents[kind];
    if (!source) continue;
    if (!Array.isArray(source.lines) || !source.lines.length || source.lines.length > po.lines.length) fail('SUPPLIER_DOCUMENT', 'Add document lines from this purchase order.');
    const seen = new Set<string>();
    const lines = source.lines.map((line: any) => {
      if (!po.lines.some((l: any) => l.id === line.poLineId) || seen.has(line.poLineId)) fail('SUPPLIER_DOCUMENT', 'Use each PO line once on a source document.');
      seen.add(line.poLineId);
      const quantity = decimal(line.quantity, true), packSize = decimal(line.packSize, true);
      const product = quantity * packSize;
      if (product % SCALE) fail('SUPPLIER_DOCUMENT', 'Document pack conversion must be exact to six decimal places.');
      // Apply the same supported quantity bound as native invoice lines.
      const baseQuantity = format(product / SCALE); decimal(baseQuantity, true);
      return { poLineId: line.poLineId, quantity: format(quantity), packSize: format(packSize), unit: text(line.unit, 'Document base unit'), baseQuantity };
    });
    text(source.original, 'Original document text');
    documents[kind] = { reference: text(source.reference, 'Source document reference'), original: source.original, lines };
  }
  if (!documents.invoice) fail('SUPPLIER_DOCUMENT', 'Retain the invoice source alongside any BOL.');
  return documents;
}

export function documentMatch(s: State, bill: Row, po: Row) {
  const differences: { kind: string; message: string; withinTolerance: boolean; poLineId?: string }[] = [];
  for (const kind of ['invoice', 'bol']) {
    const source = bill.documents?.[kind];
    if (!source) continue;
    for (const line of bill.lines) {
      const sourceLine = source.lines.find((l: any) => l.poLineId === line.poLineId);
      const item = get(s, 'items', line.itemId), committed = po.lines.find((l: any) => l.id === line.poLineId);
      const add = (reason: string) => differences.push({ kind: `${kind}Document`, poLineId: line.poLineId, message: `${kind === 'bol' ? 'BOL' : 'Invoice'} ${source.reference}: ${reason}`, withinTolerance: false });
      if (!sourceLine) { add(`no source line supports ${item.sku}.`); continue; }
      if (sourceLine.unit !== item.unit) add(`base unit ${sourceLine.unit} differs from ${item.unit}.`);
      const expectedPack = committed.terms?.packSize ?? item.packSize;
      if (sourceLine.packSize !== '1' && sourceLine.packSize !== expectedPack) add(`pack ${sourceLine.packSize} differs from committed conversion ${expectedPack}.`);
      if (sourceLine.baseQuantity !== line.quantity) add(`${sourceLine.quantity} × ${sourceLine.packSize} = ${sourceLine.baseQuantity} base units; invoice bills ${line.quantity}.`);
    }
    for (const sourceLine of source.lines) if (!bill.lines.some((l: any) => l.poLineId === sourceLine.poLineId)) differences.push({ kind: `${kind}Document`, poLineId: sourceLine.poLineId, message: `${source.reference}: source line is absent from this invoice.`, withinTolerance: false });
  }
  return differences;
}
