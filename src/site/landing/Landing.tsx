import { SiteHeader } from '../shell/SiteHeader'
import { Hero } from './Hero'
import { Agent } from './sections/Agent'
import { Closing } from './sections/Closing'
import { Details } from './sections/Details'
import { Floor } from './sections/Floor'
import { Interlude } from './sections/Interlude'
import { Ownership } from './sections/Ownership'
import { Replenish } from './sections/Replenish'
import { Retail } from './sections/Retail'
import '../style'

/**
 * run-pier.com's homepage, built from the design desk's approved page (16 Oct 2026, hero A, logo 9) in its order:
 * the harbour hero; warehouse floor and channels; retail EDI and shipping; the aisle interlude; replenishment and
 * accounting; the inventory agent and moving in; ownership; the quiet details; the closing over the dock, then the footer.
 * Painted art appears only in the hero, the interlude and the closing; every other drawing is HTML and CSS.
 */
export function Landing() {
  return <>
    <SiteHeader overArt />
    <main id="main">
      <Hero />
      <Floor />
      <Retail />
      <Interlude />
      <Replenish />
      <Agent />
      <Ownership />
      <Details />
      <Closing />
    </main>
  </>
}
