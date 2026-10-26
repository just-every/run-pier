import { createServer } from "node:net";
import { builtAsset } from "./built-assets.mjs";
import { request as httpsRequest } from 'node:https';
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { build } from "esbuild";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
export async function installation(edge = {}) {
  const root = await mkdtemp(join(tmpdir(), "pier-api-"));
  const bundled = edge.built ? null : await build({
    entryPoints: ["tests/api/worker.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    target: "es2022",
    external: ["node:*", "cloudflare:*"],
    loader: { ".css": "text", ".svg": "text" },
  });
  const emitted = edge.built ? JSON.parse(await readFile('./dist/server/wrangler.json', 'utf8')) : null;
  const modules = emitted ? [
    { type: 'ESModule', path: resolve('tests/api/built-worker.mjs') },
    ...[emitted.main, ...(await readdir('./dist/server/assets')).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]
      .map(file => ({ type: 'ESModule', path: resolve('./dist/server', file) })),
  ] : null;
  let port = 0;
  if (edge.built) {
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
  }
  let origin = edge.built ? `http://127.0.0.1:${port}` : edge.production ? "https://localhost" : "http://localhost";
  const setup = randomBytes(32).toString("hex"),
    devKey = randomBytes(32).toString("hex");
  const options = (port) => ({
    ...convertV4MiniflareOptions({
      host: "127.0.0.1",
      port,
      ...(edge.production ? { https: true } : {}),
      ...(emitted ? {
        modulesRoot: process.cwd(), modules,
        serviceBindings: { ASSETS: builtAsset },
      } : { modules: true, script: bundled.outputFiles[0].text }),
      compatibilityDate: emitted?.compatibility_date ?? "2026-09-08",
      compatibilityFlags: emitted?.compatibility_flags ?? ["nodejs_compat"],
      d1Databases: edge.built ? { DB: "pier-api-built" } : ["DB"],
      ...(edge.outboundService ? { outboundService: edge.outboundService } : {}),
      bindings: {
        AUTH_LOCAL: "true",
        AUTH_ORIGIN: origin,
        OWNER_EMAIL: "owner@example.test",
        SESSION_SECRET: randomBytes(32).toString("hex"),
        SETUP_TOKEN: setup,
        MAIL_PROVIDER: "development",
        MAIL_FROM: "auth@example.test",
        RER_DEV_KEY: devKey,
        ...edge.bindings,
      },
    }),
    resourcePersistencePath: root,
  });
  const mf = new Miniflare(options(port));
  try {
    const address = await mf.ready;
    origin = address.origin;
    // Use the real HTTP listener so URL, Host and Origin all describe this
    // installation. HTTPS production-auth tests trust only their disposable
    // loopback server certificate; provider mail is faked at the network edge.
    const localHttps = (url, options) => new Promise((resolve, reject) => {
      const req = httpsRequest(url, { ...options, rejectUnauthorized: false }, response => {
        const chunks = []; response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => { const headers = []; for (let index = 0; index < response.rawHeaders.length; index += 2) headers.push([response.rawHeaders[index], response.rawHeaders[index + 1]]); resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers })); });
      });
      req.on("error", reject); if (options.body) req.write(options.body); req.end();
    });
    await mf.setOptions(options(Number(address.port)));
    if(edge.built)console.error("Built host: binding acquisition");
    const db = await mf.getD1Database("DB");
    if(edge.built)console.error("Built host: applying migrations");
    for (const file of (await readdir("migrations/core"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile("migrations/core/" + file, "utf8");
      await db.batch(unstable_splitSqlQuery(sql).map((q) => db.prepare(q)));
    }
    if(edge.built)console.error("Built host: claiming owner");
    let cookie = "";
    const request = (path, { method = "GET", body, as = cookie, headers: extraHeaders = {} } = {}) =>
      (edge.production ? localHttps : fetch)(origin + path, {
        method,
        redirect: "manual",
        ...(edge.built ? { signal: AbortSignal.timeout(60000) } : {}),
        headers: {
          origin,
          "content-type": "application/json",
          ...(as ? { cookie: as } : {}),
          ...extraHeaders,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    const boot = await request("/auth/bootstrap", {
      method: "POST",
      body: { token: setup, displayName: "Owner" },
    });
    assert.equal(boot.status, 303, await boot.text());
    cookie = boot.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const command = async (type, payload, opts = {}) => {
      const commandId = opts.commandId ?? randomUUID();
      const res = await request("/api/pier/commands", {
        method: "POST",
        body: { commandId, type, payload },
        ...opts,
      });
      const body = await res.json();
      if (opts.error) {
        assert.equal(body.ok, false);
        assert.equal(body.error.code, opts.error);
        return body;
      }
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(body.ok, true, JSON.stringify(body));
      return body.result;
    };
    const state = async () => {
      const res = await request("/api/pier/state");
      assert.equal(res.status, 200);
      return res.json();
    };
    const invariant = async () => {
      const s = await state();
      for (const p of s.positions) {
        const sum = s.movements
          .filter(
            (m) =>
              m.itemId === p.itemId &&
              m.locationId === p.locationId &&
              m.status === p.status,
          )
          .reduce((n, m) => n + BigInt(m.quantity), 0n);
        assert.equal(parse(p.quantity), sum);
        const reserved = s.reservations
          .filter((r) => r.itemId === p.itemId && r.locationId === p.locationId)
          .reduce((n, r) => n + BigInt(r.quantity), 0n);
        assert.equal(
          parse(p.available),
          p.status === "sellable" ? sum - reserved : 0n,
        );
        assert.ok(sum >= 0n);
      }
      return s;
    };
    return {
      mf,
      origin,
      db,
      devKey,
      request,
      command,
      state,
      invariant,
      browserCookies() {
        return cookie.split('; ').map(part => {
          const index = part.indexOf('=');
          return { name: part.slice(0, index), value: part.slice(index + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
        });
      },
      async restartWithFreshSigningKey() {
        await mf.setOptions(options(Number(address.port)));
        const response=await fetch(origin+'/auth/dev/enter?as=owner',{redirect:'manual',headers:{'x-rer-dev-key':devKey}});
        assert.equal(response.status,303);
        cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
      },
      async close() {
        await mf.dispose();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if(edge.built)console.error("Built host initialization:",error.message);
    await mf.dispose().catch(() => {});
    await rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
export function parse(v) {
  const [a, b = ""] = v.split(".");
  return BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
}
export async function basics(h, prefix = '') {
  const item = await h.command("item.save", {
    sku: prefix + "BOLT",
    name: "Brass bolt",
    unit: "each",
    barcode: prefix + "10001",
    packSize: "0.5",
  });
  const source = await h.command("location.save", {
      name: prefix + "A1",
      warehouse: "North",
      kind: "bin",
    }),
    destination = await h.command("location.save", {
      name: prefix + "B1",
      warehouse: "South",
      kind: "bin",
    }),
    transit = await h.command("location.save", {
      name: prefix + "Van",
      warehouse: "Between warehouses",
      kind: "transit",
    }),
    supplier = await h.command("party.save", {
      name: prefix + "Metals",
      kind: "supplier",
    }),
    customer = await h.command("party.save", {
      name: prefix + "Workshop",
      kind: "customer",
    });
  const customerPolicy=await h.command('customer.splitPolicy',{customerId:customer.id,version:customer.version,allowSplit:true,reason:'Fixture permits split warehouse fulfilment'});
  let rule=await h.command('routing.save',{source:'manual',mode:'rules',shortage:'split',zones:[],defaultEligible:['North','South']});
  rule=await h.command('routing.preview',{ruleId:rule.id,version:rule.version});
  await h.command('routing.activate',{ruleId:rule.id,version:rule.version});
  return { item, source, destination, transit, supplier, customer:customerPolicy };
}
export async function buy(h, b, quantity = "10") {
  const po = await h.command("po.draft", {
    supplierId: b.supplier.id,
    promiseDate: "2026-11-01",
    reason: "Restock",
    lines: [{ itemId: b.item.id, quantity, price: "0.25" }],
  });
  await h.command("po.approve", { poId: po.id, version: po.version });
  await h.command("po.commit", { poId: po.id, version: po.version });
  return po;
}
export const receive = (h, b, po, quantity) =>
  h.command("receipt.create", {
    poId: po.id,
    supplierReference: "Delivery 1",
    lines: [
      {
        poLineId: po.lines[0].id,
        locationId: b.source.id,
        quantity,
        cost: "0.25",
      },
    ],
  });
