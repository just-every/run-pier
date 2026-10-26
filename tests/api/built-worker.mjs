import worker from '../../dist/server/index.js';

// Exercise the emitted application, awaiting its real background work so each
// public-command assertion observes the completed financial operation.
export default {
  ...worker,
  async fetch(request, env, ctx) {
    // Schema setup is test infrastructure, before any owner or business data.
    if (new URL(request.url).pathname === '/__test/schema') {
      if (request.method !== 'POST' || request.headers.get('x-pier-schema-key') !== env.RER_DEV_KEY) return new Response('Not found', { status: 404 });
      const statements = await request.json();
      await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
      return new Response(null, { status: 204 });
    }
    const pending = [];
    const execution = Object.create(ctx);
    execution.waitUntil = promise => { pending.push(promise); };
    const response = await worker.fetch(request, env, execution);
    await Promise.all(pending);
    return response;
  },
};
