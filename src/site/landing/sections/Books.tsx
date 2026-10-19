import { Check, Icon, SectionHead } from '../parts'
import { MATCH } from '../story'

/** Desk page 07: the three-way match on bill 7731 (PO, receipt, bill), the hold, the credit, the
 * payment and landed cost, posted to QuickBooks Online. */
export function Books() {
  const label = `Three-way match, ${MATCH.sub}: ${MATCH.docs.map(doc => `${doc.title} ${doc.sub}`).join('; ')}. ${MATCH.held}. ${MATCH.steps.map(step => step.text).join('; ')}. ${MATCH.posted}.`
  return <section id="books" className="band books" aria-labelledby="books-title">
    <div className="page-wrap beat beat-copy-right">
      <div className="card match-card" role="img" aria-label={label}>
        <div aria-hidden="true">
          <h3 className="card-display">Three-way match</h3>
          <p className="card-sub">{MATCH.sub}</p>
          <ul className="match-docs">{MATCH.docs.map(doc => <li key={doc.title} className={doc.tone}>
            <Icon name={doc.icon} className="doc-icon" /><p className="doc-title">{doc.title}</p><p className="doc-sub">{doc.sub}</p>
          </li>)}</ul>
          <p className="alert red"><Icon name="alert" />{MATCH.held}</p>
          <ul className="rows match-steps">{MATCH.steps.map(step => <li key={step.text} className="lead-mark">
            {step.agent ? <Icon name="spark" className="mark-spark" /> : <Check />}{step.text}
          </li>)}</ul>
          <p className="chip-done"><svg className="tick" viewBox="0 0 16 16"><path d="m2.8 8.6 3.3 3.2 7-7.4" /></svg>{MATCH.posted}</p>
        </div>
      </div>
      <SectionHead id="books" eyebrow="Nov 6 · The books" title={<>Billed for 500.<br />Paid for 480.</>}>
        Pier matches each bill to its PO and receipt, holds the difference and posts landed cost to QuickBooks Online or Xero.
      </SectionHead>
    </div>
  </section>
}
