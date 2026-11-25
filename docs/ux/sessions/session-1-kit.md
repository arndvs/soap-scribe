# Session 1 kit: does Bonnie trust the draft?

**Covers:** T-01 to T-04 from the [test plan](../07-test-plan.md), plus reading the [stories](../01-user-stories.md) back to her.
**Length:** 45 minutes. **People:** Bonnie (clinician), Aaron (facilitator, plays the patient).
**Data:** role-played visits with invented patients only. No real patient names, dates of birth or details, so no BAA is needed for this session.

## Before the session (Aaron, ~30 minutes)

- [ ] `pnpm demo` runs; extension loaded from `packages/extension/dist-demo` ([demo.md](../../demo.md)).
- [ ] Decide the model: the demo's rule-based stand-in only understands the demo transcripts. For her own role-played visits, run with the real model: `DEMO_LLM=bedrock` plus `AWS_REGION`, `LLM_MODEL_EXTRACT`, `LLM_MODEL_COMPOSE`. **If Bedrock access isn't set up yet, run only Part A.**
- [ ] Pocket recorder charged; three recordings will be made during the session.
- [ ] Print the three [ideal-note sheets](#ideal-note-sheet) and the [observation sheet](#observation-sheet).
- [ ] Screen recording on, with her OK (synthetic data only).

## Part A — Read-back and the demo patients (15 min)

1. **Stories (5 min).** Read Stories 1–5 aloud. Ask only: *"What's wrong or missing?"* Write down her corrections word for word. Then ask the two open numbers:
   - "How many extra minutes does charting take per visit?" (she's said both 15 and 5–10)
   - "Do you chart between visits, at the end of the day, or both?"
2. **Demo walk-through, hands on (10 min).** Give her the panel. Tasks, not tours:
   - "Maria Lopez was just seen. Chart her visit." → watch: does she find Today → Confirm → Open chart → Draft without help?
   - "What's new today in Maria's note?" (T-02: time it; pass is under 10 seconds)
   - "What have you given Maria before?" (T-11)
   - "James Carter's visit: chart it." (T-04: does she notice and understand the clone warning?)
   - "Priya's visit wasn't recorded. Chart it anyway." (T-08 / G-23)

## Part B — Her own visits (25 min, needs the real model)

For each scenario below: Aaron plays the patient, Bonnie runs the visit **exactly as she would** (including her spoken recap), Pocket records. After all three, she writes her ideal note for each on the sheet **before** seeing any draft. Then she charts each one with SOAP Scribe.

Use the scenario cards: they give Aaron's lines as the patient and leave her side unscripted, so the clinical content is hers.

### Scenario 1 — Returning prenatal patient, improving

> **Patient (Aaron):** "Dana Reyes," invented, 33 weeks, third visit.
> - Opening: "My low back is better this week, maybe a four out of ten. Still hard to sleep."
> - If asked about sitting: "I'm at a desk all day."
> - If asked about exercises: "I did the cat-cow most days."
>
> **Previous note for the chart (enter in fake Jane first):** Low back 6/10, worse at night, 32 weeks / L5 left posterior, right SI / Lumbar segmental dysfunction, pregnancy related / Weekly. Cat-cow 2x/day.
>
> **What we're watching:** pain score marked *updated* with the old value; carried findings; whether the recommendations she says land verbatim from her library with the right date.

### Scenario 2 — Returning patient, nothing changed

> **Patient:** "Sam Ortiz," invented, maintenance care.
> - Opening: "Pretty much the same as last time. Neck's a little stiff, two out of ten."
> - Everything else: "No changes."
>
> **Previous note:** Neck 2/10 / C5 right posterior, cervical rotation limited left / Cervical segmental dysfunction, stable / Every two weeks.
>
> **What we're watching:** the clone warning. Does she understand it, and does she add anything specific to today?

### Scenario 3 — New complaint on a returning patient

> **Patient:** "Lee Park," invented.
> - Opening: "My mid back is fine now, but I've had headaches since Monday."
> - If asked: "Behind my eyes, worse in the afternoon. Neck feels tight, about a five."
>
> **Previous note:** Mid back 4/10 after long drives / T6 left posterior / Thoracic segmental dysfunction / As needed.
>
> **What we're watching:** nothing from the old mid-back note carried as today's finding; the new complaint captured; any recommendation she makes that isn't in her library shows as a flag.

**Loading her visits into the demo.** After recording, copy each transcript out of the Pocket app and put the three invented patients in a private file **outside the repo** (e.g. `~/soap-session-1/patients.json`):

```json
[
  {
    "janePatientId": "2001",
    "name": "Dana Reyes",
    "appointmentMinutesAgo": 60,
    "previous": [{ "daysAgo": 7, "sections": {
      "subjective": "Low back 6/10, worse at night, 32 weeks.",
      "objective": "L5 left posterior. Right SI.",
      "assessment": "Lumbar segmental dysfunction, pregnancy related.",
      "plan": "Weekly. Cat-cow 2x/day." } }],
    "assignments": [{ "protocolId": "cat-cow", "daysAgo": 7 }],
    "transcriptText": "Clinician: ...\nPatient: ...\nRecap: ..."
  }
]
```

Then restart with `DEMO_PATIENTS_FILE=~/soap-session-1/patients.json DEMO_LLM=bedrock pnpm demo`. Make sure her protocol library has the items she'll say (Settings → Protocols) before she charts.

## Ideal-note sheet

One per scenario. She fills this in **before** seeing the draft.

```
Scenario: ____    Time to write this by hand: ____ min

S:

O:

A:

P:   (include recommendations with the date the way you normally write it)
```

These become private eval cases (G-10): save as JSON in a folder outside the repo and run `EVAL_CASES_DIR=… pnpm --filter @soap-scribe/server eval`.

## Observation sheet

Aaron fills this in during Parts A and B. Record what she **does**, not what she says.

| Task | Pass? | Time | Windows/tabs she switched to | Edits she made (count, which sections) | Hesitations ("what is this?") | Quote |
|---|---|---|---|---|---|---|
| A2 Maria | | | | | | |
| A2 what's new | | | | | | |
| A2 given before | | | | | | |
| A2 James clone | | | | | | |
| A2 Priya unrecorded | | | | | | |
| B1 Dana | | | | | | |
| B2 Sam | | | | | | |
| B3 Lee | | | | | | |

**Pass conditions** are in the [test plan](../07-test-plan.md#scenarios). The headline question for Part B: **were her edits fewer than writing the note herself?** Compare her edit count and time against the hand-written ideal note.

## Rules for Aaron during the session

- Give tasks, not hints. If she's stuck for 20 seconds, ask "What are you looking for?" and write the answer down. Only help after that, and mark the task failed.
- Don't defend the design. "Interesting, say more" is the only reply to criticism.
- Don't ask "Do you like it?" Ask "Would you use this tomorrow? What would stop you?"
- End with: "What's the one thing that would make you stop using it?"

## After the session (same day)

- [ ] Copy the observation sheet into `sessions/session-1-notes.md` using the notes template in the [test plan](../07-test-plan.md#session-notes-template). De-identified: invented patients only anyway.
- [ ] Update the stories with her corrections; re-run [traceability](../traceability.md).
- [ ] Every failure → a new gap in [gaps.md](../../gaps.md) or a story change.
- [ ] Save her ideal notes as private eval cases (not in the repo).
- [ ] Set `planDateFormat` to whatever she said.
