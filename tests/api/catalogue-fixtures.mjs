export const catalogueCsv = rows => {
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => '"' + String(typeof value === 'object' && value !== null ? JSON.stringify(value) : value ?? '').replaceAll('"', '""') + '"';
  return [headers, ...rows.map(row => headers.map(h => row[h]))].map(row => row.map(cell).join(',')).join('\n');
};
export async function catalogueJourney(h) {
  const supplier = await h.command('party.save', { name: 'Prairie Ceramics', kind: 'supplier' });
  const customer = await h.command('party.save', { name: 'North Cafe', kind: 'customer' });
  const location = await h.command('location.save', { name: 'A-14', warehouse: 'Dallas', kind: 'bin', barcode: 'BIN-A14' });
  const csv = catalogueCsv([
    { sku: 'MUG-BLUE', name: 'Blue stoneware mug', unit: 'each', packSize: '12', barcode: '036000291452', caseBarcode: '10036000291459', variantFamily: 'Stoneware mugs', category: 'Drinkware', weight: '0.75', length: '4', width: '3', height: '4.5', dimensionUnit: 'in', references: [{ partyId: supplier.id, code: 'PC-BLUE' }, { partyId: customer.id, code: 'CAFE-B' }, { partyId: supplier.id, code: 'PC-SHARED' }], barcodes: [{ code: 'INNER-BLUE', quantity: '4', label: 'Inner carton' }, { code: 'SUP-BLUE', quantity: '0.5', label: 'Supplier half unit' }] },
    { sku: 'MUG-WHITE', name: 'White stoneware mug', unit: 'each', packSize: '12', barcode: '4006381333931', variantFamily: 'Stoneware mugs', category: 'Drinkware', references: [{ partyId: supplier.id, code: 'PC-WHITE' }, { partyId: supplier.id, code: 'PC-SHARED' }], barcodes: [] },
  ]);
  const preview = await h.preview(csv);
  const applied = await h.command('catalogue.apply', { csv, stateVersion: preview.stateVersion });
  return { supplier, customer, location, csv, preview, items: applied.items };
}
