import type { ExportFile } from './import-layouts';

// Each incumbent system's standard exports, recognised by their header row.
// A preset maps every Pier field it can and gives every other column a reason
// to stay in the retained original, so the owner confirms or adjusts rather
// than mapping by hand. Column names come from the vendors' published export
// and import formats (docs/move-in.md lists the references).

type Candidates = string[];
export type Preset = {
  id: string; label: string; kind: string; fileHint?: RegExp;
  signature: Candidates[]; columns: Record<string, Candidates>; constants?: Record<string, string>;
  reasons?: Record<string, string>; layout?: string; lineIdentity?: string; quantityMeaning?: string; dateFormat?: string;
};
export type SystemGuide = { menu: string; exports: { label: string; how: string }[] };

const CURRENCY = 'Checked as USD on every row; any other currency is refused.';
const TRACKING = 'Must be empty: Pier refuses populated serial or lot values, which need their own move-in.';
const controls = (location: boolean): Preset => ({
  id: location ? 'controls-location' : 'controls', label: 'Stock check file', kind: 'controls', fileHint: /check|control|valuation/i,
  signature: [location ? ['Location', 'Bin identity'] : ['Warehouse'], ...(location ? [] : [['Bin']]), ['Value', 'USD value', 'Total value']],
  columns: { ...(location ? { locationKey: ['Location', 'Bin identity'] } : { warehouse: ['Warehouse'], bin: ['Bin'] }), unit: ['Unit', 'Base unit', 'UOM'], quantity: ['Quantity', 'Units', 'Qty', 'On Hand'], value: ['Value', 'USD value', 'Total value'] },
});

export const systemGuides: Record<string, SystemGuide> = {
  'cin7-core': { menu: 'In Cin7 Core, save each of these as CSV (a report exported to Excel needs File → Save as → CSV UTF-8):', exports: [
    { label: 'Products', how: 'Inventory → Products → Export' },
    { label: 'Stock on hand by bin', how: 'Reports → Product Availability, with Location and Bin shown → Export' },
    { label: 'Open purchase orders', how: 'Reports → Purchase Order Details, only wholly unreceived lines → Export' },
    { label: 'Suppliers', how: 'Purchases → Suppliers → Export' },
    { label: 'Customers', how: 'Sales → Customers → Export' },
  ] },
  inflow: { menu: 'In inFlow, open Settings (bottom left) → Export, then export each of these (desktop inFlow: Main Menu → General → Export Data):', exports: [
    { label: 'Product details', how: 'Settings → Export → Product details' },
    { label: 'Stock levels', how: 'Settings → Export → Stock levels' },
    { label: 'Purchase orders', how: 'Settings → Export → Purchase orders, only unfulfilled orders' },
    { label: 'Vendors', how: 'Settings → Export → Vendors' },
    { label: 'Customers', how: 'Settings → Export → Customers' },
  ] },
  fishbowl: { menu: 'In the Fishbowl client, choose File → Export and export each of these:', exports: [
    { label: 'Part', how: 'File → Export → Part' },
    { label: 'Inventory Quantities', how: 'File → Export → Inventory Quantities' },
    { label: 'Locations', how: 'File → Export → Location' },
    { label: 'Purchase Order', how: 'File → Export → Purchase Order, issued orders only' },
    { label: 'Vendors', how: 'File → Export → Vendor' },
    { label: 'Customers', how: 'File → Export → Customer' },
  ] },
};

