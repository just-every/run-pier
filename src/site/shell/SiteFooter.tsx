import { links } from '../links'
import { Lockup } from './Lockup'

/** One line: the lockup and what Pier is, then Docs, Source and the licence. */
export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-wrap"><div className="site-footer-row">
      <div className="site-footer-brand"><Lockup size={30} /><p className="site-footer-line">Inventory and orders for wholesalers</p></div>
      <nav aria-label="Footer"><a href={links.docs}>Docs</a><a href={links.source}>Source</a><a href={links.licence}>MIT licensed</a></nav>
    </div></div>
  </footer>
}
