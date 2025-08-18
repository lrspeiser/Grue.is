# Deploy Checks and Incident Documentation

Incident: 2025-08-18 Render deploy failing to roll forward
- Symptom: Client kept receiving OpenAI error about `response_format` while new code using `text.format` was pushed.
- Render logs: server crashed on startup with SyntaxError in server.js (invalid arrow function), so new build never became live.
- Root cause: A bad edit introduced `= >` tokens instead of `=>`.
- Fix:
  - Correct server.js arrow functions and rewrite routes cleanly.
  - Migrate OpenAI calls to Responses API with `max_completion_tokens` and `text.format`.
  - Add /version endpoint to verify live commit and model names.

Pre-deploy guardrails (added)
- Syntax/type check for JS using TypeScript’s `checkJs`:
  - `tsconfig.json` with `allowJs: true`, `checkJs: true`, `noEmit: true`.
  - Script: `yarn predeploy:check` runs `tsc --noEmit` and fails on syntax/type errors.
- Post-deploy smoke test script:
  - `yarn smoke:deploy` runs `scripts/smoke-deploy.js` to verify:
    - `/healthz` is 200
    - `/version` returns JSON with commit and model names
    - `POST /v2/api/generate-world` returns success and valid JSON (Responses API path)

Recommended Render config
- Pre-Deploy Command:
  - `yarn --frozen-lockfile && yarn predeploy:check`
- Start Command:
  - `yarn start` (maps to `node server.js`)
- Optional post-deploy smoke (manual):
  - From your terminal: `yarn smoke:deploy`

Verification
- After deploy:
  - `curl -fsS https://grue-is.onrender.com/healthz`
  - `curl -fsS https://grue-is.onrender.com/version`
  - `node scripts/smoke-deploy.js`

Roll-forward checklist
- If smoke test fails on `generate-world` with parameter errors, ensure code uses Responses API with:
  - `max_completion_tokens` (not `max_tokens`)
  - `text: { format: "json_object" }` (not `response_format`)

Change history
- 2025-08-18: Added predeploy check, smoke test, /version endpoint, corrected server.js, migrated OpenAI calls, and documented incident.

