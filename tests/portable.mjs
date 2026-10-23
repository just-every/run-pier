// Full public-command portability proof. Runs sequential fresh installations;
// every child and directory is owned by this script and closed in finally.
import assert from "node:assert/strict";
import { admittedServer } from "./server-admission.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, cp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { inactiveRecord } from "../scripts/installer/archive-policy.mjs";
import { documentOriginal } from "./api/document-original.mjs";
import { randomUUID } from "node:crypto";
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
  const before = await (await running.request("/api/pier/export")).json();
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
    before.commands,
    "durable command outcomes survived restore",
  );
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
  assert.equal(after.evidenceDocuments[0].original, original.toString('base64'));
  for (const field of ['documentSettings', 'aiSettings', 'channels', 'replenishmentPolicies', 'workflowRules'])
    assert.ok(after[field].every(r => r.enabled === false && r.restorePaused), field + ' paused');
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
  const erasurePlan = await (await running.request('/api/pier/privacy?kind=attachment&subjectId=' + before.evidenceDocuments[0].id)).json();
  await running.cmd('privacy.eraseAttachment', { documentId: before.evidenceDocuments[0].id, planHash: erasurePlan.planHash, confirm: true });
  await running.close(); running = null;
  const later = join(parent, 'later-journal.rer');
  await command(source, ['export', '--output', later]);
  const fenced = await copy('fenced-destination');
  const older = child(fenced, ['import', '--input', archive, '--journal', later, '--yes']);
  assert.notEqual(await older.done, 0, 'later erasure checkpoint refuses the older archive');
  assert.match(clean(older.output()), /erasure_epoch/, 'refusal identifies the later-journal fence');
  await command(fenced, ['import', '--input', later, '--yes']);
  const p3 = await port();
  await command(fenced, ['setup', '--owner-email', 'owner@example.test', '--non-interactive', '--port', String(p3)]);
  running = await start(fenced, p3);
  const fencedExport = await (await running.request('/api/pier/export')).json();
  assert.equal(fencedExport.evidenceDocuments.length, 0);
  assert.ok(!JSON.stringify(fencedExport).includes(original.toString('base64')));
  assert.deepEqual(fencedExport.movements, before.movements);
  assert.ok(fencedExport.workflowRules.every(rule => !rule.enabled));
  assert.equal((await running.request('/api/pier/documents/' + before.evidenceDocuments[0].id + '/original')).status, 404);
  await running.close(); running = null;
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
