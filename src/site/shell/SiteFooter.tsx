import { links } from '../links'
import { Lockup } from './Lockup'

/** One line: the lockup, then Docs, Source and the licence. */
export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-wrap"><div className="site-footer-row">
      <Lockup size={30} />
      <nav aria-label="Footer"><a href={links.docs}>Docs</a><a href={links.source}>Source</a><a href={links.licence}>MIT licensed</a></nav>
    </div></div>
  </footer>
}
