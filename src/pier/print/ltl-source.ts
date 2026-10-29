import { decimal, format, get, type Context } from '../model';
import { reviewedManifest } from '../shipping/ltl';
import { itemLine } from './order-sources';
import type { DocumentSource } from './source';

export function ltlSource(c: Context, sourceId: string): DocumentSource | undefined {
  const manifest = c.s.ltlManifests.find(m => m.id === sourceId);
  if (!manifest) return;
  reviewedManifest(c, manifest);
  c.approver = { id: manifest.review.actorId, role: 'owner' };
  const order = get(c.s, 'orders', manifest.orderId), customer = get(c.s, 'parties', order.customerId);
  return { source: manifest, sourceKind: 'ltlManifests', reference: manifest.reference, recipient: customer.name,
    lines: manifest.pallets.flatMap((pallet: any) => pallet.cartons.flatMap((carton: any) => carton.lines.map((line: any) => itemLine(c, { ...line, description: `Pallet ${pallet.number}, carton ${carton.number}` }, customer.id)))),
    fields: [
      { label: 'Order', value: order.reference }, { label: 'Manifest identity', value: `${manifest.id}, revision ${manifest.revision}, version ${manifest.version}` },
      { label: 'Packed source', value: `${manifest.packId}, version ${manifest.packVersion}` },
      { label: 'Manual carrier quote', value: `${manifest.quote.reference}, version ${manifest.quote.version}, USD ${manifest.quote.amount}` },
      { label: 'Operator record boundary', value: 'Manual quote and pickup details only. No carrier acknowledgment, booking or physical-stock verification.' },
      ...manifest.pallets.map((pallet: any) => ({ label: `Pallet ${pallet.number}`, value: `${pallet.weight} lb; ${pallet.length} x ${pallet.width} x ${pallet.height} in; NMFC ${pallet.nmfc}; class ${pallet.freightClass}; cartons ${pallet.cartons.map((carton: any) => carton.number).join(', ')}` })),
    ], totals: [] };
}
export function ltlFreight(manifest: any) {
  return { carrier: manifest.quote.carrier, scac: manifest.quote.scac, proNumber: manifest.review.proNumber, pickupDate: manifest.review.pickupDate,
    shipFrom: manifest.shipFrom, shipTo: manifest.shipTo, freightTerms: manifest.quote.freightTerms,
    palletCount: String(manifest.pallets.length), handlingType: 'Pallet', packageCount: String(manifest.pallets.reduce((sum: number, pallet: any) => sum + pallet.cartons.length, 0)), packageType: 'Carton',
    weight: format(manifest.pallets.reduce((sum: bigint, pallet: any) => sum + decimal(pallet.weight), 0n)),
    netWeight: format(manifest.pallets.flatMap((pallet: any) => pallet.cartons).reduce((sum: bigint, carton: any) => sum + decimal(carton.weight), 0n)),
    palletSlip: 'Y', commodity: manifest.commodity, nmfc: [...new Set(manifest.pallets.map((pallet: any) => pallet.nmfc))].join(', '),
    freightClass: [...new Set(manifest.pallets.map((pallet: any) => pallet.freightClass))].join(', '), accessorials: manifest.accessorials.join(', ') || 'None' };
}
