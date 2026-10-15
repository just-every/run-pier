# Pier's two homepages

The installed `/` serves the shared Base Lobby. Native owner first-run confirmation lives at `/setup`; completed operators enter `/app`. The Lobby never varies by session, and public setup state is served by the pinned Base handler. Native sign-in, first-run and Lobby use the edition theme (`public/rer-theme.css`).

The run site, `run-pier.com` (`deploy-site.json`), is static and built by `rer build --site` from `src/site/pages.tsx`: the homepage at `/`, whose primary action **Run Pier** opens `/run`; Base's Run page at `/run` with the commands in `src/site/run.ts`; the docs at `/docs`, rendered at build time from the Markdown that `docs/site.json` lists; and a 404. It links no instance-only route and loads nothing from another origin. `rer dev` serves it beside the app and prints `RER_SITE`. `.github/workflows/run-site.yml` deploys it only when the repository variable `RUN_SITE_DEPLOY` is `true`.
