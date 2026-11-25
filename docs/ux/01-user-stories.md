# Step 1 — User stories

These stories describe what each person does **today, without SOAP Scribe**. They're about the problem, not the product. Following the [UX process](README.md), every story runs from the trigger to the outcome, marks the most painful moments, and ends with what the system needs to do.

**Notation.** **Bold** = noun (a player or thing, feeds the [system map](02-system-map.md)). *Italic* = verb (an action). ⚠ = most painful moment. Each "system needs to…" line has an ID (N-xx) that the [traceability matrix](traceability.md) maps to the build.

**Sources.** Bonnie's own words come from her first recorded brain dump (April 2026) and the grndwrk story sessions (April 2026); carry-forward and batch charting come from what Aaron reported during the build (November 2026). Anything marked **Hypothesis** hasn't been checked with the person yet. See [validation](#validation-plan).

## Roles

| Role | Who | Goal | Environment |
|---|---|---|---|
| Clinician | **Dr. Bonnie Fischer**, chiropractor, Align San Diego Family Chiropractic | Finish accurate, defensible SOAP notes without the copy-paste | Treatment room between visits; desk at the end of the day. Jane EMR in Chrome on a laptop. A **Pocket** recorder. Her protocol wording in a **Google Doc** |
| Patient | Adults, many pregnant or postpartum; parents bringing babies | Get treated; trust that what's said in the room stays private | Treatment room, often with a partner or child present |
| Operator | **Aaron**, her husband and the developer | Keep it running without seeing patient data | Off site, at his own work. Email and GitHub |

Front desk staff, co-managing providers (lactation consultants, pediatric dentists) and the eventual patient-facing app are **out of scope** for SOAP Scribe; see [out of scope](#out-of-scope).

---

## Story 1 — Bonnie, charting a visit she just finished

**Trigger.** A 32-week pregnant **patient** *leaves* the room. Bonnie *told* her to use a **lumbar pillow**, add a **wedge** under her belly while side sleeping, and *start* cat-cow T/S mobilization twice a day. The next patient is already waiting.

**Today, step by step.**
1. She *opens* the patient's **chart** in **Jane** and *duplicates* the **previous chart note**.
2. She *scrolls* through it to *remember* what she found last time and what she already *assigned*.
3. She *edits* the **Subjective** and **Objective** to match today: what the patient *reported*, which **spinal levels** she *adjusted*, what *changed*.
4. She *opens* the **Google Doc** of **recommendations**, *finds* the exact wording for each one, and *copies* them one at a time.
5. She *pastes* them into the **Plan** section under "**clinical advice**" and *adds* the **date** so she can *track* when she gave what.
6. She *saves* and *signs* the note.

**Why this way.** Her protocol wording is careful and she doesn't want to retype it. The date is the only record of when each recommendation started. Duplicating the old note is faster than starting blank, because most findings carry over from visit to visit.

**Most painful moments.**
- ⚠ Hunting through the Google Doc for the right wording while the next patient waits.
- ⚠ Re-reading the old note to remember what she already assigned.
- ⚠ Notes pile up when she's busy, so she's charting from memory at the end of the day.

**Feelings.** Rushed. Like the charting is a second job stacked on the first.

**Outcome.** About **15 extra minutes per visit**, around **10 patients a day**. (Her brain dump puts it at 5–10 minutes; both figures are hers, from different conversations. The before/after timing in [G-13](../gaps.md) will settle it.)

**The system needs to…**
- **N-01** draft the note from what was said in the visit, so she isn't typing from memory.
- **N-02** start from her previous note's findings, not a blank page.
- **N-03** show which sentences are new today, carried, or changed, so she can trust the draft at a glance.
- **N-04** put her exact protocol wording into Plan without the Google Doc.
- **N-05** date each recommendation in Plan, the way she does by hand.
- **N-07** put the note into Jane without copy-paste, and never into the wrong patient's chart.
- **N-08** leave saving and signing to her.
- **N-19** let her correct any sentence before it goes into Jane.

*One-liner: As a chiropractor, I want my note drafted from the visit and my usual wording, so that I finish charting before the next patient instead of after dinner.*

---

## Story 2 — Bonnie, charting the day's visits in a batch

**Status: Hypothesis** (from Aaron: she records visits and processes them at the end of the day).

**Trigger.** The last patient *leaves* at 6. Six **notes** are still unwritten.

**Today, step by step.**
1. She *opens* the **schedule** in **Jane** and *works down* the list.
2. For each **appointment** she *tries to recall* what was said, *checking* her scribbled notes if she has any.
3. She *writes* each note as in Story 1.

**Most painful moments.**
- ⚠ Visits blur together by the evening; she *mixes up* which patient said what.
- ⚠ Not knowing which notes are done and which aren't without opening each chart.

**Feelings.** Tired. Worried she's left out something she'll need later.

**Outcome.** Notes get finished, but the late ones are thinner.

**The system needs to…**
- **N-10** match each recording to the right appointment, and ask her to confirm the patient before anything is drafted.
- **N-11** show today's visits in one list with each one's state: waiting, needs confirmation, ready, inserted, failed.
- **N-18** have the draft ready by the time she opens the chart.

---

## Story 3 — Bonnie, deciding what to recommend next

**Trigger.** A patient in Foundational Care seems ready for Corrective Care. Bonnie *knows* it from the visit but *wants to verify* it.

**Today, step by step.**
1. She *scrolls back* through about **8 chart notes** in Jane.
2. She *reads* the **clinical advice** in each to *piece together* a timeline of every **recommendation** over three months.
3. She *decides* the next logical **protocol** and *adds* it as in Story 1.

**Why this way.** Jane has no summary of what's been assigned. Her own copy-pasted, dated lines are the only tracking system.

**Most painful moments.**
- ⚠ No summary view, no checklist, nothing that says "stage 1 is complete."
- ⚠ She second-guesses herself on what she's already covered.

**Feelings.** Unsure. Like her memory is the database.

**Outcome.** She makes the call, but slowly and with doubt.

**The system needs to…**
- **N-06** show what she has already assigned this patient and when, while she's writing today's Plan.
- **N-05** (again) keep the date on every recommendation.

---

## Story 4 — Bonnie, a returning patient whose findings barely changed

**Trigger.** A patient *comes back* for their sixth visit. Most findings are the same as last time.

**Today, step by step.**
1. She *duplicates* the last note and *changes* a few words.
2. She *signs* it.

**Why this way.** Copying forward is most of what saves her time. The findings really are mostly the same.

**Most painful moments.**
- ⚠ Notes that are near-identical visit to visit look like **cloned notes** to an auditor or insurer, even when they're accurate.
- ⚠ A finding that quietly changed gets carried forward unchanged because she skimmed it.

**Feelings.** Efficient, with a background worry.

**Outcome.** Fast notes that may not show what was actually different today.

**The system needs to…**
- **N-02** (again) carry findings forward.
- **N-03** (again) mark what changed today, and show what it changed from.
- **N-09** warn her when a note is too similar to the last one.
- **N-20** show where a "today" sentence came from in the recording, when she doubts it.

---

## Story 5 — Bonnie, changing how she writes her notes

**Trigger.** She *starts* writing **Assessment** differently, or *adds* a new **home exercise** to her repertoire.

**Today, step by step.** She *updates* the **Google Doc** and *remembers* to use the new wording from now on.

**Most painful moments.** ⚠ (with any tool built for her) having to ask Aaron to change a setting or a prompt for her.

**Feelings.** She wants it to be *hers*.

**The system needs to…**
- **N-12** let her edit her template, carry rules, shorthand and protocol library herself, with a history she can restore from.
- **N-13** let her see what a change does before she uses it on a real patient.

---

## Story 6 — A patient, being recorded

**Status: Hypothesis** (no patient has been asked yet).

**Trigger.** A patient *notices* a small **recorder** on the counter.

**Today.** Nothing is recorded, so this doesn't happen yet.

**Most painful moments.** ⚠ Not knowing who will hear it, where it goes, or how long it's kept. A partner or child in the room is recorded too.

**Feelings.** Possibly uneasy; possibly indifferent if it's explained.

**The system needs to…**
- **N-14** get the patient's consent before recording (California generally requires everyone recorded to consent).
- **N-15** keep the transcript and drafted facts only as long as needed, and not store her previous notes at all.

---

## Story 7 — Aaron, when something breaks

**Status: Hypothesis.**

**Trigger.** A recording's transcript *fails* in **Pocket**, or the **LLM** *times out*, while Aaron is at his own job.

**Today.** No system, so nothing breaks; but with one, Bonnie would find a missing draft at 6pm and text him.

**Most painful moments.**
- ⚠ Finding out from her, late.
- ⚠ Needing to see patient data to debug it.

**The system needs to…**
- **N-16** email him when a job fails, with the job ID and error only, no patient data.
- **N-17** retry on its own, let her retry with one click, and catch anything missed hourly.

---

## Story 8 — Bonnie, after the change

**Status: Hypothesis.** Her goal, stated as a measurable outcome.

**The system needs to…**
- **N-21** prove the time saving: time a full day of charting before and after.

---

## Out of scope

These came up in the same sessions and belong to the larger perinatal app (patient portal, protocol assignment and compliance), not SOAP Scribe:

- Patients forgetting a home exercise and needing a video (grndwrk Story 2).
- Coordinating with a lactation consultant and pediatric dentist (grndwrk Stories 4 and 6).
- Emailing recommendations to the patient, and the patient losing the email (grndwrk Story 5; brain dump).
- Patients checking off completed exercises.

SOAP Scribe's protocol library and assignment records (N-04, N-06) are the overlap: they're the seed of that app's data.

## Consolidated players and actions

**Players (nouns):** Clinician, Patient, Operator, Visit/Appointment, Schedule, Recording, Transcript, Chart, Chart note (previous), SOAP section (Subjective, Objective, Assessment, Plan), Finding, Spinal level, Protocol (recommendation, home exercise, ADL), Clinical advice, Date, Template, Shorthand, Jane, Pocket, Google Doc, Alert.

**Actions (verbs):** record, transcribe, match, confirm, extract, draft, carry forward, update, assign, date, review, edit, insert, save, sign, warn, retry, alert, consent, delete, preview, restore.

These seed the [system map](02-system-map.md).

## Validation plan

1. **Bonnie, 30 minutes:** read Stories 1–5 back to her. Ask what's wrong, not what's right. Confirm the 15 vs 5–10 minute figure, and whether she batches at the end of the day (Story 2).
2. **Watch one real charting session** (Story 1) before changing anything. Note every window she switches to.
3. **Ask two patients** how they'd feel about a recorder (Story 6), once consent wording exists (G-02).
4. Revise these stories and re-run [traceability](traceability.md).

## Checklist

- [x] Every role listed (clinician, patient, operator), out-of-scope roles named
- [x] A goal for each role
- [x] At least one current-state story per role
- [x] Painful moments marked
- [x] Nouns and verbs highlighted
- [x] "The system needs to…" list per story, with IDs
- [ ] Stories read back to Bonnie
- [ ] One charting session observed
