import { admitPreparationCommand } from './preparation-scope';
import { collections, Problem, type Actor, type State, type Row } from './model';
import { physicalDocuments } from './physical-documents';
import { admitPhysicalCommand } from './physical-admission';

export type Permissions = { warehouses: string[]; locationIds: string[]; expiresAt?: string };
const denied = () => { throw new Problem('SCOPE', 'Your current warehouse grant does not authorize this operation.', null, 403); };
export function parsePermissions(value: any, s: State): Permissions | undefined {
  if (value === undefined) return;
  if (!value || Object.keys(value).some(key => !['warehouses','locationIds','expiresAt'].includes(key)) || !Array.isArray(value.warehouses) || !Array.isArray(value.locationIds) ||
      !value.warehouses.every((w: any) => typeof w === 'string' && s.locations.some(l => l.warehouse === w)) ||
      !value.locationIds.every((id: any) => s.locations.some(l => l.id === id && value.warehouses.includes(l.warehouse)))) return denied();
  if (value.expiresAt !== undefined && (typeof value.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expiresAt) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now())) return denied();
  return { warehouses: [...new Set<string>(value.warehouses)], locationIds: [...new Set<string>(value.locationIds)], ...(value.expiresAt === undefined ? {} : { expiresAt: new Date(value.expiresAt).toISOString() }) };
}
export function scoped(actor: Actor) { return actor.role !== 'owner' && actor.permissions !== undefined; }
export function allowedLocations(s: State, actor: Actor) {
  const grant = actor.permissions!;
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) return denied();
  return s.locations.filter(l => grant.warehouses.includes(l.warehouse) && (!grant.locationIds.length || grant.locationIds.includes(l.id)));
}
// Scoped stock views expose only physical definitions and admitted positions.
// Commercial data and private originals never enter a physical projection.
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
  const { receivingIds: _receivings, orderIds: _orders, waveIds: _waves, ...documents } = physicalDocuments(s, actor, locations);
  Object.assign(result, documents);
  result.reservations = s.reservations.filter(r => ids.has(r.locationId)).map(r => ({ ...r, orderId: _orders.has(r.orderId) ? r.orderId : '', orderLineId: _orders.has(r.orderId) ? r.orderLineId : '' }));
  result.traceEvents = s.traceEvents.filter(event => ids.has(event.locationId)).map(event => ({ ...event, actorId: '', commandId: '', documentId: '', movementId: '' }));
  const identities = new Set(result.traceEvents.map(event => event.identityId));
  result.traceIdentities = s.traceIdentities.filter(identity => identities.has(identity.id)).map(identity => ({ id: identity.id, version: identity.version, createdAt: identity.createdAt, arrivalSequence: identity.arrivalSequence, itemId: identity.itemId, code: identity.code, lot: identity.lot, serial: identity.serial, expiry: identity.expiry, blocked: identity.blocked }));
  result.items = result.items.map(item => { const policy = s.items.find(row => row.id === item.id)?.tracePolicy; return policy ? { ...item, tracePolicy: { mode: policy.mode, allocation: policy.allocation, expiryRequired: policy.expiryRequired } } : item; });
  return result;
}
export function admitScopedCommand(s: State, actor: Actor, type: string, p: any) {
  admitPreparationCommand(s, actor, type, p);
  if (!scoped(actor)) return;
  admitPhysicalCommand(s, actor, allowedLocations(s, actor), type, p);
}
