# Decisions

Each decision that changes behaviour, scope, or data, with its status and the reason. Accepted decisions can be reversed only by adding a new entry that supersedes them.

Status values: **Accepted** (in force), **Open** (answer needed), **Deferred** (intentionally not now).

## Open

| ID | Question | Options | Recommendation | Owner | Blocks |
|---|---|---|---|---|---|
| D-02 | Are Jane's SOAP fields plain text boxes or a rich-text editor? | (a) `textarea`: set value, dispatch `input` and `change`. (b) Rich text: use the editor's own insert path. | Inspect the test patient's chart on day 2. | Aaron | Insert |
| D-03 | Which Bedrock model for each stage, and is it on AWS's HIPAA-eligible list? | A fast model for extraction, a stronger one for composing. | Confirm both models are covered by the AWS BAA; set `LLM_MODEL_EXTRACT` and `LLM_MODEL_COMPOSE`. | Aaron | Real patients |
| D-05 | Does the public write-up name the practice? | (a) Name it and link the existing case study. (b) "A San Diego chiropractic practice." | The clinician decides. | Clinician | Write-up |

## Accepted

| ID | Decision | Reason | Where it lives |
|---|---|---|---|
| D-10 | Process recordings after visits, not live in the browser. | The clinician already records on Pocket; live tab and mic capture is the hardest part of an MV3 extension and isn't needed for her workflow. | `ARCHITECTURE.md` §2 |
| D-11 | Jobs are a MongoDB collection with a `status` field and one polling worker, not a queue service. | About 25 visits a day. One fewer vendor to run and to sign a BAA with. Switch to a queue if volume grows. | `packages/server/src/worker/` |
| D-12 | Drafting waits until the clinician confirms the patient. | The wrong patient's last note must never reach the prompt. | `ARCHITECTURE.md` §3 |
| D-13 | ~~Keep one `lastNotes` record per patient.~~ Superseded by D-24. | | |
| D-14 | The extension reads appointments from Jane's schedule page. | No Jane API is relied on; opening the schedule once a day is enough. | `packages/extension/src/content/jane.ts` |
| D-15 | Side panel, not a widget injected into Jane's page. The side panel calls the API itself; the service worker only opens the panel. | Less fragile when Jane changes its pages; a stateless service worker can't lose anything when Chrome stops it. | `packages/extension/src/sidepanel/` |
| D-16 | Insert fails closed: patient check first, fill only on a click, read back, never click Save or Sign. | It's the one step that writes to a medical record. | `ARCHITECTURE.md` §4 |
| D-17 | All Jane selectors live in `jane-map.ts`. | A Jane page change becomes a one-file fix. | `packages/extension/src/jane-map.ts` |
| D-18 | The model returns structured JSON validated with zod, plus flags for anything not stated. | A flag is better than an invented finding. One retry with the validation error, then it fails visibly. | `packages/server/src/llm/json.ts` |
| D-19 | No LLM key or LLM call in the extension. | Keys in a bundle leak, and every call must go through a BAA-covered provider. | Server only |
| D-20 | The build injects only an allowlist of non-secret values (`API_URL`, `JANE_HOST`). | Injecting `process.env` copies the build machine's whole environment into the bundle. | `packages/extension/build.ts` |
| D-21 | One user, one long random token, entered on the options page; the server stores only its SHA-256 hash. | One clinician. Proper login waits for a second user. | `packages/extension/src/options/`, `pnpm --filter @soap-scribe/server token` |
| D-22 | TypeScript, React, Node + Express, MongoDB. | Matches the target role's stack; MongoDB fits document-shaped templates and notes. Postgres with JSONB would also work. | Whole repo |
| D-23 | Public code; her templates, settings and protocol library live in her database, edited in the app; secrets in neither. | The code can be shown; her wording, recordings and config can't. | `README.md` |
| D-24 | Two-stage drafting: extract visit facts in the background after confirmation; compose the note when she opens the chart, using the last notes read from the page. | The slow step is done before she arrives, and the draft builds on her real chart history without us storing it. | `packages/server/src/pipeline/` |
| D-25 | Carry forward visibly: every sentence is tagged today, carried, updated or protocol; per-section carry rules in her settings; code enforces the rules after the model replies. | Copying forward is her main time saver; tags let her review in seconds, and enforcement means a model mistake can't break her rules. | `pipeline/compose.ts` (`enforceRules`) |
| D-26 | Plan recommendations come from her protocol library verbatim, matched deterministically, never written by the model. | Her exact wording matters, a match can be explained, and assignments become a list instead of a search through old notes. | `pipeline/protocols.ts` |
| D-27 | Workers claim jobs with a lease instead of a stuck-job sweep. | A crashed worker needs no cleanup; the same rule works with Postgres `SKIP LOCKED`. | `JobRepo.claimNext` |
| D-28 | All data access goes through repository interfaces with a shared contract test. | Built on MongoDB for the target role's stack; the practice's main app runs on Postgres, and the move is a new implementation that passes the same tests. | `packages/server/src/repos/` |
| D-29 | Amazon Bedrock for both stages, through the server's IAM role. | One AWS BAA covers hosting and the model; no LLM key exists. | `packages/server/src/llm/client.ts` |
| D-34 | Use Pocket's transcript (segments with speaker labels from `GET /public/recordings/{id}`); no separate speech-to-text. Answers former D-01. | One fewer vendor and BAA; the transcript is already speaker-labelled. | `packages/server/src/pocket/client.ts` |
| D-35 | Verify webhooks per Pocket's docs: HMAC-SHA256 of `{timestamp}.{rawBody}` in `X-HeyPocket-Signature`, and reject deliveries more than 5 minutes off. Answers former D-04. | Pocket sets no tolerance window; the 5-minute limit blocks replays. | `verifyPocketSignature` |
| D-36 | Only `transcription.completed` creates a job; other events are acknowledged and ignored. | The transcript exists by then, so the worker doesn't wait; hourly reconciliation catches anything missed. | `JOB_EVENTS` |
| D-37 | One container image for API and worker; deploys are manual, through GitHub OIDC, with no AWS keys in GitHub. | Fewer moving parts; nothing reaches the practice without a person starting it. | `deploy/`, `.github/workflows/deploy.yml` |
| D-33 | Logs accept only IDs, statuses, counts and error messages, enforced by type. | Logs are where patient data usually leaks. | `packages/server/src/log.ts` |

## Deferred

| ID | Decision | Why not now |
|---|---|---|
| D-30 | Record in the browser as an alternative to Pocket. | Not needed for v1. A good stretch goal: an offscreen document uploading chunks to the API. |
| D-31 | More than one clinician or practice. | Needs real auth, `orgId` on every record, and tenant isolation. |
| D-32 | Writing to Jane through an API. | No API is relied on today. |
