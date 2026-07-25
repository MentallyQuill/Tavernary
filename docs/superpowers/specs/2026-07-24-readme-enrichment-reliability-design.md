# README Enrichment Reliability and Chained Rollout Design

**Status:** Approved design

**Goal:** Make the GitHub-backed catalog enrichment run deterministic, resumable, efficient, and safe to publish automatically across the full catalog.

**Builds on:** `2026-07-24-readme-catalog-enrichment-design.md`

## Problem

The first enrichment implementation established the correct ownership boundary but is not safe for a full automatic rollout:

- batch selection slices a changing set of eligible records, so completed records disappearing from that set can cause later records to be skipped;
- missing, legacy, stale, or unhealthy snapshots can be mistaken for proof that a repository has no README;
- model calls run serially and have no timeout;
- a single failure can prevent already validated work from being committed, causing successful paid calls to be repeated;
- entire README files can be sent to the provider without deterministic size limits or prompt-injection hardening;
- the workflow processes only one manually selected batch and does not maintain durable continuation or retry state.

This project is pre-alpha, so the existing batch-index and enrichment-report formats may be replaced in place. No compatibility layer is required.

## Fixed decisions

- The enrichment workflow uses a stable manifest of project IDs created once at the beginning of a rollout.
- Primary batches contain 20 records by default.
- Up to four model calls may run concurrently.
- Each model call has a 120-second timeout.
- The configured model identifier must be exactly `MiniMax-M3`.
- A card receives at most two model calls: one primary attempt and one separate retry attempt.
- Successfully validated cards are committed and deployed even when other cards in the batch fail.
- Primary failures are collected and retried after all primary batches finish.
- A final retry failure leaves the registry record unchanged and remains visible in the report for manual attention.
- GitHub short description remains the preferred enrichment input. README content is used only when no usable short description exists.
- The exact no-source fallback remains `No README file found.`.
- Non-GitHub records remain outside this process.
- GitHub refresh continues to own snapshots only. Enrichment continues to own only `summary`, `metadata_status`, `primary_function`, and `capabilities`.
- No catalog-wide source preparation or enrichment may begin until a live provider preflight and a five-card canary have passed.

## Architecture

The rollout is a serialized state machine:

```text
initialize stable manifest
          |
          v
process primary batch of 20
          |
          +--> validate and publish successful records
          |
          +--> append failed IDs to retry queue
          |
          v
dispatch next primary batch
          |
          v
process retry batches of 20
          |
          +--> validate and publish recovered records
          |
          +--> record final failures without registry edits
          |
          v
mark rollout complete
```

The enrichment and refresh workflows retain the shared `catalog-publish` concurrency group with `cancel-in-progress: false`. This prevents either workflow from rebasing and publishing against catalog state being changed by the other.

## Staged rollout gates

The initial catalog rollout has four explicit gates. Passing a later gate never bypasses an earlier one.

### Gate 1: deterministic tests

Unit and workflow-contract tests run without external calls. They prove request construction, the exact `MiniMax-M3` model selection, timeout behavior, response parsing, source readiness, bounded input, partial success, stable manifests, and retry limits.

### Gate 2: live provider preflight

A non-publishing preflight uses the configured GitHub Actions secrets to make one minimal structured-output request. It:

- verifies that the API URL and credential authenticate successfully;
- rejects any configured model value other than `MiniMax-M3`;
- verifies that the outbound request names `MiniMax-M3`;
- requires a successful structured JSON response;
- validates the returned object against the enrichment contract;
- verifies a matching provider-returned model identifier when the response includes one;
- writes only a sanitized workflow summary containing connection status, requested model, returned model when available, latency, and validation status.

The preflight never reads or writes a registry record and never logs the API key, authorization header, raw provider response, or full prompt.

If the endpoint requires a provider-specific alias instead of `MiniMax-M3`, the run fails closed. Changing the expected identifier requires explicit approval rather than silently selecting another model.

### Gate 3: five-card canary

After the provider preflight passes, source preparation is limited to five explicit GitHub-backed project IDs selected to cover:

