import { Marked } from 'marked'

// One Markdown file to static HTML, at build time. The level-1 heading becomes
// the page title; raw HTML is shown as text; headings get GitHub-style ids so
// links written for GitHub work on the site; `link` decides where each link goes.

export type RenderedPage = { title: string; html: string; ids: string[]; toc: { id: string; text: string }[]; problems: string[] }

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const decodeHtml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

export function githubSlugger() {
  const seen = new Map<string, number>()
  return (text: string) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
    let slug = base, count = seen.get(base) ?? 0
    while (seen.has(slug)) slug = `${base}-${++count}`
    seen.set(base, count)
    seen.set(slug, 0)
    return slug
  }
}

export function renderMarkdown(markdown: string, link: (href: string) => string): RenderedPage {
  const slug = githubSlugger(), ids: string[] = [], toc: RenderedPage['toc'] = [], problems: string[] = []
  let title = ''
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = decodeHtml(this.parser.parseInline(tokens, this.parser.textRenderer)).replace(/\s+/g, ' ').trim()
        if (depth === 1) {
          if (title) problems.push('has more than one level-1 heading')
          title = text
          return ''
        }
        const id = slug(text)
        ids.push(id)
        if (depth === 2) toc.push({ id, text })
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      code({ text }) {
        // A code card; its Copy button stays hidden until the page's script can copy.
        return `<div class="docs-code"><div class="docs-code-head"><button type="button" class="docs-copy" hidden>Copy</button></div><pre><code>${escapeHtml(text.replace(/\n$/, ''))}</code></pre></div>\n`
      },
      html({ text }) {
        return escapeHtml(text)
      },
      link({ href, title: hint, tokens }) {
        return `<a href="${escapeHtml(link(href))}"${hint ? ` title="${escapeHtml(hint)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      image({ href }) {
        problems.push(`has an image (${href}); the docs publish text only`)
        return ''
      },
    },
  })
  const html = (marked.parse(markdown, { async: false }) as string)
    .replace(/<table>/g, '<div class="docs-table" role="region" tabindex="0" aria-label="Table"><table>')
    .replace(/<\/table>/g, '</table></div>')
  if (!title) problems.push('has no level-1 heading to title the page')
  return { title, html, ids, toc, problems }
}
