import { fail } from './model';
/** Reviewed target fields; vendor column names are explicit inputs, never guessed. */
export const moveInFields: Record<string, string[]> = {
  items: ['key', 'sku', 'name', 'barcode', 'unit', 'packSize', 'openingCost'],
  locations: ['key', 'name', 'warehouse', 'kind'],
  suppliers: ['key', 'name'],
  customers: ['key', 'name'],
  positions: ['key', 'itemKey', 'locationKey', 'status', 'quantity', 'unit', 'cost', 'warehouse', 'bin'],
  orders: ['key', 'orderKey', 'customerKey', 'itemKey', 'quantity', 'fulfilled', 'unit', 'promiseDate'],
  purchaseOrders: ['key', 'poKey', 'supplierKey', 'itemKey', 'quantity', 'fulfilled', 'unit', 'price', 'promiseDate'],
  controls: ['locationKey', 'warehouse', 'bin', 'unit', 'quantity', 'value'],
  archive: [],
};
export const providerNames: Record<string, string> = { 'cin7-core': 'Cin7 Core', inflow: 'inFlow Inventory', fishbowl: 'Fishbowl Warehouse' };
export type ExportFile = { name: string; kind: string; csv: string; columns?: Record<string, string>; constants?: Record<string, string>; archivedColumns?: Record<string, string>; archiveReason?: string; layout?: string; dateFormat?: string; lineIdentity?: string; quantityMeaning?: string; blankBin?: string; excludedRows?: Record<string, string> };
export type ExportRow = { values: Record<string, string>; row: number; headers: string[] };

/** Fishbowl's native PO file has two header/record shapes, not a flat table. */
export function fishbowlPurchase(rows: string[][]): ExportRow[] {
  const out: ExportRow[] = [];
  let poHeader: string[] = [], itemHeader: string[] = [], po: Record<string, string> = {}, line = 0;
  for (const [index, cells] of rows.entries()) {
    if (cells[0] === 'PO' && cells[1] === 'PONum') { poHeader = cells; continue; }
    if (cells[0] === 'Item' && cells[1] === 'POItemTypeID') { itemHeader = cells; continue; }
    if (cells[0] === 'PO' && poHeader.length) {
      if (cells.length !== poHeader.length) fail('CSV_COLUMNS', `Fishbowl PO row ${index + 1} has a different number of cells from its header.`);
      po = Object.fromEntries(poHeader.map((h, n) => [h, cells[n] ?? ''])); line = 0;
      // Header evidence remains accounted for by the following item rows.
      out.push({ values: { ...po, '@record': 'PO' }, row: index + 1, headers: poHeader });
    } else if (cells[0] === 'Item' && itemHeader.length && po.PONum) {
      if (cells.length !== itemHeader.length) fail('CSV_COLUMNS', `Fishbowl item row ${index + 1} has a different number of cells from its header.`);
      line++;
      out.push({ values: { ...po, ...Object.fromEntries(itemHeader.map((h, n) => [h, cells[n] ?? ''])), '@line': `${po.PONum}:line:${line}`, '@record': 'Item' }, row: index + 1, headers: [...new Set([...poHeader, ...itemHeader])] });
    } else out.push({ values: { '@invalid': cells.join(',') }, row: index + 1, headers: [] });
  }
  return out;
}
