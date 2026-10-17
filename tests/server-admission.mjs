import assert from 'node:assert/strict';
import { loadavg } from 'node:os';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
/** A declined machine admission has started no server. Wait for capacity before
 * the startup deadline; application/startup failures keep their original error. */
export async function admittedServer(launch, stop, clean) {
  const admissionDeadline = Date.now() + 600000;
  while (Date.now() < admissionDeadline) {
    let stable = 0;
    while (stable < 5 && Date.now() < admissionDeadline) {
      stable = loadavg()[0] <= 34 ? stable + 1 : 0;
      await pause(500);
    }
    assert.ok(stable === 5, 'Timed out waiting for shared-machine server capacity');
    const runtime = launch();
    try {
      const deadline = Date.now() + 120000;
      while (!runtime.output().includes('RER_READY') && Date.now() < deadline) {
        if (runtime.proc.exitCode !== null) break;
        await pause(200);
      }
      if (runtime.proc.exitCode !== null && runtime.output().includes('Not started: this computer is busy.')) {
        await runtime.done;
        continue;
      }
      assert.ok(runtime.output().includes('RER_READY'), clean(runtime.output()).slice(-3000));
      return runtime;
    } catch (error) {
      await stop().catch(() => {});
      if (runtime.proc.exitCode === null) runtime.proc.kill('SIGTERM');
      await runtime.done;
      throw error;
    }
  }
  throw new Error('Timed out waiting for shared-machine server capacity');
}
