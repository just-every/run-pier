/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { buildDocs } from './site.ts'

// The docs, rendered from docs/site.json and the Markdown it lists when Vite
// loads them, so no page ever parses Markdown. `virtual:pier-docs` exports the
// sections and every page's title and body HTML. Links to files outside the
// docs go to the source repository named in package.json.

export const docsModuleId = 'virtual:pier-docs'
const resolvedId = `\0${docsModuleId}`

export function docsSite(): Plugin {
  let root = process.cwd()
  return {
    name: 'pier:docs',
    configResolved(config) { root = config.root },
    resolveId(id) { if (id === docsModuleId) return resolvedId },
    load(id) {
      if (id !== resolvedId) return
      const { repository } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
      const site = buildDocs(root, repository)
      for (const file of site.files) this.addWatchFile(file)
      return `export const sections = ${JSON.stringify(site.sections)};\nexport const bodies = ${JSON.stringify(site.bodies)};\n`
    },
  }
}
