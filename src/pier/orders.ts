import { repDefaults } from './customers';
import { route, sourceKey, routingFrontier } from './routing';
import { quoteLines, quoteTerms, currentQuote } from './sales-quotes';
import { requireQuoteApproval } from './quote-approval';
import { reserveTracked } from './trace';
import { policyFor, sortTraceReservations } from './trace-core';
import { kitDefinition, reserveKit, reservedKits, dispatchKit } from './kits';
import {
  decimal,
  format,
  get,
  id,
  item,
  fresh,
  nextReference,
  row,
  text,
  fail,
  requireRole,
  min,
  available,
  move,
  type Context,
  type Row,
} from "./model";
import { orderPrice, priceUnpricedLines } from "./pricing";
import { codeOwners } from "./catalogue-fields";
import { money } from "./money";
import { recordChannelPayment } from "./channel-payment";
export function routeOrder(c:Context,o:Row,p:any,override?:Row) {
  const decision:any=route(c.s,sourceKey(p),p.shipTo,p.channelLocation,p.warehouse,override);
  o.shipTo=p.shipTo??null;o.channelLocation=p.channelLocation??null;o.routing=decision;
  o.warehouse=decision.eligible[0]??null;
  const split=decision.shortage==='split'&&get(c.s,'parties',o.customerId).allowSplit===true;
  if(decision.shortage==='next'||decision.shortage==='split'&&!split){
    const full=decision.eligible.find((w:string)=>{
      const trial:Context={...c,s:structuredClone(c.s)};
      trial.s.reservations=trial.s.reservations.filter(r=>r.orderId!==o.id);
      trial.s.traceReservations=trial.s.traceReservations.filter(t=>trial.s.reservations.some(r=>r.id===t.reservationId));
      const copy:Row={...structuredClone(o),warehouse:w,routing:undefined};
      try{reserve(trial,copy);}catch(error){if((error as any).code==='KIT_SHORTAGE')return false;throw error;}
      return copy.lines.every((l:any)=>(l.kit?reservedKits(trial.s,l):trial.s.reservations.filter(r=>r.orderLineId===l.id).reduce((n,r)=>n+BigInt(r.quantity),0n))>=decimal(l.quantity)-decimal(l.dispatched)-decimal(l.cancelled));
    });
    o.warehouse=full??o.warehouse;
  }
  decision.reserveWarehouses=split?decision.eligible:o.warehouse?[o.warehouse]:[];
  decision.selectedWarehouse=o.warehouse;decision.split=split;
}
export function reserve(c: Context, o: Row) {
  if(o.fulfilment==='dropship'){o.version++;return o;}
  if(o.routing){
    if(o.routing.status==='waiting'){o.version++;return o;}
    for(const warehouse of o.routing.reserveWarehouses){reserve(c,{...o,warehouse,routing:undefined});}
    o.version++;return o;
  }
  for (const l of o.lines) {
    if (l.kit) { reserveKit(c, o, l); continue; }
    let need =
      decimal(l.quantity) -
      decimal(l.dispatched) -
      decimal(l.cancelled) -
      c.s.reservations
        .filter((r) => r.orderLineId === l.id)
        .reduce((n, r) => n + BigInt(r.quantity), 0n);
    if(policyFor(c.s,l.itemId)){reserveTracked(c,o.id,l.id,l.itemId,o.warehouse,need);continue;}
    for (const loc of c.s.locations.filter((l) => l.kind === "bin" && (!o.warehouse || l.warehouse === o.warehouse))) {
      const q = min(need, available(c.s, l.itemId, loc.id));
      if (q > 0n) {
        c.s.reservations.push({
          id: id(),
          orderId: o.id,
          orderLineId: l.id,
          itemId: l.itemId,
          locationId: loc.id,
          quantity: q.toString(),
        });
        need -= q;
      }
    }
  }
  o.version++;
  return o;
}
export function orderView(c: Context, o: Row, privateCommercial=c.actor.role==='owner') {
  return {
    ...o,
    ...(privateCommercial?{}:{salesRepId:undefined,salesRep:undefined,repHistory:undefined,creditClearance:undefined,quoteApproval:undefined,quoteHistory:undefined,tax:o.tax?{status:o.tax.status,source:o.tax.source,amount:o.tax.amount,rate:o.tax.rate,providerCommit:o.tax.providerCommit}:undefined}),
    lines: o.lines.map((l: any) => {
      const q = l.kit ? reservedKits(c.s, l) : c.s.reservations
        .filter((r) => r.orderLineId === l.id)
        .reduce((n, r) => n + BigInt(r.quantity), 0n);
      return {
        ...l,
        reserved: format(q),
        backorder: format(
          decimal(l.quantity) -
            decimal(l.dispatched) -
            decimal(l.cancelled) -
            q,
        ),
      };
    }),
  };
}
export function orders(c: Context, type: string, p: any): Row | undefined {
  if (
    ![
      "routing.preview",
      "order.reroute",
      "order.route",
      "order.shipTo",
      "order.create",
      "quote.create",
      "quote.accept",
      "quote.revise",
      "order.channelPayment",
      "order.reserve",
      "order.price",
      "order.cancel",
      "dispatch.create",
      "return.create",
      "return.approve",
      "return.restock",
    ].includes(type)
  )
    return;
  requireRole(c, (type.startsWith("order.") || type.startsWith("quote.") || type.startsWith("routing.")) ? ["operator"] : ["warehouse"]);
  if(type==='routing.preview'){
    requireRole(c,[]);const rule=get(c.s,'routingRules',p.ruleId);fresh(rule,p.version);
    if(rule.activeAt)fail('ROUTING_STATE','Prepare a new rule revision to dry-run.');
    const cutoff=new Date(Date.parse(c.now)-30*86400000).toISOString();
    const orders=c.s.orders.filter(o=>o.createdAt>=cutoff&&(o.routing?.source??(o.channelId?`channel:${o.channelId}`:o.ediPartnerId?`edi:${o.ediPartnerId}`:'manual'))===rule.source).map(o=>{
      const trial:Context={...c,s:structuredClone(c.s)};trial.s.reservations=trial.s.reservations.filter(r=>r.orderId!==o.id);
      const copy=structuredClone(o);routeOrder(trial,copy,{routingSource:rule.source,shipTo:o.shipTo,channelLocation:o.channelLocation},rule);
      return {orderId:o.id,reference:o.reference,before:o.warehouse,after:copy.warehouse,eligible:copy.routing.eligible,changed:o.warehouse!==copy.warehouse};
    });
    rule.dryRun={from:cutoff,to:c.now,orders,frontier:routingFrontier(c.s),actorId:c.actor.id};rule.version++;return rule;
  }
  if(type==='order.reroute'||type==='order.shipTo'||type==='order.route'){
    requireRole(c,[]);
    const o=get(c.s,'orders',p.orderId);fresh(o,p.version);
    if(o.lines.some((l:any)=>decimal(l.dispatched)>0n)||c.s.waves.some(w=>w.lines.some((l:any)=>l.orderId===o.id&&decimal(l.picked)>0n)))fail('ORDER_PICKED','Only an unpicked, unshipped order can be rerouted.');
    const before={warehouse:o.warehouse,routing:structuredClone(o.routing??null),shipTo:o.shipTo??null};
    if(type==='order.shipTo'&&o.documentType==='quote'){
      const revised=orders(c,'quote.revise',{orderId:o.id,version:o.version,reason:text(p.reason),shipTo:p.shipTo,validUntil:o.validUntil,discountPercent:o.discountPercent,lines:o.lines.map((l:any)=>({itemId:l.itemId,quantity:l.quantity,...(l.priceSnapshot?.source==='priceList'?{}:{price:l.listPrice??l.price})}))})!;
      o.routingHistory=[...(o.routingHistory??[]),{before,after:{warehouse:o.warehouse,shipTo:o.shipTo,routing:structuredClone(o.routing)},reason:text(p.reason),actorId:c.actor.id,at:c.now}];return revised;
    }

    c.s.reservations=c.s.reservations.filter(r=>r.orderId!==o.id);c.s.traceReservations=c.s.traceReservations.filter(t=>c.s.reservations.some(r=>r.id===t.reservationId));
    // Retain invalidated tasks as history; they cannot accept a stale scan.
    for(const wave of c.s.waves.filter(w=>w.lines.some((l:any)=>l.orderId===o.id))){
      for(const line of wave.lines.filter((l:any)=>l.orderId===o.id&&l.status==='open')){line.status='rerouted';line.reroutedAt=c.now;}
      if(wave.lines.every((l:any)=>l.status!=='open'))wave.status=wave.lines.some((l:any)=>l.status==='picked')?'picked':'cancelled';wave.version++;
    }
    if(type==='order.shipTo'||type==='order.route')routeOrder(c,o,{routingSource:o.routing?.source??'manual',shipTo:type==='order.shipTo'?p.shipTo:o.shipTo,channelLocation:o.channelLocation,warehouse:o.routing?.ruleId?undefined:o.warehouse});
    else{
      const eligible=o.routing?.eligible??[o.warehouse];if(!eligible.includes(p.warehouse))fail('ROUTING_INELIGIBLE','Choose a warehouse on this order’s retained eligibility list.');
      o.warehouse=p.warehouse;o.routing={...o.routing,eligible,status:'routed',selectedWarehouse:p.warehouse,reserveWarehouses:[p.warehouse],manualOverride:true};
    }
    o.routingHistory=[...(o.routingHistory??[]),{before,after:{warehouse:o.warehouse,shipTo:o.shipTo,routing:structuredClone(o.routing)},reason:text(p.reason),actorId:c.actor.id,at:c.now}];
    reserve(c,o);for(const incoming of c.s.channelOrders.filter(row=>row.orderId===o.id))incoming.problem=o.routing.status==='waiting'?o.routing.reason:null;return orderView(c,o);
  }
  if (type === 'quote.revise') {
    const q=get(c.s,'orders',p.orderId);fresh(q,p.version);
    if(q.documentType!=='quote'||q.lines.some((l:any)=>decimal(l.dispatched)>0n)||c.s.waves.some(w=>w.lines.some((l:any)=>l.orderId===q.id&&decimal(l.picked)>0n)))fail('QUOTE_STATE','Only unpicked, unshipped quote-derived demand can be revised.');
    const reason=text(p.reason,'Quote revision reason');
    const {quoteHistory:priorHistory,...priorVersion}=structuredClone(q);
    q.quoteHistory=[...(priorHistory??[]),{...priorVersion,approval:priorVersion.quoteApproval,reason,at:c.now}];
    const terms = { freight: q.charges?.find((r:any)=>r.kind==='freight')?.amount, handling: q.charges?.find((r:any)=>r.kind==='handling')?.amount, ...p, customerId:q.customerId };
    q.lines=quoteLines(c,terms);
    q.shipTo=p.shipTo??null;
    c.s.reservations=c.s.reservations.filter(r=>r.orderId!==q.id);c.s.traceReservations=c.s.traceReservations.filter(t=>c.s.reservations.some(r=>r.id===t.reservationId));
    for(const wave of c.s.waves.filter(w=>w.lines.some((l:any)=>l.orderId===q.id))){for(const line of wave.lines.filter((l:any)=>l.orderId===q.id&&l.status==='open')){line.status='revised';line.revisedAt=c.now;}if(wave.lines.every((l:any)=>l.status!=='open'))wave.status=wave.lines.some((l:any)=>l.status==='picked')?'picked':'cancelled';wave.version++;}
    routeOrder(c,q,{routingSource:q.routing?.source??'manual',shipTo:q.shipTo,channelLocation:q.channelLocation,warehouse:q.routing?.ruleId?undefined:q.warehouse});
    Object.assign(q,quoteTerms(c,{...terms,warehouse:q.routing?.reserveWarehouses?.length>1?null:q.warehouse},q.lines));
    reserve(c,q);return orderView(c,q);
  }
  if (type === 'quote.create') {
    if(p.currency && p.currency!=='USD') fail('CURRENCY','Quotes currently use USD.');
    if(p.warehouse && !c.s.locations.some(l=>l.kind==='bin'&&l.warehouse===p.warehouse)) fail('WAREHOUSE','Choose an existing warehouse.');
    const lines=quoteLines(c,p);
    const quote=row(c,'orders',{reference:nextReference(c.s.orders,'SO'),customerId:p.customerId,...repDefaults(c.s,p.customerId),warehouse:p.warehouse||null,promiseDate:p.promiseDate||null,channel:'manual',currency:'USD',documentType:'quote',lines});
    routeOrder(c,quote,{...p,routingSource:p.routingSource??'manual'});Object.assign(quote,quoteTerms(c,{...p,warehouse:quote.routing?.reserveWarehouses?.length>1?null:quote.warehouse},lines));reserve(c,quote);
    return orderView(c,quote);
  }
  if (type === 'quote.accept') {
    const quote = get(c.s, 'orders', p.orderId);
    if(quote.acceptedAt) return orderView(c,quote);
    fresh(quote, p.version);currentQuote(c,quote);
    // Acceptance binds the exact human-reviewed commercial version.
    requireQuoteApproval(c, quote);
    if (quote.documentType !== 'quote' || quote.acceptedAt) fail('QUOTE_STATE', 'Choose an open quote.');
    quote.acceptedAt = c.now; quote.acceptedBy = c.actor.id;quote.acceptanceHistory=[...(quote.acceptanceHistory??[]),{actorId:c.actor.id,at:c.now,version:quote.version,total:quote.total}]; quote.version++;
    return orderView(c, quote);
  }
  if (type === "order.channelPayment") {
    const order = get(c.s, 'orders', p.orderId);
    recordChannelPayment(c, order, p.payment);
    return orderView(c, order);
  }
  if (type === "order.create") {
    if (p.currency !== undefined && p.currency !== 'USD') fail('CURRENCY', 'Sales orders use USD. Foreign-currency conversion is not available yet.');
    if (get(c.s, "parties", p.customerId).kind !== "customer")
      fail("CUSTOMER", "Choose a customer.");
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add at least one order line.");
    if (p.currency !== undefined && p.currency !== "USD")
      fail("CURRENCY", "Sales orders use USD.");
    const lines = p.lines.map((l: any) => {
      const i = item(c.s, l.itemId),
        quantity = decimal(l.quantity, true);
      return {
        id: id(),
        itemId: i.id,
        ...(l.commercialQuantity ? {commercialQuantity:l.commercialQuantity,commercialUnit:l.commercialUnit,packSize:l.packSize,unit:l.unit} : {}),
        quantity: format(quantity),
        dispatched: "0",
        cancelled: "0",
        ...orderPrice(c, p.customerId, i.id, quantity, l.price),
        ...(kitDefinition(c.s, i.id) ? { kit: structuredClone(kitDefinition(c.s, i.id)) } : {}),
      };
    });
    if (p.warehouse && !c.s.locations.some(l => l.kind === "bin" && l.warehouse === p.warehouse)) fail("WAREHOUSE", "Choose an existing warehouse.");
    const priced = lines.every((l: any) => l.price !== null);
    const o = row(c, "orders", {
      reference: nextReference(c.s.orders, "SO"),
      customerId: p.customerId,
      ...repDefaults(c.s, p.customerId),
      warehouse: p.warehouse ? text(p.warehouse, "Warehouse") : null,
      promiseDate: p.promiseDate ?? null,
      channel: text(p.channel ?? "manual", "Order channel"),
      currency: "USD",
      pricingStatus: priced ? "priced" : "unpriced",
      total: priced
        ? money(
            lines.reduce(
              (sum: bigint, l: any) =>
                sum + decimal(l.quantity) * decimal(l.price),
              0n,
            ),
          )
        : null,
      lines,
    });
    recordChannelPayment(c, o, p.channelPayment);
    if(p.fulfilment==='dropship'){o.fulfilment='dropship';o.routing={source:'dropship',mode:'supplier-direct',status:'direct',eligible:[],reserveWarehouses:[]};}
    else if(p.nativeCutover===true)o.allocationOrigin='reviewed-native-cutover';
    else routeOrder(c,o,p);
    reserve(c, o);
    return orderView(c, o);
  }
  if (type === "order.price") {
    const o = get(c.s, "orders", p.orderId);
    fresh(o, p.version);
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Enter a unit price for each unpriced line.");
    if (!p.lines.some((x: any) => o.lines.some((l: any) => l.id === x.orderLineId && l.price === null)))
      fail("PRICED", "Every line of this order already has a price. Saved prices do not change.");
    priceUnpricedLines(c, o, p.lines, "reviewed");
    return orderView(c, o);
  }
  if (type === "order.reserve") {
    const o = get(c.s, "orders", p.orderId);
    reserve(c, o);
    return orderView(c, o);
  }
  if (type === "order.cancel") {
    const o = get(c.s, "orders", p.orderId);
    if(o.fulfilment==='dropship')fail('DROPSHIP','Cancel through the linked dropship with supplier confirmation.');
    o.cancelReason = text(p.reason);
    for (const l of o.lines)
      l.cancelled = format(decimal(l.quantity) - decimal(l.dispatched));
    c.s.reservations = c.s.reservations.filter((r) => r.orderId !== o.id);
    o.version++;
    return orderView(c, o);
  }
  if (type === "dispatch.create") {
    const o = get(c.s, "orders", p.orderId);
    if(o.fulfilment==='dropship')fail('DROPSHIP','Record a direct supplier shipment on the linked dropship.');
    if (o.documentType === 'quote' && !o.acceptedAt) fail('QUOTE_STATE', 'Accept this quote before dispatching it.');
    const reservationWarehouses=[...new Set(c.s.reservations.filter(r=>r.orderId===o.id).map(r=>get(c.s,'locations',r.locationId).warehouse))];
    if(o.routing && reservationWarehouses.length>1 && !p.warehouse) fail('SHIPMENT_WAREHOUSE','Choose one reserved warehouse per shipment.');
    const shipmentWarehouse=p.warehouse??(reservationWarehouses.length===1?reservationWarehouses[0]:null);
    if(p.warehouse && !reservationWarehouses.includes(p.warehouse))fail('SHIPMENT_WAREHOUSE','This warehouse has no reservation for the order.');
    const shipmentCode = text(p.shipmentReference);
    const owners = codeOwners(c.s, shipmentCode);
    const shipment = row(c, "shipments", {
      orderId: o.id,
      barcode: `PIER-SHIP-${id()}`,
      warehouse:shipmentWarehouse,
      reference: text(p.shipmentReference),
      lines: [],
    });
    if (codeOwners(c.s, shipment.barcode).some(owner => owner.id !== shipment.id)) fail('DUPLICATE', 'The allocated shipment barcode conflicts with an existing stock code. Retry this dispatch.');
    if (!Array.isArray(p.lines) || !p.lines.length)
      fail("LINES", "Add dispatch lines.");
    for (const x of p.lines) {
      const l = o.lines.find((l: any) => l.id === x.orderLineId);
      if (!l) fail("LINE", "Dispatch line must belong to this order.");
      let q = decimal(x.quantity, true);
      if (l.kit) {
        shipment.lines.push(dispatchKit(c, o, l, shipment, q,shipmentWarehouse??undefined));
        l.dispatched = format(decimal(l.dispatched) + q);
        continue;
      }
      const own = sortTraceReservations(c.s,c.s.reservations.filter((r) => r.orderLineId === l.id && (!shipmentWarehouse || get(c.s,'locations',r.locationId).warehouse===shipmentWarehouse)));
      if (own.reduce((n, r) => n + BigInt(r.quantity), 0n) < q)
        fail(
          "RESERVATION",
          "Dispatch requires this order’s active reservation.",
        );
      const links = [];
      for (const r of own) {
        const take = min(q, BigInt(r.quantity));
        if (take === 0n) continue;
        r.quantity = (BigInt(r.quantity) - take).toString();
        const movement=move(c, {
          itemId: l.itemId,
          locationId: r.locationId,
          status: "sellable",
          quantity: (-take).toString(),
          reason: "Dispatch " + shipment.reference,
          documentId: shipment.id,
        });
        links.push({
          movementId: movement.id,
          reservationId: r.id,
          locationId: r.locationId,
          quantity: format(take),
        });
        q -= take;
      }
      shipment.lines.push({
        id: id(),
        orderLineId: l.id,
        itemId: l.itemId,
        quantity: format(decimal(x.quantity)),
        reservations: links,
      });
      l.dispatched = format(decimal(l.dispatched) + decimal(x.quantity));
    }
    if (owners.some(owner => owner.kind !== 'shipment')) fail('DUPLICATE', `Shipment code ${shipmentCode} already belongs to ${owners.map(o => `${o.kind} ${o.name}`).join(', ')}.`, { owners });
    c.s.reservations = c.s.reservations.filter((r) => BigInt(r.quantity) > 0n);
    o.version++;
    return shipment;
  }
  if (type === "return.create") {
    return createReturn(c, p);
  }

  const r = get(c.s, "returns", p.returnId);
  if (r.version !== p.version) fail("STALE", "Return version changed.");
  if (r.status !== "quarantine")
    fail("RETURN_STATE", "Only quarantined returns may be reviewed.");
  if (type === "return.approve") {
    const remaining = decimal(r.quantity) - decimal(r.restocked ?? "0");
    const quantity = p.quantity === undefined ? remaining : decimal(p.quantity, true);
    if (quantity > remaining) fail("RETURN_QUANTITY", "Restock quantity exceeds the units still in quarantine.");
    r.approval = { actorId: c.actor.id, version: r.version, at: c.now, quantity: format(quantity) };
    return r;
  }
  if (!r.approval || r.approval.version !== r.version)
    fail("APPROVAL", "Review this exact return before restocking.");
  if (r.kit && r.inspection.some((part: any) => part.condition !== 'sellable')) fail('KIT_INSPECTION', 'A kit with a damaged component must stay quarantined. Inspect its components before restocking.');
  const remaining = decimal(r.quantity) - decimal(r.restocked ?? "0");
  const quantity = decimal(r.approval.quantity ?? format(remaining), true);
  if (quantity > remaining || (p.quantity === undefined ? remaining : decimal(p.quantity, true)) !== quantity)
    fail("RETURN_QUANTITY", "Restock only the exact quantity the inspector approved.");
  move(c, {
    itemId: r.itemId,
    locationId: r.locationId,
    status: "quarantine",
    quantity: (-quantity).toString(),
    reason: "Reviewed restock",
    documentId: r.id,
  });
  move(c, {
    itemId: r.itemId,
    locationId: r.locationId,
    status: "sellable",
    quantity: quantity.toString(),
    reason: "Reviewed restock",
    documentId: r.id,
  });
  r.restocked = format(decimal(r.restocked ?? "0") + quantity);
  r.restockReviews = [...(r.restockReviews ?? []), { ...r.approval, postedBy: c.actor.id, postedAt: c.now, quantity: format(quantity) }];
  r.approval = null;
  r.status = quantity === remaining ? "restocked" : "quarantine";
  r.version++;
  return r;
}

