// A bounded public-door correctness journey; never a PIER-SCALE-1 benchmark.
import { execFileSync } from 'node:child_process';
import { movementExportScenario } from '../../tests/api/movement-export-scenario.mjs';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const result = await movementExportScenario();
console.log(JSON.stringify({ journey: 'bounded-movement-export', head, ...result, referenceDeployment: false, scaleAcceptance: false }));
