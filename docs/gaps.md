# Gap register

Every known gap, with its impact, the fix, and its status. Status values: **Open** (no change yet), **Done** (fixed in the repo), **Decision** (waiting on an entry in [decisions.md](decisions.md)).

Priority: **P1** blocks real-patient use. **P2** should land before the write-up. **P3** improves the record or the code.

## P1

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-01 | Not every service that touches patient data has a signed BAA yet. Pocket is signed. | Real patients can't be used. | Sign with the host, MongoDB (or confirm the Cloud Terms BAA covers the tier), and the LLM provider; a BAA between the developer and the practice. | Open |
| G-02 | Patient recording consent isn't in the intake form. | California generally requires everyone recorded to consent. | Add a consent line and a treatment-room sign. | Open |
| G-03 | Webhook verification method is unknown. | Anyone who finds the URL could create jobs. | Answer D-04; reject unverified requests. | Decision (D-04) |
| G-04 | Jane's field type is unknown. | Insert may not register with Jane's page code. | Answer D-02 on day 2. | Decision (D-02) |

| G-05 | Pocket's response and webhook shapes are assumed, not confirmed. | Parsing may miss the transcript or the start time. | Capture a real payload on day 1; tighten `pocket/client.ts` and its tests. | Open (D-01) |
| G-06 | Jane selectors in `jane-map.ts` are placeholders. | Reading the chart and inserting won't work on real Jane pages yet. | Map the real selectors on a test patient; save a de-identified copy of the page as the test fixture. | Open (D-02) |

## P2

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-10 | The draft test set doesn't exist yet. | Prompt changes can't be judged; invented findings could ship. | Record 10 role-played visits; the clinician writes the ideal note for each. | Open |
| G-11 | Recording start times may not match appointment times (time zone, late starts). | Wrong or missing patient suggestions. | Test with a recording at a known time; widen the match window; always require confirmation. | Open |
| G-12 | Jane's terms of service haven't been checked for browser extensions. | Possible terms violation. | Read the terms before real-patient use. | Open |
| G-13 | No measured result yet. | The write-up has nothing to report. | Time a full day of charting before and after. | Open |
| G-14 | Settings has an API but no editor UI. | Templates, glossary and protocols must be entered through the API for now. | Build the Settings view: template sections and carry rules, glossary, protocol library, Preview. | Open |
| G-15 | Failure alerts aren't wired to `ALERT_EMAIL`. | A failed job shows in the side panel but nobody is emailed. | Send an email (SES) when a job reaches `failed`. | Open |
| G-16 | No deployment config yet. | Can't run on AWS. | Dockerfiles for API and worker, ECS task definitions, Secrets Manager wiring. | Open |

## P3

| ID | Gap | Impact | Fix | Status |
|---|---|---|---|---|
| G-20 | Single-token auth. | Fine for one clinician; not for two. | Real login when D-31 is taken up. | Open |
| G-21 | No in-browser recording. | The project doesn't exercise live capture. | D-30 stretch goal. | Open |
