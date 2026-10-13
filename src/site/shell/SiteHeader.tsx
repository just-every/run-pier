import { repository } from '../links'

/** The run site's header: the Pier wordmark, Docs and Source. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-header">
      <a className="site-wordmark" href="/">Pier</a>
      <nav aria-label="Site">
        <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href={repository}>Source</a>
      </nav>
    </header>
  )
}
