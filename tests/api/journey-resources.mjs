// Resource scopes for a journey's sequential public-door scenarios. These do
// not register tests or suppress assertions. Every refused branch is exercised.
export async function phase(name, run) {
  const cleanup = [];
  try {
    await run({ after: fn => cleanup.push(fn) });
  } catch (error) {
    error.message = name + ': ' + error.message;
    throw error;
  } finally {
    for (const close of cleanup.reverse()) await close();
  }
}
export async function checkpoint(name, run) {
  try { await run(); }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}
