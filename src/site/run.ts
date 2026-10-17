import type { RunData } from '../base/run-site'
import { links } from './links'

/** Every string and command on the run site's Run page (/run): Base's two-line Run page. */
export const run: RunData = {
  name: 'Pier',
  repository: links.source,
  clone: 'npx -y @runeditrun/rer dev just-every/run-pier',
  folder: 'run-pier',
  requirements: 'Runs on macOS, Linux or Windows with WSL2, with git. The installer brings Node when it is missing, and rer brings pnpm.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
