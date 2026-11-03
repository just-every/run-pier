import { decimal, fail, format, get, min, type Row, type State } from './model';

export const policyFor = (s: State,itemId:string) => s.items.find(i=>i.id===itemId)?.tracePolicy;
export function traceBalance(s: State, identityId:string, locationId:string, status:string) {
  return s.traceEvents.filter(e=>e.identityId===identityId&&e.locationId===locationId&&e.status===status).reduce((n,e)=>n+BigInt(e.quantity),0n);
}
export function eligible(identity: Row, today=new Date().toISOString().slice(0,10)) { return !identity.blocked && (!identity.expiry || identity.expiry>=today); }
export function traceReserved(s: State,identityId:string,locationId:string,except?:string) {
  return s.traceReservations.filter(a=>a.reservationId!==except&&s.reservations.some(r=>r.id===a.reservationId&&r.locationId===locationId)).flatMap(a=>a.parts).filter((p:any)=>p.identityId===identityId).reduce((n:bigint,p:any)=>n+BigInt(p.quantity),0n);
}
export function identitiesAt(s: State,itemId:string,locationId:string,status='sellable',today=new Date().toISOString().slice(0,10),onlyEligible=true) {
  const policy=policyFor(s,itemId);
  return s.traceIdentities.filter(i=>i.itemId===itemId&&(!onlyEligible||eligible(i,today))).map(i=>({identity:i,quantity:traceBalance(s,i.id,locationId,status)})).filter(x=>x.quantity>0n).sort((a,b)=>
    (policy?.allocation==='fefo' ? (a.identity.expiry??'9999').localeCompare(b.identity.expiry??'9999') : 0) || a.identity.createdAt.localeCompare(b.identity.createdAt) || (a.identity.arrivalSequence??0)-(b.identity.arrivalSequence??0) || a.identity.id.localeCompare(b.identity.id));
}
export function traceAvailable(s: State,itemId:string,locationId:string,today?:string) {
  return identitiesAt(s,itemId,locationId,'sellable',today).reduce((n,x)=>n+(x.quantity>traceReserved(s,x.identity.id,locationId)?x.quantity-traceReserved(s,x.identity.id,locationId):0n),0n);
}
export function selectParts(parts:any[],quantity:bigint,selection?:any[]) {
  const chosen:any[]=[];
  for(const part of parts) {
    if(selection?.length&&!selection.some(x=>x.identityId===part.identityId))continue;
    const request=selection?.find(x=>x.identityId===part.identityId);
    const take=min(quantity,min(BigInt(part.quantity), request?.quantity?decimal(request.quantity,true):quantity));
    if(take>0n){chosen.push({identityId:part.identityId,quantity:take.toString()});part.quantity=(BigInt(part.quantity)-take).toString();quantity-=take;}
    if(!quantity)break;
  }
  if(quantity)fail('TRACE_STOCK','The selected lot/serial is unavailable, reserved elsewhere or does not cover the exact quantity.');
  return chosen;
}
export function tracePositions(s: State) {
  const keys=[...new Set(s.traceEvents.map(e=>JSON.stringify([e.identityId,e.locationId,e.status])))];
  return keys.map(key=>{const [identityId,locationId,status]=JSON.parse(key),identity=get(s,'traceIdentities',identityId);return {id:key,identityId,itemId:identity.itemId,locationId,status,quantity:format(traceBalance(s,identityId,locationId,status)),lot:identity.lot,serial:identity.serial,expiry:identity.expiry,blocked:identity.blocked,expired:!!identity.expiry&&identity.expiry<new Date().toISOString().slice(0,10)};});
}
export function shippableLayer(s: State,layer:any,today=new Date().toISOString().slice(0,10)):boolean {
  return (!layer.traceId||eligible(get(s,'traceIdentities',layer.traceId),today)) && (layer.parts??[]).every((part:any)=>shippableLayer(s,part,today));
}

export function plannedTraceParts(s:State,itemId:string,locationId:string,quantity:bigint,today?:string) {
  if(!policyFor(s,itemId))return [];
  const pool=identitiesAt(s,itemId,locationId,'sellable',today).map(x=>({identityId:x.identity.id,quantity:(x.quantity-traceReserved(s,x.identity.id,locationId)).toString()})).filter(x=>BigInt(x.quantity)>0n);
  return selectParts(pool,quantity);
}

export function sortTraceReservations(s:State,rows:any[]) {
  const first=(reservation:any)=>{const part=s.traceReservations.find(a=>a.reservationId===reservation.id)?.parts.find((part:any)=>BigInt(part.quantity)>0n);return part?s.traceIdentities.find(i=>i.id===part.identityId):null;};
  return [...rows].sort((a,b)=>{const x=first(a),y=first(b);if(!x||!y)return 0;return (policyFor(s,a.itemId)?.allocation==='fefo'?(x.expiry??'9999').localeCompare(y.expiry??'9999'):0)||x.createdAt.localeCompare(y.createdAt)||(x.arrivalSequence??0)-(y.arrivalSequence??0)||a.id.localeCompare(b.id)});
}

export function unavailableTraceQuantity(s:State,itemId:string,locationId:string,today=new Date().toISOString().slice(0,10)) {
  return policyFor(s,itemId)?identitiesAt(s,itemId,locationId,'sellable',today,false).filter(x=>!eligible(x.identity,today)).reduce((n,x)=>n+x.quantity,0n):0n;
}
