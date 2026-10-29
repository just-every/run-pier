import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type Row } from '../model';
import { packing } from '../floor/packing';

const measure = (value: unknown, label: string) => {
  const result = String(value ?? '').trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(result) || decimal(result) <= 0n) fail('LTL_MEASURE', `Enter ${label} above zero, with at most two decimals.`);
  return result;
};
const classes = new Set(['50','55','60','65','70','77.5','85','92.5','100','110','125','150','175','200','250','300','400','500']);
export function currentManifest(c: Context, manifest: Row) {
  if (manifest.privacyErasedAt) fail('LTL_PRIVATE', 'This manifest was withdrawn by governed erasure.');
  const pack = get(c.s, 'packs', manifest.packId);
  if (manifest.status === 'dispatched' || pack.status !== 'packed') fail('LTL_STATE', 'Choose a closed, unshipped pack.');
  if (pack.version !== manifest.packVersion) fail('LTL_STALE', 'The packed cartons changed. Save and review a new manifest.');
  return pack;
}
export function reviewedManifest(c: Context, manifest: Row) {
  currentManifest(c, manifest);
  if (!manifest.quote || !manifest.review || manifest.review.quoteVersion !== manifest.quote.version || manifest.review.revision !== manifest.revision)
    fail('LTL_REVIEW', 'Review the current manual quote and pickup details first.');
  if (c.automationActors?.[manifest.review.actorId] !== 'owner') fail('LTL_AUTHORITY', 'The reviewer no longer holds owner authority. Review again.');
}
export function ltl(c: Context, type: string, p: any): Row | undefined {
  if (!type.startsWith('ltl.')) return;
  requireRole(c, []);
  if (type === 'ltl.save') {
    const old = p.manifestId ? get(c.s, 'ltlManifests', p.manifestId) : undefined;
    if (old) { fresh(old, p.version); if (old.status === 'dispatched') fail('LTL_STATE', 'A dispatched manifest is retained history.'); }
    const pack = get(c.s, 'packs', p.packId);
    if (pack.status !== 'packed') fail('LTL_STATE', 'Choose a closed, unshipped pack.');
    fresh(pack, p.packVersion);
    if (c.s.ltlManifests.some(m => m.id !== old?.id && m.orderId === pack.orderId && m.status !== 'dispatched')) fail('LTL_EXISTS', 'Complete or revise the retained manifest for this order before preparing another pack.');
    if (c.s.shippingJobs.some(job => job.packId === pack.id)) fail('LTL_LABELS', 'This pack already has parcel shipping work.');
    if (!Array.isArray(p.pallets) || !p.pallets.length || p.pallets.length > 32) fail('LTL_PALLETS', 'Add between one and 32 pallets.');
    const seen = new Set<number>();
    const pallets = p.pallets.map((pallet: any, index: number) => {
      if (!Array.isArray(pallet.cartons) || !pallet.cartons.length) fail('LTL_CARTON', 'Assign closed cartons to every pallet.');
      const cartons = pallet.cartons.map((number: unknown) => {
        const carton = pack.cartons.find((carton: any) => carton.number === number);
        if (!carton || seen.has(carton.number)) fail('LTL_CARTON', 'Each carton must belong to this pack and occur on exactly one pallet.');
        seen.add(carton.number);
        return structuredClone(carton);
      });
      const freightClass = text(pallet.freightClass, 'NMFC freight class');
      if (!classes.has(freightClass)) fail('LTL_CLASS', 'Choose a standard NMFC freight class.');
      const weight = measure(pallet.weight, 'pallet weight in pounds');
      if (decimal(weight) < cartons.reduce((sum: bigint, carton: any) => sum + decimal(carton.weight), 0n)) fail('LTL_MEASURE', 'Pallet gross weight cannot be below its measured cartons.');
      return { number: index + 1, packId: pack.id, orderId: pack.orderId, cartons, weight, length: measure(pallet.length, 'length in inches'), width: measure(pallet.width, 'width in inches'), height: measure(pallet.height, 'height in inches'), nmfc: text(pallet.nmfc, 'NMFC number'), freightClass };
    });
    if (seen.size !== pack.cartons.length) fail('LTL_CARTON', 'Assign every packed carton exactly once.');
    const accessorials = p.accessorials ?? [];
    if (!Array.isArray(accessorials) || accessorials.some((value: unknown) => !['liftgate','residential','appointment','inside delivery'].includes(String(value)))) fail('LTL_ACCESSORIAL', 'Choose the listed freight accessorials.');
    const value = { packId: pack.id, packVersion: pack.version, orderId: pack.orderId, warehouse: get(c.s, 'waves', pack.waveId).warehouse,
      reference: text(p.reference, 'Manifest reference'), shipFrom: text(p.shipFrom, 'Ship from'), shipTo: text(p.shipTo, 'Ship to'), commodity: text(p.commodity, 'Commodity'),
      pallets, accessorials: [...new Set(accessorials)], revision: (old?.revision ?? 0) + 1, status: 'manifest', quote: null, review: null, updatedBy: c.actor.id };
    if (!old) return row(c, 'ltlManifests', { ...value, createdBy: c.actor.id, history: [] });
    old.history.push({ revision: old.revision, pallets: old.pallets, accessorials: old.accessorials, shipFrom: old.shipFrom, shipTo: old.shipTo, quote: old.quote, review: old.review, changedAt: c.now, changedBy: c.actor.id });
    return Object.assign(old, value, { version: old.version + 1 });
  }
  const manifest = get(c.s, 'ltlManifests', p.manifestId);
  fresh(manifest, p.version);
  const pack = currentManifest(c, manifest);
  if (type === 'ltl.quote') {
    const amount = measure(p.amount, 'quote amount in USD');
    manifest.quoteHistory = [...(manifest.quoteHistory ?? []), ...(manifest.quote ? [manifest.quote] : [])];
    manifest.quote = { version: (manifest.quote?.version ?? manifest.quoteHistory.at(-1)?.version ?? 0) + 1, revision: manifest.revision, carrier: text(p.carrier, 'Carrier'), scac: text(p.scac, 'SCAC'), reference: text(p.quoteReference, 'Carrier quote reference'), amount, currency: 'USD', freightTerms: text(p.freightTerms, 'Freight terms'), evidence: text(p.evidence, 'Carrier quote evidence'), enteredBy: c.actor.id, enteredAt: c.now };
    manifest.reviewHistory = [...(manifest.reviewHistory ?? []), ...(manifest.review ? [manifest.review] : [])];
    manifest.review = null; manifest.status = 'quote';
  } else if (type === 'ltl.review') {
    if (!manifest.quote) fail('LTL_QUOTE', 'Retain the carrier quote first.');
    const pickupDate = text(p.pickupDate, 'Pickup date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !Number.isFinite(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0,10) !== pickupDate) fail('LTL_DATE', 'Enter a valid pickup date.');
    manifest.reviewHistory = [...(manifest.reviewHistory ?? []), ...(manifest.review ? [manifest.review] : [])];
    manifest.review = { revision: manifest.revision, quoteVersion: manifest.quote.version, proNumber: text(p.proNumber, 'PRO number'), pickupDate, reason: text(p.reason, 'Review reason'), actorId: c.actor.id, reviewedAt: c.now };
    manifest.status = 'reviewed';
  } else if (type === 'ltl.pickup') {
    reviewedManifest(c, manifest);
    if (p.confirmed !== true) fail('LTL_PICKUP', 'Explicitly confirm the physical pickup.');
    const document = get(c.s, 'salesDocuments', p.documentId);
    if (document.kind !== 'bill-of-lading' || document.sourceKind !== 'ltlManifests' || document.recordId !== manifest.id || document.recordVersion !== manifest.version || !document.pdf || document.privacyErasedAt)
      fail('LTL_BOL', 'Generate and review the current manifest bill of lading before confirming pickup.');
    const evidence = text(p.evidence, 'Pickup confirmation evidence');
    c.approver = { id: manifest.review.actorId, role: 'owner' };
    c.ltlPickupId = manifest.id;
    packing(c, 'pack.dispatch', { waveId: pack.waveId, orderId: pack.orderId, shipmentReference: manifest.review.proNumber });
    const shipment = get(c.s, 'shipments', pack.shipmentId);
    shipment.ltlManifestId = manifest.id; shipment.ltlRevision = manifest.revision; shipment.bolDocumentId = document.id;
    shipment.operatorRecordedPickup = { proNumber: manifest.review.proNumber, pickupDate: manifest.review.pickupDate, evidence, actorId: c.actor.id, recordedAt: c.now };
    manifest.pickup = { ...shipment.operatorRecordedPickup, documentId: document.id }; manifest.shipmentId = shipment.id; manifest.status = 'dispatched';
  } else fail('COMMAND', 'Unknown LTL command.');
  manifest.version++;
  return manifest;
}
