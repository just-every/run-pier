import { resolve } from './floor/codes';
import { returnCost } from './returns-cost';
import { available, balance, decimal, fail, format, fresh, get, id, min, move, requireRole, row, SCALE, text, type Context, type Movement, type Row, type State } from './model';
import { codeOwners } from './catalogue-fields';
import { eligible, identitiesAt, policyFor, selectParts, shippableLayer, traceBalance, tracePositions, traceReserved } from './trace-core';
import { matchesKit, valuationLedger } from './valuation-ledger';

const date = (value:any) => {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('TRACE_DATE','Use an exact calendar date as YYYY-MM-DD.');
  return value as string;
};
function receiptIdentity(c:Context,itemId:string,input:any,quantity:bigint,definition?:Row,parents:string[]=[]) {
  const policy=policyFor(c.s,itemId),lot=input.lot ? text(input.lot,'Lot') : null,serial=input.serial ? text(input.serial,'Serial') : null;
  if(policy.mode==='serial'&&(!serial||quantity!==SCALE))fail('TRACE_SERIAL','Receive each serialized unit with its unique serial and quantity one.');
  if(policy.mode==='lot'&&!lot)fail('TRACE_LOT','Enter the supplier lot for this received stock.');
  if(serial&&c.s.traceIdentities.some(i=>i.serial?.toLowerCase()===serial.toLowerCase()))fail('DUPLICATE_SERIAL','This serial already has retained history. Return an actual dispatch instead of receiving it again.');
  if(serial&&codeOwners(c.s,serial).length)fail('DUPLICATE','This serial collides with an existing stock or location code.');
  let existing=!serial?c.s.traceIdentities.find(i=>i.itemId===itemId&&i.lot===lot&&!i.serial):undefined;
  const expiry=date(input.expiry ?? existing?.expiry),productionDate=date(input.productionDate ?? existing?.productionDate);
  if(policy.expiryRequired&&!expiry)fail('TRACE_EXPIRY','Enter this tracked stock’s expiry date.');
  if(existing&&(existing.expiry!==expiry||existing.productionDate!==productionDate))fail('TRACE_IDENTITY','An existing lot keeps its original expiry and production date.');
  const composition=definition?[...definition.components].sort((a:any,b:any)=>a.itemId.localeCompare(b.itemId)):null;
  if(existing&&composition&&JSON.stringify(existing.kitComponents)!==JSON.stringify(composition))fail('TRACE_KIT','Use a new output lot for a different assembled composition.');
  if(existing&&parents.some(parent=>!(existing.parentIdentityIds??[]).includes(parent))){existing.parentIdentityIds=[...new Set([...(existing.parentIdentityIds??[]),...parents])];existing.version++;}
  if(existing?.blocked)fail('TRACE_BLOCKED','This lot is quarantined. Review its identity before receiving more.');
  return existing ?? row(c,'traceIdentities',{itemId,lot,serial,expiry,productionDate,arrivalSequence:c.s.traceIdentities.length+1,kitComponents:composition,parentIdentityIds:parents,code:'trace-'+id(),blocked:false});
}
function selectors(s:State,itemId:string,inputs:any[]|undefined) {
  if(!inputs?.length)return undefined;
  for(const x of inputs)if(x.identityId&&!s.traceIdentities.some(i=>i.id===x.identityId))fail('TRACE_SOURCE','Unknown trace identity.');
  const relevant=inputs.filter(x=>(!x.itemId||x.itemId===itemId)&&(!x.identityId||s.traceIdentities.some(i=>i.id===x.identityId&&i.itemId===itemId)));
  if(!relevant.length)fail('TRACE_SOURCE','The selected identity belongs to another SKU.');
  return relevant.map(x=>{
    const identity=x.identityId?s.traceIdentities.find(i=>i.id===x.identityId&&i.itemId===itemId):s.traceIdentities.find(i=>i.itemId===itemId&&(!x.serial||i.serial?.toLowerCase()===String(x.serial).toLowerCase())&&(!x.lot||i.lot===x.lot));
    if(!identity)fail('TRACE_SOURCE','The scanned or entered identity does not belong to this SKU.');
    return {identityId:identity!.id,...(x.quantity?{quantity:x.quantity}:{})};
  });
}
const partsOf = (s:State,movementId:string) => s.traceEvents.filter(e=>e.movementId===movementId).map(e=>({identityId:e.identityId,quantity:(BigInt(e.quantity)<0n?-BigInt(e.quantity):BigInt(e.quantity)).toString()}));
function incoming(c:Context,m:Movement,inputs:any[]|undefined) {
  const receipt=c.s.receipts.find(r=>r.id===m.documentId),line=receipt?.lines.find((line:any)=>line.movementId===m.id);
  if(line) {
    const requested=Array.isArray(line.trace)?line.trace:line.trace?[line.trace]:inputs?.filter(x=>(!x.itemId||x.itemId===m.itemId)&&(!x.locationId||x.locationId===m.locationId));
    if(!requested?.length)fail('TRACE_RECEIPT','Receive tracked stock with its lot/serial and expiry.');
    const parts=requested!.map((input:any)=>{const quantity=decimal(input.quantity??format(BigInt(m.quantity)),true);const identity=receiptIdentity(c,m.itemId,input,quantity);if(identity.expiry&&identity.expiry<c.now.slice(0,10))fail('TRACE_EXPIRED','Expired goods cannot enter sellable receiving stock.');return {identityId:identity.id,quantity:quantity.toString()};});
    if(parts.reduce((n:bigint,p:any)=>n+BigInt(p.quantity),0n)!==BigInt(m.quantity))fail('TRACE_QUANTITY','Tracked receipt quantities must equal the full receipt line.');
    return parts;
  }
  const task=c.s.kittingTasks.find(task=>task.id===m.documentId);
  if(task){
    if(task.direction==='assemble'){
      const requested=Array.isArray(task.outputTrace)?task.outputTrace:task.outputTrace?[task.outputTrace]:[];
      const issued=valuationLedger(c.s,'9999').kittingIssues.get(task.id)??[];
      const parentIds=[...new Set(issued.flatMap(layer=>layer.traceId?[layer.traceId]:[]))];
      const expiry=parentIds.map(identityId=>get(c.s,'traceIdentities',identityId).expiry).filter(Boolean).sort()[0];
      const parts=requested.map((input:any)=>{if(expiry&&(!input.expiry||input.expiry>expiry))fail('TRACE_KIT_EXPIRY','The reviewed kit expiry must not outlive its earliest-expiring tracked component.');const quantity=decimal(input.quantity??format(BigInt(m.quantity)),true),identity=receiptIdentity(c,m.itemId,input,quantity,task.definition,parentIds);return {identityId:identity.id,quantity:quantity.toString()};});
      if(parts.reduce((n:bigint,part:any)=>n+BigInt(part.quantity),0n)!==BigInt(m.quantity))fail('TRACE_KIT','Review the output lot/serial identity and exact quantity on the kitting task.');
      return parts;
    }
    const issued=valuationLedger(c.s,'9999').kittingIssues.get(task.id)??[];
    const parts=issued.flatMap(layer=>layer.parts??[]).filter(part=>part.itemId===m.itemId);
    if(parts.some(part=>!part.traceId))fail('TRACE_KIT','The assembled kit does not retain every component identity.');
    const result=parts.map(part=>({identityId:part.traceId!,quantity:part.quantity.toString()}));
    if(result.reduce((n,part)=>n+BigInt(part.quantity),0n)!==BigInt(m.quantity))fail('TRACE_KIT','Component identities do not reconcile with the disassembly.');
    return result;
  }
  const returned=c.s.returns.find(r=>r.id===m.documentId);
  if(returned&&m.status==='quarantine'&&m.reason!=='Reviewed restock') {
    const shipment=get(c.s,'shipments',returned.shipmentId),line=shipment.lines.find((line:any)=>line.id===returned.shipmentLineId);
    if(returned.kit && line?.components?.every((part:any)=>part.itemId!==m.itemId)){
      const requested=Array.isArray(returned.trace)?returned.trace:returned.trace?[returned.trace]:[];
      const parents=[...new Set<string>((line.reservations??[]).flatMap((link:any)=>partsOf(c.s,link.movementId).map(part=>part.identityId)))];
      const expiry=parents.map(identityId=>get(c.s,'traceIdentities',identityId).expiry).filter(Boolean).sort()[0];
      const parts=requested.map((input:any)=>{if(expiry&&(!input.expiry||input.expiry>expiry))fail('TRACE_KIT_EXPIRY','A returned virtual kit’s new lot must retain its components’ earliest expiry.');const quantity=decimal(input.quantity??format(BigInt(m.quantity)),true),identity=receiptIdentity(c,m.itemId,input,quantity,returned.kit,parents);returned.traceNewKit=true;return {identityId:identity.id,quantity:quantity.toString()};});
      if(parts.reduce((n:bigint,part:any)=>n+BigInt(part.quantity),0n)!==BigInt(m.quantity))fail('TRACE_RETURN','Assign a new quarantined kit lot while retaining the actual shipped component identities.');
      return parts;
    }
    const source=line?.reservations?.filter((link:any)=>(link.itemId??line.itemId)===m.itemId).flatMap((link:any)=>partsOf(c.s,link.movementId)) ?? [];
    const grouped=new Map<string,bigint>();for(const part of source)grouped.set(part.identityId,(grouped.get(part.identityId)??0n)+BigInt(part.quantity));
    for(const prior of c.s.returns.filter(r=>r.id!==returned.id&&r.shipmentLineId===returned.shipmentLineId))for(const e of c.s.traceEvents.filter(e=>e.documentId===prior.id&&e.status==='quarantine'&&BigInt(e.quantity)>0n))grouped.set(e.identityId,(grouped.get(e.identityId)??0n)-BigInt(e.quantity));
    const pool=[...grouped].filter(([,q])=>q>0n).map(([identityId,q])=>({identityId,quantity:q.toString()}));
    const selected=selectors(c.s,m.itemId,Array.isArray(returned.trace)?returned.trace:returned.trace?[returned.trace]:inputs);
    if(policyFor(c.s,m.itemId).mode==='serial'&&!selected?.length&&pool.length!==1)fail('TRACE_RETURN','Choose the exact dispatched serial being returned.');
    return selectParts(pool,BigInt(m.quantity),selected);
  }
  // Transfers, restocks and quarantine moves carry exactly the identities issued
  // by the same document. Earlier receipts of a partial move consume that carry.
  const carry=new Map<string,bigint>();
  for(const e of c.s.traceEvents.filter(e=>e.documentId===m.documentId&&e.itemId===m.itemId&&e.commandId===c.commandId&&e.internal))carry.set(e.identityId,(carry.get(e.identityId)??0n)-BigInt(e.quantity));
  const pool=[...carry].filter(([,q])=>q>0n).map(([identityId,q])=>({identityId,quantity:q.toString()}));
  if(pool.length)return selectParts(pool,BigInt(m.quantity),selectors(c.s,m.itemId,inputs));
  fail('TRACE_SOURCE','This stock increase needs a retained receipt, return or matching identity-preserving move.');
}
function outgoing(c:Context,m:Movement,before:State,inputs:any[]|undefined) {
  const shipment=c.s.shipments.find(sh=>sh.id===m.documentId),line=shipment?.lines.find((line:any)=>line.reservations.some((link:any)=>link.movementId===m.id)),link=line?.reservations.find((link:any)=>link.movementId===m.id);
  let pool:any[];
  const allocation=link?c.s.traceReservations.find(a=>a.reservationId===link.reservationId):undefined;
  if(shipment&&link&&!allocation)fail('TRACE_RESERVATION','Dispatch needs the retained identity allocation for this reservation.');
  if(allocation)pool=allocation.parts;
  else {
    pool=identitiesAt(c.s,m.itemId,m.locationId,m.status,c.now.slice(0,10),false).map(x=>({identityId:x.identity.id,quantity:(x.quantity-(m.status==='sellable'?traceReserved(c.s,x.identity.id,m.locationId):0n)).toString()})).filter(x=>BigInt(x.quantity)>0n);
  }
  const quarantine=c.s.traceQuarantines.find(q=>q.id===m.documentId);
  let preferred=quarantine?quarantine.identityIds.map((identityId:string)=>({identityId})):selectors(c.s,m.itemId,inputs);
  if(m.reversalId)preferred=partsOf(before,m.reversalId).map(part=>({identityId:part.identityId}));
  if(shipment?.waveId) {
    const wave=get(c.s,'waves',shipment.waveId);
    const picks=wave.lines.filter((l:any)=>l.orderLineId===line.orderLineId&&l.itemId===m.itemId&&l.locationId===m.locationId).flatMap((l:any)=>l.scans.flatMap((scan:any)=>scan.trace??[]));
    const picked=new Map<string,bigint>();for(const part of picks)picked.set(part.identityId,(picked.get(part.identityId)??0n)+BigInt(part.quantity));
    for(const e of c.s.traceEvents.filter(e=>e.itemId===m.itemId&&e.locationId===m.locationId&&BigInt(e.quantity)<0n&&c.s.shipments.some(sh=>sh.id===e.documentId&&sh.waveId===shipment.waveId)))picked.set(e.identityId,(picked.get(e.identityId)??0n)+BigInt(e.quantity));
    preferred=[...picked].filter(([,q])=>q>0n).map(([identityId,q])=>({identityId,quantity:format(q)}));
    if(!preferred.length)fail('TRACE_PICK','Pick and confirm these lot/serial identities before packing their dispatch.');
  }
  const parts=selectParts(pool,-BigInt(m.quantity),preferred);
  if(shipment)for(const part of parts)if(!eligible(get(c.s,'traceIdentities',part.identityId),c.now.slice(0,10)))fail('TRACE_BLOCKED','Expired or quarantined lot/serial stock cannot ship.');
  return parts;
}
/** Reconcile all current movement and reservation doors before atomic admission. */
export function reconcileTrace(c:Context,before:State,payload:any) {
  const scan=payload.itemCode?resolve(c.s,payload.itemCode):null;
  const task=payload.planId?c.s.slottingPlans.find(plan=>plan.id===payload.planId)?.tasks[payload.taskIndex]:null;
  const requested=payload.trace ?? task?.trace ?? (scan&&'item'in scan?scan.item.trace:undefined);
  const inputs:any[]|undefined=requested===undefined?undefined:Array.isArray(requested)?requested:[requested];
  if(inputs?.some(input=>!input||typeof input!=='object'||Array.isArray(input)))fail('INPUT','Supply explicit trace identity objects.');
  for(const m of c.s.movements.slice(before.movements.length)) {
    if(!policyFor(c.s,m.itemId))continue;
    const selected=inputs?.filter(x=>(!x.itemId||x.itemId===m.itemId)&&(!x.locationId||x.locationId===m.locationId));
    const parts=BigInt(m.quantity)>0n?incoming(c,m,selected):outgoing(c,m,before,selected);
    if(policyFor(c.s,m.itemId).mode==='serial' && parts.some((part:any)=>BigInt(part.quantity)!==SCALE))fail('TRACE_SERIAL','Move each serialized unit whole, never as fractional stock.');
    for(const part of parts)row(c,'traceEvents',{movementId:m.id,documentId:m.documentId,commandId:c.commandId,internal:!c.s.receipts.some(r=>r.id===m.documentId)&&!c.s.shipments.some(sh=>sh.id===m.documentId)&&(!c.s.returns.some(r=>r.id===m.documentId)||m.reason==='Reviewed restock'),itemId:m.itemId,identityId:part.identityId,locationId:m.locationId,status:m.status,quantity:(BigInt(part.quantity)*(BigInt(m.quantity)<0n?-1n:1n)).toString(),actorId:c.actor.id});
  }
  c.s.traceReservations=c.s.traceReservations.filter(a=>c.s.reservations.some(r=>r.id===a.reservationId));
  for(const reservation of c.s.reservations.filter(r=>policyFor(c.s,r.itemId))) {
    let allocation=c.s.traceReservations.find(a=>a.reservationId===reservation.id);
    if(!allocation)allocation=row(c,'traceReservations',{reservationId:reservation.id,parts:[]});
    const current=allocation!.parts.reduce((n:bigint,p:any)=>n+BigInt(p.quantity),0n),wanted=BigInt(reservation.quantity);
    if(current>wanted){allocation!.parts=selectParts(allocation!.parts,wanted);allocation!.version++;}
    else if(current<wanted){
      const pool=identitiesAt(c.s,reservation.itemId,reservation.locationId,'sellable',c.now.slice(0,10)).map(x=>({identityId:x.identity.id,quantity:(x.quantity-traceReserved(c.s,x.identity.id,reservation.locationId)).toString()})).filter(x=>BigInt(x.quantity)>0n);
      allocation!.parts.push(...selectParts(pool,wanted-current));allocation!.version++;
    }
  }
  for(const returned of c.s.returns.filter(r=>!before.returns.some(old=>old.id===r.id)))returned.costTotal=returnCost(c.s,returned,c.now);
  for(const position of tracePositions(c.s))if(position.quantity.startsWith('-'))fail('TRACE_STOCK','Lot/serial balances cannot become negative.');
  // A pre-assembled kit carries its component identities in the valuation graph.
  if(c.s.shipments.length>before.shipments.length){const ledger=valuationLedger(c.s,c.now);for(const sh of c.s.shipments.filter(sh=>!before.shipments.some(old=>old.id===sh.id)))for(const [key,layers]of ledger.consumed)if(key.startsWith(sh.id+':')&&layers.some(layer=>!shippableLayer(c.s,layer,c.now.slice(0,10))))fail('TRACE_BLOCKED','This kit contains an expired or quarantined component identity.');}
}
export function tracePick(c:Context,line:any,scan:any,quantity:bigint) {
  if(!policyFor(c.s,line.itemId))return undefined;
  if(policyFor(c.s,line.itemId).mode==='serial'&&quantity%SCALE)fail('TRACE_SERIAL','Pick serialized units whole.');
  if(!scan?.identityId&&!scan?.lot&&!scan?.serial)fail('TRACE_SCAN','Scan GS1 lot/serial fields or enter the identity printed on these goods.');
  const selection=selectors(c.s,line.itemId,[scan]);
  const pool=c.s.traceReservations.filter(a=>c.s.reservations.some(r=>r.id===a.reservationId&&r.orderLineId===line.orderLineId&&r.locationId===line.locationId)).flatMap(a=>structuredClone(a.parts));
  const priorPicks=new Map<string,bigint>();
  for(const previous of c.s.waves.flatMap(w=>w.lines.filter((l:any)=>l.orderLineId===line.orderLineId&&l.locationId===line.locationId&&l.itemId===line.itemId).flatMap((l:any)=>l.scans.flatMap((scan:any)=>scan.trace??[]))))priorPicks.set(previous.identityId,(priorPicks.get(previous.identityId)??0n)+BigInt(previous.quantity));
  for(const e of c.s.traceEvents.filter(e=>BigInt(e.quantity)<0n&&e.itemId===line.itemId&&e.locationId===line.locationId&&c.s.shipments.some(sh=>sh.id===e.documentId&&sh.lines.some((l:any)=>l.orderLineId===line.orderLineId&&l.reservations.some((link:any)=>link.movementId===e.movementId)))))priorPicks.set(e.identityId,(priorPicks.get(e.identityId)??0n)+BigInt(e.quantity));
  for(const [identityId,quantity]of priorPicks)if(quantity>0n)selectParts(pool,quantity,[{identityId}]);
  const selected=selectParts(pool,quantity,selection);
  for(const part of selected)if(!eligible(get(c.s,'traceIdentities',part.identityId),c.now.slice(0,10)))fail('TRACE_BLOCKED','This reserved lot or serial is expired or quarantined.');
  return selected;
}
export function trace(c:Context,type:string,p:any):Row|undefined {
  if(type==='trace.configure'){
    requireRole(c,[]);const item=get(c.s,'items',p.itemId);fresh(item,p.version);
    if(!['lot','serial'].includes(p.mode)||!['fifo','fefo'].includes(p.allocation))fail('TRACE_POLICY','Choose lot or serial tracking and FIFO or FEFO allocation.');
    if(!item.tracePolicy&&c.s.movements.some(m=>m.itemId===item.id&&BigInt(m.quantity)!==0n))fail('TRACE_OPENING','Configure tracking before receiving this SKU; existing untracked history needs a reviewed identity cutover.');
    if(item.tracePolicy&&item.tracePolicy.mode!==p.mode)fail('TRACE_POLICY','An established tracking mode cannot reinterpret retained identity history.');
    item.tracePolicy={mode:p.mode,allocation:p.allocation,expiryRequired:p.expiryRequired===true,approvedBy:c.actor.id,approvedAt:c.now,reason:text(p.reason),version:(item.tracePolicy?.version??0)+1};item.version++;return item;
  }
  if(type!=='trace.quarantine')return;
  requireRole(c,['warehouse']);
  const identity=get(c.s,'traceIdentities',p.identityId),identities=c.s.traceIdentities.filter(i=>i.itemId===identity.itemId&&(identity.lot?i.lot===identity.lot:i.id===identity.id));
  const ids=new Set(identities.map(i=>i.id)),blocked=type==='trace.quarantine';
  let changed=true;while(changed){changed=false;for(const candidate of c.s.traceIdentities)if(!ids.has(candidate.id)&&(candidate.parentIdentityIds??[]).some((parent:string)=>ids.has(parent))){ids.add(candidate.id);identities.push(candidate);changed=true;}}
  const record=row(c,'traceQuarantines',{identityIds:[...ids],blocked,reason:text(p.reason),actorId:c.actor.id});
  for(const i of identities){i.blocked=blocked;i.version++;i.decisions=[...(i.decisions??[]),{blocked,reason:record.reason,actorId:c.actor.id,at:c.now}];}
  if(blocked){const lines=new Set(c.s.traceReservations.filter(a=>a.parts.some((part:any)=>ids.has(part.identityId))).map(a=>c.s.reservations.find(r=>r.id===a.reservationId)?.orderLineId));for(const order of c.s.orders.filter(order=>order.lines.some((line:any)=>lines.has(line.id)))){order.version++;order.traceHold={quarantineId:record.id,reason:record.reason,at:c.now};}c.s.reservations=c.s.reservations.filter(r=>!lines.has(r.orderLineId));}
  for(const i of identities)for(const loc of c.s.locations.filter(l=>l.kind==='bin')){
    const from=blocked?'sellable':'quarantine',to=blocked?'quarantine':'sellable',quantity=traceBalance(c.s,i.id,loc.id,from);
    if(quantity<=0n)continue;
    move(c,{itemId:i.itemId,locationId:loc.id,status:from,quantity:(-quantity).toString(),documentId:record.id,reason:record.reason});
    move(c,{itemId:i.itemId,locationId:loc.id,status:to,quantity:quantity.toString(),documentId:record.id,reason:record.reason});
  }
  return record;
}
export function traceState(s:State) {return {tracePositions:tracePositions(s)};}

