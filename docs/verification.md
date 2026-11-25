# Verification

How to rerun each check, the last recorded result, and what was not run. Update the results table whenever a check is run.

## Commands and results

| Check | Command | Last result | Date |
|---|---|---|---|
| Everything below in one command | `pnpm run ci` | Passed | 2026-11-24 |
| Shared schemas and job transitions | `pnpm --filter @soap-scribe/shared test` | 9 passed | 2026-11-24 |
| Server: pipeline, worker, API, Pocket parsing, repository contract (in-memory) | `pnpm --filter @soap-scribe/server test` | 46 passed, 1 skipped (MongoDB contract) | 2026-11-24 |
| Repository contract on MongoDB | `TEST_MONGODB_URI=mongodb://localhost:27017 pnpm --filter @soap-scribe/server test` | Not run locally (no MongoDB here); runs in CI | |
| Extension: page logic and fail-closed insert | `pnpm --filter @soap-scribe/extension test` | 12 passed | 2026-11-24 |
| Typecheck, all three packages | `pnpm typecheck` | Passed | 2026-11-24 |
| Extension build; bundle checked for secret names | `API_URL=… JANE_HOST=… pnpm --filter @soap-scribe/extension build` | Built; no `POCKET`, `MONGODB` or `pk_` strings in the bundle | 2026-11-24 |
| No audio, practice or env files tracked | `pnpm check:files` | Passed | 2026-11-24 |
| Secret scan | `gitleaks detect` (CI) | Not run locally | |
| Draft test set (10 synthetic visits) | Not built yet (G-10) | | |

## Draft test set: pass rule

A run passes only if **no case contains an invented finding**. Missing findings and wrong spinal levels are reported per case and should trend down; an invented finding blocks the change.

| Case | Visit type | Invented | Missing | Wrong level | Notes |
|---|---|---|---|---|---|
| 01 | Routine adjustment | | | | |
| 02 | New complaint | | | | |
| 03 | Re-exam | | | | |
| 04 | No spoken recap | | | | |
| 05–10 | | | | | |

## Not run here

- Anything with real patients: blocked until every item in [gaps.md](gaps.md) P1 is done.
