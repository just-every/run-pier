import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist/client');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// The test host serves the emitted asset bytes through the same ASSETS binding
// used by the deployed Worker. Application routes execute in the real Worker.
export async function builtAsset(request) {
  const path = resolve(root, '.' + decodeURIComponent(new URL(request.url).pathname));
  if (!path.startsWith(root + sep)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path);
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' } });
  } catch (error) {
    if (!['ENOENT', 'EISDIR'].includes(error.code)) throw error;
    return new Response('Not found', { status: 404 });
  }
}
