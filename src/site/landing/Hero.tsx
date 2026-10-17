import { Actions } from '../shell/Actions'
import { HeroTags } from './HeroTags'
import { Painting } from './parts'

/** The painted harbour at sunrise, the promise and the action, with the day's stock work tagged on the scene. */
export function Hero() {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-scene">
      <Painting className="hero-art" name="hero" widths={[768, 1152, 1536]} sizes="100vw" eager phone={{ name: 'hero-phone', widths: [780, 1170], media: '(max-width: 760px)' }} />
      <HeroTags />
    </div>
    <div className="site-wrap hero-copy">
      <h1 id="hero-title">Know what’s on every shelf.</h1>
      <p className="hero-sub">Pier tracks stock across your warehouses, runs orders from channel to carrier, reorders before you run out, and keeps the books in step.</p>
      <p className="hero-alt">100% free, open source alternative to <strong>Cin7</strong>, <strong>inFlow</strong> and <strong>Fishbowl</strong></p>
      <Actions />
    </div>
  </section>
}
