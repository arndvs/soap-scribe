# Verification

How to rerun each check, the last recorded result, and what was not run. Update the results table whenever a check is run.

## Commands and results

| Check | Command | Last result | Date |
|---|---|---|---|
| Everything below in one command | `pnpm run ci` | Passed | 2026-11-24 |
| Shared schemas and job transitions | `pnpm --filter @soap-scribe/shared test` | 9 passed | 2026-11-24 |
| Server: pipeline, worker, API, Pocket client and webhooks, alerts, eval scorer, repository contract (in-memory) | `pnpm --filter @soap-scribe/server test` | 62 passed, 1 skipped (MongoDB contract) | 2026-11-24 |
| Repository contract on MongoDB | `TEST_MONGODB_URI=mongodb://localhost:27017 pnpm --filter @soap-scribe/server test` | Passed in CI against `mongo:7`: server suite 72 passed, 0 skipped | 2026-11-24 |
| GitHub Actions CI (gitleaks + check) | Push to `main` | Both jobs passed on `011cf81` | 2026-11-24 |
| Extension: page logic, fail-closed insert, Settings first-run render | `pnpm --filter @soap-scribe/extension test` | 13 passed | 2026-11-24 |
| End-to-end: built extension in Chromium on demo mode (8 tests incl. the Jane capture tool) | `pnpm test:e2e` | 8 passed locally (Playwright Chromium build 1243, browser on UTC); CI job `e2e` | 2026-11-24 |
| Pocket API shapes (day 1) | `POCKET_API_KEY=… pnpm --filter @soap-scribe/server pocket:check` | Not run yet: needs the real key ([first-real-checks.md](first-real-checks.md)) | |
| Typecheck, all packages | `pnpm typecheck` | Passed | 2026-11-24 |
| Extension build; bundle checked for secret names | `API_URL=… JANE_HOST=… pnpm --filter @soap-scribe/extension build` | Built; no `POCKET`, `MONGODB` or `pk_` strings in the bundle | 2026-11-24 |
| No audio, practice or env files tracked | `pnpm check:files` | Passed | 2026-11-24 |
| Secret scan | `gitleaks detect` (CI) | Not run locally | |
| Server bundle and production install | `pnpm --filter @soap-scribe/server build`, then `pnpm --filter @soap-scribe/server deploy --prod --legacy /tmp/out` | Bundle loads from the production install and stops on missing env vars, printing names only | 2026-11-24 |
| Container build, and the image stops on missing config | CI job `image` | See the latest CI run | |
| Draft test set, synthetic cases, real models | `pnpm --filter @soap-scribe/server eval` (needs AWS + model IDs) | Not run yet | |
| Draft test set, her private cases | `EVAL_CASES_DIR=… pnpm --filter @soap-scribe/server eval` | Not run yet (G-10) | |

## Draft test set: pass rule

A run passes only if **no case contains an invented finding or cites the wrong transcript line**. Cases 05–07 also run in CI through the pipeline with the demo stand-in model, which checks the pipeline and the scorer, not the real model. Missing findings and wrong spinal levels are reported per case and should trend down; an invented finding blocks the change.

The scorer ([`packages/server/src/eval/score.ts`](../packages/server/src/eval/score.ts)) counts an *invented* finding as a spinal level the draft names that neither the transcript nor a previous note mentions, or a phrase the case forbids. It's deterministic, so every failure can be explained.

| Case | Visit type | Invented | Missing | Protocols | Notes |
|---|---|---|---|---|---|
| 01 | Routine follow-up, carried assessment | | | | |
| 02 | New complaint; old finding must not reappear as today's | | | | |
| 03 | No spoken recap | | | | |
| 04 | Prenatal, two library recommendations | | | | |
| 05 | Not recorded: only carried sentences | | | | |
| 06 | A repeat dated "since", a new item dated "given" | | | | |
| 07 | Today's pain score cites the patient's line | | | | |

## Not run here

- Anything with real patients: blocked until every item in [gaps.md](gaps.md) P1 is done.
