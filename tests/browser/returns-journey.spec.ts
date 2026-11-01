import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { warehouse_returns } from './flows';

test('Receive, fulfil, inspect returns and reconcile exact ledger credits', async ({ page, context, browser }) => {
  test.setTimeout(600_000);
  await browserInstallation({ page, context, browser }, async run => {
    const returns = (await warehouse_returns(1440))[0];
    await run(returns.title, returns.run);
  });
});
