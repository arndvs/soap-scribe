# Traceability: stories → build → tests

Every "system needs to…" line from the [user stories](01-user-stories.md), where it's built, how it's tested, and what's left. Re-run this table whenever a story or the code changes.

**Status:** ✅ Met · ◐ Partly met · ❌ Not met · ⏸ Met in code, unproven live.

| Need | The system needs to… | Story | Built in | Automated test | UX test | Status | Gap |
|---|---|---|---|---|---|---|---|
| N-01 | Draft the note from what was said | 1 | `pipeline/extract.ts`, `pipeline/compose.ts`, `worker/worker.ts` | `pipeline.test.ts`, eval cases 01–04, e2e (demo stand-in model) | T-01 | ⏸ synthetic only | G-05, G-10 |
| N-02 | Start from the previous note's findings | 1, 4 | `compose.ts` (`enforceRules`, carry rules), `content/jane.ts` `readPreviousNotes` | `pipeline.test.ts` | T-01 | ⏸ | G-06 |
| N-03 | Show new / carried / changed | 1, 4 | `shared/drafts.ts` source tags; `Chart.tsx` styling, "was:" tooltip | `shared.test.ts`, e2e visit test | T-02 | ✅ | — |
| N-04 | Her exact protocol wording in Plan | 1 | `pipeline/protocols.ts` (verbatim, deterministic match) | `pipeline.test.ts`, e2e visit test | T-03 | ✅ | — |
| N-05 | Date each recommendation in Plan | 1, 3 | `datedProtocolSentence` ("— given" / "— since"); format in Settings | `pipeline.test.ts`, `app.test.ts`, e2e | T-03 | ✅ format to confirm with her | G-17 |
| N-06 | Show what's already assigned to this patient | 3 | `services/drafts.ts` `priorAssignments`; Chart "Given before" strip, "Add to Plan" | `app.test.ts`, e2e (T-11) | T-11 | ✅ | G-18 |
| N-07 | Insert into Jane, never the wrong patient | 1 | `content/jane.ts` `insertNote` (page check, ID match, all-or-nothing, read-back); server re-checks on `/inserted` | `jane.test.ts`, `app.test.ts`, e2e (T-05, T-06) on fake Jane | T-05, T-06 | ⏸ placeholder selectors | G-04, G-06 |
| N-08 | Leave save and sign to her | 1 | `insertNote` never clicks Save/Sign | `jane.test.ts` | T-05 | ✅ | — |
| N-09 | Warn when too similar to last note | 4 | `shared/similarity.ts`; `Chart.tsx` warning; threshold in Settings | `shared.test.ts`, e2e (T-04) | T-04 | ✅ | — |
| N-10 | Match recording to appointment, she confirms | 2 | `pipeline/match.ts` (15-min slack), recomputed at read time; stable appointment IDs; `Today.tsx` confirm | `pipeline.test.ts`, `app.test.ts`, e2e | T-07 | ⏸ real clock offsets untested | G-11, G-25 |
| N-11 | One list of today's visits and their state | 2 | `Today.tsx` appointment-first (`today-model.ts`), "No recording" rows, "N of M inserted" | `today-model.test.ts`, e2e (T-08) | T-07, T-08 | ✅ | G-23 |
| N-12 | She edits template, shorthand, protocols, with history | 5 | `Settings.tsx` (protocols grouped by category, search, phase); `/settings`, `/templates/:id`, `/protocols` | `settings.test.tsx` | T-09 | ✅ | — |
| N-13 | Preview a change safely | 5 | `services/preview.ts` (synthetic facts) | `app.test.ts` | T-09 | ✅ | — |
| N-14 | Patient consent before recording | 6 | Off-system | — | — | ❌ | G-02 |
| N-15 | Keep visit data only as long as needed | 6 | Facts deleted on insert; TTL indexes in `repos/mongo.ts`; previous notes never stored; `services/cleanup.ts` | `repos.test.ts` | — | ✅ | G-01 (BAAs) |
| N-16 | Alert Aaron on failure, no patient data | 7 | `notify/notifier.ts` (job ID + error) | `worker.test.ts` | T-12 | ⏸ SES untested | G-16 |
| N-17 | Retry automatically and on demand | 7 | `worker.ts` backoff 1/5/15, hourly reconcile; Today Retry | `worker.test.ts` | T-12 | ✅ | — |
| N-18 | Draft ready when she opens the chart | 2 | Facts extracted in background; compose on open | `worker.test.ts` | T-07 | ✅ | — |
| N-19 | Correct any sentence before insert | 1 | `Chart.tsx` edit/delete; `PUT /drafts/:id` | `app.test.ts` | T-01 | ✅ | — |
| N-20 | Show where a sentence came from | 4 | Evidence copied from transcript in `extract.ts`; `attachEvidence` in `compose.ts`; "What was said" in Chart | `pipeline.test.ts`, `worker.test.ts`, e2e | — | ✅ | G-19 |
| N-21 | Prove the time saving | 8 | Off-system | — | T-10 | ❌ | G-13 |

## Summary

*Updated after the gap fixes (G-17, G-18, G-19, G-22, G-23, G-24, G-25) and demo mode.*

- **21 needs.** ✅ 14 met · ⏸ 5 built but unproven against real Pocket, Jane or AWS (N-01, N-02, N-07, N-10, N-16) · ❌ 2 not met, both off-system: patient consent (N-14) and the before/after timing (N-21).
- **Story 3 is now met in the product**: dated Plan lines and "Given before" with one-click re-add. What's left is her judgement on the format (session 1).
- **Story 2's dead end is gone**: unrecorded visits show in Today and can be drafted from previous notes.
- **The end-to-end test** (`pnpm test:e2e`, [demo.md](../demo.md)) now covers T-01, T-03 to T-06, T-08 and T-11 on fake Jane with a stand-in model. That proves the flow and the guards, not draft quality or real Jane; those still need her and day 1–2.