export const presets: Record<string, Preset[]> = {
  'cin7-core': [
    { id: 'products', label: 'Products', kind: 'items', signature: [['SKU', 'ProductCode'], ['Product', 'Name', 'ProductName'], ['Unit', 'UOM']], columns: { key: ['SKU', 'ProductCode'], sku: ['SKU', 'ProductCode'], name: ['Product', 'Name', 'ProductName'], unit: ['Unit', 'UOM'], barcode: ['Barcode'] }, constants: { packSize: '1' }, reasons: { Family: 'Variant family stays in the original; each variant is its own SKU.' } },
    { id: 'availability', label: 'Product Availability', kind: 'positions', signature: [['SKU', 'ProductCode'], ['Location'], ['Bin'], ['On Hand', 'OnHand']], columns: { itemKey: ['SKU', 'ProductCode'], warehouse: ['Location'], bin: ['Bin'], quantity: ['On Hand', 'OnHand'], unit: ['Unit', 'UOM'], cost: ['Unit Cost', 'UnitCost'] }, constants: { status: 'sellable' }, reasons: { Allocated: 'Pier reserves from on-hand itself.', Available: 'Pier works out available stock itself.', Batch: TRACKING, 'Batch/Serial': TRACKING } },
    { id: 'purchase-orders', label: 'Purchase Order Details', kind: 'purchaseOrders', signature: [['PO #', 'Order Number', 'OrderNumber'], ['Supplier'], ['SKU', 'ProductCode'], ['Quantity']], columns: { poKey: ['PO #', 'Order Number', 'OrderNumber'], supplierKey: ['Supplier'], itemKey: ['SKU', 'ProductCode'], quantity: ['Quantity'], price: ['Cost', 'Price'], unit: ['Unit', 'UOM'], promiseDate: ['Required By', 'RequiredBy'] }, lineIdentity: 'document-ordinal', quantityMeaning: 'remaining', reasons: { Currency: CURRENCY } },
    { id: 'suppliers', label: 'Suppliers', kind: 'suppliers', fileHint: /supplier|vendor/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] }, reasons: { Currency: CURRENCY } },
    { id: 'customers', label: 'Customers', kind: 'customers', fileHint: /customer/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] }, reasons: { Currency: CURRENCY } },
    controls(false),
  ],
  inflow: [
    { id: 'products', label: 'Product details', kind: 'items', signature: [['ProductName'], ['SKU'], ['Uom']], columns: { key: ['ProductName'], sku: ['SKU'], name: ['ProductName'], unit: ['Uom'], barcode: ['BarCode'], openingCost: ['Cost'] }, constants: { packSize: '1' }, reasons: { TrackSerials: 'Untracked products only; tracked products need their own move-in.', Description: 'Long description stays in the original.' } },
    { id: 'stock-levels', label: 'Stock levels', kind: 'positions', signature: [['ProductName'], ['Location'], ['Sublocation'], ['Quantity']], columns: { itemKey: ['ProductName'], warehouse: ['Location'], bin: ['Sublocation'], quantity: ['Quantity'] }, constants: { status: 'sellable' }, reasons: { Serial: TRACKING } },
    { id: 'purchase-orders', label: 'Purchase orders', kind: 'purchaseOrders', signature: [['OrderNumber'], ['Vendor'], ['ProductName'], ['ProductQuantity']], columns: { poKey: ['OrderNumber'], supplierKey: ['Vendor'], itemKey: ['ProductName'], quantity: ['ProductQuantity'], unit: ['ProductQuantityUoM'], price: ['ProductUnitPrice'], promiseDate: ['RequestedShipDate', 'DueDate'] }, lineIdentity: 'document-ordinal', quantityMeaning: 'remaining', dateFormat: 'M/D/YYYY', reasons: { InventoryStatus: 'Only Unfulfilled orders move in; Pier refuses other statuses.', CurrencyCode: CURRENCY, ProductSerials: TRACKING } },
    { id: 'vendors', label: 'Vendors', kind: 'suppliers', fileHint: /vendor|supplier/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] }, reasons: { CurrencyCode: CURRENCY } },
    { id: 'customers', label: 'Customers', kind: 'customers', fileHint: /customer/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] } },
    controls(false),
  ],
  fishbowl: [
    { id: 'part', label: 'Part', kind: 'items', signature: [['PartNumber'], ['PartDescription'], ['UOM'], ['PartType']], columns: { key: ['PartNumber'], sku: ['PartNumber'], name: ['PartDescription'], unit: ['UOM'], barcode: ['UPC'] }, constants: { packSize: '1' }, reasons: { PartType: 'Inventory parts only; other part types need separate treatment.', POItemType: 'Purchase defaults stay in the original.' } },
    { id: 'inventory', label: 'Inventory Quantities', kind: 'positions', signature: [['PartNumber'], ['Location'], ['Qty'], ['Cost']], columns: { itemKey: ['PartNumber'], locationKey: ['Location'], quantity: ['Qty'], unit: ['UOM'], cost: ['Cost'] }, constants: { status: 'sellable' }, reasons: { PartDescription: 'Names come from the Part export.' } },
    { id: 'locations', label: 'Location', kind: 'locations', signature: [['Location'], ['Description'], ['Type'], ['LocationGroup']], columns: { key: ['Location'], name: ['Description'], warehouse: ['LocationGroup'] }, constants: { kind: 'bin' }, reasons: Object.fromEntries(['Type', 'Active', 'Available', 'Pickable', 'Receivable'].map(column => [column, 'Ordinary active stock bins, reviewed; Fishbowl permissions stay in the original.'])) },
    { id: 'purchase-orders', label: 'Purchase Order', kind: 'purchaseOrders', layout: 'fishbowl-purchase', signature: [['PONum'], ['POItemTypeID'], ['PartQuantity']], columns: { key: ['@line'], poKey: ['PONum'], supplierKey: ['VendorName'], itemKey: ['PartNumber'], quantity: ['PartQuantity'], fulfilled: ['FulfilledQuantity'], unit: ['UOM'], price: ['PartPrice'], promiseDate: ['FulfillmentDate'] }, quantityMeaning: 'ordered-less-fulfilled', dateFormat: 'M/D/YYYY', reasons: { Status: 'Issued orders (status 20) only; Pier refuses others.', POItemTypeID: 'Purchase items (type 10) only; Pier refuses others.', CurrencyName: CURRENCY } },
    { id: 'vendors', label: 'Vendor', kind: 'suppliers', fileHint: /vendor|supplier/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] } },
    { id: 'customers', label: 'Customer', kind: 'customers', fileHint: /customer/i, signature: [['Name']], columns: { key: ['Name'], name: ['Name'] } },
    controls(true),
  ],
};

