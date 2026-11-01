// Nightly and push use the same public journeys and isolation.
import { command } from './runtime.mjs';
console.log(await command(process.execPath, ['tests/browser/run.mjs', ...process.argv.slice(2)], process.cwd()));
