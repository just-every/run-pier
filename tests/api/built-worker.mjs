import worker from '../../dist/server/index.js';

// Exercise the emitted application, awaiting its real background work so each
// public-command assertion observes the completed financial operation.
export default {
  ...worker,
  async fetch(request, env, ctx) {
    const pending = [];
    const execution = Object.create(ctx);
    execution.waitUntil = promise => { pending.push(promise); };
    const response = await worker.fetch(request, env, execution);
    await Promise.all(pending);
    return response;
  },
};
