import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { installation, basics, buy, receive, parse } from './harness.mjs';
import { channelEdge } from './channel-edge.mjs';

test('channel order reserves once and publishes net stock to every channel within a minute', async t => {
  const edge = channelEdge(), h = await installation({ outboundService: edge.outbound });
  t.after(() => h.close()); edge.setState(h.state);
  const b = await basics(h);
  await h.command('item.save', { ...b.item, sku: 'CASE-BLUE', version: b.item.version });
  await receive(h, b, await buy(h, b, '100'), '100');
  const ruby = await h.command('item.save', { sku: 'RUBY', name: 'Ruby case', unit: 'each', packSize: '1' });
  const rb = { ...b, item: ruby }; await receive(h, rb, await buy(h, rb, '100'), '100');
  const woo = await h.command('channel.save', { name: 'Warehouse shop', provider: 'woocommerce', baseUrl: 'https://woo.example.test', warehouse: 'North', credentials: { consumerKey: 'synthetic-key', consumerSecret: 'synthetic-secret', webhookSecret: 'synthetic-hook-secret' } });
  await h.command('channel.save', { name: 'Shopify account', provider: 'shopify', baseUrl: 'https://shop.example.test', warehouse: 'North', credentials: { accessToken: 'synthetic-shop-token', locationId: 'gid://shopify/Location/1' } });
  await h.command('channel.save', { name: 'Amazon account', provider: 'amazon', baseUrl: 'https://amazon.example.test', warehouse: 'North', credentials: { sellerId: 'SELLER', marketplaceId: 'ATVPDKIKX0DER', accessToken: 'synthetic-amazon-token' } });
  await h.command('channel.save', { name: 'Stall shop', provider: 'stall', baseUrl: 'https://stall.example.test', warehouse: 'North', credentials: { accessToken: 'synthetic-stall-token' } });
  let s = await h.state();
  assert.equal(s.channels.filter(c => c.problem).length, 0, JSON.stringify(s.channels));
  assert.ok(s.channelListings.some(l => !l.itemId && l.sku === 'CASE-RED'));
  assert.ok(s.channelOrders.some(o => !o.orderId && o.problem));
  for (const listing of s.channelListings.filter(l => !l.itemId)) {
    await h.command('channel.match', { listingId: listing.id, version: listing.version, itemId: ruby.id });
  }
  s = await h.state();
  assert.ok(s.channelOrders.every(o => o.orderId), JSON.stringify(s.channelOrders));
  assert.ok(s.channelListings.every(l => !l.problem), JSON.stringify(s.channelListings));
  const hold = await h.command('channel.hold', { itemId: b.item.id, warehouse: 'North', quantity: '10', reason: 'FBA transfer plan 14' });
  assert.equal((await h.state()).positions.find(p => p.itemId === b.item.id).held, '10');
  const before = await h.state(), orderCount = before.orders.length;
  const beforeFree = before.positions.find(p => p.itemId === b.item.id).available;
  edge.extraOrders.push({ id: 902, number: '902', status: 'processing', currency: 'USD', billing: { first_name: 'Maya', last_name: 'Chen' }, refunds: [], line_items: [{ id: 9020, sku: 'CASE-BLUE', quantity: 3, price: 12.5 }] });
  const raw = JSON.stringify({ id: 902 }), signature = createHmac('sha256', 'synthetic-hook-secret').update(raw).digest('base64'), started = Date.now();
  const hook = () => fetch(`${h.origin}/api/pier/channels/${woo.id}/webhook`, { method: 'POST', headers: { 'x-wc-webhook-signature': signature, 'content-type': 'application/json' }, body: raw });
  assert.equal((await hook()).status, 200);
  s = await h.state();
  assert.equal(s.orders.length, orderCount + 1);
  const imported = s.channelOrders.find(o => o.externalId === '902');
  const order = s.orders.find(o => o.id === imported.orderId);
  assert.equal(order.channel, 'woocommerce'); assert.equal(order.warehouse, 'North');
  assert.equal(order.lines[0].reserved, '3');
  const expected = String(Number(beforeFree) - 3);
  assert.equal(s.positions.find(p => p.itemId === b.item.id).available, expected);
  for (const provider of ['stall','woocommerce','shopify','amazon']) {
    const sent = edge.publications.filter(p => p.provider === provider && p.at >= started && p.quantity === expected);
    assert.ok(sent.length, `${provider} accepts the net availability after this order`);
    assert.ok(sent[0].at - started < 60000, `${provider} receives stock within a minute`);
  }
  assert.equal((await hook()).status, 200); await h.command('channel.sync', {});
  assert.equal((await h.state()).orders.length, orderCount + 1, 'Webhook replay and reconciliation never reserve twice');
  assert.equal((await fetch(`${h.origin}/api/pier/channels/${woo.id}/webhook`, { method: 'POST', body: raw, headers: { 'x-wc-webhook-signature': 'invalid' } })).status, 401);
  // Stall's paid checkout already owns a native Pier reservation: linking must not duplicate it.
  const native = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '1' }] });
  edge.setStallOrder(native); await h.command('channel.sync', {});
  s = await h.state(); assert.equal(s.orders.length, orderCount + 2);
  assert.equal(s.channelOrders.find(o => o.externalId === 'stall-paid-one').orderId, native.id);
  // A reservation made without prices takes the price Stall charged, so its invoice can post.
  const linked = s.orders.find(o => o.id === native.id);
  assert.deepEqual([linked.pricingStatus, linked.lines[0].price, linked.channel], ['priced', '12.5', 'stall']);
  assert.equal(Number(linked.total), 12.5);
  // Any other unpriced order is priced once from its order page; saved prices never change.
  const unpriced = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: ruby.id, quantity: '2' }] });
  const priced = await h.command('order.price', { orderId: unpriced.id, version: unpriced.version, lines: [{ orderLineId: unpriced.lines[0].id, price: '9.75' }] });
  assert.deepEqual([priced.pricingStatus, priced.lines[0].price], ['priced', '9.75']);
  assert.equal(Number(priced.total), 19.5);
  await h.command('order.price', { orderId: unpriced.id, version: priced.version, lines: [{ orderLineId: unpriced.lines[0].id, price: '1' }] }, { error: 'PRICED' });
  // A missed event is recovered by the same one-minute scheduled transport.
  edge.extraOrders.push({ id: 903, number: '903', status: 'processing', currency: 'USD', billing: { first_name: 'Ari', last_name: 'Rivera' }, refunds: [], line_items: [{ id: 9030, sku: 'CASE-BLUE', quantity: 1, price: 12.5 }] });
  const scheduled = await (await h.mf.getWorker()).scheduled({ scheduledTime: new Date(), cron: '* * * * *' });
  assert.equal(scheduled.outcome, 'ok');
  assert.equal((await h.state()).channelOrders.filter(o => o.externalId === '903' && o.orderId).length, 1);
  const free = (await h.state()).positions.find(p => p.itemId === b.item.id).available;
  const competing = await h.command('order.create', { customerId: b.customer.id, lines: [{ itemId: b.item.id, quantity: '100' }] });
  assert.equal(competing.lines[0].reserved, free, 'An ordinary order cannot consume the FBA hold');
  assert.equal((await h.state()).positions.find(p => p.itemId === b.item.id).held, '10');
  await h.command('channel.release', { holdId: hold.id, version: hold.version });
  s = await h.invariant();
  for (const position of s.positions) assert.ok(parse(position.available) >= 0n);
  const exported = await (await h.request('/api/pier/export')).text();
  assert.doesNotMatch(exported, /synthetic-(?:key|secret|hook-secret|shop-token|amazon-token|stall-token)/);
  const cipher = await h.db.prepare('SELECT secret FROM pier_channel_secrets LIMIT 1').first();
  assert.ok(cipher.secret); assert.doesNotMatch(cipher.secret, /synthetic/);
});

