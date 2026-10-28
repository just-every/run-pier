import { spawn } from 'node:child_process';

async function run(args) {
  const child = spawn('pnpm', args, { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) process.exit(code || 1);
}
await run(['run', 'build']);
await run(['run', 'typecheck']);
await run(['exec', 'rer', 'build', '--site']);
// Verify's CI build job runs this stage through rer verify, retaining its hosted
// output and hydration scans. Its required journey jobs consume this same build;
// the final aggregate requires every one. Ordinary rer verify runs the full wall.
if (!(process.env.CI === 'true' && process.env.PIER_CI_BUILD_STAGE === '1')) {
  await run(['run', 'test:journeys']);
}
