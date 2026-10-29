import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { journey } from './flows';

test("Public sales lifecycle", async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    { const flow = (await journey(1440))[0];
    await run(flow.title, flow.run); }
    const quotes = (await journey(1440))[7];
    await run(quotes.title, quotes.run);
    { const flow = (await journey(1440))[1];
    await run(flow.title, flow.run); }
    { const flow = (await journey(1440))[2];
    await run(flow.title, flow.run); }
    { const flow = (await journey(1440))[3];
    await run(flow.title, flow.run); }
  });
});
