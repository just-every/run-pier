import { licence, repository } from '../links'

/** The run site's footer: Pier, Docs, Source and the licence. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a className="site-wordmark" href="/">Pier</a>
      <nav aria-label="Footer">
        <a href="/docs">Docs</a>
        <a href={repository}>Source</a>
        <a href={licence}>MIT licensed</a>
      </nav>
    </footer>
  )
}
