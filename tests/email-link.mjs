import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The foundation's one end-to-end email-link test: the emitted Worker, as a
// production install over HTTPS, claims the owner, mails a sign-in link through
// its configured provider, and the link signs in through confirmation. Local dev
// and demos suppress mail, so the provider is faked only at the network edge.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const origin = `https://127.0.0.1:${port}`, directory = await mkdtemp(join(tmpdir(), 'foundation-email-link-'))
const secret = () => randomBytes(32).toString('base64url'), owner = 'owner@example.test', setupToken = secret()
const config = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'))
const mails = [], destinations = []
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    host: '127.0.0.1', port, https: true, modulesRoot: 'dist/server',
    modules: [config.main, ...(await readdir('dist/server/assets')).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)].map(file => ({ type: 'ESModule', path: join('dist/server', file) })),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    d1Databases: { DB: 'pier-email-link' },
    bindings: { AUTH_LOCAL: 'false', AUTH_ORIGIN: origin, OWNER_EMAIL: owner, SESSION_SECRET: secret(), SETUP_TOKEN: setupToken, MAIL_PROVIDER: 'resend', MAIL_FROM: 'auth@example.test', MAIL_API_KEY: 'test-only-key' },
    // Test-only outbound capture: the emitted Worker and its mail facade are unchanged.
    outboundService: async request => {
      destinations.push(request.url)
      if (request.url !== 'https://api.resend.com/emails') throw new Error('Unexpected test network destination')
      mails.push(await request.json())
      return Response.json({ id: `test-receipt-${mails.length}` })
    },
  }),
  resourcePersistencePath: directory,
})
const post = (path, body, cookie) => mf.dispatchFetch(origin + path, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
try {
  await mf.ready
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(join('migrations/core', file), 'utf8')).map(query => db.prepare(query)))
  assert.equal((await post('/auth/bootstrap', { token: setupToken, displayName: 'Owner' })).status, 303, 'owner claimed')
  assert.equal((await post('/auth/magic-link', { email: owner })).status, 202, 'sign-in link mailed')
  assert.equal(mails.length, 1, 'the provider received one message')
  assert.deepEqual(mails[0].to, [owner])
  const link = new URL(String(mails[0].text).match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
  assert.equal(link.origin, origin)
  assert.equal((await mf.dispatchFetch(link)).status, 200, 'confirmation page')
  const confirmed = await post('/auth/confirm', { token: link.searchParams.get('token') })
  assert.equal(confirmed.status, 303)
  const cookie = confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
  const session = await mf.dispatchFetch(`${origin}/auth/session`, { headers: { cookie } })
  assert.equal(session.status, 200)
  assert.equal((await session.json()).operator.email, owner)
  assert.deepEqual(destinations, ['https://api.resend.com/emails'], 'mail is the only outbound request')
  console.log('Email-link sign-in passed against the emitted Worker: claim, provider mail, confirmation, session')
} finally {
  await mf.dispose()
  await rm(directory, { recursive: true, force: true })
}
