// The shapes the docs virtual module exports (build/plugin.ts) and the docs pages read.

/** One page as docs/site.json lists it: its slug ('' for /docs), Markdown file and the section it sits in. */
export type DocsPageMeta = { slug: string; label: string; file: string; summary: string; section: string }

export type DocsSection = { title: string; pages: DocsPageMeta[] }

/** A page's title (its Markdown's level-1 heading) and body, rendered to HTML at build time. */
export type DocsBody = { title: string; html: string }

export type DocsPage = DocsPageMeta & DocsBody
