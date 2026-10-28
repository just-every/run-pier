import { spawn } from 'node:child_process';

// Keep public lifecycles together. Each shard consumes the one shared build.
const shards = [
  { api: ['inventory', 'catalogue', 'warehouse'], browser: 'warehouse', commands: [] },
  { api: ['migration', 'identity'], browser: 'authority', commands: [] },
  { api: ['sales', 'channel'], browser: 'sales', commands: [] },
  { api: ['purchase', 'planning'], browser: 'purchase', commands: [] },
  { api: ['agent', 'ledger'], browser: 'catalogue', commands: [] },
  { api: ['documents', 'delivery'], browser: 'phone', commands: ['email-link', 'runtime'] },
  { api: [], browser: null, commands: ['portable'] },
  { api: [], browser: 'returns', commands: ['portable-custody', 'site'] },
];
async function command(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, RER_SERVER_JOURNEY: '1' } });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error(`Journey command exited ${code}: node ${args.join(' ')}`);
}
async function run(index) {
  const shard = shards[index];
  if (!shard) throw new Error('Choose a journey shard from 1 through 8.');
  if (shard.api.length) await command(['--test', '--test-concurrency=1', ...shard.api.map(name => `tests/api/${name}-journey.test.mjs`)]);
  if (shard.browser) await command(['tests/browser/run.mjs', `${shard.browser}-journey.spec.ts`]);
  for (const name of shard.commands) await command(name === 'site' ? ['--test', 'tests/site/site.test.mjs'] : name === 'portable-custody' ? ['tests/portable.mjs', '--custody'] : [`tests/${name}.mjs`]);
}
if (process.argv[2]) await run(Number(process.argv[2]) - 1);
else for (let index = 0; index < shards.length; index++) await run(index);
