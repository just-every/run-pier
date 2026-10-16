import type { RunData } from '../base/run-site'
import { repository } from './links'

/** Every string and command on the run site's Run page (/run). */
export const run: RunData = {
  name: 'Pier',
  repository,
  clone: 'npx -y @runeditrun/rer dev just-every/run-pier',
  folder: 'run-pier',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