- repository-description input;
- README input;
- extension classification;
- another GitHub-backed project kind when available;
- confirmed no-README fallback when available.

Only those five snapshots are refreshed with current README provenance, and only those five repository identities are backfilled through the separate identity command. The canary then invokes the same loader, provider, validator, writer, report generator, catalog checks, commit path, and deploy path used by the full rollout. It is not a mock or a separate simplified implementation.

Canary mode never self-dispatches another batch. Valid canary records may publish automatically under the already approved partial-success rule, but the canary is not considered passed unless all five reach an expected terminal success: enriched or confirmed fallback. Any source-not-ready, provider failure, invalid output, write failure, catalog-check failure, or deployment failure blocks the full rollout.

After deployment, inspect the canary report and rendered tiles to verify:

- the requested model was `MiniMax-M3`;
- generated descriptions are factual, legible, and within the four-line card height;
- primary functions and capabilities are plausible and use controlled vocabulary values;
- the fallback is exact when exercised;
- no unrelated registry record changed;
- a snapshot refresh cannot overwrite the canary editorial fields.

### Gate 4: full source preparation and rollout

Only after the five-card canary is verified:

1. Refresh all remaining GitHub snapshots with current README provenance.
2. Run the existing repository-identity backfill as a separate validated migration and commit.
3. Confirm that every full-rollout candidate passes the identity and snapshot preconditions or appears in the source-not-ready inventory.
4. Initialize the stable full-rollout manifest.
5. Let the primary and retry batches chain automatically to completion.

At design time, `origin/main` contains 204 GitHub snapshots and 200 GitHub records without permanent repository IDs. The full refresh and identity migration are therefore required rollout preparation, not optional cleanup. They remain separate from enrichment's four-field write boundary.

## Stable manifest and run state

The first workflow invocation freezes an alphabetically ordered list of eligible, published, GitHub-backed project IDs. Later batches select IDs from this manifest, not from a newly filtered registry list.

The committed machine-readable run state contains:

- schema version;
- unique run ID;
- creation and last-update timestamps;
- status: `primary`, `retry`, or `complete`;
- configured primary batch size and model concurrency;
- immutable ordered project-ID manifest;
- primary cursor;
- ordered retry queue and retry cursor;
- per-project attempt count;
- per-project outcome;
- source snapshot identity used for each attempt;
- sanitized reason code and message for skipped or failed work;
- aggregate counts.

The manifest is immutable after initialization. The cursors and per-project outcomes are updated only after the corresponding registry changes have passed validation and are ready to be committed together.

Eligible records that were already completed by the same run are not selected again. A canceled or manually interrupted rollout can resume from its last committed cursor. If a workflow is terminated before its state and successful outputs are committed, those uncommitted calls may need to be repeated; GitHub Actions cannot guarantee recovery of in-memory work.

## Source-readiness gate

Every card must pass a deterministic readiness gate before fallback generation or a model call:

1. The registry record is published and GitHub-backed.
2. A snapshot exists.
3. The snapshot validates against the current repository snapshot schema.
4. `snapshot.project_id` matches the registry project ID.
5. `source_health` is exactly `healthy`.
6. `stale_since` is `null`.
7. The snapshot repository owner and name match the registry repository path case-insensitively.
8. When the registry contains a permanent `repository_id`, it matches the snapshot repository ID.
9. README provenance is explicitly present with a boolean `found` value.

A missing permanent repository ID is not invented by enrichment. Identity backfill remains a separate operation, and any registry rule requiring that ID must be satisfied before the card can be published as curated.

Records that fail readiness receive a `source-not-ready` outcome and no registry change. Reason codes distinguish missing snapshot, unsupported snapshot schema, unhealthy source, stale source, project mismatch, repository mismatch, identity mismatch, missing README provenance, and missing permanent identity.

The following states must never produce the fallback:

- absent snapshot;
- legacy snapshot without README provenance;
- `unavailable`, `identity-change`, `deleted`, or `private` source health;
- non-null `stale_since`;
- repository identity mismatch;
- README retrieval or decoding failure after the snapshot asserted that a README exists.

