# PakThai source map and repository operating rules

## Canonical production source
- AI Sourcing Cloudflare Worker: `PakThai-Tech-AI-Sourcing-FINAL/src/worker.js` plus its imported modules under the same project.
- AI Sourcing configuration and dependency lock: `PakThai-Tech-AI-Sourcing-FINAL/wrangler.jsonc`, `package.json`, and `package-lock.json`.
- Store static source: `PakThai-Store-DEPLOY/` (notably `index.html`, `app.js`, `sw.js`, `functions/`, and `_headers`).
- GitHub automation: `.github/workflows/run-engine.yml`.

## Legacy engine source
- `PAKTHAI_MASTER_WORKER_CURRENT.js` is retained as a legacy/reference snapshot.
- It is not the canonical deployment entrypoint and must not overwrite the current modular Worker.
- Reconcile individual features only after route, schema, authentication, and test comparisons. Never concatenate the legacy file into the modular Worker.

## CI contract
- GitHub Actions runs tests from the AI Sourcing project root.
- It syntax-checks the Store browser JavaScript and legacy reference source.
- It performs read-only HTTP health checks against the deployed Worker health/catalog endpoints and Store.
- CI must not deploy, mutate D1, send outreach, or use production credentials.

## Repository security
- Never commit OAuth client-secret JSON, browser profiles, Wrangler state, local databases, environment files, or runtime dependencies.
- Use GitHub Actions secrets / Cloudflare secret storage for runtime credentials. Do not print secret values in CI logs.
- Removing a credential from the current Git tree does not remove it from earlier Git history. Rotate/revoke any credential or session data that was ever committed to a public repository.