/** Physical intake shared by legacy returns and the scan bench; callers enforce authority. */
export function createReturn(c: Context, p: any): Row {
    const sh = get(c.s, "shipments", p.shipmentId),
      line = sh.lines.find((l: any) => l.id === p.shipmentLineId);
    if (!line) fail("LINE", "Return must reference an actual dispatch line.");
    const q = decimal(p.quantity, true),
      returned = c.s.returns
        .filter((r) => r.shipmentLineId === line.id)
        .reduce((n, r) => n + decimal(r.quantity), 0n);
    if (returned + q > decimal(line.quantity))
      fail("RETURN_LIMIT", "Cumulative return exceeds dispatched quantity.");
    if (get(c.s, "locations", p.locationId).kind !== "bin")
      fail("BIN", "Returns require a warehouse bin.");
    if (line.kit) {
      if (!Array.isArray(p.inspection) || p.inspection.length !== line.kit.components.length || line.kit.components.some((part: any) => !p.inspection.some((x: any) => x.itemId === part.itemId && ['sellable','damaged'].includes(x.condition) && typeof x.reason === 'string' && x.reason.trim()))) fail('KIT_INSPECTION', 'Inspect every component of the returned kit and record its condition and reason.');
    }
    const r = row(c, "returns", {
      shipmentId: sh.id,
      ...(p.trace ? { trace: structuredClone(p.trace) } : {}),
      ...(line.kit ? { kit: structuredClone(line.kit), inspection: structuredClone(p.inspection) } : {}),
      shipmentLineId: line.id,
      itemId: line.itemId,
      locationId: p.locationId,
      quantity: format(q),
      reason: text(p.reason),
      status: "quarantine",
    });
    move(c, {
      itemId: r.itemId,
      locationId: r.locationId,
      status: "quarantine",
      quantity: q.toString(),
      reason: r.reason,
      documentId: r.id,
    });
    return r;
}
