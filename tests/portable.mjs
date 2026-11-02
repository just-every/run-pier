import { authenticatorCode } from './api/strong-auth-fixture.mjs';
// Full public-command portability proof. Runs sequential fresh installations;
// every child and directory is owned by this script and closed in finally.
import assert from "node:assert/strict";
import { admittedServer } from "./server-admission.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, cp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { inactiveRecord, inactiveValue } from "../scripts/installer/archive-policy.mjs";
import { documentOriginal } from "./api/document-original.mjs";
import { createHash, randomUUID } from "node:crypto";
const workspace = resolve("."),
  parent = await mkdtemp(join(tmpdir(), "pier-portable-")),
  children = new Set();
const excluded = new Set([
  ".git",
  "node_modules",
  ".wrangler",
  ".rer",
  ".seed",
  ".cache",
  ".tanstack",
  "dist",
  "exports",
  "test-results",
]);
const clean = (s) =>
  s
    .replace(/RER_OPEN[^\n]*/g, "RER_OPEN [private]")
    .replace(/token=[^\s"&<>]+/g, "token=[private]")
    .replace(/rer-dev=[^\s"&<>]+/g, "rer-dev=[private]");
async function copy(name) {
  const root = join(parent, name);
  await cp(workspace, root, {
    recursive: true,
    filter: (path) => {
      const rel = path.slice(workspace.length + 1);
      return (
        !excluded.has(rel.split("/")[0]) &&
        !rel.startsWith(".dev.vars") &&
        !rel.startsWith(".env")
      );
    },
  });
  // Setup may relink dependencies. Each installation must own its node_modules
  // so the public setup command cannot mutate the source checkout or its peer.
  await command(
    root,
    ["pnpm", "install", "--frozen-lockfile"],
    "corepack",
  );
  return root;
}
function child(root, args, executable = join(root, "node_modules/.bin/rer")) {
  const environment = { ...process.env };
  // Each scratch installation owns a new operation; the outer verification
  // token belongs to the source checkout and is invalid at another root.
  delete environment.RER_LOCAL_OPERATION;
  delete environment.RER_ONBOARDING_PROCESS_OWNER;
  const proc = spawn(executable, args, {
    cwd: root,
    env: {
      ...environment,
      CI: "true",
      RER_SERVER_JOURNEY: "1",
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(proc);
  let output = "";
  for (const pipe of [proc.stdout, proc.stderr])
    pipe.on("data", (chunk) => (output += chunk));
  const done = new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code) => {
      children.delete(proc);
      resolve(code);
    });
  });
  return { proc, done, output: () => output };
}
async function command(root, args, executable) {
  const p = child(root, args, executable),
    code = await p.done;
  assert.equal(code, 0, clean(p.output()).slice(-5000));
}
async function port() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const p = server.address().port;
  await new Promise((r) => server.close(r));
  return p;
}
// Stop this script's own foreground server as Ctrl-C does, by its process only.
async function interrupt(runtime) {
  if (runtime.proc.exitCode === null) runtime.proc.kill("SIGINT");
  await runtime.done;
}
async function start(root, p) {
  let launched;
  const runtime = await admittedServer(
    () => (launched = child(root, ["dev", "--port", String(p), "--foreground"])),
    () => interrupt(launched),
    clean,
  );
  try {
    const origin = `http://127.0.0.1:${p}`;
    let cookie = "";
    const request = (path, method = "GET", body, as = cookie) =>
      fetch(origin + path, {
        method,
        redirect: "manual",
        headers: { origin, "content-type": "application/json", cookie: as },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const open = runtime.output().match(/RER_OPEN (\S+)/)?.[1];
    assert.ok(open, "rer dev supplies the private one-click sign-in link");
    const link = new URL(open), fragment = new URLSearchParams(link.hash.slice(1));
    const gate = await request(link.pathname, "POST", { key: fragment.get("rer-dev") });
    assert.equal(gate.status, 204, await gate.text());
    cookie = gate.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    const entered = await request(`/auth/dev/enter?as=${fragment.get("as")}`);
    assert.equal(entered.status, 303, await entered.text());
    cookie +=
      "; " +
      entered.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; ");
    return {
      request,
      sessionCookie: () => cookie,
      async cmd(type, payload) {
        const response = await request("/api/pier/commands", "POST", {
          commandId: randomUUID(),
          type,
          payload,
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        return result.result;
      },
      async close() {
        await interrupt(runtime);
      },
    };
  } catch (error) {
    await interrupt(runtime);
    throw error;
  }
}
async function verifyNative(runtime, secret) {
  const state=await(await runtime.request('/auth/strong-auth/status')).json();
  if(state.restorePaused){
    assert.equal(state.enrolled,false,'archive restores no factor secret');
    assert.equal(state.verified,false,'archive restores no session assurance');
    assert.equal((await runtime.request('/api/pier/export')).status,403,'required assurance survives restore');
    assert.equal((await runtime.request('/auth/strong-auth/enroll','POST',{})).status,403,'restored enrollment refuses until explicit native owner recovery');
    const session=await(await runtime.request('/auth/session')).json();
    assert.equal((await runtime.request('/auth/strong-auth/recover','POST',{operatorId:session.operator.id,reason:'Fresh native owner restored installation'})).status,200);
    assert.equal((await runtime.request('/api/pier/state')).status,403,'restored recovery grants no private access before fresh verification');
    secret=undefined;
  }
  if(!secret)secret=(await(await runtime.request('/auth/strong-auth/enroll','POST',{})).json()).secret;
  let response=await runtime.request('/auth/strong-auth/verify','POST',{code:authenticatorCode(secret)});
  if(response.status===409){await new Promise(resolve=>setTimeout(resolve,30010-Date.now()%30000));response=await runtime.request('/auth/strong-auth/verify','POST',{code:authenticatorCode(secret)});}
  assert.equal(response.status,200,await response.clone().text());
  return secret;
}
let running;
try {
  const source = await copy("source"),
    destination = await copy("destination"),
    p = await port();
  await command(source, [
    "setup",
    "--owner-email",
    "owner@example.test",
    "--port",
    String(p),
    "--non-interactive",
  ]);
  running = await start(source, p);
  const item = await running.cmd("item.save", {
      sku: "PORTABLE",
      name: "Portable item",
      unit: "each",
      packSize: "0.5",
    }),
    location = await running.cmd("location.save", {
      name: "A1",
      warehouse: "Main",
      kind: "bin",
    }),
    supplier = await running.cmd("party.save", {
      name: "Supplier",
      kind: "supplier",
    });
  const po = await running.cmd("po.draft", {
    supplierId: supplier.id,
    promiseDate: "2026-11-01",
    reason: "Restore proof",
    lines: [{ itemId: item.id, quantity: "0.3", price: "0.1" }],
  });
  await running.cmd("po.approve", { poId: po.id, version: po.version });
  await running.cmd("po.commit", { poId: po.id, version: po.version });
  await running.cmd("receipt.create", {
    poId: po.id,
    supplierReference: "Source receipt",
    lines: [
      {
        poLineId: po.lines[0].id,
        locationId: location.id,
        quantity: "0.1",
        cost: "0.1",
      },
    ],
  });
  const customer = await running.cmd("party.save", {
    name: "Restore customer",
    kind: "customer",
  });
  const order = await running.cmd("order.create", {
    customerId: customer.id,
    warehouse: "Main",
    promiseDate: "2026-11-01",
    lines: [{ itemId: item.id, quantity: "0.2" }],
  });
  assert.equal(order.lines[0].reserved, "0.1");
  assert.equal(order.lines[0].backorder, "0.1");
  const importInput = {
    namespace: "portable-csv",
    sourceVersion: "1",
    exportedAt: "2026-10-13T00:00:00Z",
    filters: "all",
    cutoffTimezone: "Australia/Brisbane",
    currency: "USD",
    mappingRevision: "1",
    files: [
      {
        kind: "items",
        name: "items.csv",
        csv: "key,sku,name,barcode,unit,packSize\ni,RESTORE-IMPORT,Restore import,,each,1\n",
      },
      {
        kind: "locations",
        name: "locations.csv",
        csv: "key,name,warehouse,kind\nl,Restore bin,Main,bin\n",
      },
      {
        kind: "positions",
        name: "positions.csv",
        csv: "key,itemKey,locationKey,status,quantity,unit,cost\np,i,l,sellable,0.2,each,0.1\n",
      },
    ],
  };
  const csv = cells => cells.map(row => row.map(value => '"' + String(value).replaceAll('"','""') + '"').join(',')).join('\n') + '\n';
  importInput.files[0].csv=csv([['key','sku','name','barcode','unit','packSize','metadata'],['i','RESTORE-IMPORT','Restore import','','each','1',JSON.stringify({customFields:{private_value:'synthetic-pier-private-item'}})]]);
  importInput.files.push(
    {kind:'customFieldDefinitions',name:'fields.csv',csv:csv([['key','ownerType','fieldKey','label','type','options'],...['item','customer','supplier','order'].map(kind=>[kind,kind,'private_value','Private value','text','[]'])])},
    {kind:'parties',name:'parties.csv',csv:csv([['key','name','kind','metadata'],['typed-customer','Typed customer','customer',JSON.stringify({customFields:{private_value:'synthetic-pier-private-customer'}})],['typed-supplier','Typed supplier','supplier',JSON.stringify({customFields:{private_value:'synthetic-pier-private-supplier'}})]])},
    {kind:'orders',name:'orders.csv',csv:csv([['key','orderKey','customerKey','itemKey','quantity','unit','promiseDate','metadata'],['typed-line','typed-order','typed-customer','i','0.1','each','2026-11-01',JSON.stringify({customFields:{private_value:'synthetic-pier-private-order'}})]])}
  );
  let imported = await running.cmd("import.stage", importInput);
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    imported = await running.cmd("import.review", {
      batchId: imported.id,
      version: imported.version,
      stage,
      reason: "Portable custody proof",
    });
  imported = await running.cmd("import.commit", {
    batchId: imported.id,
    version: imported.version,
  });
  importInput.files[2].csv = importInput.files[2].csv.replace(
    "sellable,0.2",
    "sellable,0.4",
  );
  let revision = await running.cmd("import.stage", importInput);
  revision = await running.cmd("import.revise", {
    batchId: revision.id,
    version: revision.version,
    decisions: [{ kind: "positions", key: "p", action: "replace" }],
    reason: "Reconciled source revision before portable handover",
  });
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    revision = await running.cmd("import.review", {
      batchId: revision.id,
      version: revision.version,
      stage,
      reason: "Review corrected opening quantity",
    });
  revision = await running.cmd("import.commit", {
    batchId: revision.id,
    version: revision.version,
  });
  await running.cmd('supplierItem.save', { supplierId: supplier.id, itemId: item.id, code: 'synthetic-pier-1', packSize: '0.5', minimum: '0.5', price: '0.1', leadDays: 3 });
  await running.cmd('replenishment.save', { version: 0, itemId: item.id, warehouse: 'Main', supplierId: supplier.id, method: 'fixed', safetyStock: '0', reorderPoint: '1', reorderQuantity: '1', autoDraft: true });
  const currentPO = (await (await running.request('/api/pier/export')).json()).purchaseOrders.find(r => r.id === po.id);
  await running.cmd('po.authorizeSend', { poId: po.id, version: currentPO.version, recipient: 'supplier@example.test', maxSpend: '3', expiresAt: new Date(Date.now() + 86400000).toISOString(), maxChases: 0, confirm: true });
  let workflow = await running.cmd('workflow.save', { name: 'Portable inspection', kind: 'inventory-check', warehouses: ['Main'], supplierIds: [], perRunBudget: '0', dailyBudget: '0', cadenceMinutes: 15, automaticApproval: false });
  const workflowPreview = await running.cmd('workflow.preview', { ruleId: workflow.id, version: workflow.version });
  workflow = await running.cmd('workflow.enable', { ruleId: workflow.id, version: workflow.version, previewHash: workflowPreview.previewHash });
  await running.cmd('workflow.enqueue', { ruleId: workflow.id });
  const savedReport = await running.cmd('report.save', { name: 'Portable valuation', parameters: { warehouse: 'Main' } });
  await running.cmd('report.run', { reportId: savedReport.id, version: savedReport.version });
  await running.cmd('print.delivery.configure', { version: 0, provider: 'resend', verificationKey: 'synthetic-pier-7', consent: true });
  const original = documentOriginal([['synthetic-pier-1'], ['Private portable source original']]);
  await running.cmd('document.upload', { name: 'source.pdf', mimeType: 'application/pdf', base64: original.toString('base64') });
  await running.cmd('document.configure', { version: 0, model: 'synthetic-pier-model', apiKey: 'synthetic-pier-2', consent: true });
  await running.cmd('ai.save', { version: 0, model: 'synthetic-pier-model', apiKey: 'synthetic-pier-3', consent: true });
  await running.cmd('channel.save', { name: 'Portable channel', provider: 'woocommerce', baseUrl: 'https://synthetic-pier.example', warehouse: 'Main', enabled: false, credentials: { consumerKey: 'synthetic-pier-4', consumerSecret: 'synthetic-pier-5' } });
  const tradeKeys = ['synthetic-pier-12-portable-buyer-credential', 'synthetic-pier-13-portable-buyer-credential'];
  const tradeHash = key => createHash('sha256').update('pier-trade-buyer\0' + key).digest('hex');
  let tradeChannel = await running.cmd('channel.save', { name: 'Portable trade', provider: 'stall', baseUrl: 'https://trade.example.test', warehouse: 'Main', enabled: false, credentials: { accessToken: 'synthetic-pier-18' } });
  const tradeGrant = (buyerId, key) => ({ channelId: tradeChannel.id, version: tradeChannel.version, buyerId, customerId: customer.id, itemIds: [item.id], keyHash: tradeHash(key), shipTo: { country: 'US', postalCode: '94104' } });
  for (const [index, buyerId] of ['suppressed', 'purchased'].entries()) tradeChannel = await running.cmd('trade.grant', { ...tradeGrant(buyerId, tradeKeys[index]), followupConsent: { recipient: 'buyer@example.test', purpose: 'One abandoned wholesale cart reminder', source: 'synthetic-pier-14', at: '2026-10-26T00:00:00Z' } });
  tradeChannel = await running.cmd('channel.save', { id: tradeChannel.id, version: tradeChannel.version, name: 'Portable trade', provider: 'stall', baseUrl: 'https://trade.example.test', warehouse: 'Main', enabled: true, credentials: { accessToken: 'synthetic-pier-18' } });
  const tradeEvent = async (key, eventId, cartId, event) => {
    const response = await fetch(`http://127.0.0.1:${p}/api/pier/trade/cart-events`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ eventId, cartId, event }) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await tradeEvent(tradeKeys[0], 'unsubscribed', 'retained-cart', 'unsubscribed')).cart.status, 'suppressed');
  assert.equal((await tradeEvent(tradeKeys[1], 'purchased', 'retained-cart', 'purchased')).cart.status, 'purchased');
  const typedState=await(await running.request('/api/pier/state')).json();
  await running.cmd('business.save',{name:'Synthetic portable business',address:'1 Synthetic Pier Road',shipTo:{}});
  const typedPurchase=await running.cmd('po.draft',{supplierId:typedState.parties.find(p=>p.customFields?.private_value==='synthetic-pier-private-supplier').id,promiseDate:'2026-11-01',reason:'Typed PDF custody',lines:[{itemId:typedState.items.find(i=>i.sku==='RESTORE-IMPORT').id,quantity:'1',price:'1'}]});
  const typedDocument=await running.cmd('print.generate',{kind:'purchase-order',sourceId:typedPurchase.id});
  assert.equal((await (await running.request('/api/pier/export')).json()).customFieldDefinitions.length,4);
  assert.equal(typedDocument.typedFieldCustody,true);

  const nativeSecret=await verifyNative(running);
  assert.equal((await running.request('/auth/strong-auth/require','POST',{})).status,200);
  const nativePersona=async name=>{
    const entered=await running.request('/auth/dev/enter?as='+name);assert.equal(entered.status,303);
    const cookies=new Map(running.sessionCookie().split(';').map(part=>{const value=part.trim(),index=value.indexOf('=');return [value.slice(0,index),value.slice(index+1)];}));
    for(const value of entered.headers.getSetCookie()){const part=value.split(';')[0],index=part.indexOf('=');cookies.set(part.slice(0,index),part.slice(index+1));}
    const cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');
    const session=await(await running.request('/auth/session','GET',undefined,cookie)).json();return {cookie,session};
  };
  const securityAdmin=await nativePersona('admin'), securityTarget=await nativePersona('member');
  const securityGrant=await running.request('/auth/strong-auth/grant','POST',{delegateId:securityAdmin.session.operator.id,operatorId:securityTarget.session.operator.id,minutes:1440});
  assert.equal(securityGrant.status,200,await securityGrant.clone().text());
  assert.equal((await securityGrant.json()).grants.length,1,'source has a live human security grant');
  let orderWebhook = await running.cmd('webhook.save', { name: 'Portable order receiver', destination: 'https://receiver.example.com/orders', fields: ['status'], secret: 'synthetic-pier-19-private-signing-material' });
  orderWebhook = await running.cmd('webhook.preview', { subscriptionId: orderWebhook.id, version: orderWebhook.version, orderId: order.id });
  orderWebhook = await running.cmd('webhook.approve', { subscriptionId: orderWebhook.id, version: orderWebhook.version, destination: orderWebhook.destination, fields: orderWebhook.fields, previewDigest: orderWebhook.preview.digest, confirm: true });
  await running.cmd('order.reserve', { orderId: order.id });
  const before=await(await running.request('/api/pier/export')).json();
  const oldSession = running.sessionCookie();
  assert.ok(before.importJournal.jobs.length > 0);
  assert.ok(
    before.importJournal.jobs.every(
      (job) => job.state === "completed" && job.checkpoint === job.total,
    ),
  );
  assert.ok(before.importJournal.originals.length > 0);
  await running.close();
  running = null;
  const archive = join(parent, "installation.rer");
  await command(source, ["export", "--output", archive]);
  const corrupt = join(parent, 'corrupt.rer');
  const archiveBytes = await readFile(archive);
  for (const secret of ['synthetic-pier-2','synthetic-pier-3','synthetic-pier-4','synthetic-pier-5','synthetic-pier-7','synthetic-pier-19-private-signing-material', ...oldSession.split(';').map(part=>part.trim().slice(part.indexOf('=')+1))])
    assert.ok(!archiveBytes.includes(Buffer.from(secret)), 'installation archive excludes active credential/session material');
  const corruptBytes = Buffer.from(archiveBytes); corruptBytes[Math.floor(corruptBytes.length / 2)] ^= 1;
  await writeFile(corrupt, corruptBytes);
  const refused = child(destination, ['import', '--input', corrupt, '--yes']);
  assert.notEqual(await refused.done, 0, 'corrupt archive is refused before the valid restore');
  await command(destination, [
    "import",
    "--input",
    archive,
    "--yes",
  ]);
  const p2 = await port();
  await command(destination, [
    "setup",
    "--owner-email",
    "owner@example.test",
    "--port",
    String(p2),
    "--non-interactive",
  ]);
  running = await start(destination, p2);
  const restoredSecurity=await(await running.request('/auth/strong-auth/status')).json();
  assert.equal(restoredSecurity.required,true,'restore preserves required two-factor enforcement');
  assert.equal(restoredSecurity.restorePaused,true,'restore must pause enrollment before any recovery branch');
  assert.equal(restoredSecurity.enrolled,false,'restore excludes enrolled factors');
  assert.equal(restoredSecurity.verified,false,'restore excludes session proofs');
  await verifyNative(running);
  assert.deepEqual((await(await running.request('/auth/strong-auth/status')).json()).grants,[],'archive restore retains no live security grant authority');
  assert.equal(
    (await running.request("/api/pier/state", "GET", undefined, oldSession))
      .status,
    401,
    "restored operator evidence does not restore the source native session",
  );
  const after = await (await running.request("/api/pier/export")).json();
  assert.deepEqual(
    after.importJournal,
    before.importJournal,
    "complete native import journals and originals survived restore",
  );
  assert.deepEqual(
    after.commands,
    before.commands.map(command => ({ ...command, result: inactiveValue(command.result) })),
    "durable command outcomes survived restore without active provider links",
  );
  assert.equal(before.webhookDeliveries.length, 1, 'source retains a queued signed notification');
  assert.equal(before.webhookDeliveries[0].status, 'queued');
  assert.equal(after.webhookSubscriptions[0].enabled, false, 'restore pauses prior webhook approval');
  assert.equal(after.webhookSubscriptions[0].restorePaused, true);
  assert.equal(after.webhookDeliveries[0].status, 'restore-paused', 'restore cannot resume a queued notification');
  await running.cmd('webhook.process', {});
  assert.equal((await (await running.request('/api/pier/export')).json()).webhookDeliveries[0].status, 'restore-paused');
  // Every current and future business collection is compared, including source
  // bytes and valuation/approval histories; only declared authority is paused.
  for (const [field, rows] of Object.entries(before)) {
    if (!Array.isArray(rows) || field === 'commands') continue;
    assert.deepEqual(
      [...after[field]].sort((a, b) => a.id.localeCompare(b.id)),
      rows.map(r => inactiveRecord(field, r)).sort((a, b) => a.id.localeCompare(b.id)),
      field + ' restored with only declared inactive-authority changes',
    );
  }
  let restoredTrade = after.channels.find(channel => channel.id === tradeChannel.id);
  assert.equal(restoredTrade.enabled, false);
  assert.deepEqual(restoredTrade.tradeBuyers.map(buyer => [buyer.buyerId, buyer.enabled, buyer.keyHash, buyer.followupConsent, buyer.suppressed]), [['suppressed', false, null, null, true], ['purchased', false, null, null, false]]);
  assert.ok(restoredTrade.tradeBuyers[1].carts[0].purchasedAt);
  const restoredCatalog = key => fetch(`http://127.0.0.1:${p2}/api/pier/trade/catalog`, { headers: { authorization: `Bearer ${key}` } });
  for (const key of tradeKeys) assert.equal((await restoredCatalog(key)).status, 403);
  restoredTrade = await running.cmd('channel.save', { id: restoredTrade.id, version: restoredTrade.version, name: 'Portable trade', provider: 'stall', baseUrl: 'https://trade.example.test', warehouse: 'Main', enabled: true, credentials: { accessToken: 'synthetic-pier-18' } });
  for (const key of tradeKeys) assert.equal((await restoredCatalog(key)).status, 403, 're-enablement cannot restore buyer credentials');
  const freshKeys = ['synthetic-pier-15-restored-buyer-credential', 'synthetic-pier-16-restored-buyer-credential'];
  for (const [index, buyerId] of ['suppressed', 'purchased'].entries()) {
    restoredTrade = await running.cmd('trade.grant', { ...tradeGrant(buyerId, freshKeys[index]), version: restoredTrade.version });
    const catalog = await restoredCatalog(freshKeys[index]);
    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).followupSuppressed, index === 0);
    for (const cartId of ['retained-cart', 'new-cart']) {
      const response = await fetch(`http://127.0.0.1:${p2}/api/pier/trade/cart-events`, { method: 'POST', headers: { authorization: `Bearer ${freshKeys[index]}`, 'content-type': 'application/json' }, body: JSON.stringify({ eventId: cartId, cartId, event: 'abandoned' }) });
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { ok: true, cart: { cartId, status: index === 0 ? 'suppressed' : cartId === 'retained-cart' ? 'purchased' : 'no-consent' }, reminderSent: false });
    }
  }
  assert.equal(after.evidenceDocuments[0].original, original.toString('base64'));
  assert.equal(after.salesDocuments.find(d=>d.id===typedDocument.id).pdf,typedDocument.pdf);
  const typedPlan=await(await running.request('/api/pier/privacy?kind=customer&subjectId='+customer.id)).json();
  assert.match(typedPlan.refusal,/Erasure refused: subject attribution/);
  const typedRefusal=await running.request('/api/pier/commands','POST',{commandId:randomUUID(),type:'privacy.eraseSubject',payload:{kind:'customer',subjectId:customer.id,planHash:typedPlan.planHash,confirm:true}});
  assert.equal((await typedRefusal.json()).error.message,typedPlan.refusal);
  const restoredAudit=await(await running.request('/api/pier/audit')).json();
  assert.ok(restoredAudit.some(e=>e.type==='privacy.eraseSubject'&&e.outcome==='refused'));
  assert.ok(!JSON.stringify(restoredAudit).includes('synthetic-pier-private-'));

  for (const field of ['documentSettings', 'aiSettings', 'channels', 'replenishmentPolicies', 'workflowRules'])
    assert.ok(after[field].every(r => r.enabled !== true && r.autoDraft !== true && r.restorePaused), field + ' paused');
  assert.equal((await running.request('/api/pier/documents/' + after.evidenceDocuments[0].id + '/original')).status, 200);
  await running.cmd('document.configure', { version: after.documentSettings[0].version, model: 'synthetic-pier-model', apiKey: 'synthetic-pier-6', consent: true });
  assert.equal((await (await running.request('/api/pier/export')).json()).documentSettings[0].enabled, true, 'fresh owner explicitly reconnects');
  let repeated = await running.cmd("import.stage", importInput);
  assert.deepEqual(repeated.errors, []);
  for (const stage of ["mapped", "reconciled", "shadow", "frozen"])
    repeated = await running.cmd("import.review", {
      batchId: repeated.id,
      version: repeated.version,
      stage,
      reason: "Reconcile identical restored source revision",
    });
  await running.cmd("import.commit", {
    batchId: repeated.id,
    version: repeated.version,
  });
  assert.equal(
    (await (await running.request("/api/pier/state")).json()).movements.length,
    before.movements.length,
    "latest restored revision is a no-op",
  );
  await running.cmd("receipt.create", {
    poId: po.id,
    supplierReference: "After restore",
    lines: [
      {
        poLineId: po.lines[0].id,
        locationId: location.id,
        quantity: "0.2",
        cost: "0.1",
      },
    ],
  });
  const state = await (await running.request("/api/pier/state")).json();
  assert.equal(
    state.positions.find((p) => p.itemId === item.id).quantity,
    "0.3",
  );
  const restoredOrder = state.orders.find((o) => o.id === order.id);
  assert.equal(restoredOrder.lines[0].reserved, "0.1");
  assert.equal(restoredOrder.lines[0].backorder, "0.1");
  await running.cmd("import.undo", {
    batchId: revision.id,
    version: revision.version,
    reason: "Undo restored untouched import through its retained journal",
  });
  assert.equal(state.purchaseOrders[0].lines[0].received, "0.3");
  await running.close();
  running = null;
  await command(destination, [
    "export",
    "--output",
    join(parent, "restored.rer"),
  ]);
  // A later journal is a real public archive made after explicit erasure.
  // Its checkpoint refuses the older source archive before any private row
  // returns. A current archive restores normally with the source absent.
  running = await start(source, p);
  await verifyNative(running,nativeSecret);
  const erasurePlan = await (await running.request('/api/pier/privacy?kind=attachment&subjectId=' + before.evidenceDocuments[0].id)).json();
  await running.cmd('privacy.eraseAttachment', { documentId: before.evidenceDocuments[0].id, planHash: erasurePlan.planHash, confirm: true });
  await running.close(); running = null;
  const later = join(parent, 'later-journal.rer');
  await command(source, ['export', '--output', later]);
  const fenced = await copy('fenced-destination');
  await cp(later, join(fenced, 'later-journal.rer'));
  const older = child(fenced, ['import', '--input', archive, '--journal', 'later-journal.rer', '--yes']);
  assert.notEqual(await older.done, 0, 'later erasure checkpoint refuses the older archive');
  assert.match(clean(older.output()), /erasure_epoch/, 'refusal identifies the later-journal fence');
  await command(fenced, ['import', '--input', later, '--yes']);
  const p3 = await port();
  await command(fenced, ['setup', '--owner-email', 'owner@example.test', '--non-interactive', '--port', String(p3)]);
  running = await start(fenced, p3);
  await verifyNative(running);
  const fencedExport = await (await running.request('/api/pier/export')).json();
  assert.equal(fencedExport.evidenceDocuments.length, 0);
  assert.ok(!JSON.stringify(fencedExport).includes(original.toString('base64')));
  assert.deepEqual(fencedExport.movements, before.movements);
  assert.ok(fencedExport.workflowRules.every(rule => !rule.enabled));
  assert.equal((await running.request('/api/pier/documents/' + before.evidenceDocuments[0].id + '/original')).status, 404);
  await running.close(); running = null;
  // A separate fresh installation proves retained custody with no live definitions.
  const undoRoot=await copy('typed-undo'), undoPort=await port();
  await command(undoRoot,['setup','--owner-email','owner@example.test','--non-interactive','--port',String(undoPort)]);
  running=await start(undoRoot,undoPort);
  let undoBatch=await running.cmd('import.stage',{...importInput,namespace:'typed-undo'});
  assert.deepEqual(undoBatch.errors,[]);
  for(const stage of ['mapped','reconciled','shadow','frozen']) undoBatch=await running.cmd('import.review',{batchId:undoBatch.id,version:undoBatch.version,stage,reason:'Review independent typed custody'});
  undoBatch=await running.cmd('import.commit',{batchId:undoBatch.id,version:undoBatch.version});
  await running.cmd('import.undo',{batchId:undoBatch.id,version:undoBatch.version,reason:'Remove all eligible imported live definitions'});
  const unrelated=await running.cmd('party.save',{kind:'customer',name:'Unrelated custody subject'});
  const refusalProof=async(restored=false)=>{
    const current=await(await running.request('/api/pier/export')).json();
    assert.equal(current.customFieldDefinitions.length,0);
    assert.ok(current.imports.some(batch=>batch.status==='undone'&&batch.source.records.some(r=>r.kind==='customFieldDefinitions')));
    const plan=await(await running.request('/api/pier/privacy?kind=customer&subjectId='+unrelated.id)).json();
    assert.match(plan.refusal,/Erasure refused: subject attribution/);
    const result=await running.request('/api/pier/commands','POST',{commandId:randomUUID(),type:'privacy.eraseSubject',payload:{kind:'customer',subjectId:unrelated.id,planHash:plan.planHash,confirm:true}});
    assert.equal((await result.json()).error.message,plan.refusal);
    const final=await(await running.request('/api/pier/export')).json();
    assert.deepEqual(final.imports,current.imports);
    assert.ok(final.auditEvents.some(event=>event.type==='privacy.eraseSubject'&&event.outcome==='refused'&&event.custody?.classes.includes('imports')));
    let member=await running.request('/auth/dev/enter?as=member');
    if(restored){
      assert.equal(member.status,403,'restore does not reactivate the prior staff identity');
      const state=await(await running.request('/api/pier/state')).json();
      assert.equal(state.actor.role,'owner');
      const inactive=state.operators.filter(operator=>operator.role!=='owner'&&operator.status==='inactive');
      assert.equal(inactive.length,1);
      await verifyNative(running);
      const reactivated=await running.request('/auth/operator/status','POST',{operatorId:inactive[0].id,status:'active'});
      assert.equal(reactivated.status,200,'fresh owner explicitly reactivates this staff identity');
      member=await running.request('/auth/dev/enter?as=member');
    }
    assert.equal(member.status,303);
    const memberCookies=new Map(running.sessionCookie().split(';').map(part=>{const value=part.trim(),index=value.indexOf('=');return [value.slice(0,index),value.slice(index+1)];}));
    for(const header of member.headers.getSetCookie()){const value=header.split(';')[0],index=value.indexOf('=');memberCookies.set(value.slice(0,index),value.slice(index+1));}
    const memberCookie=[...memberCookies].map(([name,value])=>name+'='+value).join('; ');
    const privateState=await(await running.request('/api/pier/state','GET',undefined,memberCookie)).json();
    assert.equal(privateState.actor.role,'viewer');
    assert.equal(privateState.imports,undefined);
    assert.equal((await running.request('/api/pier/native-export','GET',undefined,memberCookie)).status,403);
    assert.ok(!JSON.stringify(final.auditEvents).includes('synthetic-pier-private-'));
    return final;
  };
  await refusalProof();
  await running.close();running=null;
  running=await start(undoRoot,undoPort);
  const undoBefore=await refusalProof(), undoSession=running.sessionCookie();
  await running.close();running=null;
  const undoArchive=join(parent,'typed-undo.rer');
  await command(undoRoot,['export','--output',undoArchive]);
  await command(undoRoot,['reset','--yes']);
  await command(undoRoot,['import','--input',undoArchive,'--yes']);
  await command(undoRoot,['setup','--owner-email','owner@example.test','--non-interactive','--port',String(undoPort)]);
  running=await start(undoRoot,undoPort);
  assert.equal((await running.request('/api/pier/state','GET',undefined,undoSession)).status,401);
  const undoAfter=await refusalProof(true);
  assert.deepEqual(undoAfter.imports,undoBefore.imports);
  assert.deepEqual(undoAfter.importJournal,undoBefore.importJournal);
  await running.close();running=null;
  console.log(
    "Fresh rer export/import retained business identity and exact history; a new native session continued receipt to 0.3.",
  );
} finally {
  if (running) await running.close().catch(() => {});
  for (const proc of children) {
    proc.kill("SIGTERM");
    await new Promise((r) =>
      proc.exitCode !== null ? r() : proc.once("close", r),
    );
  }
  await rm(parent, { recursive: true, force: true });
}
