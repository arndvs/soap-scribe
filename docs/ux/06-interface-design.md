# Step 6 — Interface design

**Honest status.** v0.1 went from architecture straight to code; no 1-minute sketches were made first. This page records the UI patterns the build uses, so they can be judged against the [screen requirements](05-screen-requirements.md), and sets out sketch variations for the screens the gaps will change. Sketch those before writing the code for G-17, G-18, G-22 and G-23.

## Patterns in the build

| Screen | Dominant element | Primary action | Pattern |
|---|---|---|---|
| Today | List of cards, one per recording | Confirm | Inbox / triage list with status badges |
| Chart (no draft) | Single message | Draft today's note | Empty state with one call to action |
| Chart (draft) | Four sections of sentences | Insert into Jane | Review-and-approve document, source-tagged like tracked changes |
| Settings | Tabs: Template, Shorthand, Protocols, History | Save | Form editor with version history and preview |
| Options | Two fields | Save | Plain settings form |

Constraint for every screen: a Chrome side panel, roughly 360–400 px wide, next to Jane. Bonnie reads the draft beside the chart, so the panel must work at that width without horizontal scrolling.

## Variations to sketch (1 minute each)

### Chart: showing what's already assigned (G-18)

1. **Collapsible strip above Plan.** "Assigned before: Lumbar pillow (Oct 3), Cat-cow (Oct 17)…", collapsed to one line by default.
2. **Inline in Plan.** Protocol sentences that repeat an earlier assignment show "since Oct 3"; new ones show "new today".
3. **Separate "History" tab inside Chart.** A timeline of every assignment for the patient.

Lean: 1 for the overview plus 2 for the dates (which also covers G-17). Test with Bonnie before choosing.

### Today: visits with no recording (G-23)

1. **Appointment-first list.** One row per appointment; recording status is a badge on it ("no recording", "needs confirmation", "ready"…). Unmatched recordings in a short list at the bottom.
2. **Recording-first list (current)** with a footer: "3 appointments have no recording" that expands.

Lean: 1, because it answers Story 2's real question ("which notes are left?").

### Today → Chart link (G-22)

1. Make the patient name in a ready row a link to their Jane chart (needs the Jane chart URL pattern, mapped on day 2 with the selectors).
2. A "Next" button that opens the next ready patient's chart.

### Chart: transcript behind a sentence (G-19)

1. Hover or tap a "today" sentence → popover with the cited transcript line(s) and time.
2. A "Show sources" toggle that lists citations under each section.

## What was built (v0.2)

The leaning variation for each was built so it can be tested; the others stay on the list for session 2.

| Gap | Built | Still to compare in session 2 |
|---|---|---|
| G-18 | Strip above Plan ("Given before"), open when ≤ 4 items, plus "— since" dates inline (variations 1 + 2) | 3 (History tab) |
| G-23 | Appointment-first Today (variation 1) | — |
| G-22 | "Open chart" link on each row (variation 1) | 2 ("Next" button) |
| G-19 | "What was said" disclosure under the sentence (closest to variation 2, per sentence) | 1 (hover popover) |

Screenshots: run `pnpm demo` ([demo.md](../demo.md)).

## Checklist

- [x] Patterns recorded for every built screen
- [x] Leaning variations built for G-17/18/19/22/23
- [ ] 1-minute sketches of the alternatives, for session 2
- [ ] Bonnie picks between variations (Step 7, session 2)
