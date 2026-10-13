import { bodies, sections } from 'virtual:pier-docs'
import type { DocsPage, DocsPageMeta, DocsSection } from './types'

// The published docs, rendered at build time (build/plugin.ts), and lookups over them.

export const docsSections: DocsSection[] = sections
export const docsPages: DocsPageMeta[] = sections.flatMap(section => section.pages)
export const docsPath = (slug: string) => (slug ? `/docs/${slug}` : '/docs')

export function docsPage(slug: string): DocsPage {
  const meta = docsPages.find(page => page.slug === slug)
  if (!meta) throw new Error(`No docs page "${slug}".`)
  return { ...meta, ...bodies[slug] }
}
