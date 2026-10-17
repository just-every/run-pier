import { links } from '../../links'
import { Icon } from '../parts'

const START = 'npx -y @runeditrun/rer dev'
const REPO = 'just-every/run-pier'
const COMMENT = '# clones, installs and starts Pier on your computer'
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
      <div className="terminal" role="img" aria-label={`One command: ${START} ${REPO}. ${COMMENT}`}>
        <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
        <pre aria-hidden="true"><span className="terminal-line"><span className="prompt">$</span>{START} <span style={{ whiteSpace: 'nowrap' }}>{REPO}</span>{'\n'}</span><span className="terminal-line">{COMMENT}{'\n'}</span></pre>
      </div>
    </div>
  </section>
}
