# SOAP Scribe: From Visit to Chart

An AI scribe that drafts SOAP notes from recorded visits; the clinician reviews and signs. Built for one chiropractic practice · Aaron Davis · November–December 2026

Turns each recorded visit into a draft SOAP note that the clinician reviews and inserts into Jane with one click. A Pocket recorder captures the visit, a Node + MongoDB backend drafts the note, and a Chrome extension writes it into the chart only after she checks it.

**[Case study](https://arndvs.com/projects/TODO)** · **[Full write-up](https://arndvs.com/blog/TODO)** · Synthetic data only · Not affiliated with or endorsed by Jane App

**Why this one:** my wife is a chiropractor. Her EMR has an AI scribe, and it doesn't fit how her visits work: visits are short, and most of what goes in the note (the segments she adjusted, the technique, range of motion) is never said out loud. So she writes notes after dinner. TODO: one or two sentences in your own words, and her before-and-after time to chart a day once you have it.

<!-- TODO: screenshot of the side panel on a synthetic test patient -->

---

## What it does

- **Starts from a recording she already makes.** She records each visit on a Pocket and ends with a 20-second spoken recap of her findings. Pocket syncs and transcribes; a webhook tells the API the recording is ready.
- **Asks before it guesses the patient.** The worker matches each recording to her schedule by start time, and she confirms the match before any draft is written.
- **Drafts in her format, and flags instead of inventing.** The model returns structured S/O/A/P from the transcript, the recap, her template, and her last note for that patient. Anything not stated becomes a flag, never a typical finding.
- **Writes into Jane only on her click, and fails closed.** The extension checks the patient on the page matches the draft, fills the four fields, and reads them back. If anything doesn't match, nothing is written and she gets the text to copy instead. She saves and signs in Jane herself.
- **Keeps almost nothing.** Drafts are deleted a day after insert; the database enforces every retention rule.

## Results

- **94 automated tests** in CI across the three packages, including the repository contract run against a real MongoDB.
- **Draft test set:** a deterministic scorer and 4 synthetic cases are in the repo; results on real models, and on her 10 role-played visits, are still to come.
- TODO: her time to chart a full day, before and after.

## Walkthroughs

TODO: (1) a role-played visit going from Pocket to an inserted note in a Jane test patient; (2) the insert safety checks: wrong patient, missing field, read-back mismatch. Synthetic data only.

## What building it taught me

TODO: what Pocket's API, Jane's pages, and the BAA chain turned up that the docs didn't make obvious.

## How it was built

TODO: agents drafting, tests deciding what shipped, each change starting as a ticket and a failing test.

---

## What's built here

| File | What it contains |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Five diagrams: the whole system, one visit end to end, job status, writing into Jane safely, and where patient data lives |
| [`docs/decisions.md`](./docs/decisions.md) | Decisions with their reasons, open questions, and what's deferred |
| [`docs/gaps.md`](./docs/gaps.md) | Known gaps by priority, including what blocks real-patient use |
| [`docs/verification.md`](./docs/verification.md) | How to run every check, with the last results |
| [`docs/deploy.md`](./docs/deploy.md) | Running it on AWS: services, one-time setup, deploys, installing the extension, rotating secrets |
| [`deploy/`](./deploy/) | Dockerfile, ECS task definitions, IAM policies |
| [`packages/shared/`](./packages/shared/) | zod domain types and API contracts shared by server and extension |
| [`packages/server/`](./packages/server/) | Express API, worker, two-stage drafting pipeline, repository layer (in-memory and MongoDB), retention cleanup, failure alerts, draft test set ([`eval-cases/`](./packages/server/eval-cases/)) |
| [`packages/extension/`](./packages/extension/) | MV3 extension: side panel (Today, Chart, Settings), content script, `jane-map.ts`, options page for the token |

## Running the checks

```bash
pnpm install
pnpm run ci                       # forbidden files, typecheck, all tests
TEST_MONGODB_URI=mongodb://localhost:27017 pnpm --filter @soap-scribe/server test   # adds the MongoDB contract tests
pnpm --filter @soap-scribe/server token          # new extension token + the hash for the server
API_URL=http://localhost:8787 JANE_HOST=example.jane.app pnpm --filter @soap-scribe/extension build
```

Copy `.env.example` to `.env` for local development. Real keys never go in this repo. Load `packages/extension/dist` as an unpacked extension in Chrome.

## What I'd do next

- Record in the browser as an alternative to Pocket
- A second clinician: real login and tenant isolation
- Write to Jane through an API if one becomes available
- Track edit rate per section as an ongoing quality signal

---

## Conventions

- **Synthetic data only.** Every transcript, note, patient, and screenshot in this repo is made up. The clinician's own templates, recordings, and configuration live in a separate private repo.
- **Not a medical device.** The clinician reviews and signs every note. Anyone using this code is responsible for HIPAA, Business Associate Agreements with every vendor that touches patient data, and patient consent to recording.
- **Not affiliated with Jane App or Pocket.** Jane selectors are best guesses from the clinician's own account and may break when Jane changes its pages.
- MIT license.
