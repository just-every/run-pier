import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { catalogue, openness } from './flows';

test("Public catalogue lifecycle", async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    { const flow = (await catalogue(1440))[0];
    await run(flow.title, flow.run); }
    { const flow = (await catalogue(1440))[1];
    await run(flow.title, flow.run); }
    const access = (await openness())[0];
    await run(access.title, access.run);
  });
});
