import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsNav } from './DocsNav'
import { docsPage } from './pages'
import '../style'

/** One docs page: the navigation and the article rendered from the repository's Markdown at build time. */
export function DocsPage({ slug }: { slug: string }) {
  const page = docsPage(slug)
  return (
    <div className="site">
      <SiteHeader current="docs" />
      <div className="docs-shell">
        <DocsNav current={slug} />
        <main id="main" className="docs-main">
          <article className="docs-article" aria-labelledby="docs-title">
            <h1 id="docs-title">{page.title}</h1>
            <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
          </article>
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
