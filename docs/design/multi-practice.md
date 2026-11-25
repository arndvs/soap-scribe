# Design note: from one practice to many

**Status:** design only, not built (decision D-31, deferred). Written to answer "how would this serve thousands of clinicians?" without pretending the code already does.

SOAP Scribe today serves one clinician at one practice: one bearer token, no organization on any record, one worker. This note lists what changes, in the order it would be built, and what stays.

## What stays

- **The pipeline shape:** webhook → job → extract facts → compose on chart open → fail-closed insert. None of it assumes one practice.
- **Repository interfaces and their contract test** (D-28). Multi-tenancy is a change inside them plus new tests, not a rewrite of the worker or API.
- **The job state machine and leases** (D-27). They already work with several workers.
- **Safety rules:** verbatim library text, code-enforced carry rules, cited facts, an insert that fails closed.

## What changes

### 1. Identity and access

| Today | Many practices |
|---|---|
| One long random token; the server stores its hash (D-21) | Real sign-in (OIDC through the practice's identity provider, or email + passkey), short-lived sessions, per-user refresh |
| Whoever holds the token can do everything | Roles per organization: clinician (own patients' drafts), admin (settings, library, members), support (job status only, never patient data) |
| No user on an audit entry | Every audit entry carries `userId` and `orgId` |

### 2. Tenant isolation (the part to get right first)

- **`orgId` on every record and as the first field of every index.** Jobs, appointments, facts, drafts, settings, templates, protocols, assignments, audit.
- **Repositories take the org, not the caller.** `repos.forOrg(orgId)` returns repositories that add `orgId` to every query and every write. Handlers never build a filter themselves, so a forgotten filter can't exist.
- **The contract test gains isolation cases:** org A writes, org B reads through every method and must see nothing; an update aimed at another org's ID changes nothing.
- **On Postgres** (the likely end state, per the practice's main app): row-level security on `org_id` as a second wall, with the application role unable to bypass it.
- **Webhooks:** each organization connects its own Pocket account; the webhook URL carries an opaque connection ID, the secret is per connection, and the job is created under that connection's org.

### 3. Scale

Rough numbers to size against: 5,000 clinicians × 20 visits a day = 100,000 visits a day, about 10 a second at the morning and afternoon peaks.

| Part | Today | At that scale |
|---|---|---|
| Job queue | Polling one MongoDB collection (D-11) | A real queue (SQS) with a dead-letter queue; the job record stays the source of truth for status |
| Workers | One process | Autoscaled on queue depth; per-org concurrency limits so one large group can't starve others |
| Model calls | Two per visit, sequential | The same two, with per-org rate limits, retries with jitter, and a second region or provider for failover |
| Compose latency | On chart open, a few seconds | Pre-compose when the chart is likely to be opened (the next appointment), keep on-open as the fallback |
| Storage | Visit data deleted within days | The same policy; volume stays small because nothing clinical is kept long |

### 4. EHR adapters

Jane is read and filled through its pages (D-14, D-17). For many practices:

- One `EhrAdapter` interface: read schedule, read previous notes, insert note, open chart. Jane (pages) is one implementation; FHIR or a vendor API is another.
- Each adapter has its own contract test against saved, de-identified page skeletons or recorded API responses (the capture tool in [first-real-checks.md](../first-real-checks.md) produces the first).
- Prefer write APIs where they exist; keep the fail-closed rules either way.

### 5. Settings per clinician

Templates, shorthand, carry rules and protocol libraries become per clinician, with an optional organization default that a clinician copies and edits. Version history stays per template.

### 6. Measuring quality across practices

- Per section: how much of the draft the clinician kept (edit distance between the draft and what was inserted), sampled, with no note text leaving the tenant.
- The eval runner per specialty, run before any prompt or model change, blocking on invented findings as today.
- Staged model rollouts: a share of organizations at a time, comparing edit rates.

## Build order

1. `orgId` everywhere + `forOrg` repositories + isolation contract tests.
2. Sign-in and roles; audit with user and org.
3. Per-connection Pocket webhooks.
4. Queue and autoscaled workers.
5. `EhrAdapter` with Jane as the first implementation.
6. Quality measurement and staged rollouts.

## Open questions

- Does a practice own its clinicians' templates, or does each clinician? (Matters when a clinician leaves.)
- Which EHRs come next, and do they have write APIs?
- Is per-organization data residency (region) a requirement?
