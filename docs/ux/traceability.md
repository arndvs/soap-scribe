# Traceability: stories → build → tests

Every "system needs to…" line from the [user stories](01-user-stories.md), where it's built, how it's tested, and what's left. Re-run this table whenever a story or the code changes.

**Status:** ✅ Met · ◐ Partly met · ❌ Not met · ⏸ Met in code, unproven live.

| Need | The system needs to… | Story | Built in | Automated test | UX test | Status | Gap |
|---|---|---|---|---|---|---|---|
| N-01 | Draft the note from what was said | 1 | `pipeline/extract.ts`, `pipeline/compose.ts`, `worker/worker.ts` | `pipeline.test.ts`, eval cases 01–04 | T-01 | ⏸ synthetic only | G-05, G-10 |
| N-02 | Start from the previous note's findings | 1, 4 | `compose.ts` (`enforceRules`, carry rules), `content/jane.ts` `readPreviousNotes` | `pipeline.test.ts` | T-01 | ⏸ | G-06 |
| N-03 | Show new / carried / changed | 1, 4 | `shared/drafts.ts` source tags; `Chart.tsx` styling, "was:" tooltip | `shared.test.ts` (tag rules) | T-02 | ✅ | — |
| N-04 | Her exact protocol wording in Plan | 1 | `pipeline/protocols.ts` (verbatim, deterministic match) | `pipeline.test.ts` | T-03 | ✅ | — |
| N-05 | Date each recommendation in Plan | 1, 3 | — (`assignedOn` is stored but not printed) | — | T-03 | ❌ | G-17 |
| N-06 | Show what's already assigned to this patient | 3 | `services/drafts.ts` records assignments; `GET /patients/:id/assignments`; no UI, not used by compose | `repos.test.ts` | T-11 | ◐ data only | G-18 |
| N-07 | Insert into Jane, never the wrong patient | 1 | `content/jane.ts` `insertNote` (page check, ID match, all-or-nothing, read-back); server re-checks on `/inserted` | `jane.test.ts`, `app.test.ts` | T-05, T-06 | ⏸ placeholder selectors | G-04, G-06 |
| N-08 | Leave save and sign to her | 1 | `insertNote` never clicks Save/Sign | `jane.test.ts` | T-05 | ✅ | — |
| N-09 | Warn when too similar to last note | 4 | `shared/similarity.ts`; `Chart.tsx` warning; threshold in Settings | `shared.test.ts` | T-04 | ✅ | — |
| N-10 | Match recording to appointment, she confirms | 2 | `pipeline/match.ts` (15-min slack); `Today.tsx` confirm | `pipeline.test.ts` | T-07 | ⏸ | G-11 |
| N-11 | One list of today's visits and their state | 2 | `Today.tsx`, `GET /today` | `app.test.ts` | T-07, T-08 | ◐ recordings only | G-23 |
| N-12 | She edits template, shorthand, protocols, with history | 5 | `Settings.tsx`; `/settings`, `/templates/:id`, `/protocols` | `settings.test.tsx` | T-09 | ✅ | G-24 (categories) |
| N-13 | Preview a change safely | 5 | `services/preview.ts` (synthetic facts) | `app.test.ts` | T-09 | ✅ | — |
| N-14 | Patient consent before recording | 6 | Off-system | — | — | ❌ | G-02 |
| N-15 | Keep visit data only as long as needed | 6 | Facts deleted on insert; TTL indexes in `repos/mongo.ts`; previous notes never stored; `services/cleanup.ts` | `repos.test.ts` | — | ✅ | G-01 (BAAs) |
| N-16 | Alert Aaron on failure, no patient data | 7 | `notify/notifier.ts` (job ID + error) | `worker.test.ts` | T-12 | ⏸ SES untested | G-16 |
| N-17 | Retry automatically and on demand | 7 | `worker.ts` backoff 1/5/15, hourly reconcile; Today Retry | `worker.test.ts` | T-12 | ✅ | — |
| N-18 | Draft ready when she opens the chart | 2 | Facts extracted in background; compose on open | `worker.test.ts` | T-07 | ✅ | — |
| N-19 | Correct any sentence before insert | 1 | `Chart.tsx` edit/delete; `PUT /drafts/:id` | `app.test.ts` | T-01 | ✅ | — |
| N-20 | Show where a sentence came from | 4 | Facts cite segments; composed sentences don't carry them to the UI | `pipeline.test.ts` (citations) | — | ◐ | G-19 |
| N-21 | Prove the time saving | 8 | Off-system | — | T-10 | ❌ | G-13 |

## Summary

- **21 needs.** ✅ 10 met · ⏸ 5 built but unproven against real Pocket, Jane or AWS · ◐ 3 partly met (N-06, N-11, N-20) · ❌ 3 not met (N-05 dated Plan lines, N-14 consent, N-21 measurement).
- **The biggest product gap is Story 3** (N-05, N-06): what was assigned and when. It's the reason she copies dated lines today, and the data to fix it is already being recorded.
- **The biggest experience gap is Story 2** (N-11): a visit with no recording is invisible.
- Everything ⏸ is blocked on the day-1/day-2 checks already in [verification.md](../verification.md), not on design.
