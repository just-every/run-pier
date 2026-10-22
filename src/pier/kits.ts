import { reserveTracked } from './trace';
import { policyFor, shippableLayer, sortTraceReservations } from './trace-core';
import { matchesKit, valuationLedger } from './valuation-ledger';
import { available, decimal, fail, format, fresh, get, id, item, min, move, requireRole, row, SCALE, text, type Context, type Row, type State } from './model';

/** Definitions are immutable records. New versions never change reserved orders. */
export const kitDefinition = (s: State, itemId: string) => s.kitDefinitions.filter(k => k.itemId === itemId).sort((a,b) => b.revision - a.revision)[0];
export function componentQuantity(quantity: bigint, perKit: string) {
  const product = quantity * decimal(perKit, true);
  if (product % SCALE) fail('KIT_PRECISION', 'This kit quantity cannot be represented exactly in component base units.');
  return product / SCALE;
}
export const kitBins = (s: State, warehouse: string) => s.locations.filter(l => l.kind === 'bin' && l.warehouse === warehouse);
export function buildable(s: State, definition: Row, warehouse: string, buffer = '0') {
  const bins = kitBins(s, warehouse), safety = decimal(buffer);
  return definition.components.reduce((count: bigint | null, component: any) => {
    const free = bins.reduce((n, bin) => n + available(s, component.itemId, bin.id), 0n) - safety;
    const kits = (free > 0n ? free : 0n) / decimal(component.quantity);
    return count === null || kits < count ? kits : count;
  }, null) as bigint;
}
export function physicalKitAvailable(s: State, definition: Row, binId: string) {
  const layers=valuationLedger(s,'9999').positions.find(p=>p.itemId===definition.itemId && p.locationId===binId && p.status==='sellable')?.layers ?? [];
  const compatible=layers.filter(layer=>matchesKit(layer,definition)&&shippableLayer(s,layer)).reduce((n,layer)=>n+layer.quantity,0n);
  const reserved=s.reservations.filter(r=>r.itemId===definition.itemId && r.locationId===binId).reduce((n,r)=>{
    const line=s.orders.find(o=>o.id===r.orderId)?.lines.find((l:any)=>l.id===r.orderLineId);
    const same=line?.kit && JSON.stringify([...line.kit.components].sort((a:any,b:any)=>a.itemId.localeCompare(b.itemId)))===JSON.stringify([...definition.components].sort((a:any,b:any)=>a.itemId.localeCompare(b.itemId)));
    return n+(same?BigInt(r.quantity):0n);
  },0n);
  const free=min(compatible-reserved,available(s,definition.itemId,binId));
  return free>0n?free:0n;
}
export function kitAvailability(s: State, definition: Row, warehouse: string, buffer = '0') {
  const physical = kitBins(s, warehouse).reduce((n,b) => n + physicalKitAvailable(s, definition, b.id), 0n) - decimal(buffer);
  return (physical > 0n ? physical / SCALE : 0n) * SCALE + buildable(s, definition, warehouse, buffer) * SCALE;
}
export function reservedKits(s: State, line: any) {
  const own = s.reservations.filter(r => r.orderLineId === line.id);
  const assembled = own.filter(r => r.itemId === line.itemId).reduce((n,r) => n + BigInt(r.quantity), 0n);
  if (!line.kit) return assembled;
  const components = line.kit.components.map((component: any) => own.filter(r => r.itemId === component.itemId).reduce((n,r) => n + BigInt(r.quantity), 0n) * SCALE / decimal(component.quantity));
  return assembled + components.reduce((a: bigint,b: bigint) => min(a,b));
}
function allocate(c: Context, order: Row, line: any, itemId: string, quantity: bigint) {
  if(policyFor(c.s,itemId)){if(reserveTracked(c,order.id,line.id,itemId,order.warehouse,quantity,itemId===line.itemId?line.kit:undefined)!==quantity)fail('KIT_STOCK','The complete tracked component set is unavailable.');return;}
  for (const bin of kitBins(c.s, order.warehouse)) {
    const take = min(quantity, itemId===line.itemId ? physicalKitAvailable(c.s,line.kit,bin.id) : available(c.s, itemId, bin.id));
    if (take > 0n) { c.s.reservations.push({ id: id(), orderId: order.id, orderLineId: line.id, itemId, locationId: bin.id, quantity: take.toString() }); quantity -= take; }
  }
  if (quantity) fail('KIT_STOCK', 'The complete component set is no longer available. Reserve again.');
}
export function reserveKit(c: Context, order: Row, line: any) {
  const need = decimal(line.quantity) - decimal(line.dispatched) - decimal(line.cancelled) - reservedKits(c.s, line);
  if (need <= 0n) return;
  const warehouses = order.warehouse ? [order.warehouse] : [...new Set(c.s.locations.filter(l => l.kind === 'bin').map(l => l.warehouse))];
  const warehouse = warehouses.find(w => kitAvailability(c.s, line.kit, w) >= need) ?? warehouses.find(w => kitAvailability(c.s, line.kit, w) > 0n);
  if (!warehouse) { if (line.kit.shortagePolicy === 'block') fail('KIT_SHORTAGE', 'This kit needs every component at one warehouse.'); return; }
  const fill = min(need, kitAvailability(c.s, line.kit, warehouse));
  if (fill < need && line.kit.shortagePolicy === 'block') fail('KIT_SHORTAGE', 'The configured kit policy blocks an incomplete kit order.');
  order.warehouse = warehouse;
  const physical = min(fill, kitBins(c.s, warehouse).reduce((n,b) => n + physicalKitAvailable(c.s,line.kit,b.id), 0n) / SCALE * SCALE);
  allocate(c, order, line, line.itemId, physical);
  for (const component of line.kit.components) allocate(c, order, line, component.itemId, componentQuantity(fill - physical, component.quantity));
}
export function dispatchKit(c: Context, order: Row, line: any, shipment: Row, quantity: bigint,warehouse?:string) {
  if (reservedKits(c.s, line) < quantity) fail('RESERVATION', 'Dispatch requires this order’s complete kit reservation.');
  const own = sortTraceReservations(c.s,c.s.reservations.filter(r => r.orderLineId === line.id&&(!warehouse||get(c.s,'locations',r.locationId).warehouse===warehouse))), links: any[] = [], components: any[] = [];
  const physical = min(quantity, own.filter(r => r.itemId === line.itemId).reduce((n,r) => n + BigInt(r.quantity), 0n));
  const required = [{ itemId: line.itemId, quantity: physical }, ...line.kit.components.map((component: any) => ({ itemId: component.itemId, quantity: componentQuantity(quantity - physical, component.quantity) }))];
  for (const part of required.filter(part => part.quantity > 0n)) {
    let need = part.quantity;
    for (const reservation of own.filter(r => r.itemId === part.itemId)) {
      const take = min(need, BigInt(reservation.quantity));
      if (!take) continue;
      reservation.quantity = (BigInt(reservation.quantity) - take).toString();
      const movement=move(c, { itemId: part.itemId, locationId: reservation.locationId, status: 'sellable', quantity: (-take).toString(), reason: 'Dispatch ' + shipment.reference, documentId: shipment.id });
      links.push({ movementId: movement.id, reservationId: reservation.id, itemId: part.itemId, locationId: reservation.locationId, quantity: format(take) }); need -= take;
    }
    if (need) fail('RESERVATION', 'The complete kit reservation changed.');
    components.push({ itemId: part.itemId, quantity: format(part.quantity) });
  }
  return { id: id(), orderLineId: line.id, itemId: line.itemId, quantity: format(quantity), reservations: links, components, kit: structuredClone(line.kit) };
}
export function kits(c: Context, type: string, p: any): Row | undefined {
  if (type === 'kit.define') {
    requireRole(c, []);
    const sku = item(c.s, p.itemId), old = kitDefinition(c.s, sku.id);
    if (old) fresh(old, p.version);
    if (!Array.isArray(p.components) || !p.components.length) fail('KIT_COMPONENTS', 'Add stocked components with their base quantities.');
    const seen = new Set<string>();
    const components = p.components.map((x: any) => {
      const component = item(c.s, x.itemId);
      if (component.id === sku.id || seen.has(component.id)) fail('KIT_COMPONENTS', 'Use distinct components other than the kit itself.');
      seen.add(component.id);
      if (x.unit !== component.unit) fail('KIT_UNIT', 'Component quantities use the stocked SKU’s exact base unit.');
      return { itemId: component.id, quantity: format(decimal(x.quantity, true)), unit: component.unit };
    });
    // Assembly consumes physical stock, including pre-assembled component kits;
    // virtual recursion never promises unbuilt nested stock.
    if (!['backorder','block'].includes(p.shortagePolicy)) fail('KIT_POLICY', 'Choose whole-kit backorder or block.');
    const definition = row(c, 'kitDefinitions', { itemId: sku.id, revision: (old?.revision ?? 0) + 1, components, shortagePolicy: p.shortagePolicy, reason: text(p.reason), definedBy: c.actor.id });
    definition.version = definition.revision;
    return definition;
  }
  if (!type.startsWith('kitting.')) return;
  if (type === 'kitting.plan') {
    requireRole(c, []);
    const definition = p.definitionId ? get(c.s, 'kitDefinitions', p.definitionId) : kitDefinition(c.s, p.itemId);
    if (!definition || definition.itemId !== p.itemId) fail('KIT', 'Choose this kit’s definition first.');
    const quantity = decimal(p.quantity, true);
    const location = get(c.s, 'locations', p.locationId);
    if (location.kind !== 'bin') fail('BIN', 'Choose a warehouse bin for the kit.');
    if (!['assemble','disassemble'].includes(p.direction)) fail('KIT_TASK', 'Choose assembly or disassembly.');
    const components = definition!.components.map((x: any) => {
      const bin = get(c.s, 'locations', p.bins?.[x.itemId]);
      if (bin.kind !== 'bin' || bin.warehouse !== location.warehouse) fail('KIT_WAREHOUSE', 'Every component bin must be in the kit’s warehouse.');
      return { ...x, locationId: bin.id, quantity: format(componentQuantity(quantity, x.quantity)) };
    });
    return row(c, 'kittingTasks', { definition: structuredClone(definition), itemId: p.itemId, quantity: format(quantity), locationId: location.id, components, direction: p.direction, outputTrace: p.trace ? structuredClone(p.trace) : null, status: 'review', reason: text(p.reason), plannedBy: c.actor.id });
  }
  const task = get(c.s, 'kittingTasks', p.taskId); fresh(task, p.version);
  if (task.status !== 'review') fail('KIT_TASK', 'This task already posted.');
  if (type === 'kitting.approve') {
    requireRole(c, []);
    task.approval = { actorId: c.actor.id, version: task.version, at: c.now }; return task;
  }
  if (type !== 'kitting.post') fail('COMMAND', 'Unknown kitting command.');
  requireRole(c, ['warehouse']);
  if (!task.approval || task.approval.version !== task.version) fail('APPROVAL', 'An owner must review this exact task.');
  const assembly = task.direction === 'assemble';
  if(assembly && task.components.some((part:any)=>get(c.s,'items',part.itemId).tracePolicy) && !get(c.s,'items',task.itemId).tracePolicy)fail('TRACE_KIT','Configure lot/serial tracking on the kit SKU before assembling tracked components.');
  const issue = (itemId: string, locationId: string, quantity: string) => {
    const q = decimal(quantity);
    if (available(c.s, itemId, locationId) < q) fail('KIT_STOCK', 'Kitting cannot consume reserved, held, quarantined or unavailable stock.');
    move(c, { itemId, locationId, status: 'sellable', quantity: (-q).toString(), reason: 'Kitting ' + task.direction, documentId: task.id });
  };
  const receive = (itemId: string, locationId: string, quantity: string) => move(c, { itemId, locationId, status: 'sellable', quantity: decimal(quantity).toString(), reason: 'Kitting ' + task.direction, documentId: task.id });
  if (assembly) { for (const part of task.components) issue(part.itemId, part.locationId, part.quantity); receive(task.itemId, task.locationId, task.quantity); }
  else { issue(task.itemId, task.locationId, task.quantity); for (const part of task.components) receive(part.itemId, part.locationId, part.quantity); }
  // Reproduce actual source layers before admission, including disassembly of
  // the chosen definition; no guessed cost can turn a different version into stock.
  valuationLedger(c.s, c.now);
  task.status = 'posted'; task.postedBy = c.actor.id; task.postedAt = c.now; task.version++;
  return task;
}
export function kitState(s: State) {
  const warehouses = [...new Set(s.locations.filter(l => l.kind === 'bin').map(l => l.warehouse))];
  return { kitAvailability: s.items.flatMap(i => {
    const definition = kitDefinition(s, i.id);
    return definition ? warehouses.map(warehouse => ({ id: `${i.id}:${warehouse}`, itemId: i.id, warehouse, revision: definition.revision, buildable: format(buildable(s, definition, warehouse) * SCALE), available: format(kitAvailability(s, definition, warehouse)) })) : [];
  }) };
}

/** Every existing write door must preserve whole component sets and one route. */
export function validateKitReservations(s: State) {
  for (const order of s.orders) for (const line of order.lines.filter((l: any) => l.kit)) {
    const own = s.reservations.filter(r => r.orderLineId === line.id);
    const physical = own.filter(r=>r.itemId===line.itemId).reduce((n,r)=>n+BigInt(r.quantity),0n);
    const kits = reservedKits(s,line), virtual = kits - physical;
    if (own.some(r=>!kitBins(s,order.warehouse).some(bin=>bin.id===r.locationId) || (r.itemId!==line.itemId && !line.kit.components.some((part:any)=>part.itemId===r.itemId))) || line.kit.components.some((part:any)=>own.filter(r=>r.itemId===part.itemId).reduce((n,r)=>n+BigInt(r.quantity),0n)!==componentQuantity(virtual,part.quantity)) || kits > decimal(line.quantity)-decimal(line.dispatched)-decimal(line.cancelled)) fail('KIT_RESERVATION', 'The command would split a kit’s component set or warehouse. Cancel its remaining demand and reserve complete kits again.');
  }
}
