import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { journey } from './flows';

test("Phone smoke: stock through order fulfilment", async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    { const flow = (await journey(390))[0];
    await run(flow.title, flow.run); }
  });
});
