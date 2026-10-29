import type { integrationHealth } from './integration-health';
import { sha256 } from './import-kit';
import { materialHash } from './native-mapping';
import { collections, type State } from './model';

const stages = ['captured', 'mapped', 'reconciled', 'shadow', 'frozen'];
const reviewNames: Record<string, string> = {
  captured: 'Review identities and units', mapped: 'Reconcile totals and references',
  reconciled: 'Review the shadow result', shadow: 'Approve the exact cutover version',
  frozen: 'Commit the explicitly frozen version',
};

/** Retained facts only. Reading this projection neither previews nor admits an import. */
export function onboarding(s: State, health: Awaited<ReturnType<typeof integrationHealth>>) {
  const frontier = sha256(materialHash({ s }));
  const batches = s.imports.filter(batch => !batch.provider).map(batch => {
    const href = `#imports/${encodeURIComponent(batch.id)}`;
    const pending = stages.includes(batch.status);
    const problems: { code: string; message: string; sourceId: string | null; artifact: string | null; row: number | null; href: string }[] = (batch.errors ?? []).map((error: any) => ({
      code: String(error.code), message: String(error.message),
      sourceId: error.sourceId ?? error.details?.key ?? null,
      artifact: error.location?.artifact ?? null, row: error.location?.row ?? null, href,
    }));
    const stale = pending && batch.materialHash !== frontier;
    const status = batch.status === 'committed' ? 'committed' : batch.status === 'undone' ? 'undone'
      : problems.length ? 'invalid' : stale ? 'stale' : batch.status === 'captured' ? 'staged' : 'reviewed';
    const nextAction = !pending ? batch.status === 'committed' ? 'Inspect the recorded cutover' : 'Inspect the retained undo'
      : problems.some(problem => problem.code === 'REVISION_REVIEW') ? 'Review changed source rows explicitly'
      : problems.length ? 'Correct the named source problems and stage corrected files'
      : stale ? 'Stage a fresh reconciliation against current records'
      : reviewNames[batch.status];
    return { id: batch.id, version: batch.version, namespace: batch.namespace, sourceVersion: batch.sourceVersion,
      mappingRevision: batch.mappingRevision, createdAt: batch.createdAt, capturedVersion: batch.capturedVersion ?? null,
      status, stage: batch.status, stale, problems, nextAction, href,
      reviews: (batch.review ?? []).map((review: any) => ({ stage: review.stage, actorId: review.actorId, at: review.at })),
      committedVersion: batch.committedVersion ?? null };
  }).sort((a, b) => (b.capturedVersion ?? 0) - (a.capturedVersion ?? 0) || String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id));
  const counts = Object.fromEntries((['items', 'locations', 'parties', 'orders', 'purchaseOrders', 'receipts', 'shipments', 'movements'] as const).map(kind => [kind, s[kind].length]));
  const profile = s.businessProfile.find(row => row.id === 'business');
  const business = { counts, profile: { configured: Boolean(profile?.name && profile?.address), version: profile?.version ?? null, href: '#purchasing' } };
  const connections = health.connectors.filter(connection => connection.id !== 'stock-source' && !connection.id.startsWith('[')).map(connection => ({
    id: connection.id, name: connection.name, status: connection.status, href: connection.manage,
    pending: connection.pending, failed: connection.failed, uncertain: connection.uncertain,
    lastSuccessfulRequest: connection.lastSuccessfulRequest, lastSuccessfulSync: connection.lastSuccessfulSync,
  }));
  if (!s.channels.length) connections.unshift({ id: 'channels', name: 'Sales channels', status: 'not connected', href: '#channels', pending: 0, failed: 0, uncertain: 0, lastSuccessfulRequest: null, lastSuccessfulSync: null });
  if (!s.ediPartners.length) connections.push({ id: 'edi', name: 'EDI partners', status: 'not connected', href: '#edi', pending: 0, failed: 0, uncertain: 0, lastSuccessfulRequest: null, lastSuccessfulSync: null });
  const empty = !s.movements.length && !s.reservations.length && !collections.some(kind => kind !== 'roles' && s[kind].length);
  const next = batches[0];
  return { version: s.version, empty, business, batches, connections,
    nextAction: next && stages.includes(next.stage) ? { label: next.nextAction, href: next.href, batchId: next.id }
      : !business.profile.configured ? { label: 'Record your business details', href: business.profile.href, batchId: null }
      : next ? { label: 'Inspect connection configuration and retained outcomes', href: '#channels', batchId: null }
      : { label: 'Stage native CSV files or enter records through Stock', href: '#imports', batchId: null } };
}

export type OnboardingDiagnostic = ReturnType<typeof onboarding>;
