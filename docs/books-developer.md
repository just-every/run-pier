# Books developer notes

The adapter uses exact-reference lookup, stable idempotency keys and an installation-wide database lease. `tests/api/books.test.mjs` covers real Pier/Pantry HTTP and D1. `tests/api/books-landed.test.mjs` covers landed cost and return closure. `PANTRY_SOURCE` selects an explicit sibling checkout for development.

Cloudflare uses `global_fetch_strictly_public` so sibling public Worker routes remain reachable. See [Worker fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/).
