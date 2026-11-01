import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { journey } from './flows';

test("Public authority lifecycle", async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    { const flow = (await journey(1440))[4];
    await run(flow.title, flow.run); }
    { const flow = (await journey(1440))[5];
    await run(flow.title, flow.run); }
  });
});
