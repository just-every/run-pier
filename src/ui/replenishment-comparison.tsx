import { useState } from 'react';
import { label, records, type PierState, type RunCommand } from './api';
import { Amount, Badge, Facts, Field, Form, Select, Table, text } from './controls';
import { day, when, words } from './display';

type Props = { state: PierState; run: RunCommand; busy: boolean };
const authorized = (state: PierState) => ['owner', 'buyer'].includes(state.actor.role);

export function ReplenishmentComparison({ state, run, busy, forecast: f }: Props & { forecast: any }) {
  const [saved, setSaved] = useState<any>(null), [includeTransfer, setIncludeTransfer] = useState(false);
  const current = saved?.actor === `${state.actor.id}:${state.actor.role}` && saved.result.stateVersion === state.version;
  const comparison = current ? saved.result.optimization : null;
  const locations = records(state, 'locations'), bins = locations.filter(l => l.kind === 'bin');
  const choose = async (option: any) => { await run(option.command.type, option.command.payload); };
  return <>
    <Form title="Compare cash and service plans" submit="Compare current options" busy={busy} disabled={!authorized(state)}
      note="Compare one item using saved settings and current evidence. A purchase choice creates a draft for separate human approval. A transfer choice dispatches physical stock only with current warehouse authority."
      onSubmit={async data => { await run('replenishment.compare', { itemId: f.itemId, warehouse: f.warehouse, cashCeiling: text(data, 'cashCeiling'),
        ...(includeTransfer ? { transferQuotes: [{ fromLocationId: text(data, 'fromLocationId'), toLocationId: text(data, 'toLocationId'), transitLocationId: text(data, 'transitLocationId'),
          expectedDate: text(data, 'expectedDate'), transportCost: text(data, 'transportCost'), reason: text(data, 'reason') }] } : {}) },
      { onResult: result => setSaved({ actor: `${state.actor.id}:${state.actor.role}`, result }) }); return false; }}>
      <Field label="Cash ceiling USD" name="cashCeiling" inputMode="decimal" defaultValue="100" />
      {f.scope !== 'company' && <Field label="Include a reviewed transfer" type="checkbox" required={false} checked={includeTransfer} onChange={() => setIncludeTransfer(!includeTransfer)} />}
      {includeTransfer && <>
        <Select label="Transfer source bin" name="fromLocationId" rows={bins.filter(l => l.warehouse !== f.warehouse && f.includedWarehouses.includes(l.warehouse))} />
        <Select label="Transfer destination bin" name="toLocationId" rows={bins.filter(l => l.warehouse === f.warehouse)} />
        <Select label="Transfer transit location" name="transitLocationId" rows={locations.filter(l => l.kind === 'transit')} />
        <Field label="Reviewed arrival date" name="expectedDate" type="date" />
        <Field label="Transport estimate USD" name="transportCost" inputMode="decimal" />
        <Field label="Transport estimate source" name="reason" />
      </>}
    </Form>
    {saved && !current && <p role="status">Inputs changed. Compare current options again before choosing.</p>}
    {comparison && <section className="panel" aria-label="Current replenishment comparison"><h2>Current replenishment comparison</h2>
      <Facts values={[
        { label: 'Captured demand', value: comparison.forecast.observed }, { label: 'Stockout correction', value: comparison.forecast.correctedWindowDemand ?? 'Insufficient exposure history' },
        { label: 'Forecast low', value: comparison.forecast.low }, { label: 'Forecast expected', value: comparison.forecast.expected }, { label: 'Forecast high', value: comparison.forecast.high },
        { label: 'In-stock days', value: comparison.forecast.availability ? (comparison.forecast.availability.availableMs / 86400000).toFixed(1) : 'Unknown' },
        { label: 'Realized contribution USD', value: <Amount value={comparison.realizedMargin.margin} unknown="Owner-only or insufficient evidence" /> },
      ]} />
      <p>{comparison.forecast.uncertainty}</p>
      {comparison.forecast.assumptions && <p>Seasonality: {comparison.forecast.assumptions.seasonality.source}. Promotion: {comparison.forecast.assumptions.promotion.source}.</p>}
      {comparison.forecast.backtest && <><h3>Held-out backtest</h3><Facts values={[
        { label: 'Training actual', value: comparison.forecast.backtest.trainingActual }, { label: 'Predicted holdout', value: comparison.forecast.backtest.predicted },
        { label: 'Holdout actual', value: comparison.forecast.backtest.actual }, { label: 'Absolute error', value: comparison.forecast.backtest.absoluteError },
      ]} /><p>{comparison.forecast.backtest.basis}</p></>}
      {['cash', 'service'].map(objective => <div key={objective}><h3>{objective === 'cash' ? 'Cash-constrained ranking' : 'Service-maximizing ranking'}</h3>
        {!comparison.rankings[objective].length ? <p>No executable option fits this objective. Review cash, stock and supplier settings.</p> :
          <Table headings={['Rank and source', 'Quantity', 'Arrival basis', 'Cash USD', 'Uncovered', 'Contribution USD', '']} numeric={[1, 3, 4, 5]}>
            {comparison.rankings[objective].map((option: any, index: number) => <tr key={`${option.kind}-${option.supplierId ?? option.quoteIndex}`}>
              <td>{index + 1}. {option.kind === 'purchase' ? label(records(state, 'parties'), option.supplierId) : `Transfer from ${option.fromWarehouse}`}</td>
              <td>{option.quantity}</td><td>{option.expectedDate ? day(option.expectedDate) : `${option.leadDays} days including observed supplier delay`}
                {option.reliability && <small>{option.reliability.delayDays === null ? 'Supplier reliability unknown' : `${option.reliability.delayDays} days observed delay`}</small>}</td>
              <td><Amount value={option.expectedLandedCost} /></td><td>{option.uncoveredAtHorizon}</td><td><Amount value={option.expectedContribution} unknown="Insufficient permitted evidence" /></td>
              <td><button disabled={busy || !authorized(state) || option.kind === 'transfer' && state.actor.role !== 'owner'} onClick={() => void choose(option)}>
                {option.kind === 'purchase' ? `Draft ${objective} purchase` : `Dispatch ${objective} transfer`}</button></td>
            </tr>)}
          </Table>}
      </div>)}
      {comparison.transfers.filter((option: any) => !option.executable).map((option: any, index: number) => <p key={index}>Transfer from {option.fromWarehouse}: {option.reason}</p>)}
      <p>{comparison.limits}</p><p>Transfer cash is the incremental transport estimate; existing stock cost remains in its contribution calculation.</p>
    </section>}
  </>;
}

