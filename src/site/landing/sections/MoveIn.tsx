import { links } from '../../links'
import { Arrow } from '../../shell/Actions'
import { Check, Icon, SectionHead } from '../parts'
import { IMPORTED } from '../story'

// Desk page 09: the Cin7 Core import, the one-line start and what it does, and where Pier stops. The terminal
// shows the command and a comment, never rer's output: a homepage carries no RER_ line or loopback address.

const START = 'npx -y @runeditrun/rer dev just-every/run-pier'
const OUTPUT = ['# clones, installs and starts Pier on your computer']

export function MoveIn() {
  return <section id="move-in" className="band move-in" aria-labelledby="move-in-title">
    <div className="page-wrap">
      <div className="beat beat-copy-right">
        <div className="card import-card" role="img" aria-label={`Importing from Cin7 Core, 100%: ${IMPORTED.map(row => `${row.name} ${row.value}`).join('; ')}.`}>
          <div aria-hidden="true">
            <h3 className="card-display">Importing from Cin7 Core</h3>
            <div className="progress"><span className="progress-bar"><span /></span><b>100%</b></div>
            <ul className="rows split">{IMPORTED.map(row => <li key={row.name} className="lead-mark">
              {row.done ? <Check /> : <Icon name="alert" className="mark-warn" />}<span>{row.name}</span><span className="import-value">{row.value}</span>
            </li>)}</ul>
          </div>
        </div>
        <div className="move-copy">
          <SectionHead id="move-in" eyebrow="Move in" title={<>Bring your warehouse<br />with you.</>}>
            Items, bins, stock on hand, customers, suppliers and open orders come across from Cin7, inFlow or Fishbowl. Channels reconnect to the same listings.
          </SectionHead>
          <div className="terminal" role="img" aria-label={`One command: ${START}. It ${OUTPUT.join('; ').replace('# ', '')}.`}>
            <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
            <pre aria-hidden="true"><span className="terminal-line"><span className="prompt">$</span>npx -y @runeditrun/rer dev <span className="nowrap">just-every/run-pier</span>{'\n'}</span>{OUTPUT.map(line => <span key={line} className="terminal-line out">{line}{'\n'}</span>)}</pre>
          </div>
          <p className="terminal-note"><a href={links.run}>Runs on your own computer or server.</a></p>
        </div>
      </div>
      <div className="stops">
        <Icon name="box" className="stops-icon" />
        <p><b>Where Pier stops.</b> Manufacturing work orders, point of sale and 3PL client billing.</p>
        <a className="stops-link" href={links.contract}>Read the contract<Arrow /></a>
      </div>
    </div>
  </section>
}
