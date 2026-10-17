import { bodies, sections } from 'virtual:pier-docs'
import type { DocsPage, DocsPageMeta, DocsSection } from './types'

// The published docs, rendered at build time (build/plugin.ts), and lookups over them.

export const docsSections: DocsSection[] = sections
export const docsPages: DocsPageMeta[] = sections.flatMap(section => section.pages)
export const docsLead = 'Run Pier on your own computer, set up your bins and items, take and ship orders, buy and receive, count, move in from CSV and keep a backup.'

export function docsPage(slug: string): DocsPage {
  const meta = docsPages.find(page => page.slug === slug)
  if (!meta) throw new Error(`No docs page "${slug}".`)
  return { ...meta, ...bodies[slug] }
}

/** The pages before and after `slug` in reading order, across sections. */
export function docsNeighbours(slug: string): { previous?: DocsPageMeta; next?: DocsPageMeta } {
  const index = docsPages.findIndex(page => page.slug === slug)
  return index === -1 ? {} : { previous: docsPages[index - 1], next: docsPages[index + 1] }
}

/** Document title and description: the docs home without a slug, a page with one. */
export function docsHead(slug?: string): [title: string, description: string] {
  if (slug === undefined) return ['Docs · Pier', docsLead]
  const page = docsPage(slug)
  return [`${page.title} · Pier docs`, page.summary]
}
