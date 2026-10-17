import { links } from '../../links'
import { Icon } from '../parts'

const START = 'npx -y @runeditrun/rer dev'
const REPO = 'just-every/run-pier'
/** What rer 0.2.38 prints for `rer dev <repo>` on a first run: the restart line, the install phase and the ready address (default port 8787). */
const OUTPUT = ['Restart: cd run-pier && rer dev', 'rer dev: installing dependencies', 'RER_READY http://127.0.0.1:8787']
const OWN: [string, string][] = [['server', 'Your own computer or server'], ['database', 'Your stock, your data'], ['export', 'Export any time']]

/** Run it yourself: the one-line start in a terminal, and what owning it means. */
export function Ownership() {
  return <section id="ownership" className="ownership" aria-labelledby="ownership-title">
    <div className="site-wrap ownership-row">
      <div className="feature-copy">
        <p className="eyebrow">Ownership</p>
        <h2 id="ownership-title">Your stock, your<br />system.</h2>
        <p className="feature-body"><a href={links.run}>Run Pier</a> on your own computer or server and keep every item, order and supplier. Export everything, any time.</p>
        <ul className="own-list">{OWN.map(([icon, text]) => <li key={text}><Icon name={icon} />{text}</li>)}</ul>
      </div>
      <div className="terminal" role="img" aria-label={`One command: ${START} ${REPO}. It prints: ${OUTPUT.join(', ')}`}>
        <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
        <pre aria-hidden="true"><span className="terminal-line"><span className="prompt">$</span>{START} <span style={{ whiteSpace: 'nowrap' }}>{REPO}</span>{'\n'}</span>{OUTPUT.map(line => <span key={line} className="terminal-line">{line}{'\n'}</span>)}</pre>
      </div>
    </div>
  </section>
}
