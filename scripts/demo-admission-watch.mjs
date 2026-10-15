// Test-host operation only. Keep request headers and provider credentials private;
// report just readiness, admission counts, and the observed quiet interval.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const config = JSON.parse(await readFile('.rer/demo-host/wrangler.json', 'utf8'))
if (!config.routes.some(route => route.pattern === 'demo.test.run-pier.com')) throw Error('Expected the test demo host')
const child = spawn('pnpm', ['exec', 'wrangler', 'tail', config.name, '--format', 'pretty'], { stdio: ['ignore', 'pipe', 'pipe'] })
let connected = false, done = false, admissions = 0, quietTimer
const timeout = setTimeout(() => finish(false), 17 * 60_000)
function finish(ok) {
 if (done) return
 done = true
 clearTimeout(timeout); clearTimeout(quietTimer)
 child.kill('SIGINT')
 console.log(JSON.stringify({ at: new Date().toISOString(), connected, admissions, quietMinutes: ok ? 15 : 0 }))
 process.exitCode = ok ? 0 : 1
}
function observe(stream) {
 let buffer = ''
 stream.setEncoding('utf8')
 stream.on('data', chunk => {
  buffer += chunk
  const lines = buffer.split('\n'); buffer = lines.pop()
  for (const line of lines) {
   if (line.includes('Connected to ')) {
    connected = true
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'tail_connected' }))
    quietTimer = setTimeout(() => finish(true), 15 * 60_000)
   }
   if (line.includes('demo_admitted')) {
    admissions++
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'non_harness_demo_admitted' }))
    clearTimeout(quietTimer)
    quietTimer = setTimeout(() => finish(true), 15 * 60_000)
   }
   if (line.includes('Reconnected to ')) finish(false)
  }
 })
}
observe(child.stdout); observe(child.stderr)
child.on('error', () => finish(false))
child.on('exit', () => { if (!done) finish(false) })
