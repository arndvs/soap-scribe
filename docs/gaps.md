# Gap register

Every known gap, with its impact, the fix, and its status. Status values: **Open** (no change yet), **Done** (fixed in the repo), **Decision** (waiting on an entry in [decisions.md](decisions.md)).

Priority: **P1** blocks real-patient use. **P2** should land before the write-up. **P3** improves the record or the code.

## P1

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-01 | Not every service that touches patient data has a signed BAA yet. Pocket is signed. | Real patients can't be used. | Sign with the host, MongoDB (or confirm the Cloud Terms BAA covers the tier), and the LLM provider; a BAA between the developer and the practice. | Open |
| G-02 | Patient recording consent isn't in the intake form. | California generally requires everyone recorded to consent. | Add a consent line and a treatment-room sign. | Open |
| G-03 | Webhook verification method is unknown. | Anyone who finds the URL could create jobs. | Verify per Pocket's documented signature (D-35). | Done |
| G-04 | Jane's field type is unknown. | Insert may not register with Jane's page code. | Answer D-02 on day 2. | Decision (D-02) |

| G-05 | Pocket's response and webhook shapes come from the docs but haven't been seen live. | Example values in the docs are placeholders (timestamp format, duration units). | Call the API with a real key on a role-played recording; confirm `recording_at` and `duration`. | Partly done (D-34) |
| G-06 | Jane selectors in `jane-map.ts` are placeholders. | Reading the chart and inserting won't work on real Jane pages yet. | Map the real selectors on a test patient; save a de-identified copy of the page as the test fixture. | Open (D-02) |

## P2

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-10 | The draft test set has 4 synthetic cases; her 10 role-played visits don't exist yet. | The scorer and runner work, but results on synthetic cases don't prove quality on her visits. | Record 10 role-played visits with her ideal notes into a private folder; run `EVAL_CASES_DIR=… pnpm --filter @soap-scribe/server eval`. | Partly done |
| G-11 | Recording start times may not match appointment times (time zone, late starts). | Wrong or missing patient suggestions. | Test with a recording at a known time; widen the match window; always require confirmation. | Open |
| G-12 | Jane's terms of service haven't been checked for browser extensions. | Possible terms violation. | Read the terms before real-patient use. | Open |
| G-13 | No measured result yet. | The write-up has nothing to report. | Time a full day of charting before and after. | Open |
| G-14 | Settings has an API but no editor UI. | Templates, glossary and protocols must be entered through the API for now. | Settings view: template and carry rules, examples, shorthand, protocol library, version history with restore, Preview on a synthetic visit. | Done |
| G-15 | Failure alerts aren't wired to `ALERT_EMAIL`. | A failed job shows in the side panel but nobody is emailed. | SES email with job ID and error only. | Done |
| G-16 | No deployment config yet. | Can't run on AWS. | Dockerfile, ECS task definitions, IAM policies, manual deploy workflow, [deploy.md](deploy.md). Not yet run against a real AWS account. | Done (untested on AWS) |
| G-17 | Protocol lines in Plan carry no date. | She dates every clinical-advice line by hand today (Story 1); without it she can't see when a recommendation started (Story 3). | Protocol lines end "— given 11/24/26", or "— since <first date>" when given before; format (US, ISO, off) in Settings. `datedProtocolSentence`; unit, API and e2e tests. Confirm her format in session 1. | Done |
| G-18 | Assignments are recorded but never shown, and compose doesn't read them. | Story 3 isn't met: she's still scrolling old notes to see what she's assigned. | Draft carries `priorAssignments`; Chart shows "Given before" above Plan with dates and one-click "Add to Plan"; repeats are marked "since", not re-added. API and e2e tests (T-11). | Done |
| G-23 | A visit with no recording is invisible: Today lists recordings, not appointments, and Chart can only say "no confirmed visit". | Story 2: she can't tell which notes are left; a forgotten recorder is a dead end. | Today lists appointments first, with "No recording" rows and "N of M notes inserted"; Chart offers "Draft from previous notes" (job with no recording, never claimed by the worker, all sentences carried, flagged). Contract, API and e2e tests. | Done |

## P3

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-20 | Single-token auth. | Fine for one clinician; not for two. | Real login when D-31 is taken up. | Open |
| G-21 | No in-browser recording. | The project doesn't exercise live capture. | D-30 stretch goal. | Open |
| G-19 | A "today" sentence can't be traced to its transcript line in the UI. | Story 4: when she doubts a sentence she has no way to check it. | Code copies cited transcript lines onto facts after extraction; compose links today/updated sentences to them by word overlap (no link when unsure); "What was said" under the sentence. Unit and e2e tests. | Done |
| G-22 | Today says "open the patient's chart" but doesn't link to it. | Extra navigation per patient in a batch (Story 2). | "Open chart" in Today navigates the Jane tab to the patient's chart. The chart path is a placeholder in `jane-map.ts` like the selectors (G-06). | Done (path unverified) |
| G-24 | The protocol list is flat (category exists but isn't used to group) and there is no care phase. | A flat library won't scale past ~50 items; "ready to progress?" (Story 3) needs phases. | Protocols grouped by category with search in Settings; optional care phase on each item, shown in "Given before". Automatic "ready to progress" is not attempted. | Done (phase is a label only) |
| G-25 | A recording that arrived before the schedule was synced never got a suggested patient, and every re-sync gave appointments new IDs, orphaning confirmed jobs. Found by demo mode. | End-of-day batch (Story 2) would show no suggestions; re-opening the schedule would break Today. | Stable appointment IDs from the schedule row; suggestion recomputed while a job waits for confirmation. API test and e2e test. | Done |
