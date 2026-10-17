// Full public-command portability proof. Runs sequential fresh installations;
// every child and directory is owned by this script and closed in finally.
import assert from "node:assert/strict";
import { admittedServer } from "./server-admission.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, cp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
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
async function start(root, p) {
  const runtime = await admittedServer(
    () => child(root, ["dev", "--port", String(p), "--no-queue"]),
    () => command(root, ["dev", "--stop"]),
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
        await command(root, ["dev", "--stop"]);
        if (runtime.proc.exitCode === null) runtime.proc.kill("SIGTERM");
        await runtime.done;
      },
    };
  } catch (error) {
    await command(root, ["dev", "--stop"]).catch(() => {});
    if (runtime.proc.exitCode === null) runtime.proc.kill("SIGTERM");
    await runtime.done;
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
    "--no-queue",
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
  await command(source, ["export", "--output", archive, "--no-queue"]);
  await command(destination, [
    "import",
    "--input",
    archive,
    "--yes",
    "--no-queue",
  ]);
  const p2 = await port();
  await command(destination, [
    "setup",
    "--owner-email",
    "owner@example.test",
    "--port",
    String(p2),
    "--non-interactive",
    "--no-queue",
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
  for (const field of [
    "items",
    "locations",
    "parties",
    "orders",
    "purchaseOrders",
    "receipts",
    "movements",
    "reservations",
    "imports",
    "proposals",
    "roles",
  ])
    assert.deepEqual(
      [...after[field]].sort((a, b) => a.id.localeCompare(b.id)),
      [...before[field]].sort((a, b) => a.id.localeCompare(b.id)),
      field + " restored exactly",
    );
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
    "--no-queue",
  ]);
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
