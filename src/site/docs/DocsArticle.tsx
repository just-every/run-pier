import { docsPath } from '../links'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsMenu, DocsSidebar } from './DocsNav'
import { docsNeighbours, docsPage } from './pages'
import '../style'

/** One docs page: the section sidebar, the article rendered from Markdown at build time, "On this page", and previous and next cards. */
export function DocsArticle({ slug }: { slug: string }) {
  const page = docsPage(slug)
  const { previous, next } = docsNeighbours(slug)
  return <>
    <SiteHeader current="docs" />
    <div className="docs-page"><div className="site-wrap docs-shell">
      <DocsSidebar current={slug} />
      <main id="main" className="docs-main">
        <DocsMenu current={slug} />
        <article aria-labelledby="docs-title">
          <header className="docs-page-head">
            <p className="eyebrow">{page.section}</p>
            <h1 id="docs-title">{page.title}</h1>
            <p className="docs-summary">{page.summary}</p>
          </header>
          <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        {(previous || next) && <nav className="docs-pager" aria-label="Previous and next">
          {previous ? <a className="card docs-pager-link" href={docsPath(previous.slug)} rel="prev"><span>Previous</span>{previous.label}</a> : <span />}
          {next ? <a className="card docs-pager-link next" href={docsPath(next.slug)} rel="next"><span>Next</span>{next.label}</a> : <span />}
        </nav>}
      </main>
      {page.toc.length > 1 ? <nav className="docs-toc" aria-label="On this page"><p>On this page</p><ul>{page.toc.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul></nav> : <span />}
    </div></div>
    <SiteFooter />
  </>
}
