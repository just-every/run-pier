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
  execFileSync(join(root, 'node_modules/.bin/rer'), ['build', '--site'], { cwd: root, stdio: 'pipe' })
  const home = readFileSync(join(site, 'index.html'), 'utf8')
  assert.match(home, /<a class="site-pill" href="\/run">/, 'the homepage leads with Run Pier to /run')
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

test('mail-off dry run builds a deployment plan without credentials or provider requests', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:CLOUDFLARE_|CF_|MAIL_|RESEND_API_KEY$|SENDGRID_API_KEY$)/.test(name)));
  env.MAIL_PROVIDER = 'none';
  const result = spawnSync(join(root, 'node_modules/.bin/rer'), ['deploy', '--dry-run', '--non-interactive', '--json'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const outcome = result.stdout.trim().split('\n').map(line => JSON.parse(line)).find(event => event.event === 'result');
  assert.equal(outcome.dryRun, true);
  assert.equal(outcome.deployed, false);
  assert.equal(outcome.providerChecked, false);
  assert.ok(outcome.plan.d1.length > 0, 'the deploy target includes its database');
  assert.ok(!outcome.neededForRealDeploy.some(item => /\bMAIL_/.test(item)), 'mail settings are unnecessary for a real mail-off deploy');
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
    const next = output.match(/Run (chmod u\+w src\/branding.json && rer setup --owner-email 'owner@example.test' --non-interactive)\./)?.[1];
    assert.ok(next, 'a failed setup must give the executable recovery command');
    const recovered = spawnSync('sh', ['-c', next], { cwd: scratch, env, encoding: 'utf8' });
    assert.equal(recovered.status, 0, 'the printed recovery command must finish setup');
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
