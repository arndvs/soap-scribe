# Step 5 — Screen requirements

Each screen in the [flow](03-flow-diagram.md) gets at most two goals and is written as **Inform → Engage → Invite**: **A.** what the user gets, **B.** what they can do, **C.** how they get to the next screen. The **Built** column checks each line against the code (updated after the gap fixes): ✅ built, ◐ partly, ❌ missing (with its gap).

## Today

**Goals.** (1) Know the state of every visit today at a glance. (2) Confirm which patient each recording belongs to.
**Stories.** 2, 7.

| | Requirement | Built |
|---|---|---|
| A | One row per recording: time, status in plain words, suggested patient | ✅ `Today.tsx` |
| A | Failed rows show the error | ✅ |
| A | Visits on the schedule with no recording yet, and "N of M notes inserted" | ✅ G-23 |
| B | Sync today's schedule from the Jane schedule page | ✅ |
| B | Confirm or change the patient from today's appointments | ✅ |
| B | Retry a failed job | ✅ |
| C | Ready rows say whose chart to open | ✅ (text only) |
| C | One click from a row to that patient's chart in Jane | ✅ G-22 (path unverified) |

## Chart — before a draft exists

**Goals.** (1) Make it obvious whether a draft can be made for this patient. (2) Start it.
**Stories.** 1.

| | Requirement | Built |
|---|---|---|
| A | Which patient the panel is reading (follows the active Jane tab) | ◐ reads the ID, doesn't show the name |
| A | If there's no confirmed visit, say so and where to fix it | ✅ "Confirm the recording in Today" |
| B | Draft today's note (reads up to N previous notes from the page) | ✅ |
| B | Draft from previous notes only, when there's no recording | ✅ G-23 |
| C | Draft appears in place | ✅ |

## Chart — draft

**Goals.** (1) Let her trust or fix every sentence quickly. (2) Get it into Jane safely.
**Stories.** 1, 3, 4.

| | Requirement | Built |
|---|---|---|
| A | S/O/A/P sections with each sentence styled by source: today, carried (with date), updated (with "was:"), protocol | ✅ |
| A | Clone warning when similarity to the last note passes her threshold | ✅ |
| A | Flags the model raised (missing info) | ✅ |
| A | Protocols already given to this patient, with dates, one-click re-add | ✅ G-18 |
| A | The transcript line behind a "today" sentence ("What was said") | ✅ G-19 |
| A | Date on each protocol line in Plan | ✅ G-17 |
| B | Edit or delete any sentence; saved before insert | ✅ |
| B | Copy one section | ✅ |
| B | Insert into Jane: checks the page, checks the patient ID matches, fills all fields or none, reads back | ✅ (selectors are placeholders, G-06) |
| C | After insert: "Review, then save and sign the note in Jane." | ✅ |
| C | A way back to Today for the next visit | ◐ the Today tab; no prompt |

## Settings

**Goals.** (1) Let her change how notes are written without Aaron. (2) See the effect before it touches a patient.
**Stories.** 5.

| | Requirement | Built |
|---|---|---|
| A | Current template: sections, carry rules, guidance, style notes, examples | ✅ `Settings.tsx` |
| A | Shorthand list; protocol library; version history | ✅ |
| B | Edit and save (a template save creates a new version) | ✅ |
| B | Restore an earlier version | ✅ |
| B | Preview the template on a synthetic visit | ✅ `/settings/preview` |
| B | Group protocols by category, search, care phase | ✅ G-24 |
| C | Back to Chart via the tab | ✅ |

## Options (one-time)

**Goals.** (1) Connect the extension to the API.
**Stories.** 7.

| | Requirement | Built |
|---|---|---|
| A | Whether it's connected | ◐ says a token is saved; doesn't test the connection |
| B | Enter API URL and token | ✅ |
| C | Open the side panel | ◐ she opens it from the toolbar |

## Not screens, but part of the experience

| Touchpoint | Requirement | Built |
|---|---|---|
| Pocket | Recording uploads and a transcript arrives without her doing anything | ✅ webhook (untested live, G-05) |
| Treatment room | Patient knows they're being recorded and has agreed | ❌ G-02 |
| Aaron's inbox | Failed job → email with job ID and error, no patient data | ✅ |
