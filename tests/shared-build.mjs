import { cp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

// A disposable installation consumes the exact candidate output already checked
// by rer verify. Only its compilation command changes; setup still prepares real
// private settings, applies migrations, starts the Worker and claims the owner.
export async function shareBuild(workspace, installation) {
  await access(join(workspace, 'dist/server/wrangler.json')).catch(() => { throw new Error('Run rer build once before the journey suite.'); });
  const path = join(installation, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.scripts['build:app'] = 'node tests/shared-build.mjs ' + quote(join(resolve(workspace), 'dist'));
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = resolve(process.argv[2]);
  const destination = resolve('dist');
  if (source === destination) throw new Error('A disposable installation must own its build copy.');
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}
