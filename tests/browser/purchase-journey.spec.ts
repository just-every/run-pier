import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { journey, supplier_bills } from './flows';

test("Public purchase lifecycle", async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    { const flow = (await journey(1440))[6];
    await run(flow.title, flow.run); }
    { const flow = (await supplier_bills(1440))[0];
    await run(flow.title, flow.run); }
  });
});
