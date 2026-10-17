import type { Bindings } from '../../auth.server';
import type { State } from '../model';
import { credentials } from '../channels/secrets';
import { PANTRY_CREDENTIAL } from './adapters/pantry-client';

export async function bookConnectionViews(env: Bindings, state: State) {
  const secret = await credentials(env, 'books:pantry').catch(() => ({} as Record<string, string>));
  const credentialPresent = PANTRY_CREDENTIAL.test(secret.integrationToken ?? '');
  return state.bookConnections.map(connection => ({ ...connection, credentialPresent,
    ...(connection.enabled && !credentialPresent ? { problem: 'Pier holds no Pantry credential. Restored backups never carry connection credentials. Choose Reconnect Pantry and paste a new integration credential from Pantry.' } : {}) }));
}
