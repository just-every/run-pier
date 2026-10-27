import { readDeployEnvFile } from '@runeditrun/rer/internal/modules/deploy-kit/env-file.mjs';
import { invalid, missing } from '@runeditrun/rer/internal/cli/errors.mjs';

/** Pier's hosting guidance runs before the shared build or any provider request. */
export function hostedPreflight(deploy) {
  return Object.assign(async context => {
    const { root, options, store, localOnlyKeys = [] } = context;
    let supplied = {};
    if (options.envFile) {
      try { supplied = await readDeployEnvFile(root, options.envFile, localOnlyKeys); }
      catch { throw invalid('The hosting settings file could not be read as an owned private file. Check its path and permissions, then run rer deploy --dry-run --env-file ~/pier-deploy.env.'); }
    }
    const inputs = [
      ['CLOUDFLARE_ACCOUNT_ID', 'selects the Cloudflare account that will own the Worker and database'],
      ['CLOUDFLARE_API_TOKEN', 'permits Worker uploads and D1 database management; grant Workers Scripts: Edit and D1: Edit'],
    ];
    const absent = inputs.filter(([name]) => !(supplied[name] ?? process.env[name])?.trim());
    if (absent.length) {
      for (const [name, purpose] of inputs) store.report(`- ${name} (${purpose}).`);
      store.report('For hosted sign-in, also set your owner email, a mail provider, its verified sender and its API key as described at https://run-pier.com/docs/hosting.');
      throw missing('Hosting settings are incomplete. Nothing was uploaded. Add the listed inputs to your private hosting settings file, then run rer deploy --dry-run --env-file ~/pier-deploy.env.');
    }
    return deploy(context);
  }, deploy);
}
