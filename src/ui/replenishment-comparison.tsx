import { useState } from 'react';
import { itemLabel, label, records, type PierState, type RunCommand } from './api';
import { Amount, Badge, Facts, Field, Form, Select, Table, text } from './controls';
import { day, reference, when } from './display';
import { readReply } from './wire';

// These two evidence commands never move stock, approve purchases or send mail.
function usePlanningEvidence() {
  const [result, setResult] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const read = async (type: 'replenishment.compare' | 'replenishment.review', payload: object) => {
    setLoading(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/pier/commands', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: crypto.randomUUID(), type, payload }) });
      const reply = readReply(await response.json());
      if (!reply.ok) throw new Error(reply.error.message);
      if (!response.ok) throw new Error('The evidence could not be loaded. Retry with current authority.');
      setResult(reply.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Evidence could not be loaded. Retry.'); }
    finally { setLoading(false); }
    return false;
  };
  return { result, error, loading, read, clear: () => setResult(null) };
}

type Props = { state: PierState; run: RunCommand; busy: boolean };
export function ReplenishmentComparison({ state, run, busy, forecast: f }: Props & { forecast: any }) {
  const evidence = usePlanningEvidence(), comparison = evidence.result, result = comparison?.optimization;
  const [cashCeiling, setCashCeiling] = useState(''), [quote, setQuote] = useState<any>(null);
  const [objective, setObjective] = useState('cash');
  const locations = records(state, 'locations');
  const allowed = ['owner', 'buyer'].includes(state.actor.role);
  const compare = () => evidence.read('replenishment.compare', { itemId: f.itemId, warehouse: f.warehouse, cashCeiling, transferQuotes: quote ? [quote] : [] });
  const stale = comparison && state.version > comparison.stateVersion;
  return <section className="panel" aria-label="Replenishment comparison">
    <h2>Compare cash and service</h2><p>{itemLabel(state, f.itemId)} · {f.warehouse}</p>
    <form onSubmit={event => { event.preventDefault(); void compare(); }}>
      <Field label="Cash ceiling (USD)" value={cashCeiling} onChange={value => { setCashCeiling(value); evidence.clear(); }} inputMode="decimal" disabled={evidence.loading} />
      <div className="actions"><button className="primary" disabled={busy || evidence.loading || !allowed}>Compare current options</button></div>
    </form>
    <details><summary>Transfer quote</summary>
      <Form title="Review a transport quote" submit="Use reviewed quote" busy={busy || evidence.loading} disabled={!allowed} note="A quote moves no stock and pays no carrier. Source commitments, safety stock and future demand remain protected. Dispatch requires current warehouse authority."
        onSubmit={data => { setQuote({ fromLocationId: text(data, 'from'), toLocationId: text(data, 'to'), transitLocationId: text(data, 'transit'), expectedDate: text(data, 'arrival'), transportCost: text(data, 'cost'), reason: text(data, 'source') }); evidence.clear(); }}>
        <Select label="Transfer source bin" name="from" rows={locations.filter(l => l.kind === 'bin' && l.warehouse !== f.warehouse)} />
        <Select label="Transfer destination bin" name="to" rows={locations.filter(l => l.kind === 'bin' && l.warehouse === f.warehouse)} />
        <Select label="Transfer transit location" name="transit" rows={locations.filter(l => l.kind === 'transit')} />
        <Field label="Quoted arrival date" name="arrival" type="date" /><Field label="Quoted transport cost (USD)" name="cost" inputMode="decimal" />
        <Field label="Transport quote source" name="source" />
      </Form>
      {quote && <p role="status">Reviewed quote: {label(locations, quote.fromLocationId)} → {label(locations, quote.toLocationId)}, {day(quote.expectedDate)}, USD {quote.transportCost}. Compare again to use it.</p>}
      {quote && <button onClick={() => { setQuote(null); evidence.clear(); }}>Remove quote</button>}
    </details>
    {evidence.error && <p role="alert">{evidence.error}</p>}
    {result && <>
      {stale && <p role="alert">Inputs changed. Compare current options again before selecting a consequence.</p>}
      <h3>Forecast and uncertainty</h3><Facts values={[
        { label: 'Observed demand', value: result.forecast.observed }, { label: 'Stockout-corrected scenario', value: result.forecast.correctedWindowDemand ?? 'Insufficient exposure history' },
        { label: 'Low scenario', value: result.forecast.low }, { label: 'Expected scenario', value: result.forecast.expected }, { label: 'High scenario', value: result.forecast.high },
        { label: 'Stockout exposure', value: result.forecast.availability ? `${result.forecast.availability.stockoutMs / 86400000} days` : 'Unknown' },
      ]} /><p>{result.forecast.uncertainty}</p>
      {result.forecast.assumptions && <p>Seasonality: {result.forecast.assumptions.seasonality.source}. Promotion: {result.forecast.assumptions.promotion.source}.</p>}
      {result.forecast.backtest && <><h3>Held-out backtest</h3><Facts values={[
        { label: 'Training demand', value: result.forecast.backtest.trainingActual }, { label: 'Predicted holdout', value: result.forecast.backtest.predicted },
        { label: 'Retained holdout actual', value: result.forecast.backtest.actual }, { label: 'Absolute error', value: result.forecast.backtest.absoluteError },
      ]} /><p>{result.forecast.backtest.basis}</p></>}
      <h3>Actual margin evidence</h3><Facts values={[
        { label: 'Net shipped quantity', value: result.realizedMargin.quantity }, { label: 'Revenue USD', value: <Amount value={result.realizedMargin.revenue} /> },
        { label: 'Actual cost USD', value: <Amount value={result.realizedMargin.cost} /> }, { label: 'Contribution USD', value: <Amount value={result.realizedMargin.margin} /> },
      ]} /><p>{result.realizedMargin.basis}</p>
      <label className="field"><span>Planning objective</span><select aria-label="Planning objective" value={objective} onChange={event => setObjective(event.target.value)}><option value="cash">Cash constrained</option><option value="service">Service maximizing</option></select></label>
      {!result.rankings[objective].length && <p role="status">No executable option meets this objective. Review the cash ceiling, supplier terms or transport quote and compare again.</p>}
      <Table headings={['Ranked option', 'Quantity', 'Arrival basis', 'Additional cash USD', 'Uncovered demand', '']} numeric={[1, 3, 4]}>
        {result.rankings[objective].map((option: any, index: number) => <tr key={`${option.kind}-${option.supplierId}-${option.fromWarehouse}-${index}`}>
          <td>{index + 1}. {option.kind === 'purchase' ? label(records(state, 'parties'), option.supplierId) : `Transfer from ${option.fromWarehouse}`}<small>{option.kind === 'purchase' ? `Observed supplier delay: ${option.reliability.delayDays ?? 'unknown'} days` : `Protected safety: ${option.protectedSafetyStock}; future demand: ${option.protectedFutureDemand}`}</small></td>
          <td>{option.quantity}</td><td>{option.arrivalDate ? day(option.arrivalDate) : `${option.leadDays} days, estimated`}</td><td><Amount value={option.expectedLandedCost} /></td><td>{option.uncoveredAtHorizon}</td>
          <td><button disabled={busy || stale || !allowed || option.kind === 'transfer' && state.actor.role !== 'owner'} onClick={() => run(option.command.type, option.command.payload)}>{option.kind === 'purchase' ? 'Draft this purchase' : 'Dispatch reviewed transfer'}</button></td>
        </tr>)}
      </Table><p>{result.limits}</p>
      {result.transfers.filter((o: any) => !o.executable).map((o: any) => <p key={o.fromWarehouse}>Transfer from {o.fromWarehouse}: {o.reason}</p>)}
    </>}
  </section>;
}

export function ReplenishmentFollowThrough({ state, po }: { state: PierState; po: any }) {
  const evidence = usePlanningEvidence(), follow = evidence.result?.followThrough;
  if (!po.replenishment || !['owner', 'buyer'].includes(state.actor.role)) return null;
  return <section className="panel" aria-label="Forecast follow-through"><h3>Forecast versus actual</h3>
    <button disabled={evidence.loading} onClick={() => evidence.read('replenishment.review', { poId: po.id })}>Check receipt and ledger</button>
    {evidence.error && <p role="alert">{evidence.error}</p>}
    {follow && <><p><Badge>{follow.status === 'closed' ? 'Physically and financially closed' : 'Open: receipt or ledger work remains'}</Badge></p>
      <Facts values={[{ label: 'Planned at', value: when(follow.plannedAt) }, { label: 'Checked at', value: when(follow.checkedAt) }, { label: 'Quantity still due', value: follow.remaining },
        { label: 'Expected landed USD', value: <Amount value={follow.expectedLandedCost} /> }, { label: 'Actual landed USD', value: <Amount value={follow.actualLandedCost} /> }, { label: 'Landed difference USD', value: <Amount value={follow.landedCostDifference} /> },
        { label: 'Current inventory ledger', value: follow.inventoryReconciliation?.status ?? 'Not reconciled' }]} />
      <Table headings={['Item', 'Forecast to date', 'Actual demand', 'Difference', 'Received']} numeric={[1, 2, 3, 4]}>{follow.lines.map((line: any) => <tr key={line.itemId}><td>{itemLabel(state, line.itemId)}</td><td>{line.predicted}</td><td>{line.actual}</td><td>{line.difference}</td><td>{line.received}</td></tr>)}</Table>
      <p>{follow.explanation}</p><p>Receipts: {follow.receiptIds.map((id: string) => reference(records(state, 'receipts').find(r => r.id === id))).join(', ') || 'None posted'}</p>
    </>}
  </section>;
}
