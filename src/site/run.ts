import type { RunData } from '../base/run-site'
import { links } from './links'

/** Every string and command on the run site's Run page (/run): Base's two-line Run page. */
export const run: RunData = {
  name: 'Pier',
  repository: links.source,
  clone: 'npx -y @runeditrun/rer dev just-every/run-pier',
  licence: 'MIT',
  docs: true,
  paths: { product: 'run-pier' },
}
