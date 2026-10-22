import { Problem, type Actor, type State } from '../model';
import { documentViews } from './records';
import { decode } from './validation';

export function documentRead(path: string, actor: Actor, s: State): Response | null {
  if (path !== '/api/pier/documents' && !path.startsWith('/api/pier/documents/')) return null;
  if (actor.role !== 'owner') throw new Problem('FORBIDDEN', 'Only an owner can read retained originals, inbox mail and extraction drafts.', null, 403);
  if (path === '/api/pier/documents') return Response.json(documentViews(s), { headers: { 'cache-control': 'no-store' } });
  const match = /^\/api\/pier\/documents\/([^/]+)\/original$/.exec(path);
  const document = match ? s.evidenceDocuments.find(d => d.id === match[1]) : null;
  if (!document) throw new Problem('NOT_FOUND', 'Document not found.', null, 404);
  const extension = document.mimeType === 'application/pdf' ? 'pdf' : document.mimeType === 'image/png' ? 'png' : 'jpg';
  return new Response(decode(document.original), { headers: {
    'content-type': document.mimeType, 'content-disposition': `attachment; filename="pier-original-${document.id}.${extension}"`,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'referrer-policy': 'no-referrer',
  } });
}
