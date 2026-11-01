import { test as base } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error Plain Node helpers for the public setup and dev doors.
import { freshCopy, freePort, command, startDev, stopDev } from './runtime.mjs'

// A spec file owns one fresh native installation, shared by its scenarios in order,
// through the same public setup and dev doors as the business journeys in installation.mjs.
export const test = base.extend<{}, { installation: void }>({
  installation: [async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'pier-browser-'))
    const previous = { PIER_BASE_URL: process.env.PIER_BASE_URL, PIER_OPEN: process.env.PIER_OPEN }
    let runtime
    try {
      await freshCopy(resolve('.'), root)
      const port = await freePort()
      await command(join(root, 'node_modules/.bin/rer'), ['setup', '--owner-email', 'owner@example.test', '--non-interactive', '--no-queue', '--port', String(port)], root)
      runtime = await startDev(root, port)
      process.env.PIER_BASE_URL = runtime.origin
      process.env.PIER_OPEN = runtime.entry
      await use()
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
      await stopDev(root, runtime)
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    }
  }, { scope: 'worker', auto: true, timeout: 600_000 }],
})
export { expect } from '@playwright/test'
