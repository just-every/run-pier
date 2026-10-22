import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type Row } from './model';
import { orders, orderView } from './orders';
import { orderPrice } from './pricing';
import { isoDay } from './sales-quotes';
import { amount, money } from './money';
import { activeRule } from './routing';
export function recurringOrders(c:Context,type:string,p:any):Row|undefined {
  if(type==='customer.creditClearance') {
    requireRole(c,[]);const customer=get(c.s,'parties',p.customerId);fresh(customer,p.version);
    if(customer.kind!=='customer'||!['clear','hold'].includes(p.status))fail('CREDIT','Choose a customer and clear or hold status.');
    customer.creditClearance={status:p.status,allowance:format(decimal(p.allowance??'0')),used:'0.000000000000',validThrough:isoDay(p.validThrough,'Credit clearance expiry'),reason:text(p.reason),approvedBy:c.actor.id,at:c.now};customer.version++;return customer;
  }
  if(!type.startsWith('recurring.'))return;
  requireRole(c,[]);
  if(type==='recurring.save'){
    const old=p.id?get(c.s,'recurringOrders',p.id):undefined;if(old){fresh(old,p.version);if(old.cancelled)fail('RECURRING_CANCELLED','Create a new schedule after cancellation.');}
    const customer=get(c.s,'parties',p.customerId);if(customer.kind!=='customer')fail('CUSTOMER','Choose a customer.');
    if(!['hold-on-change','current-with-ceiling'].includes(p.pricePolicy)||!['backorder','full-stock'].includes(p.stockPolicy))fail('RECURRING_POLICY','Choose explicit price and stock policies.');
    if(!Number.isSafeInteger(p.cadenceDays)||p.cadenceDays<1||p.cadenceDays>366)fail('CADENCE','Use a cadence of one to 366 UTC days.');
    if(!Array.isArray(p.lines)||!p.lines.length)fail('LINES','Add recurring order lines.');
    const lines=p.lines.map((l:any)=>{const item=get(c.s,'items',l.itemId);if(item.archived)fail('ARCHIVED','Use active items.');return {itemId:item.id,quantity:format(decimal(l.quantity,true)),...(l.price!==undefined?{price:format(decimal(l.price))}:{})};});
    const prices=lines.map((l:any)=>orderPrice(c,customer.id,l.itemId,decimal(l.quantity),l.price).price);
    if(prices.some((price:any)=>price===null))fail('PRICE','Price every line explicitly or through a current customer tier.');
    const ceiling=format(decimal(p.ceiling,true)),nextDue=isoDay(p.nextDue,'Next recurrence day');
    if(old?.occurrences?.some((o:any)=>o.due===nextDue))fail('RECURRING_DUE','That occurrence already created an order. Choose a new due day.');
    const data={name:text(p.name),customerId:customer.id,lines,expectedPrices:prices,pricePolicy:p.pricePolicy,stockPolicy:p.stockPolicy,ceiling,cadenceDays:p.cadenceDays,nextDue,shipTo:p.shipTo??null,warehouse:p.warehouse??null,creditPolicy:'require-current-owner-clearance',enabled:p.enabled===true,cancelled:false,approvedBy:c.actor.id,reason:text(p.reason),lastOutcome:null};
    return old?Object.assign(old,data,{version:old.version+1}):row(c,'recurringOrders',{...data,occurrences:[]});
  }
  const schedule=get(c.s,'recurringOrders',p.scheduleId);fresh(schedule,p.version);
  if(type==='recurring.pause'||type==='recurring.cancel'){
    schedule.enabled=false;schedule.cancelled=type==='recurring.cancel';schedule.controls=[...(schedule.controls??[]),{action:type,actorId:c.actor.id,reason:text(p.reason),at:c.now}];schedule.version++;return schedule;
  }
  if(type!=='recurring.run')fail('COMMAND','Unknown recurring command.');
  const hold=(reason:string)=>{schedule.lastOutcome={status:'held',reason,at:c.now,due:schedule.nextDue};schedule.version++;return schedule;};
  if(!schedule.enabled||schedule.cancelled)return hold('Schedule is paused or cancelled.');
  if(schedule.nextDue>c.now.slice(0,10))return hold('The next occurrence is not due.');
  const customer=get(c.s,'parties',schedule.customerId),credit=customer.creditClearance;
  if(!credit||credit.status!=='clear'||credit.validThrough<c.now.slice(0,10))return hold('Current owner credit clearance is required.');
  const lines=schedule.lines.map((l:any)=>({...l,...orderPrice(c,customer.id,l.itemId,decimal(l.quantity),l.price)}));
  if(lines.some((l:any)=>l.price===null))return hold('A current customer price is unavailable.');
  if(schedule.pricePolicy==='hold-on-change'&&lines.some((l:any,i:number)=>l.price!==schedule.expectedPrices[i]))return hold('Customer price changed. Review and save a new schedule version.');
  const total=lines.reduce((n:bigint,l:any)=>n+decimal(l.quantity)*decimal(l.price),0n);
  if(total>decimal(schedule.ceiling)*1000000n)return hold('Order total exceeds the approved price ceiling.');
  if(total+amount(credit.used)>decimal(credit.allowance)*1000000n)return hold('The owner-reviewed credit allowance is exhausted.');
  if(c.automationActors?.[schedule.approvedBy]!=='owner'||c.automationActors?.[credit.approvedBy]!=='owner')return hold('Owner approval authority was revoked.');
  c.approver={id:credit.approvedBy,role:'owner'};
  const due=schedule.nextDue;
  if(schedule.occurrences.some((o:any)=>o.due===due))fail('RECURRING_DUPLICATE','This occurrence already created its order.');
  const source=`recurring:${schedule.id}`;
  const input={customerId:schedule.customerId,warehouse:schedule.warehouse,shipTo:schedule.shipTo,routingSource:source,channel:'recurring',lines};
  // Trial the same reservation door before any real record is made. No orphan
  // order or reservation may survive a full-stock hold.
  const trial:Context={...c,s:structuredClone(c.s)};let proposed:Row;
  try{proposed=orders(trial,'order.create',input)!;}catch(error){if((error as any).code==='KIT_SHORTAGE')return hold('Full kit stock is unavailable.');throw error;}
  if(proposed.routing.status==='waiting')return hold(proposed.routing.reason);
  if(schedule.stockPolicy==='full-stock'&&proposed.lines.some((l:any)=>l.backorder!=='0'))return hold('Full-stock policy waits for every line.');
  const order=orders(c,'order.create',input)!;
  Object.assign(get(c.s,'orders',order.id),{recurringScheduleId:schedule.id,recurringDue:due,recurringPolicyVersion:schedule.version,creditClearance:structuredClone(credit)});
  credit.used=money(amount(credit.used)+total);customer.version++;
  schedule.occurrences.push({due,orderId:order.id,policyVersion:schedule.version,total:money(total),at:c.now});
  schedule.nextDue=new Date(Date.parse(due)+schedule.cadenceDays*86400000).toISOString().slice(0,10);
  schedule.lastOutcome={status:'created',orderId:order.id,due,at:c.now};schedule.version++;return schedule;
}
