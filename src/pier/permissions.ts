import { collections, Problem, type Actor, type State, type Row } from './model';

export type Permissions = { warehouses: string[]; locationIds: string[] };
const denied = () => { throw new Problem('SCOPE', 'Your current warehouse grant does not authorize this operation.', null, 403); };
export function parsePermissions(value: any, s: State): Permissions | undefined {
  if (value === undefined) return;
  if (!value || Object.keys(value).some(key => !['warehouses','locationIds'].includes(key)) || !Array.isArray(value.warehouses) || !Array.isArray(value.locationIds) ||
      !value.warehouses.every((w: any) => typeof w === 'string' && s.locations.some(l => l.warehouse === w)) ||
      !value.locationIds.every((id: any) => s.locations.some(l => l.id === id && value.warehouses.includes(l.warehouse)))) return denied();
  return { warehouses: [...new Set<string>(value.warehouses)], locationIds: [...new Set<string>(value.locationIds)] };
}
export function scoped(actor: Actor) { return actor.role !== 'owner' && actor.permissions !== undefined; }
function allowedLocations(s: State, actor: Actor) {
  const grant = actor.permissions!;
  return s.locations.filter(l => grant.warehouses.includes(l.warehouse) && (!grant.locationIds.length || grant.locationIds.includes(l.id)));
}
// Scoped stock views expose only physical definitions and admitted positions.
// Costs, parties, documents, proposals, connections and command results remain
// owner/global-role doors until each domain can prove its own narrower scope.
export function physicalState(s: State, actor: Actor): State {
  if (!scoped(actor)) return s;
  const result = { version: s.version, movements: [], reservations: [] } as unknown as State;
  for (const k of collections) result[k] = [];
  const locations = allowedLocations(s, actor), ids = new Set(locations.map(l => l.id));
  result.locations = locations;
  const itemFields = ['id','version','createdAt','sku','name','barcode','caseBarcode','barcodes','unit','packSize','archived','variantFamily','category','image','weight','dimensions'];
  result.items = s.items.map(item => Object.fromEntries(itemFields.filter(k => Object.hasOwn(item, k)).map(k => [k, item[k]])) as Row);
  result.movements = s.movements.filter(m => ids.has(m.locationId)).map(m => ({ ...m, reason: '', actorId: '', commandId: '', documentId: '', reversalId: null, importId: null }));
  result.reservations = s.reservations.filter(r => ids.has(r.locationId)).map(r => ({ ...r, orderId: '', orderLineId: '' }));
  result.counts = s.counts.filter(r => ids.has(r.locationId));
  return result;
}
export function admitScopedCommand(s: State, actor: Actor, type: string, p: any) {
  if (!scoped(actor)) return;
  const locations = new Set(allowedLocations(s, actor).map(l => l.id));
  if (!['count.capture', 'count.record', 'count.approve', 'count.recount'].includes(type)) return denied();
  const locationId = type === 'count.capture' ? p.locationId : s.counts.find(r => r.id === p.countId)?.locationId;
  if (!locations.has(locationId)) denied();
}
