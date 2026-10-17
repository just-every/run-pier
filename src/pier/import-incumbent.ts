import { decimal, format, fail, text } from './model';
import { canonicalJson, sha256, type SourceBundle } from './import-kit';
import { parseCSV } from './import-csv';
import { fishbowlPurchase, moveInFields, providerNames, type ExportFile, type ExportRow } from './import-layouts';
import { reconcileMoveIn } from './import-reconcile';

type Mapped = { kind: string; payload: Record<string, string>; original: Record<string, string>; artifactHash: string; location: { artifact: string; row: number } };
export function incumbentSource(p: any) {
  if (!providerNames[p.provider]) fail('IMPORT_PROVIDER', 'Choose Cin7 Core, inFlow Inventory or Fishbowl Warehouse.');
  if (!Array.isArray(p.files) || !p.files.length || p.files.length > 20) fail('FILES', 'Supply 1–20 original CSV files.');
  const source: SourceBundle = { records: [], artifacts: [], diagnostics: [] };
  const mapped: Mapped[] = [], coverage: any[] = [], excluded: any[] = [];
  const issue = (code: string, message: string, location?: { artifact: string; row: number }, field?: string) => source.diagnostics.push({ severity: 'error', code, message, ...(location ? { location } : {}), ...(field ? { field } : {}) });
  for (const file of p.files as ExportFile[]) {
    const name = text(file.name), bytes = new TextEncoder().encode(file.csv);
    if (typeof file.csv !== 'string' || bytes.length > 1024 * 1024) fail('CSV_SIZE', 'Each original file must be at most 1 MiB.');
    if (source.artifacts.some(a => a.name === name)) fail('FILES', 'Original file names must be unique.');
    const artifactHash = sha256(bytes);
    source.artifacts.push({ name, sha256: artifactHash, size: bytes.length, original: { status: 'available', base64: btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')) } });
    try {
      const all = parseCSV(file.csv);
      if (all.length > 1002) fail('CSV_ROWS', 'At most 1000 data rows per export file.');
      const mixed = file.layout === 'fishbowl-purchase';
      if (mixed && (p.provider !== 'fishbowl' || file.kind !== 'purchaseOrders')) fail('CSV_LAYOUT', 'Fishbowl purchase layout requires a Fishbowl purchase-order file.');
      const header = all[0] ?? [];
      if (!mixed && (!header.length || new Set(header).size !== header.length || header.some(h => !h))) fail('CSV_HEADERS', 'Provide unique non-empty column names.');
      const rows: ExportRow[] = mixed ? fishbowlPurchase(all) : all.slice(1).map((cells, i) => {
        if (cells.length !== header.length) fail('CSV_COLUMNS', `Row ${i + 2} has ${cells.length} cells; expected ${header.length}.`);
        return { values: Object.fromEntries(header.map((h, n) => [h, cells[n]])), headers: header, row: i + 2 };
      });
      const allowed = moveInFields[file.kind];
      if (!allowed) fail('CSV_KIND', 'Choose the export content type.');
      const columns = file.columns ?? {}, constants = file.constants ?? {};
      for (const field of [...Object.keys(columns), ...Object.keys(constants)]) {
        if (!allowed.includes(field)) issue('MAPPING_FIELD', `Unknown target field ${field}.`, { artifact: name, row: 1 }, field);
        if (field in columns && field in constants) issue('MAPPING_FIELD', `Choose a column or a constant for ${field}, not both.`, { artifact: name, row: 1 }, field);
      }
      const headers = [...new Set(rows.flatMap(r => r.headers).concat(header))];
      for (const [field, column] of Object.entries(columns)) if (!headers.includes(column) && !(mixed && column === '@line')) issue('MISSING_COLUMN', `Mapped column ${column} for ${field} does not exist.`, { artifact: name, row: 1 }, column);
      for (const column of headers) {
        if (mixed && ['PO', 'Item'].includes(column)) continue;
        const fields = Object.entries(columns).filter(([, c]) => c === column).map(([f]) => f);
        const reason = file.archivedColumns?.[column];
        const archived = file.kind === 'archive' ? file.archiveReason : reason;
        coverage.push({ artifact: name, column, fields, reason: archived ?? '', disposition: fields.length ? 'mapped' : archived?.trim() ? 'retained only' : 'unmapped' });
        if (!fields.length && !archived?.trim()) issue('UNMAPPED_COLUMN', `Unmapped column “${column}”. Map it or record why it stays in the retained archive.`, { artifact: name, row: 1 }, column);
      }
      const documentLines = new Map<string, number>();
      for (const row of rows) {
        const location = { artifact: name, row: row.row };
        if (row.values['@invalid']) { issue('UNMAPPED_ROW', 'Unrecognized Fishbowl record or missing PO/Item header.', location); continue; }
        if (file.kind === 'archive') { excluded.push({ location, reason: text(file.archiveReason), original: row.values }); continue; }
        if (row.values['@record'] === 'PO') continue;
        try {
          if (mixed && row.values.Status !== '20') fail('OPEN_DOCUMENT', 'Only issued Fishbowl POs (Status 20) may become expected receipts.');
          if (mixed && row.values.POItemTypeID !== '10') fail('UNSUPPORTED_ROW', 'Only Fishbowl purchase item type 10 maps to an open stock purchase line. Retain other line types separately.');
          if (row.values.InventoryStatus && row.values.InventoryStatus !== 'Unfulfilled') fail('OPEN_DOCUMENT', 'This inFlow order export includes fulfilled or partially fulfilled processing state. Supply reviewed remaining-line evidence separately.');
          if (row.values.PartType && row.values.PartType !== 'Inventory' && file.kind === 'items') fail('UNSUPPORTED_ROW', 'Only inventory parts are supported in this opening-stock mapping.');
          if (row.values.ItemType && row.values.ItemType !== 'Stockable' && file.kind === 'items') fail('UNSUPPORTED_ROW', 'Only stockable inFlow products are supported in this opening-stock mapping.');
          if (Object.entries(row.values).some(([field, value]) => (field.startsWith('Tracking-') || field === 'Serial') && value.trim())) fail('UNSUPPORTED_TRACKING', 'Populated lot/serial tracking cannot be opened as untracked stock. Retain and reconcile these rows separately.');
          for (const field of ['Currency', 'CurrencyCode', 'CurrencyName']) {
            const currency = row.values[field];
            if (currency && !['USD', 'US Dollar', 'US Dollars'].includes(currency)) fail('CURRENCY', `Source ${field} is ${currency}; provide independently reviewed USD values before cutover.`);
          }
          const payload: Record<string, string> = { ...constants };
          for (const [field, column] of Object.entries(columns)) payload[field] = row.values[column] ?? '';
          if ((file.kind === 'positions' || file.kind === 'controls') && !payload.locationKey) {
            payload.locationKey = JSON.stringify([text(payload.warehouse, 'Warehouse'), text(payload.bin, 'Bin')]);
          }
          if (file.kind === 'purchaseOrders' || file.kind === 'orders') {
            const document = text(file.kind === 'purchaseOrders' ? payload.poKey : payload.orderKey);
            const ordinal = (documentLines.get(document) ?? 0) + 1; documentLines.set(document, ordinal);
            if (file.lineIdentity === 'document-ordinal' && !payload.key) payload.key = `${document}:line:${ordinal}`;
            if (!['remaining', 'ordered-less-fulfilled'].includes(file.quantityMeaning ?? '')) fail('OPEN_QUANTITY', 'State whether the source quantity is remaining, or ordered less fulfilled.');
            if (file.quantityMeaning === 'ordered-less-fulfilled' && payload.fulfilled === undefined) fail('OPEN_QUANTITY', 'Map the fulfilled quantity before computing remaining demand.');
            if (file.quantityMeaning === 'ordered-less-fulfilled') payload.quantity = format(decimal(payload.quantity) - decimal(payload.fulfilled));
            if (decimal(payload.quantity) <= 0n) fail('OPEN_DOCUMENT', 'Only positive remaining open quantities can be imported.');
            if (file.dateFormat === 'M/D/YYYY') {
              // inFlow writes a midnight time after the date ("11/1/2026 0:00"); any other time is refused.
              const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: 0?0:00(?::00)?)?$/.exec(payload.promiseDate) ?? fail('DATE', 'Expected an explicit M/D/YYYY promise date.');
              payload.promiseDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
            }
          }
          mapped.push({ kind: file.kind, payload, original: row.values, artifactHash, location });
        } catch (error) { issue((error as any).code ?? 'MAPPING', (error as Error).message, location); }
      }
    } catch (error) { issue((error as any).code ?? 'CSV', (error as Error).message, { artifact: name, row: 1 }); }
  }
  const items = new Map(mapped.filter(r => r.kind === 'items').map(r => [r.payload.key, r.payload]));
  const seen = new Set<string>(), positions = new Set<string>();
  const derivedLocations = new Set<string>();
  for (const row of mapped.filter(r => r.kind === 'positions' && r.payload.warehouse && r.payload.bin)) {
    const payload = { key: row.payload.locationKey, name: row.payload.bin, warehouse: row.payload.warehouse, kind: 'bin' };
    if (derivedLocations.has(payload.key)) continue;
    derivedLocations.add(payload.key);
    if (!mapped.some(r => r.kind === 'locations' && r.payload.key === payload.key)) mapped.push({ ...row, kind: 'locations', payload });
  }
  for (const row of mapped.filter(r => r.kind !== 'controls')) {
    try {
      const payload = { ...row.payload }, kind = ['suppliers', 'customers'].includes(row.kind) ? 'parties' : row.kind;
      if (row.kind === 'suppliers' || row.kind === 'customers') { payload.key = `${row.kind}:${text(payload.key)}`; payload.kind = row.kind === 'suppliers' ? 'supplier' : 'customer'; }
      if (kind === 'purchaseOrders') payload.supplierKey = `suppliers:${text(payload.supplierKey)}`;
      if (kind === 'orders') payload.customerKey = `customers:${text(payload.customerKey)}`;
      if (['positions', 'orders', 'purchaseOrders'].includes(kind)) {
        const item = items.get(payload.itemKey);
        // Unit/cost joins are exact source-key joins, never SKU/name fuzzy matches.
        if (!('unit' in payload) && item) payload.unit = item.unit;
        if (kind === 'positions' && !('cost' in payload) && item?.openingCost !== undefined) payload.cost = item.openingCost;
      }
      if (kind === 'positions' && !('key' in payload)) payload.key = JSON.stringify([payload.itemKey, payload.locationKey, payload.status]);
      text(payload.key, 'Stable source key');
      const identity = `${kind}:${payload.key}`;
      if (seen.has(identity)) fail('DUPLICATE', `Duplicate ${identity}.`);
      seen.add(identity);
      if (kind === 'positions') {
        const identity = JSON.stringify([payload.itemKey, payload.locationKey, payload.status]);
        if (positions.has(identity)) fail('DUPLICATE', 'Multiple source rows name the same item/bin/status. Reconcile the source before opening stock.');
        positions.add(identity);
      }
      source.records.push({ namespace: text(p.namespace), kind, sourceId: payload.key, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: row.artifactHash, location: row.location });
    } catch (error) { issue((error as any).code ?? 'MAPPING', (error as Error).message, row.location); }
  }
  const controls = reconcileMoveIn(source, mapped.filter(r => r.kind === 'controls'));
  return { source, review: { provider: p.provider, coverage, excluded, controls, mappings: p.files.map(({ csv, ...file }: ExportFile) => file), sourceRows: mapped.map(row => ({ kind: row.kind, location: row.location, original: row.original, mapped: row.payload })) } };
}
