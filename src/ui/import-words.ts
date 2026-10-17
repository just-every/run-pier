// Move-in screens in plain words: what each mapped field means, and source
// identities ("[\"Overflow\",\"C-02\"]") as the names people know them by.

const keys: Record<string, string> = { items: 'Item ID', locations: 'Bin ID', suppliers: 'Supplier ID', customers: 'Customer ID', positions: 'Stock row ID', orders: 'Order line ID', purchaseOrders: 'PO line ID' }
const names: Record<string, string> = {
  sku: 'SKU', name: 'Name', barcode: 'Barcode', unit: 'Unit', packSize: 'Units per case', openingCost: 'Opening unit cost',
  warehouse: 'Warehouse', kind: 'Bin or transit', bin: 'Bin', itemKey: 'Item', locationKey: 'Bin', status: 'Stock status',
  quantity: 'Quantity', cost: 'Unit cost', orderKey: 'Sales order number', customerKey: 'Customer', fulfilled: 'Already fulfilled',
  promiseDate: 'Promise date', poKey: 'Purchase order number', supplierKey: 'Supplier', price: 'Unit price', value: 'Stock value',
}
export const fieldLabel = (kind: string, field: string) => field === 'key' ? keys[kind] ?? 'Row ID' : names[field] ?? field

/** A source identity as people read it: a JSON list becomes "Overflow · C-02". */
export function identity(value: unknown): string {
  const text = String(value ?? '')
  if (!text.startsWith('[')) return text
  try { const parts = JSON.parse(text); return Array.isArray(parts) ? parts.map(identity).join(' · ') : text } catch { return text }
}
