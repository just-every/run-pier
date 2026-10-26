import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

export async function qboScreens(h, result, directory) {
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PIER_CHROMIUM ? { executablePath: process.env.PIER_CHROMIUM } : {}), args: ['--use-mock-keychain', '--password-store=basic'] });
  try {
    const context = await browser.newContext();
    await context.addCookies(h.browserCookies());
    const page = await context.newPage();
    await page.goto(`${h.origin}/app`);
    if (new URL(page.url()).pathname === '/setup') {
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/app');
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${h.origin}/app#books`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'QuickBooks Online · Connected', exact: true })).toBeVisible();
      await expect(page.getByText('Matched in Pier', { exact: true })).toBeVisible();
      await expect(page.getByText('Voided · no payment', { exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(directory, `${width}-qbo-connected.png`), fullPage: true });
      await page.getByRole('heading', { name: 'Accounting documents', exact: true }).locator('..').screenshot({ path: join(directory, `${width}-qbo-documents.png`) });
      await page.goto(`${h.origin}/app#books/${encodeURIComponent(result.bill.id)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const match = page.getByRole('heading', { name: `Match supplier invoice ${result.bill.reference}`, exact: true });
      await expect(match).toBeVisible();
      await expect(match.locator('..').getByText('QuickBooks: posted', { exact: false })).toBeVisible();
      await match.locator('..').screenshot({ path: join(directory, `${width}-qbo-supplier-bill.png`) });
      const receipt = result.state.receipts[0];
      await page.goto(`${h.origin}/app#purchasing/${encodeURIComponent(receipt.id)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByRole('heading', { name: 'Receipt accounting', exact: true })).toBeVisible();
      await page.screenshot({ path: join(directory, `${width}-qbo-receipt.png`), fullPage: true });
      await page.goto(`${h.origin}/app#books/settings`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByRole('heading', { name: 'Connect QuickBooks Online', exact: true })).toBeVisible();
      await expect(page.getByLabel('Authorized refresh token', { exact: true })).toHaveValue('');
      await page.screenshot({ path: join(directory, `${width}-qbo-saved-settings.png`), fullPage: true, mask: ['Authorized company ID', 'Intuit client ID', 'Intuit client secret', 'Authorized refresh token'].map(label => page.getByLabel(label, { exact: true })) });
      await qboSessionDenied(page, context, h, directory, width);
      await context.addCookies(h.browserCookies());
    }
    await context.close();
  } finally { await browser.close(); }
}

export async function qboSessionDenied(page, context, h, directory, width) {
  await context.clearCookies();
  await page.reload();
  await page.waitForURL(url => url.pathname === '/signin');
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal((await page.request.get(h.origin + '/api/pier/state')).status(), 401);
  await expect(page.getByRole('heading', { name: /sign in/i }).or(page.getByRole('link', { name: /sign in/i })).or(page.getByRole('button', { name: /sign in/i })).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect QuickBooks Online', exact: true })).toHaveCount(0);
  await page.screenshot({ path: join(directory, `${width}-qbo-session-denied.png`), fullPage: true });
}