/** The header row a file is mapped against; Fishbowl's PO file has PO and Item sections. */
export function exportHeaders(rows: string[][], layout?: string): string[] {
  if (layout !== 'fishbowl-purchase') return rows[0] ?? [];
  return [...new Set(rows.filter(r => (r[0] === 'PO' && r[1] === 'PONum') || (r[0] === 'Item' && r[1] === 'POItemTypeID')).flat().filter(h => !['PO', 'Item'].includes(h))), '@line'];
}

const present = (headers: string[], candidates: Candidates) => candidates.find(c => headers.includes(c));

/** The standard export this file is, by its headers (and its name when headers alone are ambiguous). */
export function recognise(provider: string, name: string, rows: string[][]): Preset | undefined {
  const fishbowlPo = rows[0]?.[0] === 'PO' && rows[0]?.[1] === 'PONum';
  const fits = (presets[provider] ?? []).filter(p => {
    const headers = exportHeaders(rows, p.layout);
    return (p.layout === 'fishbowl-purchase') === fishbowlPo && p.signature.every(s => present(headers, s));
  });
  const named = fits.filter(p => p.fileHint?.test(name));
  const pool = named.length ? named : fits.filter(p => !p.fileHint || fits.length === 1);
  return pool.sort((a, b) => b.signature.length - a.signature.length)[0];
}

/** Map a recognised export completely: fields to its columns, every other column kept with a reason. */
export function applyPreset(file: ExportFile, preset: Preset, rows: string[][], system: string): ExportFile & { preset: string } {
  const headers = exportHeaders(rows, preset.layout);
  const columns = Object.fromEntries(Object.entries(preset.columns).flatMap(([field, candidates]) => { const column = present(headers, candidates); return column ? [[field, column]] : [] }));
  const used = new Set(Object.values(columns));
  const archivedColumns = Object.fromEntries(headers.filter(h => h !== '@line' && !used.has(h)).map(h => [h, preset.reasons?.[h] ?? (h.startsWith('Tracking-') ? TRACKING : `Pier does not use this ${system} column; it stays in the retained original.`)]));
  return { ...file, kind: preset.kind, columns, constants: { ...(preset.constants ?? {}) }, archivedColumns, preset: preset.id,
    ...(preset.layout ? { layout: preset.layout } : {}), ...(preset.lineIdentity ? { lineIdentity: preset.lineIdentity } : {}),
    ...(preset.quantityMeaning ? { quantityMeaning: preset.quantityMeaning } : {}), ...(preset.dateFormat ? { dateFormat: preset.dateFormat } : {}) };
}

export const checkTemplate = (provider: string) => provider === 'fishbowl' ? 'Location,Unit,Quantity,Value\n' : 'Warehouse,Bin,Unit,Quantity,Value\n';
