# First real checks: Pocket (day 1) and Jane (day 2)

The two checks that need real accounts. Both use role-played visits and a **test patient** only. Each is set up so it takes minutes and produces something you can paste into [verification.md](verification.md) without patient data in it.

## Day 1: Pocket (G-05, D-34)

1. In the Pocket app, record a 2-minute role-played visit (Aaron as patient), ending with a spoken recap. Wait for the transcript.
2. Put your key in `.env` (never committed) or the environment, then:

   ```bash
   POCKET_API_KEY=pk_… pnpm --filter @soap-scribe/server pocket:check
   # or a specific recording:
   POCKET_API_KEY=pk_… pnpm --filter @soap-scribe/server pocket:check <recordingId>
   ```

3. It prints the **shape** of the list and details responses (field names and types, no values) plus the few values that settle open questions: `recording_at`, `created_at`, `duration`, segment count, first segment start/end, how many segments have a speaker. It then runs the real `parseRecording` and prints PASS/FAIL for each assumption.
4. Compare `duration` with the recording's real length: seconds or milliseconds? Compare `recording_at` with when you pressed record: is it the start, and in UTC?
5. Record the outcome in [verification.md](verification.md) and close or update D-34. If a field differs from the docs, change `pocket/client.ts` and its tests together.

Webhooks: in Pocket's settings, point the webhook at the deployed API's `/webhooks/pocket` (or a tunnel to a local API for a one-off check) and record one more visit. The API logs `job_created` with the job ID only; a 401 means the signing secret or timestamp handling differs from the docs (D-35).

## Day 2: Jane (G-04, G-06, G-22, D-02)

Everything Jane-specific is in [`packages/extension/src/jane-map.ts`](../packages/extension/src/jane-map.ts). Today it holds placeholders that match fake Jane ([demo.md](demo.md)).

1. Create a **test patient** in Jane with two invented chart notes. Use invented content only.
2. Open the test patient's chart. Open DevTools → Console, paste all of [`packages/extension/tools/jane-capture.js`](../packages/extension/tools/jane-capture.js), press Enter. The result is copied to the clipboard:
   - `fields`: each editable field with a suggested selector, its label, and a S/O/A/P guess;
   - `patientIdCarriers`: elements whose attributes hold the patient ID from the URL (for `patientIdElement`);
   - `previousNoteListCandidates`: repeated blocks containing dates (for `previousNotes.item`);
   - `page`: the URL with IDs replaced by `:id` (for `chartPage.urlPattern` and `chartPage.path`);
   - `skeleton`: the page with every letter turned to `x` and every digit to `0`.
3. **Read the output before saving it.** The tool is built not to carry patient data (the e2e test checks this on fake Jane), but you're the check. Save it as `packages/extension/src/content/__fixtures__/jane-chart.json`.
4. Repeat on today's schedule page → `jane-schedule.json`.
5. Update `jane-map.ts` from the suggestions. Two things to answer while you're there:
   - **D-02:** are the note fields plain `textarea`s or a rich-text editor (`contenteditable`)? The capture's `editable` column says which. If rich text, test that an insert is still there after Jane autosaves and you reload.
   - **G-22:** does `chartPage.path(id)` open the chart? Click "Open chart" in Today.
6. Add a test in `src/content/jane.test.ts` that loads the saved skeleton into jsdom and runs `readPreviousNotes`, `patientIdOnPage` and `insertNote` against it, so a future Jane change fails a test instead of a visit.
7. Insert into the test patient's chart from the side panel, then save and sign in Jane yourself. Reload and confirm all four sections stuck.

## After both

- Mark G-05, G-06 and D-02 in [gaps.md](gaps.md) and [decisions.md](decisions.md).
- Session 3 of the [test plan](ux/07-test-plan.md) (T-05 to T-08 on real Jane) is unblocked.
