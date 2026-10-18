import { expect, type Page } from '@playwright/test'

export async function ownerEntry(page: Page) {
  const origin = process.env.PIER_BASE_URL || 'http://127.0.0.1:8787'
  const entry = process.env.PIER_OPEN
  if (!entry) throw new Error('A real local owner entry is required.')
  try { await page.goto(entry); await page.waitForURL(url => !url.hash.includes('rer-dev') && ['/app', '/setup'].includes(url.pathname)) }
  catch { throw new Error('Local owner entry failed; obtain a fresh entry privately.') }
  if (new URL(page.url()).pathname === '/setup') {
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/app')
  }
  return origin
}
