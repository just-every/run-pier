import { decimal, fail, format, fresh, get, requireRole, row, text, type Context, type State } from './model';
import { amount, money } from './money';
import { reports } from './reports';

export function reportParameters(p: any): Record<string,string> {
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('REPORT_FILTER', 'Supply explicit report parameters.');
  const allowed = ['asOf','from','to','days','warehouse','customerId','channel','variantFamily'];
  if (Object.keys(p).some(key => !allowed.includes(key)) || Object.values(p).some(v => typeof v !== 'string' || v.length > 200)) fail('REPORT_FILTER', 'Use supported text report parameters only.');
  return { ...p };
}
function margins(rows: any[]) {
  const sum = (field:string) => rows.some(r=>r[field]===null) ? null : money(rows.reduce((n,r)=>n+amount(r[field]),0n));
  return { quantity: format(rows.reduce((n,r)=>n+decimal(r.quantity),0n)), revenue: sum('revenue'), cost: sum('cost'), margin: sum('margin') };
}
function groups(rows:any[],field:string) { return [...new Set(rows.map(r=>r[field]))].map(key=>({key,...margins(rows.filter(r=>r[field]===key))})); }
export function filteredReports(s: State, parameters: Record<string,string>, now = new Date().toISOString()) {
  const result = reports(s, new URLSearchParams(parameters), now), { warehouse,customerId,channel,variantFamily } = parameters;
  if (warehouse && !s.locations.some(l=>l.warehouse===warehouse)) fail('REPORT_FILTER','Choose an existing warehouse.');
  if (customerId && !s.parties.some(p=>p.id===customerId&&p.kind==='customer')) fail('REPORT_FILTER','Choose an existing customer.');
  const locations = new Set(s.locations.filter(l=>!warehouse||l.warehouse===warehouse).map(l=>l.id));
  const items = new Set(s.items.filter(i=>!variantFamily||i.variantFamily===variantFamily).map(i=>i.id));
  const position = (r:any) => locations.has(r.locationId)&&items.has(r.itemId);
  result.valuation.rows = result.valuation.rows.filter(position);
  const total = result.valuation.rows.some(r=>r.value===null) ? null : money(result.valuation.rows.reduce((n,r)=>n+amount(r.value!),0n));
  result.valuation.total = total;
  result.valuation.unvaluedQuantity = format(result.valuation.rows.reduce((n,r)=>n+decimal(r.unvaluedQuantity),0n));
  if (warehouse||variantFamily) result.valuation.reconciliation = { receipts:null,openings:null,returns:null,adjustments:null,cogs:null,closing:total,difference:null } as any;
  result.margin.rows = result.margin.rows.filter(r=>items.has(r.itemId)&&(!customerId||r.customerId===customerId)&&(!channel||r.channel===channel)&&(!warehouse||s.orders.find(o=>o.id===r.orderId)?.warehouse===warehouse));
  Object.assign(result.margin, margins(result.margin.rows), { bySku:groups(result.margin.rows,'itemId'),byChannel:groups(result.margin.rows,'channel'),byCustomer:groups(result.margin.rows,'customerId'),unpricedLines:result.margin.rows.filter(r=>r.revenue===null).length,unvaluedLines:result.margin.rows.filter(r=>r.cost===null).length });
  result.inactivity = result.inactivity.filter(position); result.deadStock.rows = result.deadStock.rows.filter(position);
  result.deadStock.total = result.deadStock.rows.some(r=>r.value===null)?null:money(result.deadStock.rows.reduce((n,r)=>n+amount(r.value!),0n));
  result.lowStock = result.lowStock.filter(r=>(!warehouse||r.warehouse===warehouse)&&items.has(r.itemId));
  if (warehouse||customerId||channel||variantFamily) { result.kitMargins=[]; result.orderCosts={}; result.methodHistory=[]; result.overdueOrders={...result.overdueOrders,rows:result.overdueOrders.rows.filter((r:any)=>!warehouse||r.warehouse===warehouse)}; }
  return { ...result, filters: parameters, generatedAt:now, sourceVersion:s.version, capacity:'PIER-SCALE-1 capacity has not been measured. No capacity guarantee is claimed.', filterBasis:'Warehouse and variant filters apply to physical positions and shipments. Customer and channel filters apply to shipment margin only. Low stock and reservations use current state. Installation-wide reconciliation and kit/order-cost summaries are unavailable for filtered reports.' };
}
export function savedReports(c: Context, type: string, p: any) {
  if (!type.startsWith('report.')) return;
  requireRole(c, []);
  if (type === 'report.save') {
    const old = p.id ? get(c.s,'savedReports',p.id) : undefined; if(old)fresh(old,p.version);
    const parameters = reportParameters(p.parameters); filteredReports(c.s, parameters, c.now);
    const data={name:text(p.name),parameters,approvedBy:c.actor.id,updatedAt:c.now};
    return old?Object.assign(old,data,{version:old.version+1}):row(c,'savedReports',data);
  }
  const saved = get(c.s,'savedReports',p.reportId);fresh(saved,p.version);
  if(type==='report.run') return row(c,'reportSnapshots',{reportId:saved.id,reportVersion:saved.version,generatedBy:c.actor.id,result:filteredReports(c.s,saved.parameters,c.now)});
  if(type==='report.schedule') {
    if(p.confirm!==true||!Number.isSafeInteger(p.cadenceMinutes)||p.cadenceMinutes<15||p.cadenceMinutes>525600)fail('REPORT_SCHEDULE','Explicitly approve a cadence of 15 to 525600 UTC minutes. No email is sent.');
    const id='report-'+saved.id, old=c.s.workflowRules.find(r=>r.id===id), warehouses=saved.parameters.warehouse?[saved.parameters.warehouse]:[...new Set(c.s.locations.map(l=>l.warehouse))];
    const data={name:saved.name,kind:'report',reportId:saved.id,reportVersion:saved.version,reportParameters:saved.parameters,warehouses,supplierIds:[],perRunBudget:'0.000000000000',dailyBudget:'0.000000000000',cadenceMinutes:p.cadenceMinutes,automaticApproval:false,enabled:p.enabled===true,killed:false,approvedBy:c.actor.id,approvedAt:c.now};
    return old?Object.assign(old,data,{version:old.version+1}):row(c,'workflowRules',{id,...data});
  }
  fail('COMMAND','Unknown saved report command.');
}
export function reportCsv(result: ReturnType<typeof filteredReports>) {
  const details = [...result.valuation.rows.map(r=>({report:'valuation',...r})),...result.margin.rows.map(r=>({report:'margin',...r})),...result.deadStock.rows.map(r=>({report:'dead-stock',...r}))];
  const metadata = { currency:result.currency,asOf:result.asOf,from:result.from,to:result.to,timezone:result.timezone,method:result.method,sourceVersion:result.sourceVersion,generatedAt:result.generatedAt,...result.filters,basis:result.filterBasis };
  const rows = [{report:'metadata',...metadata},...details.map(row=>({...metadata,...row}))];
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))], cell=(v:any)=>{let s=v===null?'Unknown':typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+@\-\t\r]/.test(s)&&!/^[-]?\d+(?:\.\d+)?$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell((r as any)[k])).join(','))].join('\r\n');
}
