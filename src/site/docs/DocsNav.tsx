import { docsPath, docsSections } from './pages'

/** Every docs page by section; the current one is a teal stock label. Phones show it above the article. */
export function DocsNav({ current }: { current: string }) {
  return (
    <nav className="docs-nav" aria-label="Docs">
      {docsSections.map((section, index) => (
        <div className="docs-nav-group" key={section.title}>
          <p className="docs-nav-section" id={`docs-section-${index}`}>{section.title}</p>
          <ul aria-labelledby={`docs-section-${index}`}>
            {section.pages.map(page => (
              <li key={page.slug}><a href={docsPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.label}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
