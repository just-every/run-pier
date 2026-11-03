// @ts-expect-error The vendored bounded stream reader has no TypeScript declarations.
import { readStream } from '../../modules/mail/src/inbound/bytes.mjs';
import { Problem } from '../model';

/** Bound the bytes before decoding/parsing an upload command, including chunked bodies. */
export async function commandText(request: Request) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await readStream(request.body, 2 * 1024 * 1024));
  } catch {
    throw new Problem('SIZE', 'Command exceeds 2 MiB or is not valid UTF-8.', null, 400);
  }
}