## Source selection and fallback

After readiness succeeds:

1. A non-empty `repository.description` is normalized and used as the sole model source.
2. Otherwise, `readme.found: true` causes the README to be fetched using the authenticated GitHub API at the snapshot's recorded source revision.
3. Otherwise, an explicit healthy `readme.found: false` result produces `No README file found.` without a model call.

If the snapshot says a README exists but retrieval returns an error, empty response, malformed payload, unsupported encoding, or unusable text, the attempt fails and enters the retry queue. It does not become a fallback.

The fallback output is:

```json
{
  "summary": "No README file found.",
  "metadata_status": "curated",
  "primary_function": "uncategorized",
  "capabilities": []
}
```

It removes the provisional presentation while remaining easy to find and edit manually. Enrichment does not change card visibility.

## Bounded README preparation

README text is untrusted reference data. Before provider submission, the runner deterministically:

- decodes only valid UTF-8 text;
- normalizes line endings and removes a byte-order mark;
- removes control characters;
- removes badges, standalone images, HTML comments, script/style blocks, and repeated navigation boilerplate;
- removes fenced code blocks and installation-command blocks that do not describe the project;
- preserves the title, opening explanatory paragraphs, and useful content under headings such as Overview, About, Purpose, Features, and Usage;
- normalizes excess whitespace;
- truncates the final prepared source to 8,000 characters.

The extraction is deterministic and tested independently from provider behavior. No raw README content is written to the public catalog or enrichment report.

## Provider contract and safety

The provider prompt states that repository content is untrusted data and must never be followed as instructions. It asks only for factual extraction and classification grounded in the supplied source.

The response must be strict JSON containing:

- `summary`;
- `metadata_status`;
- `primary_function`;
- `capabilities`.

The existing enrichment validator remains authoritative:

- exactly one sentence;
- no newline or markdown;
- target 12-24 words;
- maximum 140 characters;
- `metadata_status: curated`;
- one allowed primary-function ID;
- only allowed capability IDs;
- no `uncategorized` primary function when usable source text was supplied.

Provider configuration is validated before starting paid work. Each request uses an abort signal with a 120-second timeout. HTTP 429, HTTP 5xx, timeout, network failure, malformed provider shape, invalid JSON, and contract failure are recorded as failed attempts.

There is no hidden provider retry loop. Failed primary attempts enter the separate retry phase, preserving the hard maximum of two model calls per card.

The provider adapter exposes sanitized response metadata needed by the live preflight, including the response's model identifier when supplied. Production enrichment still consumes only the validated enrichment object.

## Bounded concurrency and partial success

Each batch uses a worker pool with a default concurrency of four. Fallback and source-not-ready results do not consume model-call slots.

Each project is processed independently:

- a valid generated or fallback result is staged for its project;
- a skipped or failed project leaves its registry file untouched;
- one project's exception does not abort unrelated workers;
- all staged outputs are validated again at the write boundary.

After the workers settle, successful registry changes and the updated run state are validated as one candidate publication. If catalog validation fails, nothing from that batch is committed. If validation passes, successful records are retained even when the same batch contains failures.

## Workflow chaining and publication

The workflow supports `preflight`, `canary`, full-rollout initialization, automatic continuation, and explicit resume. Preflight and canary modes cannot initialize or advance the full-rollout manifest. The first full invocation creates the run state; subsequent invocations read it from `main` and process the next phase batch.

For every batch:

1. Check out current `main`.
2. Install pinned dependencies.
3. Validate provider configuration and run-state consistency.
4. Process the next fixed manifest or retry slice.
5. Validate enrichment outputs and the resulting catalog.
6. Stage only changed registry files and the enrichment run report.
7. Commit and push with the existing bounded rebase/push conflict handling.
8. Trigger Pages deployment only when registry files changed.
9. Dispatch the next enrichment invocation when unfinished work remains.

