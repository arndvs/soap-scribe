# Step 7 — Test-driven design

What to test first, how to tell pass from fail, and how to run sessions with Bonnie without the usual mistakes. Automated tests (94 in CI) prove the code does what it says; these tests prove it does what the [stories](01-user-stories.md) need.

## The riskiest assumption first

**Bonnie will insert a SOAP Scribe draft with less editing than writing the note herself.** Everything else depends on this: if the draft needs as much fixing as a blank page, nothing downstream matters. So the first test is the draft, on her own role-played visits, before any polish on Today or Settings.

Order:
1. Draft quality on her visits (T-01 to T-04).
2. The insert into real Jane (T-05, T-06), once selectors are mapped (G-06).
3. The daily batch (T-07, T-08).
4. Settings by herself (T-09).
5. A real day, timed (T-10).

## Scenarios

Each scenario names the story and needs it tests ([traceability](traceability.md)), what she's asked to do, and a pass condition that doesn't rely on her opinion.

| ID | Story / needs | Task given to Bonnie | Pass | Fail |
|---|---|---|---|---|
| T-01 | 1 / N-01, N-02 | Role-play a returning-patient visit with Aaron; open the chart; draft | Draft covers every finding she said aloud; no invented findings (eval scorer: zero invented spinal levels) | Any invented finding, or she says "I'd rather start blank" |
| T-02 | 1, 4 / N-03 | "Point to what's new today" | She finds the new findings in under 10 seconds using the styling | She has to read every sentence |
| T-03 | 1 / N-04, N-05 | Visit where she gives two home exercises | Both appear in Plan with her exact library wording | Paraphrased wording; or she rewrites the date by hand (means the format is wrong) |
| T-04 | 4 / N-09 | Visit where nothing changed | Clone warning appears; she understands what it means without explanation | No warning, or she ignores/misreads it |
| T-05 | 1 / N-07 | Insert into a test patient's chart in Jane | All fields filled, read-back matches, she only has to save and sign | Any field missing or wrong, or she has to re-paste |
| T-06 | 1 / N-07 | Open patient A's draft, then switch Jane to patient B's chart, press Insert | Nothing inserted; clear error | Anything written into B's chart |
| T-07 | 2 / N-10, N-11 | Three role-played recordings, then "chart these" | She confirms all three patients correctly from Today without help | Wrong patient confirmed, or she can't tell which recording is which |
| T-08 | 2 / N-11 | One appointment with no recording | She notices it's missing from Today | She doesn't notice |
| T-09 | 5 / N-12, N-13 | "Add a new home exercise and change how Assessment is worded; check it before using it" | Done in Settings with Preview, no help from Aaron | She asks Aaron, or skips Preview because she can't find it |
| T-10 | 8 / N-21 | A real charting day, before and after | Measured minutes per note drop; she keeps using it the following week | No drop, or she stops using it |
| T-11 | 3 / N-06 | "What have you already given this patient?" | She answers from the panel | She opens old notes in Jane |
| T-12 | 7 / N-16, N-17 | Aaron breaks the Pocket key on staging | Alert email within ~25 min with job ID only; Retry works after the fix | No email, or email contains patient data |

T-01 to T-04 use synthetic or role-played visits only, until the BAAs in G-01 are done.

## Automated coverage

`pnpm test:e2e` ([demo.md](../demo.md)) runs the mechanical half of T-01, T-03, T-04, T-05, T-06, T-08 and T-11 on fake Jane with a stand-in model, in CI. It proves the flow and the safety checks work; it can't tell whether Bonnie trusts the draft, finds things fast, or likes the date format. Those are what the sessions below are for.

## Running sessions without the six mistakes

From Amir Khella's "Six Mistakes of User Testing", applied here:

| Mistake | What we do instead |
|---|---|
| Testing too late | Session 1 runs on the current build with role-played visits, before G-17/G-18 are built. The sketches in [Step 6](06-interface-design.md) are tested on paper in session 2. |
| Testing the wrong thing | Draft quality first (the riskiest assumption), not the look of the side panel. |
| Asking leading questions | Give tasks ("chart this visit"), not questions ("isn't the carry-forward helpful?"). Ask "what are you looking for?" when she pauses. |
| Not watching what users do | Aaron watches and notes every window switch and every edit. What she does counts more than what she says afterwards. Screen-record with her permission (synthetic data only). |
| Testing with the wrong users | Bonnie is the user. If another chiropractor ever tries it, that's a separate round, not a substitute. |
| Not sharing results | Each session's notes go into `docs/ux/sessions/` (de-identified), and every failure becomes a gap or a story revision. |

The one awkward fact: the tester is the developer's wife. Mitigate by having her test with tasks and pass/fail conditions written beforehand (this table), and by asking her to "break it", not to approve it.

## Session plan

| Session | Length | Covers | Prerequisites |
|---|---|---|---|
| 1 | 45 min | T-01 to T-04, story read-back | Bedrock access; 3 role-played recordings |
| 2 | 30 min | Paper sketches from Step 6; T-09 | Sketches |
| 3 | 45 min | T-05 to T-08 on real Jane, test patient | G-06 selectors mapped |
| 4 | 1 day + 1 day | T-10 | G-01, G-02 done; real patients |

## Session notes template

```
Date / session / build commit:
Scenarios run:
For each: pass / fail, time taken, what she did (not said), quotes
Surprises:
Story changes needed:
New gaps:
```
