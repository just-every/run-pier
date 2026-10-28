import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { freshCopy, freePort, command, startDev, stopDev } from './runtime.mjs';

// Every workflow uses the public setup/dev doors and owns its installation.
// Browser assertions run at 1440; the separate phone journey uses 390.
export async function browserInstallation(fixtures, run) {
  const root = await mkdtemp(join(tmpdir(), 'pier-browser-'));
  const previous = { PIER_BASE_URL: process.env.PIER_BASE_URL, PIER_OPEN: process.env.PIER_OPEN };
  let runtime;
  try {
    await freshCopy(resolve('.'), root);
    const port = await freePort();
    await command(join(root, 'node_modules/.bin/rer'), ['setup', '--owner-email', 'owner@example.test', '--non-interactive', '--no-queue', '--port', String(port)], root);
    runtime = await startDev(root, port);
    process.env.PIER_BASE_URL = runtime.origin;
    process.env.PIER_OPEN = runtime.entry;
    await run(async (name, body) => {
      console.log('Browser workflow: ' + name);
      await body(fixtures);
    });
  } finally {
    await fixtures.page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
    await fixtures.page.goto('about:blank').catch(() => {});
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await stopDev(root, runtime);
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
