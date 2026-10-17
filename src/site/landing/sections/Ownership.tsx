import { links } from '../../links'
import { Icon } from '../parts'

const COMMANDS = ['git clone https://github.com/just-every/run-pier.git pier', 'cd pier', 'rer install', 'rer setup', 'rer dev']
const OWN: [string, string][] = [['server', 'Your own computer or server'], ['database', 'Your stock, your data'], ['export', 'Export any time']]

/** Run it yourself: the five commands in a terminal, and what owning it means. */
export function Ownership() {
  return <section id="ownership" className="ownership" aria-labelledby="ownership-title">
    <div className="site-wrap ownership-row">
      <div className="feature-copy">
        <p className="eyebrow">Ownership</p>
        <h2 id="ownership-title">Your stock, your<br />system.</h2>
        <p className="feature-body"><a href={links.run}>Run Pier</a> on your own computer or server and keep every item, order and supplier. Export everything, any time.</p>
        <ul className="own-list">{OWN.map(([icon, text]) => <li key={text}><Icon name={icon} />{text}</li>)}</ul>
      </div>
      <div className="terminal" role="img" aria-label={`Five commands: ${COMMANDS.join(', ')}`}>
        <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
        <pre aria-hidden="true">{COMMANDS.map(line => <span key={line} className="terminal-line"><span className="prompt">$</span>{line}{'\n'}</span>)}</pre>
      </div>
    </div>
  </section>
}
