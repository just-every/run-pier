// The run site (run-pier.com) as `rer build --site` writes it: a visitor reaches /run from the homepage's
// primary action, every page's links and files resolve inside the site, and no page links an instance-only route.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

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

// Public CLI refusal: no build or upload may begin while hosting inputs are absent.
test('hosted preflight refuses missing account inputs before building or contacting a provider', () => {
  const env = { ...process.env };
  delete env.CLOUDFLARE_ACCOUNT_ID; delete env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync(join(root, 'node_modules/.bin/rer'), ['deploy', '--dry-run'], { cwd: root, env, encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 3, output);
  assert.match(output, /Nothing was uploaded/);
  assert.match(output, /rer deploy --dry-run --env-file/);
  assert.doesNotMatch(output, /vite v|transforming|Uploading|https:\/\/api.cloudflare.com/);
});
