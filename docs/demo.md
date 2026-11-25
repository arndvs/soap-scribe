# Demo mode

Runs the real API, worker, pipeline and Chrome extension on your machine, against synthetic patients, a fake Pocket and a fake Jane. No keys, no database, no AWS. It's for three things: showing the product (the Clinically AI workshop, the write-up), testing sessions with Bonnie before the real Jane selectors are mapped, and the end-to-end test in CI.

## What's real and what's fake

| Part | In demo mode |
|---|---|
| API, worker, job states, webhook signature check | **Real** code (`createApp`, `Worker`) |
| Carry rules, protocol matching, similarity, insert safety | **Real** code |
| Extension (side panel, content script, insert) | **Real**, built for `localhost` |
| Data store | In memory; lost on restart |
| Pocket | **Fake**: a page that stores a synthetic transcript and sends a signed `transcription.completed` webhook |
| Jane | **Fake**: a schedule page and chart pages using the selectors in `jane-map.ts`; not a copy of Jane |
| Model | **Rule-based stand-in** (`server/src/demo/llm.ts`) that answers the real prompts in the real JSON shapes. It is not AI and says nothing about draft quality. `DEMO_LLM=bedrock` uses the real model instead (needs AWS credentials and the model IDs) |

## Run it

```bash
pnpm install
pnpm demo
```

Then, in Chrome:

1. `chrome://extensions` → Developer mode → **Load unpacked** → `packages/extension/dist-demo`.
2. Extension **Options** → paste `demo-token-not-a-secret` → Save.
3. Open <http://localhost:4100/demo> (fake Pocket) → **Finish all three**.
4. Open <http://localhost:4101/admin/schedule> (fake Jane), open the SOAP Scribe side panel → **Today** → **Sync schedule** → **Confirm** each patient.
5. Click a patient in the schedule → side panel **Chart** → **Draft today's note** → edit → **Insert into Jane** → **Save & sign** in fake Jane.

**Reset demo** on the fake Pocket page puts everything back.

## The three patients

| Patient | Shows |
|---|---|
| Maria Lopez, 32 weeks | Carry-forward with an updated pain score (5/10 → 3/10, with "Was:"), two protocols from her library verbatim |
| James Carter | Nothing changed since last week → clone warning |
| Priya Shah | New complaint; only today's findings, nothing invented from her old mid-back note |

## End-to-end test

```bash
pnpm test:e2e
```

Playwright loads `dist-demo` into Chromium and runs four scenarios from the [test plan](ux/07-test-plan.md): a full visit (T-01, T-03, T-05), the clone warning (T-04), the wrong-patient guard (T-06), and a recording that arrives before the schedule is synced (G-25). Chrome's real side panel can't be automated, so the panel page runs in its own tab with its "active tab" pointed at the Jane tab; everything else is the real extension.

Locally, if Playwright's own Chromium isn't installed, point it at another build: `PW_CHROMIUM_PATH=/path/to/chrome pnpm test:e2e`.
