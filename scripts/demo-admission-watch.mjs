// Test-host operation only. Keep request headers and provider credentials private;
// report just readiness, admission counts, and the observed quiet interval.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const config = JSON.parse(await readFile('.rer/demo-host/wrangler.json', 'utf8'))
if (!config.routes.some(route => route.pattern === 'demo.test.run-pier.com')) throw Error('Expected the test demo host')
const child = spawn('pnpm', ['exec', 'wrangler', 'tail', config.name, '--format', 'pretty'], { stdio: ['ignore', 'pipe', 'pipe'] })
let connected = false, done = false, admissions = 0, quietTimer
function restartQuietWindow() { clearTimeout(quietTimer); quietTimer = setTimeout(() => finish(true, 'quiet_window_complete'), 15 * 60_000) }
const timeout = setTimeout(() => finish(false, 'watch_deadline'), 28 * 60_000)
function finish(ok, reason) {
 if (done) return
 done = true
 clearTimeout(timeout); clearTimeout(quietTimer)
 child.kill('SIGINT')
 console.log(JSON.stringify({ at: new Date().toISOString(), connected, admissions, reason, quietMinutes: ok ? 15 : 0 }))
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
    restartQuietWindow()
   }
   if (line.includes('demo_admitted')) {
    admissions++
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'non_harness_demo_admitted' }))
    clearTimeout(quietTimer)
    restartQuietWindow()
   }
   if (line.includes('Tail connection lost')) { connected = false; clearTimeout(quietTimer); console.log(JSON.stringify({ at: new Date().toISOString(), event: 'tail_disconnected' })) }
   if (line.includes('Reconnected to ')) { connected = true; restartQuietWindow(); console.log(JSON.stringify({ at: new Date().toISOString(), event: 'tail_reconnected' })) }
  }
 })
}
observe(child.stdout); observe(child.stderr)
child.on('error', () => finish(false, 'tail_process_error'))
child.on('exit', (code, signal) => { if (!done) finish(false, `tail_exit_${code}_${signal}`) })
