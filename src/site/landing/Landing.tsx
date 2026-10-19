import { SiteHeader } from '../shell/SiteHeader'
import { Hero } from './Hero'
import { Books } from './sections/Books'
import { Channels } from './sections/Channels'
import { Closing } from './sections/Closing'
import { Counting } from './sections/Counting'
import { MoveIn } from './sections/MoveIn'
import { Receiving } from './sections/Receiving'
import { Reorder } from './sections/Reorder'
import { ShipDay } from './sections/ShipDay'
import { StockCard } from './sections/StockCard'
import '../style'

/**
 * run-pier.com's homepage on the owner-approved structure (page-s1, 17 Oct 2026): one purchase order, PO-1048
 * for 500 Blue Mug 12oz, followed through a wholesaler's own stages. The harbour hero; the reorder and the short
 * ship notice; receiving at the door; put-away and count on the handhelds; every channel on one count; ship day;
 * the books; the stock card; moving in and where Pier stops; the closing over the dock at dusk, then the footer.
 * Painted plates appear only in the hero, receiving, the handhelds and the closing; every drawing is HTML and CSS.
 */
export function Landing() {
  return <>
    <SiteHeader overArt />
    <main id="main">
      <Hero />
      <Reorder />
      <Receiving />
      <Counting />
      <Channels />
      <ShipDay />
      <Books />
      <StockCard />
      <MoveIn />
      <Closing />
    </main>
  </>
}
