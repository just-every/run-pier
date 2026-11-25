import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The emitted Worker claims the owner over HTTPS. Both provider email and a
// mail-off owner grant sign in through their public confirmation routes.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

const config = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'))
const modules = [config.main, ...(await readdir('dist/server/assets')).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]
  .map(file => ({ type: 'ESModule', path: join('dist/server', file) }))
const secret = () => randomBytes(32).toString('base64url'), owner = 'owner@example.test'

async function checkSignIn(mailOff) {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const origin = `https://127.0.0.1:${port}`, directory = await mkdtemp(join(tmpdir(), 'foundation-email-link-'))
  const setupToken = secret()
  const mails = [], destinations = []
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1', port, https: true, modulesRoot: 'dist/server',
      modules,
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      d1Databases: { DB: 'pier-email-link' },
      bindings: { AUTH_LOCAL: 'false', AUTH_ORIGIN: origin, OWNER_EMAIL: owner, SESSION_SECRET: secret(), SETUP_TOKEN: setupToken,
        ...(mailOff ? { MAIL_PROVIDER: 'none' } : { MAIL_PROVIDER: 'resend', MAIL_FROM: 'auth@example.test', MAIL_API_KEY: 'test-only-key' }) },
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
  const post = (path, body) => mf.dispatchFetch(origin + path, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  try {
    await mf.ready
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(await readFile(join('migrations/core', file), 'utf8')).map(query => db.prepare(query)))
    assert.equal((await post('/auth/bootstrap', { token: setupToken, displayName: 'Owner' })).status, 303, 'owner claimed')
    const requested = await post('/auth/magic-link', { email: owner })
    let link
    if (mailOff) {
      assert.equal(requested.status, 503)
      assert.deepEqual(await requested.json(), { error: 'mail_off' })

      // Stand in for the Cloudflare D1 write made by `rer signin`, using its grant format.
      const token = secret(), now = Date.now()
      const hash = createHash('sha256').update(`owner-signin\0${token}`).digest('hex')
      await db.prepare(`INSERT INTO oa_owner_signins(id,token_hash,operator_id,operator_version,created_at,expires_at)
        SELECT ?,?,id,version,?,? FROM oa_operators WHERE email=? AND role='owner' AND status='active'`)
        .bind(randomUUID(), hash, now, now + 60_000, owner).run()
      link = new URL('/auth/owner-signin', origin)
      link.searchParams.set('token', token)
    } else {
      assert.equal(requested.status, 202, 'sign-in link mailed')
      assert.equal(mails.length, 1, 'the provider received one message')
      assert.deepEqual(mails[0].to, [owner])
      link = new URL(String(mails[0].text).match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
    }
    assert.equal(link.origin, origin)
    assert.equal((await mf.dispatchFetch(link)).status, 200, 'confirmation page')
    const proof = { token: link.searchParams.get('token') }
    const confirmed = await post(link.pathname, proof)
    assert.equal(confirmed.status, 303)
    const cookie = confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
    const session = await mf.dispatchFetch(`${origin}/auth/session`, { headers: { cookie } })
    assert.equal(session.status, 200)
    assert.equal((await session.json()).operator.email, owner)
    if (mailOff) assert.equal((await post(link.pathname, proof)).status, 400, 'the owner grant can be used only once')
    assert.deepEqual(destinations, mailOff ? [] : ['https://api.resend.com/emails'])
    console.log(`${mailOff ? 'Mail-off owner sign-in' : 'Email-link sign-in'} passed against the emitted Worker`)
  } finally {
    await mf.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

await checkSignIn(false)
await checkSignIn(true)
