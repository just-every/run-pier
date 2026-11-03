import { plannedTraceParts, policyFor } from './trace-core';
import { available, balance, decimal, fail, format, fresh, get, min, move, requireRole, row, text, type Context, type Row, type State } from './model';
import { binMatches, itemScan } from './floor/codes';
import { capacityRemaining } from './location-capacity';

const compareDecimal = (a: string, b: string) => decimal(a) < decimal(b) ? -1 : decimal(a) > decimal(b) ? 1 : 0;
const distance = (a: Row, b: Row) => {
  const x = a.storagePolicy, y = b.storagePolicy;
  if (!x || !y) return null;
  return format((decimal(x.aisleMetres) > decimal(y.aisleMetres) ? decimal(x.aisleMetres) - decimal(y.aisleMetres) : decimal(y.aisleMetres) - decimal(x.aisleMetres)) + (decimal(x.bayMetres) > decimal(y.bayMetres) ? decimal(x.bayMetres) - decimal(y.bayMetres) : decimal(y.bayMetres) - decimal(x.bayMetres)));
};
export function slottingPlan(s: State, warehouse: string, now: string, sourceLocationId?: string) {
  const bins = s.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse && l.storagePolicy);
  const since = Date.parse(now) - 30 * 86400000;
  const velocity = s.items.filter(i => !i.archived).map(item => {
    const observations = s.waves.filter(w => w.warehouse === warehouse).flatMap(w => w.lines.filter((l: any) => l.itemId === item.id).flatMap((l: any) => (l.scans ?? []).filter((scan: any) => Date.parse(scan.at) >= since && Date.parse(scan.at) <= Date.parse(now)).map((scan: any) => ({ waveId: w.id, lineId: l.id, locationId: l.locationId, at: scan.at, secondsFromRelease: Math.max(0, (Date.parse(scan.at) - Date.parse(w.createdAt)) / 1000) }))));
    return { itemId: item.id, sku: item.sku, pickScans: observations.length, scansPerDay: format(BigInt(observations.length) * 1000000n / 30n), observations, dimensions: item.dimensions ?? null };
  }).sort((a, b) => b.pickScans - a.pickScans || a.sku.localeCompare(b.sku));
  const total = velocity.reduce((n, v) => n + v.pickScans, 0); let cumulative = 0;
  const abc = velocity.map(v => {
    const group = !v.pickScans ? 'unranked' : cumulative * 100 < total * 80 ? 'A' : cumulative * 100 < total * 95 ? 'B' : 'C';
    cumulative += v.pickScans;
    const travel = bins.filter(b => b.storagePolicy.pickFace && capacityRemaining(s, v.itemId, b.id) > 0n).map(b => {
      const observations = v.observations.filter(o => o.locationId === b.id);
      return { locationId: b.id, distanceFromEntranceMetres: format(decimal(b.storagePolicy.aisleMetres) + decimal(b.storagePolicy.bayMetres)), pickSequence: b.storagePolicy.pickSequence, meanPickElapsedSeconds: observations.length ? observations.reduce((n,o)=>n+o.secondsFromRelease,0)/observations.length : null };
    }).sort((a,b) => compareDecimal(a.distanceFromEntranceMetres,b.distanceFromEntranceMetres) || (a.meanPickElapsedSeconds ?? Infinity) - (b.meanPickElapsedSeconds ?? Infinity) || compareDecimal(a.pickSequence,b.pickSequence));
    return { ...v, group, travel, recommendedLocationId: v.pickScans ? travel[0]?.locationId ?? null : null, reason: !v.pickScans ? 'No pick observations in the last 30 days; no velocity-based relocation is justified.' : `${group}: ${v.pickScans} confirmed pick scans in 30 days. Closest fitting permitted pick face by aisle/bay distance from entrance, then observed mean elapsed pick time and pick sequence; dimensions and capacity checked. Times are elapsed from wave release, not isolated walking times.` };
  });
  const tasks: any[] = [];
  const staged = structuredClone(s);
  const propose = (itemId: string, from: Row, to: Row, desired: bigint, kind: string, priority: number) => {
    const quantity = min(min(desired, available(staged, itemId, from.id)), capacityRemaining(staged, itemId, to.id));
    if (quantity <= 0n) return;
    const parts=plannedTraceParts(staged,itemId,from.id,quantity,now.slice(0,10));
    for(const chunk of parts.length?parts:[{quantity:quantity.toString(),identityId:null}])tasks.push({ itemId, fromLocationId: from.id, toLocationId: to.id, quantity: format(BigInt(chunk.quantity)), ...(chunk.identityId?{trace:[{identityId:chunk.identityId,quantity:format(BigInt(chunk.quantity))}]}:{}), kind, priority, distanceMetres: distance(from, to), fromVersion: from.version, toVersion: to.version, itemVersion: get(s, 'items', itemId).version, status: 'proposed', reason: kind === 'replenish' ? 'Pick face at or below its minimum; replenish up to maximum from unreserved reserve stock.' : 'Move from the receiving bin to a fitting, permitted destination in travel sequence.' });
    for(const part of parts)for(const [locationId,sign]of [[from.id,-1n],[to.id,1n]] as const)staged.traceEvents.push({id:'planned-'+tasks.length+'-'+locationId,version:1,itemId,identityId:part.identityId,locationId,status:'sellable',quantity:(BigInt(part.quantity)*sign).toString()});
    // Account for earlier recommendations so a plan never overcommits space/stock.
    staged.movements.push({ itemId, locationId: from.id, status: 'sellable', quantity: (-quantity).toString() } as any, { itemId, locationId: to.id, status: 'sellable', quantity: quantity.toString() } as any);
  };
  const needs = bins.flatMap(to => to.storagePolicy.pickFaces.map((face: any) => ({ to, face, current: available(staged, face.itemId, to.id) })))
    .filter(({face,current}) => current <= decimal(face.minimum))
    .sort((a,b) => (a.current <= 0n ? 0 : 1) - (b.current <= 0n ? 0 : 1) || compareDecimal(a.to.storagePolicy.pickSequence,b.to.storagePolicy.pickSequence));
  for (const {to,face,current} of needs) {
    for (const from of bins.filter(b => !b.storagePolicy.pickFace && b.id !== to.id).sort((a,b) => compareDecimal(distance(a,to) ?? '0', distance(b,to) ?? '0') || compareDecimal(a.storagePolicy.pickSequence,b.storagePolicy.pickSequence))) {
      const gap = decimal(face.maximum) - available(staged, face.itemId, to.id);
      if (gap > 0n) propose(face.itemId, from, to, gap, 'replenish', current <= 0n ? 0 : 1);
    }
  }
  if (sourceLocationId) {
    const from = get(s, 'locations', sourceLocationId);
    if (from.kind !== 'bin' || from.warehouse !== warehouse) fail('BIN', 'Choose a receiving bin in this warehouse.');
    for (const item of s.items.filter(i => !i.archived)) {
      for (const to of bins.filter(b => b.id !== from.id && !b.storagePolicy.pickFace).sort((a,b) => compareDecimal(distance(from,a) ?? '0', distance(from,b) ?? '0') || compareDecimal(a.storagePolicy.pickSequence,b.storagePolicy.pickSequence))) {
        propose(item.id, from, to, available(staged, item.id, from.id), 'put-away', 2);
      }
    }
  }
  tasks.sort((a,b) => a.priority - b.priority || compareDecimal(a.distanceMetres ?? '0',b.distanceMetres ?? '0'));
  return { warehouse, sourceLocationId: sourceLocationId ?? null, basis: '30-day confirmed pick scans; ABC cumulative scan share 80/95%; empty items unranked. Travel is Manhattan aisle/bay metres, pick sequence breaks ties. Observed elapsed pick times retain wave/line sources.', abc, tasks };
}