export function traceReport(s:State,identityId:string) {
  const identity=get(s,'traceIdentities',identityId),events=s.traceEvents.filter(e=>e.identityId===identity.id);
  const ledger=valuationLedger(s,'9999');
  const contains=(layer:any):boolean=>layer.traceId===identityId||(layer.parts??[]).some(contains);
  const shipmentIds=new Set(events.filter(e=>BigInt(e.quantity)<0n&&s.shipments.some(sh=>sh.id===e.documentId)).map(e=>e.documentId));
  for(const [key,layers]of ledger.consumed)if(layers.some(contains))shipmentIds.add(key.split(':')[0]);
  const shipments=s.shipments.filter(sh=>shipmentIds.has(sh.id)).map(sh=>({...sh,customerId:s.orders.find(o=>o.id===sh.orderId)?.customerId}));
  const receiptIds=new Set(events.filter(e=>BigInt(e.quantity)>0n&&s.receipts.some(r=>r.id===e.documentId)).map(e=>e.documentId));
  const receipts=s.receipts.filter(r=>receiptIds.has(r.id)).map(r=>({...r,supplierId:s.purchaseOrders.find(po=>po.id===r.poId)?.supplierId}));
  return {identity,positions:tracePositions(s).filter(p=>p.identityId===identityId),events,receipts,shipments,customers:s.parties.filter(p=>shipments.some(sh=>sh.customerId===p.id)),suppliers:s.parties.filter(p=>receipts.some(r=>r.supplierId===p.id)),returns:s.returns.filter(r=>events.some(e=>e.documentId===r.id)||(ledger.returnedLayers.get(r.id)??[]).some(contains)),kittingTasks:s.kittingTasks.filter(task=>events.some(e=>e.documentId===task.id))};
}

