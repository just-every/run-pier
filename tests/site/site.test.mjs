// The run site (run-pier.com) as `rer build --site` writes it: a visitor reaches /run from the homepage's
// primary action, every page's links and files resolve inside the site, and no page links an instance-only route.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { mkdtemp, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { freshCopy } from '../browser/runtime.mjs'

const root = new URL('../..', import.meta.url).pathname
const site = join(root, 'dist/site')
const pages = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])
const served = path => [path, `${path}.html`, join(path, 'index.html')].some(candidate => existsSync(join(site, candidate)) && !candidate.endsWith('/'))
const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map(match => match[1].replaceAll('&amp;', '&'))

test('the run site builds, its primary action opens /run, and every link and file it names resolves', () => {
  const home = readFileSync(join(site, 'index.html'), 'utf8')
  assert.ok(attrs(home, 'href').includes('/run'), 'a visitor can open /run from the homepage')
  assert.ok(served('run') && served('docs'), '/run and /docs are built')
  const all = pages(site)
  assert.ok(all.length > 4, 'the homepage, /run, the docs and the not-found page')
  for (const file of all) {
    const html = readFileSync(file, 'utf8'), where = relative(site, file)
    const refs = [...attrs(html, 'href'), ...attrs(html, 'src'), ...attrs(html, 'srcSet').concat(attrs(html, 'srcset')).flatMap(set => set.split(',').map(part => part.trim().split(/\s+/)[0]))]
    for (const ref of refs.filter(ref => ref.startsWith('/') && !ref.startsWith('//'))) {
      const path = decodeURIComponent(ref.split(/[?#]/)[0])
      assert.doesNotMatch(path, /^\/(signin|login|sign-in|setup|app|auth)(\/|$)/, `${where} links the instance-only ${path}`)
      if (path !== '/') assert.ok(served(path), `${where} names ${path}, which the site does not serve`)
    }
  }
})

// Public CLI refusal: no build or upload may begin while hosting inputs are absent.
test('hosted preflight refuses missing account inputs before building or contacting a provider', () => {
  const env = { ...process.env };
  delete env.CLOUDFLARE_ACCOUNT_ID; delete env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync(join(root, 'node_modules/.bin/rer'), ['deploy', '--dry-run'], { cwd: root, env, encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 3, output);
  assert.doesNotMatch(output, /vite v|transforming|Uploading|https:\/\/api.cloudflare.com/);
});

test('setup explains a read-only checkout and its published recovery command completes the same installation', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'pier-recovery-'));
  try {
    await freshCopy(root, scratch);
    const branding = join(scratch, 'src/branding.json');
    await chmod(branding, 0o444);
    const env = { ...process.env, CI: 'true', RER_SERVER_JOURNEY: '1', PATH: join(scratch, 'node_modules/.bin') + ':' + process.env.PATH };
    delete env.RER_LOCAL_OPERATION; delete env.RER_ONBOARDING_PROCESS_OWNER;
    const failed = spawnSync('rer', ['setup', '--owner-email', 'owner@example.test', '--non-interactive'], { cwd: scratch, env, encoding: 'utf8' });
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    const output = failed.stdout + failed.stderr;
    assert.doesNotMatch(output, /EACCES|EPERM|\n\s+at /);
    const next = output.match(/Run (chmod [^\n]+ && rer setup [^\n]+)\./)?.[1];
    assert.ok(next, 'a failed setup must give the executable recovery command');
    const recovered = spawnSync('sh', ['-c', next], { cwd: scratch, env, encoding: 'utf8' });
    assert.equal(recovered.status, 0, 'the printed recovery command must finish setup');
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
