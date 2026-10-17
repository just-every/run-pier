/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import type { DocsBody, DocsSection } from '../types.ts'
import { manifestPath, readManifest } from './manifest.ts'
import { renderMarkdown } from './render.ts'

// The whole docs site from the tree as it is: every page docs/site.json lists,
// rendered with its links resolved. A link to another listed Markdown file
// becomes its /docs page; a link to any other file in the repository goes to
// that file in the source repository; every anchor is checked. Any problem
// fails the build with the full list.

export type DocsSite = { sections: DocsSection[]; bodies: Record<string, DocsBody>; files: string[] }

/** An absolute path on the build machine must never reach a published page. */
const machinePath = /(?<![\w.@~-])\/(?:Users|home|private|tmp|var|Volumes|root)\/[^\s"'`<\\]*/g
const docsPath = (slug: string) => `/docs/${slug}`

export function buildDocs(root: string, repository: string): DocsSite {
  const sections = readManifest(root)
  const pages = sections.flatMap(section => section.pages)
  const slugOf = new Map(pages.map(page => [page.file, page.slug]))
  const problems: string[] = [], files = [join(root, manifestPath)]
  const anchors: { from: string; slug: string; id: string }[] = []
  const rendered = new Map(pages.map(page => {
    const report = (problem: string) => problems.push(`${page.file}: ${problem}`)
    const link = (href: string) => {
      if (/^(?:https?:|mailto:)/i.test(href)) return href
      if (href.startsWith('#')) { anchors.push({ from: page.file, slug: page.slug, id: href.slice(1) }); return href }
      if (href.startsWith('/')) { report(`links to ${href}; use a path relative to the file or a full https:// address`); return href }
      const [path, id] = href.split('#')
      const target = posix.normalize(posix.join(posix.dirname(page.file), path))
      if (target.startsWith('..') || !existsSync(join(root, target))) { report(`links to ${href}, which is not a file in the repository`); return href }
      const slug = slugOf.get(target)
      if (slug === undefined) return `${repository}/blob/main/${target}${id ? `#${id}` : ''}`
      if (id) anchors.push({ from: page.file, slug, id })
      return `${docsPath(slug)}${id ? `#${id}` : ''}`
    }
    files.push(join(root, page.file))
    const result = renderMarkdown(readFileSync(join(root, page.file), 'utf8'), link)
    result.problems.forEach(report)
    for (const leak of new Set(result.html.match(machinePath) ?? [])) report(`contains ${leak}, a build machine path`)
    return [page.slug, result] as const
  }))
  for (const anchor of anchors) if (!rendered.get(anchor.slug)!.ids.includes(anchor.id)) problems.push(`${anchor.from}: links to #${anchor.id}, which is not a heading on ${docsPath(anchor.slug)}`)
  if (problems.length) throw new Error(`Docs: ${problems.length} problem(s) in the Markdown:\n- ${problems.join('\n- ')}`)
  const bodies = Object.fromEntries(pages.map(page => { const { title, html, toc } = rendered.get(page.slug)!; return [page.slug, { title, html, toc }] }))
  return { sections, bodies, files }
}
