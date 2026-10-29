export const nativeCapture = (quantity = '2', currency = 'USD') => ({
  namespace: 'synthetic-pier-onboarding', sourceVersion: 'owner-export-1',
  exportedAt: '2026-10-01T00:00:00Z', cutoffTimezone: 'UTC', mappingRevision: '1', filters: 'opening stock',
  files: [
    { kind: 'items', name: 'items.csv', csv: 'key,sku,name,barcode,unit,packSize\nitem,synthetic-pier-710,Onboarding bolts,,each,1\n' },
    { kind: 'locations', name: 'locations.csv', csv: 'key,name,warehouse,kind\nbin,Onboarding bin,North,bin\n' },
    { kind: 'positions', name: 'positions.csv', csv: `key,itemKey,locationKey,status,quantity,unit,cost,currency\nopening,item,bin,sellable,${quantity},each,2.5,${currency}\n` },
  ],
});
