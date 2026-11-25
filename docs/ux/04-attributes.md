# Step 4 — Modeling the attributes

Every attribute each [system map](02-system-map.md) element needs, where it comes from, and where it's defined. **Source:** *user* = Bonnie types it; *system* = SOAP Scribe generates it; *Jane* / *Pocket* = read from that system; *model* = produced by the LLM and validated. The last section lists attributes the [stories](01-user-stories.md) imply that the schema doesn't have yet.

Schemas live in `packages/shared/src/`.

## Appointment — `visit.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| id | string | system | 2 |
| date | YYYY-MM-DD (practice time zone) | Jane | 2 |
| start, end | ISO datetime | Jane | 2 (matching) |
| janePatientId | string | Jane | 1, 2 (wrong-patient guard) |
| patientDisplayName | string | Jane | 2 (confirm list) |

## Recording / Transcript — `visit.ts`, `pocket/client.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| pocketRecordingId | string | Pocket | 2 |
| recordedAt | ISO datetime | Pocket `recording_at` | 2 (matching) |
| durationSeconds | number | Pocket | 2 |
| segments[].index, speaker, startSeconds, text | int, string?, number?, string | Pocket | 1, 4 (citations) |

## Job — `jobs.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| status | received · fetched · needs_confirmation · confirmed · extracting · facts_ready · inserted · failed | system | 2, 7 |
| suggestedAppointmentId / appointmentId / janePatientId | string? | system / user (confirm) | 2 |
| attempts, lastError, notBefore | int, string?, datetime? | system | 7 |
| createdAt, updatedAt | datetime | system | 7 |

## Visit facts — `visit.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| complaints, treatments, recommendationMentions, planItems | {text, sourceSegments[]}[] | model | 1 |
| findings | {kind: segment · rom · palpation · orthopedic · neurological · posture · other, text, sourceSegments[]}[] | model | 1, 4 |
| painScores | {region, score 0–10, sourceSegments[]}[] | model | 1, 4 |
| recapFound | boolean | model | 1 |

Every fact must cite at least one transcript segment; facts citing segments that don't exist are dropped.

## Draft / Sentence — `drafts.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| sections.{subjective, objective, assessment, plan} | Sentence[] | model + system | 1 |
| sentence.text | string | model / protocol library | 1 |
| sentence.source | today · carried · updated · protocol | model, rules enforced in code | 1, 4 |
| sentence.fromNoteDate | YYYY-MM-DD, required for carried/updated | Jane (previous note) | 4 |
| sentence.previousText | string, for updated | Jane (previous note) | 4 |
| sentence.protocolId | string, for protocol | system | 1, 3 |
| flags[] | {section, reason} | model | 1 |
| similarityToLast | 0–1 trigram Jaccard | system | 4 |
| templateId, templateVersion | string, int | system | 5 |
| createdAt, insertedAt | datetime | system | 2 |

## Previous note — `drafts.ts` (read from the page, never stored)

| Attribute | Type | Source | Story |
|---|---|---|---|
| date | YYYY-MM-DD | Jane | 1, 3, 4 |
| sections | {S, O, A, P: string} | Jane | 1, 4 |

## Template / Section / Shorthand / Settings — `settings.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| template.name, version, styleNotes, examples (≤10) | string, int, string, note[] | user | 5 |
| section.label, required, guidance, carryRule (carry · carry_unless_contradicted · today_only) | | user | 4, 5 |
| glossary[].term, meaning | string | user | 5 |
| previousNotesToRead | 0–5 | user | 1 |
| cloneWarningThreshold | 0–1 | user | 4 |

## Protocol item / assignment — `settings.ts`

| Attribute | Type | Source | Story |
|---|---|---|---|
| protocol.title, instruction (verbatim), frequency?, contraindications?, aliases[], active | | user | 1, 5 |
| assignment.janePatientId, protocolId, assignedOn, draftId | | system (on insert) | 3 |

## Implied by the stories, not modeled yet

| Attribute | On | Story | Why it matters | Gap |
|---|---|---|---|---|
| Date given, printed in the Plan text | Sentence (protocol) | 1, 3 | She dates every clinical-advice line by hand today; `assignedOn` exists but never reaches the note | G-17 |
| Category (HEP subtype, ADL, nutrition…) | Protocol item | 3, 5 | Her library is organized by category in the Google Doc; a flat list won't scale past ~50 items | G-24 |
| Care phase (Foundational, Corrective, …) and next-in-sequence | Protocol item / patient | 3 | "Is she ready to progress?" needs a phase to compare against | G-24 |
| Source segment shown per "today" sentence | Sentence | 4 | Facts cite lines, but the composed sentence drops the link | G-19 |
| Consent recorded (date, by whom) | Patient / appointment | 6 | Needed before real-patient use; lives in Jane intake today | G-02 |
| Expected visit with no recording | Appointment | 2 | Today lists jobs, not appointments, so a missing recording is invisible | G-23 |