test('an owner chooses Shopify locations read from the platform without saving credentials in command history', async t => {
  let calls = 0, authorizations = 0, rejectAuthorization = false;
  let expectedToken = 'synthetic-location-secret';
  const h = await installation({ async outboundService(request) {
    calls++;
    const url = new URL(request.url);
    assert.equal(url.hostname, 'harbor.myshopify.com');
    if (url.pathname === '/admin/oauth/access_token') {
      authorizations++;
      assert.equal(request.method, 'POST');
      const form = new URLSearchParams(await request.text());
      assert.equal(form.get('grant_type'), 'client_credentials');
      assert.equal(form.get('client_id'), 'synthetic-location-client');
      assert.equal(form.get('client_secret'), 'synthetic-location-client-secret');
      if (rejectAuthorization) return Response.json({ error: 'invalid_client' }, { status: 401 });
      return Response.json({ access_token: 'synthetic-exchanged-location-token', expires_in: 86399 });
    }
    assert.equal(request.headers.get('x-shopify-access-token'), expectedToken);
    const body = await request.json();
    if (body.query.includes('query PierListings')) return Response.json({ data: { productVariants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    if (body.query.includes('query PierOrders')) return Response.json({ data: { orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    const second = body.variables.after === 'next-location';
    return Response.json({ data: { locations: { nodes: [{ id: `gid://shopify/Location/${second ? '2' : '1'}`, name: second ? 'Newark warehouse' : 'Reno warehouse' }], pageInfo: { hasNextPage: !second, endCursor: second ? null : 'next-location' } } } });
  } }); t.after(() => h.close());
  const result = await h.command('channel.shopifyLocations', { baseUrl: 'https://harbor.myshopify.com', accessToken: 'synthetic-location-secret' });
  assert.deepEqual(result.locations.map(l => l.name), ['Reno warehouse', 'Newark warehouse']);
  assert.equal(calls, 2);
  assert.equal(authorizations, 0, 'existing legacy tokens do not perform a client credentials exchange');
  const app = { baseUrl: 'https://harbor.myshopify.com', authMode: 'clientCredentials', clientId: 'synthetic-location-client', clientSecret: 'synthetic-location-client-secret' };
  expectedToken = 'synthetic-exchanged-location-token';
  const renewed = await h.command('channel.shopifyLocations', app);
  assert.deepEqual(renewed, result);
  assert.equal(authorizations, 1, 'both location pages share one exchanged token');
  assert.equal(calls, 5);
  rejectAuthorization = true;
  await h.command('channel.shopifyLocations', app, { error: 'CHANNEL_SETUP' });
  assert.equal(authorizations, 2);
  assert.equal(calls, 6, 'a refused exchange makes no GraphQL call or alternate authorization attempt');
  await h.command('channel.shopifyLocations', { baseUrl: 'https://unrelated.example.test', accessToken: 'synthetic-location-secret' }, { error: 'CHANNEL_SETUP' });
  await h.command('channel.shopifyLocations', { ...app, baseUrl: 'https://unrelated.example.test' }, { error: 'CHANNEL_SETUP' });
  assert.equal(calls, 6, 'an invalid platform address is refused before a network request');
  await h.command('channel.shopifyLocations', { baseUrl: 'https://harbor.myshopify.com', accessToken: 'synthetic-location-secret' }, { as: '', error: 'AUTH' });
  await h.command('channel.shopifyLocations', app, { as: '', error: 'AUTH' });
  assert.equal(calls, 6);
  const exported = await (await h.request('/api/pier/export')).text();
  for (const secret of ['synthetic-location-secret', app.clientId, app.clientSecret, expectedToken]) {
    assert.ok(!exported.includes(secret), 'setup credentials and exchanged tokens stay outside business export');
    assert.ok(!JSON.stringify(renewed).includes(secret), 'the location reply contains no credentials or token');
  }
  const secrets = await h.db.prepare('SELECT COUNT(*) AS n FROM pier_channel_secrets').first();
  assert.equal(secrets.n, 0, 'a setup lookup does not persist even an encrypted exchanged token');
  const commands = await h.db.prepare("SELECT COUNT(*) AS n FROM pier_commands WHERE result LIKE '%Newark warehouse%'").first();
  assert.equal(commands.n, 0, 'a setup lookup is read-only');
  // Save the owner's renewable credentials, then prove two real sync runs each
  // exchange once across their concurrent reads without persisting the token.
  rejectAuthorization = false;
  await basics(h);
  const saved = await h.command('channel.save', { name: 'Own Shopify store', provider: 'shopify', baseUrl: app.baseUrl, warehouse: 'North', enabled: false, credentials: { authMode: app.authMode, clientId: app.clientId, clientSecret: app.clientSecret, locationId: result.locations[0].id } });
  const cipherBefore = await h.db.prepare('SELECT secret FROM pier_channel_secrets WHERE channel_id=?').bind(saved.id).first();
  await h.command('channel.save', { ...saved, enabled: true });
  assert.equal(authorizations, 3, 'saved client credentials authorize concurrent listing and order reads once');
  const sync = await h.command('channel.sync', {});
  assert.ok(sync.channels.every(channel => !channel.problem));
  assert.equal(authorizations, 4, 'a later sync obtains fresh authorization without an owner replacing a token');
  const cipherAfter = await h.db.prepare('SELECT secret FROM pier_channel_secrets WHERE channel_id=?').bind(saved.id).first();
  assert.equal(cipherAfter.secret, cipherBefore.secret, 'authorization never persists an exchanged token over the saved client credentials');
  const savedExport = await (await h.request('/api/pier/export')).text();
  for (const secret of [app.clientId, app.clientSecret, expectedToken]) assert.ok(!savedExport.includes(secret));
});


test('owner routing versions choose zones, shortage policy, reroute and net channel publication without FBA stock', async t=>{
  const remote=[],publications=[];
  const page=nodes=>({nodes,pageInfo:{hasNextPage:false,endCursor:null}});
  const h=await installation({outboundService:async request=>{
    const body=await request.json(),q=body.query;
    if(q.includes('query PierListings'))return Response.json({data:{productVariants:page([{id:'gid://shopify/ProductVariant/1',sku:'BOLT',title:'Default',product:{title:'Bolt'},inventoryItem:{id:'gid://shopify/InventoryItem/1'}}])}});
    if(q.includes('query PierOrders'))return Response.json({data:{orders:page(remote)}});
    if(q.includes('query PierInventory'))return Response.json({data:{inventoryItem:{inventoryLevel:{quantities:[{name:'available',quantity:0}]}}}});
    if(q.includes('mutation PierStock')){const quantity=body.variables.input.quantities[0].quantity;publications.push(quantity);return Response.json({data:{inventorySetQuantities:{inventoryAdjustmentGroup:{changes:[{name:'available',quantityAfterChange:quantity}]},userErrors:[]}}});}
    throw new Error('Unexpected synthetic-pier Shopify request');
  }});t.after(()=>h.close());const b=await basics(h);
  const east=await h.command('location.save',{name:'synthetic-pier-East',warehouse:'East',kind:'bin'}),west=await h.command('location.save',{name:'synthetic-pier-West',warehouse:'West',kind:'bin'}),fba=await h.command('location.save',{name:'synthetic-pier-FBA',warehouse:'FBA',kind:'bin'});
  const po=await buy(h,b,'100');for(const [bin,quantity]of[[east,'20'],[west,'12'],[fba,'50']])await h.command('receipt.create',{poId:po.id,supplierReference:'synthetic-pier-1',lines:[{poLineId:po.lines[0].id,locationId:bin.id,quantity,cost:'1'}]});
  const channel=await h.command('channel.save',{name:'Shopify routing',provider:'shopify',baseUrl:'https://shop.example.test',warehouse:'East',buffer:'1',credentials:{accessToken:'synthetic-pier-1',locationId:'gid://shopify/Location/1'}});
  const zones=[{name:'West coast',zipPrefixes:Array.from({length:62},(_,i)=>String(i+900)),states:['WA','OR','NV','AZ'],countries:[],eligible:['West','East']}];
  const activate=async(source,shortage='hold',changes={})=>{let rule=await h.command('routing.save',{source,mode:'rules',shortage,zones,defaultEligible:['East','West'],...changes});await h.command('routing.activate',{ruleId:rule.id,version:rule.version},{error:'ROUTING_REVIEW'});rule=await h.command('routing.preview',{ruleId:rule.id,version:rule.version});return h.command('routing.activate',{ruleId:rule.id,version:rule.version});};
  await activate(`channel:${channel.id}`);
  const add=(id,zip,state,quantity=1)=>remote.push({id:`gid://shopify/Order/${id}`,name:`synthetic-pier-${id}`,closed:false,cancelledAt:null,displayFinancialStatus:'PAID',displayFulfillmentStatus:'UNFULFILLED',currencyCode:'USD',customer:{displayName:'Routing customer'},shippingAddress:{address1:'40 Pier Road',provinceCode:state,zip,countryCodeV2:'US'},fulfillmentOrders:page([{assignedLocation:{location:{id:'gid://shopify/Location/1'}}}]),lineItems:page([{id:`gid://shopify/LineItem/${id}`,sku:'BOLT',requiresShipping:true,unfulfilledQuantity:quantity,originalUnitPriceSet:{shopMoney:{amount:'2',currencyCode:'USD'}}}])});
  add(1,'94107','CA');add(2,'10001','NY');await h.command('channel.sync',{});
  let s=await h.state(),shop=s.orders.filter(o=>o.channelId===channel.id);assert.deepEqual(['synthetic-pier-1','synthetic-pier-2'].map(reference=>shop.find(o=>o.channelReference===reference).warehouse),['West','East']);assert.equal(shop.find(o=>o.channelReference==='synthetic-pier-1').routing.zone,'West coast');assert.equal(shop[0].channelLocation,'gid://shopify/Location/1');
  assert.equal(s.channelListings.find(l=>l.channelId===channel.id).available,'29');assert.equal(publications.at(-1),29);
  await h.command('routing.save',{source:'manual',mode:'rules',shortage:'hold',zones:[...zones,{...zones[0],name:'Overlapping zone'}],defaultEligible:[]},{error:'ROUTING_OVERLAP'});
  // Drain West to exactly two, while East retains at least ten.
  await activate('manual');const drain=await h.command('order.create',{customerId:b.customer.id,shipTo:{postalCode:'94107',country:'US'},lines:[{itemId:b.item.id,quantity:'9'}]});
  const order=async()=>h.command('order.create',{customerId:b.customer.id,shipTo:{postalCode:'94107',state:'CA',country:'US'},lines:[{itemId:b.item.id,quantity:'5',price:'2'}]});
  let held=await order();assert.deepEqual([held.warehouse,held.lines[0].reserved,held.lines[0].backorder],['West','2','3']);await h.command('order.cancel',{orderId:held.id,reason:'End hold policy proof'});
  await activate('manual','next');let next=await order();assert.deepEqual([next.warehouse,next.lines[0].reserved],['East','5']);await h.command('order.cancel',{orderId:next.id,reason:'End next policy proof'});
  await activate('manual','split');let split=await order();s=await h.state();let own=s.reservations.filter(r=>r.orderId===split.id);assert.deepEqual(own.map(r=>[s.locations.find(l=>l.id===r.locationId).warehouse,r.quantity]).sort(),[['East','3000000'],['West','2000000']]);
  await h.command('dispatch.create',{orderId:split.id,shipmentReference:'synthetic-pier-split-1',lines:[{orderLineId:split.lines[0].id,quantity:'5'}]},{error:'SHIPMENT_WAREHOUSE'});
  const a=await h.command('dispatch.create',{orderId:split.id,warehouse:'West',shipmentReference:'synthetic-pier-split-1',lines:[{orderLineId:split.lines[0].id,quantity:'2'}]}),z=await h.command('dispatch.create',{orderId:split.id,warehouse:'East',shipmentReference:'synthetic-pier-split-2',lines:[{orderLineId:split.lines[0].id,quantity:'3'}]});assert.deepEqual([a.warehouse,z.warehouse],['West','East']);
  const customer=(await h.state()).parties.find(p=>p.id===b.customer.id);await h.command('customer.splitPolicy',{customerId:customer.id,version:customer.version,allowSplit:false,reason:'Whole shipments only'});
  next=await order();assert.equal(next.warehouse,'East');await h.command('order.cancel',{orderId:next.id,reason:'End no-split proof'});
  await activate('manual','hold');const rerouted=await h.command('order.create',{customerId:b.customer.id,shipTo:{state:'OR',country:'US'},lines:[{itemId:b.item.id,quantity:'1'}]});
  await h.command('order.reroute',{orderId:rerouted.id,version:rerouted.version,warehouse:'FBA',reason:'Forbidden destination'},{error:'ROUTING_INELIGIBLE'});
  const changed=await h.command('order.reroute',{orderId:rerouted.id,version:rerouted.version,warehouse:'East',reason:'Reviewed delivery change'});assert.equal(changed.routingHistory[0].before.warehouse,'West');assert.equal(changed.warehouse,'East');
  let draft=await h.command('routing.save',{source:'manual',mode:'fixed',shortage:'hold',eligible:['East']});draft=await h.command('routing.preview',{ruleId:draft.id,version:draft.version});assert.ok(draft.dryRun.orders.find(o=>o.orderId===drain.id).changed);assert.ok(draft.dryRun.orders.find(o=>o.orderId===rerouted.id));
  await activate('manual','hold',{defaultEligible:[]});const waiting=await h.command('order.create',{customerId:b.customer.id,shipTo:{state:'NY',postalCode:'10001',country:'US'},lines:[{itemId:b.item.id,quantity:'1'}]});assert.equal(waiting.routing.status,'waiting');assert.equal(waiting.lines[0].reserved,'0');
  await activate('manual','hold',{mode:'channel-location',locations:{'synthetic-pier-1':['East']}});const missing=await h.command('order.create',{customerId:b.customer.id,channelLocation:'unmapped',lines:[{itemId:b.item.id,quantity:'1'}]});assert.equal(missing.routing.status,'waiting');
  const located=await h.command('order.create',{customerId:b.customer.id,channelLocation:'synthetic-pier-1',lines:[{itemId:b.item.id,quantity:'1'}]});assert.equal(located.warehouse,'East');
  s=await h.invariant();assert.ok(s.reservations.every(r=>r.locationId!==fba.id));assert.equal(s.positions.find(p=>p.locationId===fba.id).quantity,'50');
});
