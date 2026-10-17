// The run site (run-pier.com) `rer build --site` writes: the homepage with its Run action,
// /run, the docs from the repository's Markdown, and the not-found page. Every Run page
// string and command is in run.ts; nothing here reads installation data.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EditionIdentity } from '../base/identity'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'

// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"

/** The run site's own tokens and faces (public/site/theme.css, public/fonts/fonts.css) for Base's Run and not-found pages; no floor art there. */
const siteIdentity: EditionIdentity = { ...identity, theme: '/site/theme.css', fonts: '/fonts/fonts.css', band: undefined }
const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`

export function sitePages({ styles }: SiteContext): SiteBuild {
  const document = (title: string, description: string, body: ReactElement, script = '') => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#f9f8f4" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Pier" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/fonts/pier-display/pier-display-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link rel="stylesheet" href={siteIdentity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}{script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document('Pier — Know what’s on every shelf', 'Open source inventory and order management for US wholesalers and distributors: stock across warehouses, orders from channel to carrier, reorders and books in step. A free alternative to Cin7, inFlow and Fishbowl.', <Landing />) },
      { path: '/run', html: runPageHtml(siteIdentity, run) },
      { path: '/docs', html: document(...docsHead(), <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(...docsHead(page.slug), <DocsArticle slug={page.slug} />, COPY) })),
      { path: '/404', html: siteNotFoundHtml(siteIdentity, run) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}
