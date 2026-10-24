import { fail, type Actor, type Collection, type Context, type Row, type State } from './model';
import { authority, policyAuthority } from './storage';
import { scoped } from './permissions';
import { sha256 } from './import-kit';

type Gate = { sql: string; params: any[] };
type Source = { collection: Collection; row: Row };
export type ProviderAudit = {
  actor: Actor;
  policy?: Context['backgroundPolicy'];
  commandId: string;
  connectorId: string;
  operation: string;
  direction: 'inbound' | 'outbound';
  state: State;
  sources: Source[];
  itemIds?: string[];
  documentIds?: string[];
  externalIds?: unknown[];
  requestId?: string;
  providerAttemptId?: string;
  approval?: { actorId: string; documentId: string; version: number; policyVersion: number | null };
};
type Outcome = 'accepted' | 'refused' | 'uncertain' | 'unavailable';
type Result = { outcome?: Outcome; externalIds?: unknown[] };

// Only explicit provider identity fields enter history. Unsafe identities retain
// a stable digest, never a URL, contact, credential or arbitrary response text.
function identities(values: unknown[] = []): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(value => /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) ? value : `sha256:${sha256(value)}`))];
}

/** Admission and intent are one SQL write. Completion never needs renewed authority. */
export async function beginProviderAttempt(db: D1Database, input: ProviderAudit, approvedMessage?: Gate) {
  if (scoped(input.actor)) fail('SCOPE', 'Your current warehouse grant does not authorize this provider operation.');
  const gate = approvedMessage ?? (input.policy ? policyAuthority({ actor: input.actor, backgroundPolicy: input.policy }) : authority(input.actor));
  const attemptId = crypto.randomUUID();
  const event = {
    id: `${attemptId}:attempt`, at: new Date().toISOString(), actorId: input.actor.id,
    commandId: input.commandId, type: 'provider.' + input.operation, outcome: 'uncertain' as Outcome,
    phase: 'attempt', attemptId, requestId: input.requestId ?? input.commandId,
    providerAttemptId: input.providerAttemptId ?? attemptId, approval: input.approval ?? null,
    version: input.state.version, rule: input.policy ?? null,
    connectorId: input.connectorId, direction: input.direction,
    itemIds: [...new Set(input.itemIds ?? [])],
    documentIds: [...new Set([...(input.documentIds ?? []), ...input.sources.map(source => source.row.id)])],
    sourceVersions: input.sources.map(source => ({ kind: source.collection, id: source.row.id, version: source.row.version })),
    externalIds: identities(input.externalIds), changes: [],
  };
  const sources = input.sources.map(() => 'EXISTS(SELECT 1 FROM pier_records WHERE kind=? AND id=? AND data=?)');
  const admitted = await db.prepare(`INSERT INTO pier_audit(id,at,actor_id,command_id,event_type,outcome,data)
    SELECT ?,?,?,?,?,?,? WHERE (${gate.sql})${sources.map(source => ` AND ${source}`).join('')}`)
    .bind(event.id, event.at, event.actorId, event.commandId, event.type, event.outcome, JSON.stringify(event),
      ...gate.params, ...input.sources.flatMap(source => [source.collection, source.row.id, JSON.stringify(source.row)])).run();
  if (!admitted.meta.changes) fail('PROVIDER_AUTHORITY', 'Provider authority or the exact source changed. Review current records before continuing.');
  return async (result: Result = {}) => {
    const outcome = result.outcome ?? 'accepted';
    const completed = { ...event, id: `${attemptId}:outcome`, at: new Date().toISOString(), phase: 'outcome', outcome,
      externalIds: identities([...(input.externalIds ?? []), ...(result.externalIds ?? [])]) };
    await db.prepare('INSERT INTO pier_audit(id,at,actor_id,command_id,event_type,outcome,data) VALUES(?,?,?,?,?,?,?)')
      .bind(completed.id, completed.at, completed.actorId, completed.commandId, completed.type, outcome, JSON.stringify(completed)).run();
  };
}

export async function providerOperation<T>(db: D1Database, input: ProviderAudit, remote: () => Promise<T>, result?: (value: T) => Result) {
  const finish = await beginProviderAttempt(db, input);
  let value: T;
  try { value = await remote(); }
  catch (error) { await finish({ outcome: 'uncertain' }); throw error; }
  await finish(result?.(value));
  return value;
}
