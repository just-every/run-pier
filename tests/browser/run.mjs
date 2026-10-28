import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { command, redact } from './runtime.mjs';

const workspace = resolve('.');
const evidence = resolve(process.env.PIER_BROWSER_OUTPUT || join(tmpdir(), 'pier-browser-evidence'));
const screenshots = resolve(process.env.PIER_SCREENSHOTS || join(evidence, 'screenshots'));
if ([evidence, screenshots].some(path => path === workspace || path.startsWith(workspace + '/'))) throw new Error('Browser evidence must be outside the product checkout.');
await mkdir(screenshots, { recursive: true });
try {
  console.log(redact(await command(join(workspace, 'node_modules/.bin/playwright'), [
    'test', '--config', 'tests/browser/playwright.config.ts', '--workers=1', ...process.argv.slice(2),
  ], workspace, { PIER_SCREENSHOTS: screenshots, PIER_BROWSER_OUTPUT: evidence })));
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
}