export function tracePack(c:Context,w:Row,pack:Row,orderLineId:string,itemId:string,scan:any,quantity:bigint) {
  if(!policyFor(c.s,itemId))return undefined;
  if(!scan?.identityId&&!scan?.lot&&!scan?.serial)fail('TRACE_SCAN','Scan or enter the lot/serial identity being packed.');
  const pool=w.lines.filter((line:any)=>line.orderLineId===orderLineId&&line.itemId===itemId).flatMap((line:any)=>line.scans.flatMap((scan:any)=>structuredClone(scan.trace??[])));
  for(const part of pack.cartons.flatMap((carton:any)=>carton.lines.filter((line:any)=>line.orderLineId===orderLineId&&line.itemId===itemId).flatMap((line:any)=>line.trace??[])))selectParts(pool,BigInt(part.quantity),[{identityId:part.identityId}]);
  const selected=selectParts(pool,quantity,selectors(c.s,itemId,[scan]));
  for(const part of selected)if(!eligible(get(c.s,'traceIdentities',part.identityId),c.now.slice(0,10)))fail('TRACE_BLOCKED','Expired or quarantined identities cannot be packed.');
  return selected;
}

/** Choose identities across bins first; a bin boundary cannot defeat FEFO. */
export function reserveTracked(c:Context,orderId:string,orderLineId:string,itemId:string,warehouse:string|null,quantity:bigint,definition?:Row) {
  const bins=c.s.locations.filter(l=>l.kind==='bin'&&(!warehouse||l.warehouse===warehouse)),policy=policyFor(c.s,itemId);
  const candidates=bins.flatMap(bin=>identitiesAt(c.s,itemId,bin.id,'sellable',c.now.slice(0,10)).map(x=>({...x,bin}))).sort((a,b)=>(policy?.allocation==='fefo'?(a.identity.expiry??'9999').localeCompare(b.identity.expiry??'9999'):0)||a.identity.createdAt.localeCompare(b.identity.createdAt)||(a.identity.arrivalSequence??0)-(b.identity.arrivalSequence??0)||a.identity.id.localeCompare(b.identity.id)||a.bin.name.localeCompare(b.bin.name));
  const compatible=definition?valuationLedger(c.s,c.now).positions.filter(p=>p.itemId===itemId&&p.status==='sellable').flatMap(p=>p.layers.filter(layer=>matchesKit(layer,definition)&&shippableLayer(c.s,layer,c.now.slice(0,10))).map(layer=>({locationId:p.locationId,identityId:layer.traceId,quantity:layer.quantity}))):null;
  const wanted=quantity;
  for(const candidate of candidates){
    const compatibleQuantity=compatible?compatible.filter(part=>part.locationId===candidate.bin.id&&part.identityId===candidate.identity.id).reduce((n,part)=>n+part.quantity,0n):candidate.quantity;
    const free=min(candidate.quantity,compatibleQuantity)-traceReserved(c.s,candidate.identity.id,candidate.bin.id),take=min(quantity,min(free,available(c.s,itemId,candidate.bin.id)));
    if(take<=0n)continue;
    const reservationId=id();c.s.reservations.push({id:reservationId,orderId,orderLineId,itemId,locationId:candidate.bin.id,quantity:take.toString()});
    row(c,'traceReservations',{reservationId,parts:[{identityId:candidate.identity.id,quantity:take.toString()}]});
    quantity-=take;if(!quantity)break;
  }
  return wanted-quantity;
}
