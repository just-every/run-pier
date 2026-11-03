import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { command, redact } from './runtime.mjs'

const workspace = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const output = resolve(process.env.PIER_BROWSER_OUTPUT || join(tmpdir(), 'pier-acceptance'))
const screenshots = resolve(process.env.PIER_SCREENSHOTS || join(output, 'screenshots'))
const files = [
  'journey.spec.ts', 'stock.spec.ts', 'open.spec.ts',
  'warehouse-waves.spec.ts', 'warehouse-offline.spec.ts', 'warehouse-returns.spec.ts',
  'slotting.spec.ts', 'dispatch.spec.ts', 'supplier-bills.spec.ts', 'supplier-returns.spec.ts', 'reorder-list.spec.ts',
]
const playwright = join(workspace, 'node_modules/.bin/playwright')
const listing = JSON.parse(await command(playwright, [
  'test', '--config', 'tests/browser/playwright.config.ts', '--list', '--reporter=json',
  '--fully-parallel', ...files, ...process.argv.slice(2),
], workspace))
if (listing.errors?.length) throw new Error(redact(JSON.stringify(listing.errors)))
const cases = []
function collect(suite, parents = []) {
  const titles = suite.file && suite.title !== suite.file ? [...parents, suite.title] : parents
  for (const spec of suite.specs || []) cases.push({ file: spec.file, title: [...titles, spec.title].join(' ') })
  for (const child of suite.suites || []) collect(child, titles)
}
for (const suite of listing.suites || []) collect(suite)
if (!cases.length) throw new Error('Acceptance selection contains no tests.')

let failures = 0
for (const [index, entry] of cases.entries()) {
  console.log(`Acceptance ${index + 1} of ${cases.length}: ${entry.title}`)
  // Routing, policies and retained business records are installation state.
  // Each existing test gets its own real setup rather than inheriting a prior test.
  const title = entry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'
  try {
    console.log(await command(process.execPath, [
      'tests/browser/run.mjs', entry.file, '--grep', title,
    ], workspace, {
      PIER_BROWSER_OUTPUT: join(output, `case-${index + 1}`),
      PIER_SCREENSHOTS: screenshots,
    }))
  } catch (error) {
    failures++
    console.error(redact(error.message))
  }
}
if (failures) {
  console.error(`${failures} acceptance tests failed.`)
  process.exitCode = 1
}
