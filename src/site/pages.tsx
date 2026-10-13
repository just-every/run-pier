import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsPage } from './docs/DocsPage'
import { docsPage, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'

/** The run site (run-pier.com), built by `rer build --site`: the homepage, the Run page, the docs and a 404. */
export function sitePages({ styles }: SiteContext): SiteBuild {
  const document = (title: string, description: string, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href={identity.mark} />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document('Pier — Promise stock you can ship.', identity.tagline, <Landing />) },
      { path: '/run', html: runPageHtml(identity, run) },
      ...docsPages.map(page => ({ path: page.slug ? `/docs/${page.slug}` : '/docs', html: document(`${docsPage(page.slug).title} · Pier docs`, page.summary, <DocsPage slug={page.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run) },
    ],
    assets: ['rer-theme.css', 'brand', 'fonts'],
  }
}