The workflow advances the cursor for every attempted manifest ID, including source-not-ready and failed IDs. Primary failures are appended once to the retry queue. Retry failures are terminal for that rollout, so no infinite dispatch loop is possible.

A batch containing 18 successes and two failures therefore publishes the 18 successes, records the two failures, and continues. The two failed IDs are retried only after the primary phase is complete.

## Reporting and observability

The report is an operational ledger rather than a dump of provider input or output. Per-project entries include:

- project ID;
- attempt number;
- phase;
- outcome;
- snapshot repository ID and head SHA when available;
- whether the selected source was repository description, README, or confirmed fallback;
- README path and ref when used;
- sanitized reason code and concise diagnostic message;
- completion timestamp.

Allowed outcomes are:

- `enriched`;
- `fallback`;
- `source-not-ready`;
- `retry-pending`;
- `retry-enriched`;
- `retry-fallback`;
- `final-failure`;
- `skipped`.

Secrets, authorization headers, raw README text, full prompts, and raw provider responses are never reported.

The workflow summary displays aggregate totals, current cursor and phase, the next action, and a table of failed or source-not-ready project IDs. The final report makes manual cleanup discoverable without changing non-successful cards.

## Write isolation

The existing narrow registry write boundary remains mandatory. Enrichment may replace only:

- `summary`;
- `metadata_status`;
- `primary_function`;
- `capabilities`.

It must preserve source identity, project ID, name, kind, frontends, visibility, URLs, provenance, and timestamps. The refresh workflow continues to stage only `data/snapshots/github/*.json` and may never stage registry or enrichment-report files.

## Testing strategy

Implementation follows test-driven development. Required coverage includes:

- stable manifest selection after earlier records become curated;
- immutable manifest ordering and resumable cursors;
- primary-to-retry phase transition;
- one retry maximum and terminal final failures;
- partial batch success preserving valid outputs;
- source readiness for every health, staleness, schema, provenance, and identity case;
- fallback only from an explicit healthy `readme.found: false` snapshot;
- README retrieval failure remaining retryable;
- deterministic README cleaning and 8,000-character limit;
- prompt text treating source material as untrusted;
- exact `MiniMax-M3` request selection and rejection of every other configured model;
- live-preflight result sanitization;
- canary mode using the production execution path without continuation;
- full-rollout initialization refusing to run without a passed canary;
- strict provider response-shape validation;
- 120-second request cancellation;
- worker-pool concurrency never exceeding four;
- provider failure isolation between records;
- report sanitization and aggregate counts;
- workflow self-dispatch and completion guards;
- shared refresh/enrichment concurrency;
- registry and snapshot write-set isolation;
- summary contract and rendered four-line card fit;
- full catalog validation, build, typecheck, static export, and relevant browser tests.

## Acceptance criteria

The reliability work is complete when:

- a dry-run simulation proves every manifest ID is attempted exactly once in the primary phase;
- failed IDs alone are attempted exactly once in the retry phase;
- no mutable eligibility slicing remains in rollout continuation;
- unhealthy or incomplete snapshots cannot produce curated fallbacks;
- no provider request receives more than 8,000 characters of prepared README text;
- a live preflight proves the configured endpoint accepts an authenticated `MiniMax-M3` structured-output request;
- five diverse cards pass through the production enrichment, publication, deployment, and rendered-tile path before catalog-wide preparation starts;
- no card receives more than two model calls;
- successful cards from mixed-result batches are committed and deployed;
- canceled runs can resume from committed state without repeating completed IDs;
- automatic chaining terminates in `complete` without manual batch indexes;
- final reports identify every enriched, fallback, source-not-ready, and unresolved card;
- a subsequent GitHub refresh cannot overwrite enriched editorial fields;
- all repository checks pass.

## Deliberately deferred

- Enrichment of non-GitHub records.
- Automatic editorial rewriting of already curated non-generic summaries.
- More than one retry per project.
- Parallel publishing from multiple workflow jobs.
- Storing README contents or provider transcripts.
- A runtime backend, database, or external job queue.
