import { catalogue } from './catalogue';
import { parseCSV } from './import-csv';
import { fail, Problem, requireRole, type Context, type Row } from './model';

const columns = ['sku', 'name', 'unit', 'packSize', 'barcode', 'caseBarcode', 'variantFamily', 'category', 'imageUrl', 'weight', 'length', 'width', 'height', 'dimensionUnit', 'barcodes', 'references', 'archived'];
function inputs(csv: unknown) {
  if (typeof csv !== 'string' || new TextEncoder().encode(csv).length > 1024 * 1024) fail('CATALOGUE_SIZE', 'Upload a CSV of at most 1 MiB.');
  const [header, ...rows] = parseCSV(csv as string);
  if (!header || ['sku', 'name', 'unit', 'packSize'].some(k => !header.includes(k)) || new Set(header).size !== header.length || header.some(k => !columns.includes(k)))
    fail('CATALOGUE_CSV', 'Use unique supported columns including sku,name,unit,packSize.');
  if (!rows.length || rows.length > 200) fail('CATALOGUE_SIZE', 'Use 1–200 catalogue rows per review.');
  return { header, rows };
}
function affected(c: Context, itemId: string) {
  return (['orders', 'purchaseOrders', 'receipts', 'counts', 'supplierItems', 'shipments'] as const).flatMap(kind =>
    c.s[kind].filter(d => d.itemId === itemId || d.lines?.some((l: any) => l.itemId === itemId)).map(d => ({ kind, id: d.id })));
}

/** Evaluate the exact same commands as individual edits on an isolated state.
 * No preview writes business data, command outcomes, or source files. */
export function previewCatalogue(c: Context, csv: unknown) {
  requireRole(c, ['operator', 'buyer', 'warehouse']);
  const { header, rows } = inputs(csv), trial: Context = { ...c, s: structuredClone(c.s) };
  const errors: { line: number; code: string; message: string; details?: unknown }[] = [];
  const resolved: { line: number; item: Row; affectedDocuments: {kind: string; id: string}[] }[] = [];
  const seen = new Set<string>();
  for (const [index, cells] of rows.entries()) {
    const line = index + 2;
    try {
      if (cells.length !== header.length) fail('CATALOGUE_CSV', 'The row must contain exactly one cell per header.');
      const p: any = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
      const skuKey = String(p.sku).trim().toLowerCase();
      if (seen.has(skuKey)) fail('DUPLICATE', `SKU ${p.sku} appears more than once in this file.`);
      seen.add(skuKey);
      const old = trial.s.items.find(i => i.sku === p.sku.trim());
      if (old) Object.assign(p, { id: old.id, version: old.version });
      for (const field of ['barcodes', 'references']) if (field in p) {
        try { p[field] = JSON.parse(p[field] || '[]'); } catch { fail('CATALOGUE_CSV', `${field} must be a JSON array in a quoted CSV cell.`); }
      }
      if (['length', 'width', 'height', 'dimensionUnit'].some(k => k in p)) {
        p.dimensions = !p.length && !p.width && !p.height ? null : { length: p.length, width: p.width, height: p.height, unit: p.dimensionUnit };
      }
      if ('archived' in p) {
        if (!['true', 'false', ''].includes(p.archived)) fail('CATALOGUE_CSV', 'archived must be true or false.');
        p.archived = p.archived === 'true';
      } else p.archived = old?.archived ?? false;
      // Omitted columns retain established barcode identities and metadata.
      if (old) for (const k of ['barcode', 'caseBarcode']) if (!(k in p)) p[k] = old[k];
      const item = catalogue(trial, 'item.save', p)!;
      resolved.push({ line, item: structuredClone(item), affectedDocuments: old ? affected(c, old.id) : [] });
    } catch (e) {
      if (!(e instanceof Problem)) throw e;
      errors.push({ line, code: e.code, message: e.message, details: e.details });
    }
  }
  return { stateVersion: c.s.version, rows: resolved, errors, trial };
}
export function catalogueBulk(c: Context, type: string, p: any): Row | undefined {
  if (type !== 'catalogue.apply') return;
  requireRole(c, ['operator', 'buyer', 'warehouse']);
  if (p.stateVersion !== c.s.version) fail('STALE', 'Stock or documents changed. Preview the catalogue file again before applying.');
  const preview = previewCatalogue(c, p.csv);
  if (preview.errors.length) fail('CATALOGUE_REVIEW', 'Resolve every catalogue row error before applying.', preview.errors);
  c.s.items = preview.trial.s.items;
  return { id: c.commandId, version: 1, items: preview.rows.map(r => r.item), sourceCsv: p.csv, reviewedStateVersion: p.stateVersion, appliedBy: c.actor.id };
}