export function ReplenishmentFollowThrough({ state, po, run, busy }: Props & { po: any }) {
  const [saved, setSaved] = useState<any>(null);
  if (!po.replenishment || !authorized(state)) return null;
  const follow = saved?.version === state.version && saved?.actor === `${state.actor.id}:${state.actor.role}` ? saved.value : null;
  return <section className="panel replenishment-review"><h2>Forecast versus actual</h2>
    <button disabled={busy} onClick={() => run('replenishment.review', { poId: po.id }, { onResult: result => setSaved({ value: result.followThrough, version: state.version + 1, actor: `${state.actor.id}:${state.actor.role}` }) })}>Review current receipt and ledger</button>
    {saved && !follow && <p>Records changed. Review current receipt and ledger again.</p>}
    {follow && <><p><Badge>{words(follow.status)}</Badge> Checked {when(follow.checkedAt)}</p>
      <Facts values={[
        { label: 'Remaining goods', value: follow.remaining }, { label: 'Expected landed USD', value: <Amount value={follow.expectedLandedCost} /> },
        { label: 'Actual landed USD', value: <Amount value={follow.actualLandedCost} /> }, { label: 'Landed difference USD', value: <Amount value={follow.landedCostDifference} /> },
        { label: 'Inventory ledger', value: follow.inventoryReconciliation?.status ?? 'Not reconciled' },
      ]} />
      <Table headings={['Item', 'Forecast to date', 'Captured actual', 'Difference', 'Received', 'Scenario check']} numeric={[1, 2, 3, 4]}>
        {follow.lines.map((line: any) => <tr key={`${line.itemId}-${line.warehouse}`}><td>{label(records(state, 'items'), line.itemId)}</td><td>{line.predicted}</td><td>{line.actual}</td><td>{line.difference}</td><td>{line.received}</td><td>{line.predictedLow}–{line.predictedHigh}; absolute error {line.absoluteError}. {line.withinScenario ? 'Inside reviewed bounds' : 'Outside reviewed bounds'}</td></tr>)}
      </Table>
      <Table headings={['Receipt', 'Physical and financial status']}>
        {follow.receiptClosures.map((receipt: any) => <tr key={receipt.id}><td><a href={`#purchasing/${receipt.id}`}>{receipt.id}</a></td><td>{words(receipt.status)}</td></tr>)}
      </Table><p>{follow.explanation}</p>
    </>}
  </section>;
}
