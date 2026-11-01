import { test } from '@playwright/test';
import { browserInstallation } from './installation.mjs';
import { warehouse_waves, warehouse_offline, slotting } from './flows';

test('Public warehouse lifecycle', async ({ page, context, browser }) => {
  const fixtures = { page, context, browser };
  test.setTimeout(900_000);
  await browserInstallation(fixtures, async run => {
    const waves = (await warehouse_waves(1440))[0];
    await run(waves.title, waves.run);
    const placement = (await slotting(1440))[0];
    await run(placement.title, placement.run);
    const offline = (await warehouse_offline(1440))[0];
    await run(offline.title, offline.run);
  });
});
