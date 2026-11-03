import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: { headless: true, launchOptions: { executablePath: process.env.PIER_CHROMIUM, args: ['--use-mock-keychain', '--password-store=basic', ...(process.env.PIER_CHROMIUM ? ['--no-sandbox'] : [])] }, trace: 'off', video: 'off', screenshot: 'off' },
  reporter: [['list']],
  outputDir: process.env.PIER_BROWSER_OUTPUT || '/tmp/pier-browser-results',
})