export function slotting(c: Context, type: string, p: any): Row | undefined {
  if (!['location.policy', 'slotting.plan', 'slotting.approve', 'slotting.scan'].includes(type)) return;
  if (type === 'location.policy') {
    requireRole(c, []); // Until a supervisor role exists the owner acts for it.
    const bin = get(c.s, 'locations', p.locationId); fresh(bin, p.version);
    if (bin.kind !== 'bin') fail('BIN', 'Storage policies apply to bins.');
    const allowedItemIds: string[] = p.allowedItemIds ?? [];
    if (!Array.isArray(allowedItemIds) || allowedItemIds.length > 100 || new Set(allowedItemIds).size !== allowedItemIds.length) fail('BIN_STOCK', 'Choose up to 100 distinct permitted items.');
    for (const id of allowedItemIds) get(c.s, 'items', id);
    const faces = p.pickFaces ?? [];
    if (!Array.isArray(faces) || faces.length > 100 || new Set(faces.map((f: any) => f.itemId)).size !== faces.length) fail('PICK_FACE', 'Choose up to 100 distinct pick-face items.');
    const pickFaces = faces.map((f: any) => {
      get(c.s, 'items', f.itemId);
      const minimum = decimal(f.minimum), maximum = decimal(f.maximum, true);
      if (maximum < minimum || allowedItemIds.length && !allowedItemIds.includes(f.itemId)) fail('PICK_FACE', 'The maximum must cover the minimum and the item must be permitted.');
      return { itemId: f.itemId, minimum: format(minimum), maximum: format(maximum) };
    });
    const policy: any = { allowedItemIds, pickFace: p.pickFace === true, pickFaces };
    if (pickFaces.length && !policy.pickFace) fail('PICK_FACE', 'Mark the bin as a pick face before setting thresholds.');
    for (const key of ['capacityCm3','lengthCm','widthCm','heightCm']) policy[key] = format(decimal(p[key], true));
    for (const key of ['aisleMetres','bayMetres','pickSequence']) policy[key] = format(decimal(p[key]));
    if (decimal(policy.capacityCm3) * 1000000n ** 2n > decimal(policy.lengthCm) * decimal(policy.widthCm) * decimal(policy.heightCm)) fail('BIN_CAPACITY', 'Usable capacity cannot exceed the bin dimension volume.');
    bin.storagePolicy = policy; bin.storagePolicyVersion = (bin.storagePolicyVersion ?? 0) + 1; bin.version++;
    return bin;
  }
  requireRole(c, ['warehouse']);
  if (type === 'slotting.plan') return row(c, 'slottingPlans', { ...slottingPlan(c.s, text(p.warehouse), c.now, p.sourceLocationId), status: 'proposed' });
  const plan = get(c.s, 'slottingPlans', p.planId); fresh(plan, p.version);
  if (type === 'slotting.approve') {
    requireRole(c, []);
    if (plan.status !== 'proposed') fail('SLOTTING_STATE', 'Review a proposed plan once.');
    plan.approval = { actorId: c.actor.id, version: plan.version, at: c.now }; plan.status = 'approved'; plan.version++;
    return plan;
  }
  if (plan.status !== 'approved') fail('SLOTTING_STATE', 'An owner must approve the exact plan before physical movement.');
  const task = plan.tasks[p.taskIndex];
  if (!Number.isSafeInteger(p.taskIndex) || !task || task.status !== 'proposed') fail('SLOTTING_TASK', 'Choose an unfinished task.');
  const from = get(c.s, 'locations', task.fromLocationId), to = get(c.s, 'locations', task.toLocationId), item = get(c.s, 'items', task.itemId);
  if (from.version !== task.fromVersion || to.version !== task.toVersion || item.version !== task.itemVersion) fail('STALE', 'Bin policy or item changed; prepare and approve a new plan.');
  if (!binMatches(from, p.fromCode) || !binMatches(to, p.toCode)) fail('WRONG_BIN', 'Scan the task source and destination bin labels.');
  const hit=itemScan(c.s,p.itemCode,'confirm movement');
  if(hit.item.id!==task.itemId)fail('WRONG_ITEM','Scan the task item.');
  if(task.trace){const identity=get(c.s,'traceIdentities',task.trace[0].identityId);if(!hit.trace || (hit.trace.identityId!==identity.id && !(hit.trace.serial&&hit.trace.serial.toLowerCase()===identity.serial?.toLowerCase()) && !(hit.trace.lot&&hit.trace.lot===identity.lot&&!identity.serial)))fail('TRACE_SCAN','Scan the lot/serial identity approved on this movement task.');}
  if (decimal(p.quantity, true) !== decimal(task.quantity)) fail('SLOTTING_QUANTITY', 'Confirm the exact approved base-unit quantity.');
  const quantity = decimal(task.quantity);
  if (available(c.s, task.itemId, from.id) < quantity) fail('AVAILABLE', 'Source stock was reserved or moved; prepare a new plan.');
  const base = { itemId: task.itemId, status: 'sellable', reason: `${task.kind} approved scan task`, documentId: plan.id };
  move(c, { ...base, locationId: from.id, quantity: (-quantity).toString() });
  move(c, { ...base, locationId: to.id, quantity: quantity.toString() });
  task.status = 'completed'; task.confirmation = { actorId: c.actor.id, at: c.now, fromCode: text(p.fromCode), toCode: text(p.toCode), itemCode: text(p.itemCode), quantity: task.quantity, device: text(p.device, 'Device') };
  if (plan.tasks.every((t: any) => t.status === 'completed')) plan.status = 'completed';
  plan.version++;
  return plan;
}
