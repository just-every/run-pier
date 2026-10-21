import { type Context, type Row, decimal } from '../model';
import { amount, money, extended } from '../money';
import { valuationLedger } from '../valuation-ledger';
import type { BookDocument } from './adapters/types';
import { planSupplierBills } from './supplier-bills';
import { planReturnBooks } from './return-planning';
import { repairLandedCents } from '../landed-cost';

/** No silent rounding at the financial boundary. Source precision stays in evidence. */
export function dollars(value: string): string {
  const n = amount(value);
  if (n < 0n || n % 10000000000n) throw new Error('The source amount has fractions of a cent. Review the source cost or price with your accountant before posting.');
  return `${n / 1000000000000n}.${String(n / 10000000000n % 100n).padStart(2,'0')}`;
}
const ref = (prefix: string, id: string) => `PIER-${prefix}-${id.replaceAll('-','').slice(0,24)}`;
export function planBooks(c: Context) {
  const connection = c.s.bookConnections.find(r => r.enabled);
  if (!connection) return;
  // Receipts landed before freight and duty were split in whole cents are re-split once.
  repairLandedCents(c.s.receipts);
  // Unsent receipt-generated proposals are replaced by reviewed supplier invoices.
  // Already-attempted obligations retain their immutable identity and readback.
  c.s.bookJobs = c.s.bookJobs.filter(j => !(j.sourceKind === 'receipt' && j.kind === 'bill' && !j.attempted));
  const add = (key: string, kind: string, source: Row, sourceKind: string, reference: string, build: () => BookDocument) => {
    const old = c.s.bookJobs.find(j => j.key === key);
    if (old?.attempted || old?.status === 'skipped') return;
    let document: BookDocument | null = null, reason = '';
    try { document = build(); } catch (error) { reason = error instanceof Error ? error.message : 'Review the source document.'; }
    const fields = { kind, sourceId: sourceKind === 'order' ? source.orderId : source.id, sourceKind, reference, document, total: document?.total ?? null, currency:'USD', status: reason ? 'review' : 'pending', reason, fix: reason.includes('Books settings') ? 'Open Books settings, choose Reconnect Pantry, pick the Freight and duty account and save. Pier posts the journal on the next sync.' : 'Open the source, correct its missing price or USD cost, then retry. Fractions of a cent need accountant review.' };
    if (old) { if (JSON.stringify(old.document) !== JSON.stringify(document) || old.reason !== reason) Object.assign(old, fields, {version: old.version + 1}); }
    else c.s.bookJobs.push({ id: crypto.randomUUID(),version:1,key,connectionId:connection.id,...fields,createdAt:c.now,attempted:false });
  };
  for (const i of c.s.items) add(`item:${i.id}:${i.version}`,'item',i,'item',ref('ITEM',i.id),() => ({ key:`item:${i.id}:${i.version}`,kind:'item',date:c.now.slice(0,10),reference:ref('ITEM',i.id),lines:[{itemId:i.id,description:`${i.sku} · ${i.name}`,quantity:'1',amount:'0.00',account:''}],total:'0.00',attachment:{name:`${ref('ITEM',i.id)}-v${i.version}.txt`,content:JSON.stringify({sku:i.sku,name:i.name,unit:i.unit,packSize:i.packSize,barcode:i.barcode,archived:i.archived??false},null,2)} }));
  // Keep already-sent receipt obligations readable; all new bills require invoice matching.
  for (const receipt of c.s.receipts.filter(r => r.status === 'posted' && c.s.bookJobs.some(j => j.key === `bill:${r.id}` && j.attempted))) {
    const po = c.s.purchaseOrders.find(p => p.id === receipt.poId)!;
    const supplier = c.s.parties.find(p => p.id === po.supplierId)!;
    add(`bill:${receipt.id}`,'bill',receipt,'receipt',ref('BILL',receipt.id),() => {
      if (receipt.currency !== 'USD') throw new Error('This receipt has no reviewed USD valuation. Review the receipt cost first.');
      const lines = receipt.lines.map((l:any) => ({itemId:l.itemId,description:`${c.s.items.find(i=>i.id===l.itemId)?.sku} · received ${l.quantity} · ${receipt.supplierReference}`,quantity:l.quantity,amount:dollars(l.landedTotal ?? l.costTotal),account:connection.inventoryAccountId}));
      return {key:`bill:${receipt.id}`,kind:'bill',date:receipt.createdAt.slice(0,10),reference:ref('BILL',receipt.id),party:{id:supplier.id,name:supplier.name,kind:'supplier'},lines,total:dollars(money(lines.reduce((n:bigint,l:any)=>n+amount(l.amount),0n))),attachment:{name:`${ref('BILL',receipt.id)}-receipt.txt`,content:JSON.stringify({purchaseOrder:po.reference,supplierReference:receipt.supplierReference,receiptId:receipt.id,receivedAt:receipt.createdAt,lines:receipt.lines},null,2)}};
    });
  }
  planSupplierBills(c, connection, add, dollars);
  // Freight and duty enter Pantry's inventory from the account their carrier and
  // customs bills are entered in, so Pantry's stock value matches Pier's landed cost.
  for (const receipt of c.s.receipts.filter(r => r.status === 'posted' && r.currency === 'USD' && r.landedCost)) {
    const extra = receipt.lines.reduce((n: bigint, l: any) => n + amount(l.freight ?? '0') + amount(l.duty ?? '0'), 0n);
    if (!extra) continue;
    add(`landed:${receipt.id}`,'journal',receipt,'receipt',ref('LAND',receipt.id),() => {
      if (!connection.landedCostAccountId) throw new Error('This receipt carries freight or duty. Choose the Freight and duty account in Books settings so Pier can move it into inventory.');
      const total = dollars(money(extra));
      return {key:`landed:${receipt.id}`,kind:'journal',date:receipt.createdAt.slice(0,10),reference:ref('LAND',receipt.id),total,lines:[{description:`Freight and duty on receipt ${receipt.supplierReference}`,quantity:'1',amount:total,account:connection.inventoryAccountId,debit:total},{description:'Freight and duty moved into inventory',quantity:'1',amount:total,account:connection.landedCostAccountId,credit:total}]};
    });
  }
  const ledger = valuationLedger(c.s,c.now);
  for (const shipment of c.s.shipments) {
    const order = c.s.orders.find(o => o.id === shipment.orderId)!;
    const customer = c.s.parties.find(p => p.id === order.customerId)!;
    add(`invoice:${shipment.id}`,'invoice',shipment,'order',ref('INV',shipment.id),() => {
      const lines = shipment.lines.map((l:any) => {
        const ol = order.lines.find((line:any)=>line.id===l.orderLineId);
        if (typeof ol?.price !== 'string') throw new Error('This shipped order has no sales price. Open the sales order and choose Price this order; the invoice posts on the next sync.');
        const total=dollars(money(extended(l.quantity,ol.price)));
        if (amount(total) === 0n) throw new Error('A zero-price shipment needs an accountant decision before invoicing.');
        return {itemId:l.itemId,description:`${c.s.items.find(i=>i.id===l.itemId)?.sku} · shipped ${l.quantity} · ${shipment.reference}`,quantity:'1',unitPrice:total,amount:total,account:connection.revenueAccountId};
      });
      return {key:`invoice:${shipment.id}`,kind:'invoice',date:shipment.createdAt.slice(0,10),reference:ref('INV',shipment.id),party:{id:customer.id,name:customer.name,kind:'customer'},lines,total:dollars(money(lines.reduce((n:bigint,l:any)=>n+amount(l.amount),0n)))};
    });
    add(`cogs:${shipment.id}`,'journal',shipment,'order',ref('COGS',shipment.id),() => {
      const layers = [...new Set<string>(shipment.lines.flatMap((l:any)=>(l.components ?? [{ itemId:l.itemId }]).map((part:any)=>part.itemId)))].flatMap(itemId => ledger.consumed.get(`${shipment.id}:${itemId}`) ?? []);
      if (!layers.length || layers.some(l=>l.value===null)) throw new Error('This shipment contains stock without a reviewed USD cost. Resolve the stock valuation before posting cost of goods.');
      const total=dollars(money(layers.reduce((n,l)=>n+l.value!,0n)));
      if (!amount(total)) throw new Error('A zero-cost shipment needs an accountant decision before posting cost of goods.');
      return {key:`cogs:${shipment.id}`,kind:'journal',date:shipment.createdAt.slice(0,10),reference:ref('COGS',shipment.id),total,lines:[{description:'Cost of goods shipped',quantity:'1',amount:total,account:connection.cogsAccountId,debit:total},{description:'Inventory shipped',quantity:'1',amount:total,account:connection.inventoryAccountId,credit:total}]};
    });
  }
  planReturnBooks(c, connection, add, dollars);
  const frontier = c.s.movements.at(-1)?.sequence;
  if (frontier) {
    const source={id:`valuation-${frontier}`,version:1};
    add(`valuation:${frontier}`,'valuation',source,'valuation',`PIER-VALUE-${frontier}`,() => {
      const layers=ledger.positions.flatMap(p=>p.layers).filter(l=>l.quantity>0n);
      if(layers.some(l=>l.value===null)) throw new Error('Some stock has no reviewed USD cost. Resolve that valuation before sending the inventory-value evidence.');
      const value=money(layers.reduce((n,l)=>n+l.value!,0n));
      return {key:`valuation:${frontier}`,kind:'item',date:c.now.slice(0,10),reference:`PIER-VALUE-${frontier}`,total:dollars(value),lines:[],attachment:{name:`PIER-VALUE-${frontier}.txt`,content:JSON.stringify({asOf:c.now,movementFrontier:frontier,method:ledger.method,inventoryValueUSD:value,positions:ledger.positions.map(p=>({...p,layers:p.layers.map(l=>({...l,quantity:l.quantity.toString(),value:l.value===null?null:money(l.value)}))}))},null,2)}};
    });
  }
}
