import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Closing } from './Closing'
import { Hero } from './Hero'
import { Free, MovingIn, Movements, Orders, Purchasing } from './Sections'
import '../style'

/** Pier's homepage on its run site (run-pier.com): seven sections, text before each drawing. */
export function Landing() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main" className="landing">
        <Hero />
        <Free />
        <Movements />
        <div className="landing-pair">
          <Orders />
          <Purchasing />
        </div>
        <MovingIn />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
