/// <reference types="node" />
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocsSection } from '../types.ts'

// docs/site.json lists the published pages in reading order, grouped in sections.
// Each page names its slug ('' is /docs itself), its navigation label, its
// Markdown file (relative to the repository root, so README.md and the contract
// files publish as they are) and a one-sentence summary for the page's description.

export const manifestPath = 'docs/site.json'
const slugPattern = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function readManifest(root: string): DocsSection[] {
  const raw = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'))
  const problems: string[] = []
  const slugs = new Set<string>(), files = new Set<string>()
  const sections: DocsSection[] = (Array.isArray(raw?.sections) ? raw.sections : []).map((section: Record<string, unknown>, s: number) => {
    const title = text(section.title)
    if (!title) problems.push(`section ${s + 1} has no title`)
    const entries: Record<string, unknown>[] = Array.isArray(section.pages) ? section.pages : []
    if (!entries.length) problems.push(`section "${title}" has no pages`)
    return {
      title,
      pages: entries.map((page, p) => {
        const where = `page ${p + 1} of "${title}"`
        const slug = typeof page.slug === 'string' ? page.slug : '', label = text(page.label), file = text(page.file), summary = text(page.summary)
        if (!slugPattern.test(slug)) problems.push(`${where}: slug "${slug}" must be lowercase words joined by hyphens`)
        if (slugs.has(slug)) problems.push(`${where}: slug "${slug}" is used twice`)
        slugs.add(slug)
        if (!label) problems.push(`${where}: no label`)
        if (!summary) problems.push(`${where}: no summary`)
        if (!/^(?:docs\/)?[A-Z0-9a-z-]+\.md$/.test(file)) problems.push(`${where}: file "${file}" must be a Markdown file at the root or in docs/`)
        else if (!existsSync(join(root, file)) || !statSync(join(root, file)).isFile()) problems.push(`${where}: ${file} does not exist`)
        if (files.has(file)) problems.push(`${where}: ${file} is listed twice`)
        files.add(file)
        return { slug, label, file, summary, section: title }
      }),
    }
  })
  if (!slugs.has('')) problems.push('no page has the empty slug, so /docs would have no page')
  if (problems.length) throw new Error(`${manifestPath} is invalid:\n- ${problems.join('\n- ')}`)
  return sections
}
