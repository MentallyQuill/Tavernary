# Enrichment Rollout Robustness Design

**Status:** Approved on 2026-07-25

**Goal:** Make one enrichment dispatch durable and self-driving while distinguishing isolated catalog-record failures from systemic failures that should stop publication.

**Builds on:**

- `2026-07-24-readme-catalog-enrichment-design.md`
- `2026-07-24-readme-enrichment-reliability-design.md`
- `../plans/2026-07-25-unified-enrichment-rollout.md`

## Failure evidence

Run `30176262619` proved that repository synchronization, provider preflight, source preparation, catalog validation, all unit tests, the production build, and static export can succeed while the rollout still fails. Four of five canary records produced valid enrichment after the bounded retry; one record remained invalid. The workflow then exited before publishing the canary ledger or any of the four valid results.

The failure is architectural:

- model-output variance, source exceptions, workflow infrastructure failures, publication conflicts, and deployment failures share one terminal `failed` state;
- the retry repeats the same request without the previous validation reason;
- the provider adapter accepts only a string containing exact JSON and discards safe structural diagnostics;
- a terminal canary report is not durable unless all five records succeed;
- the canary is random rather than representative;
- five single-project refreshes overwrite one shared refresh manifest;
- a 469-line Bash step owns state transitions, Git publication, recovery, deployment dispatch, and summarization;
- deployment ownership is ambiguous between push triggers and explicit dispatch, even though workflow-token pushes do not start another workflow.

## Success semantics

The rollout has two failure scopes.

### Systemic failures

The action remains red and does not claim completion when any of these occurs:

- provider configuration or authentication failure;
- provider model mismatch;
- catalog validation, write-boundary, or build failure;
- invalid or corrupt rollout state;
- Git synchronization or publication failure;
- deployment creation or deployment execution failure;
- a canary pool unable to produce five validated successes within its bounded budget.
- a full rollout that produces zero validated records.

### Isolated project failures

Source unavailability, malformed output for one project, a transient provider failure limited to one project, or a project that exhausts its retry remains visible in the durable report. The project record remains unchanged. A full rollout containing only these failures completes as `complete-with-errors`; the GitHub Action succeeds with a warning summary and the next dispatch selects the still-eligible backlog.

## Provider boundary

The adapter keeps the enrichment contract strict while normalizing safe transport variants:

- accept a JSON string;
- accept a content-parts array only when every part is textual;
- accept one JSON code fence only when it encloses the entire response;
- reject leading or trailing prose, multiple objects, tool calls, and non-object JSON;
- attach a sanitized diagnostic code such as `content-missing`, `content-parts-invalid`, `json-invalid`, or `json-not-object`;
- never report raw provider content.

The separate retry remains the second and final model call. Retry input includes the prior sanitized reason code and validation message. The system prompt explicitly instructs the provider to correct that defect while preserving the same source-grounding and vocabulary constraints.

## Representative canary pool

The canary selector deterministically chooses up to seven candidates. It prioritizes unique records covering:

- a healthy snapshot with repository-description input;
- a healthy snapshot without a repository description, exercising README retrieval;
- an extension;
- another GitHub-backed project kind when one is available;
- additional alphabetically stable candidates.

The canary processes the bounded seven-record pool through the production source loader, provider, validator, writer, publication, and deployment path. Five validated enriched or confirmed-fallback records are required. Isolated failures may occupy the remaining two slots and remain visible in the report. A systemic failure or fewer than five successes blocks the full rollout.

## Durable batching

Every completed canary or full batch is validated and published before the orchestrator advances to another batch. The commit contains:

- successful registry edits;
- the updated enrichment report;
- no raw provider source or response.

This makes the committed cursor and successful work the resume boundary. A runner terminated before a batch returns may repeat that in-flight batch, but a later dispatch never repeats a committed batch.

Each report also stores `publication.checkpoint_commit_sha`, the exact commit
containing that report checkpoint and its associated registry edits. Recording
that identity uses a second report-only commit, so recovery never guesses from
the repository-wide latest registry writer. If a runner stops between the two
commits, recovery inspects the latest commit for that exact report path and
recognizes whether it is a results commit or the controlled SHA-recording
commit.

Legacy reports that predate `publication` never deploy their historical
report commit. Recovery migrates them to the current synchronized `main` SHA,
then the normal approval or full-deployment write persists that exact SHA in
the current ledger. An unrecognized report-history commit in a current-format
ledger fails closed.

A systemic batch restores all in-flight registry edits before publication and
commits only its sanitized failed ledger. This prevents successes from the same
concurrent batch from leaking through a failure that invalidates the rollout.

Every project has a hard two-call budget per dispatch. Canary members that
remain eligible after the canary are recorded in the first full checkpoint as
`deferred_ids` rather than being attempted a third or fourth time. A later
dispatch starts a new bounded full run for those IDs. The full report carries
`authorized_canary_run_id`, so this boundary is applied exactly once for each
canary authorization rather than repeatedly deferring the same backlog.

The full rollout finishes as:

- `complete` when every manifest entry succeeds;
- `complete-with-errors` when only isolated project failures remain;
- `failed` when a systemic result enters the ledger.

## Source preparation

Project refresh accepts repeated `--project-id` flags. Canary preparation refreshes the entire selected pool in one invocation, producing one coherent refresh manifest instead of overwriting it once per project.

Full source preparation repeats refresh, identity backfill, validation, and
publication until a post-rebase round is unchanged. It is bounded to three
rounds. A timestamp-only refresh-manifest change is restored and counts as
stable; only snapshot or registry changes require another round. Continued
meaningful movement is a systemic failure rather than allowing a frozen
manifest to absorb projects that were never prepared.

## Orchestration

`scripts/catalog/enrichment-orchestrator.mjs` owns the rollout sequence through a dependency-injected operations interface. The GitHub Actions workflow becomes environment setup plus one orchestrator command and the sanitized summary.

The orchestrator:

1. synchronizes with `main`;
2. runs provider preflight;
3. reads the rollout plan;
4. starts or resumes the representative canary;
5. validates and publishes every completed canary batch;
6. explicitly dispatches Pages for the exact durable canary checkpoint and waits for that run;
7. records canary approval;
8. authorizes and prepares the full rollout;
9. validates and publishes every full batch;
10. explicitly dispatches Pages for the exact durable full checkpoint and waits for that run;
11. records the exact verified full deployment in the full report;
12. exits successfully for `complete` or `complete-with-errors`.

The orchestrator reuses an existing successful or active deployment for the
same checkpoint. Otherwise it dispatches Pages exactly once with
`source_sha=<checkpoint>`. This explicit path is required because pushes made
with the workflow `GITHUB_TOKEN` do not start another workflow. The Pages
workflow names the run with the source SHA and checks out that exact commit, so
a later report-only commit cannot change what is deployed. Publication retries
fetch the newest `main`; a content conflict aborts with an explicit file
inventory instead of replaying the same doomed rebase.

If a runner stops after the terminal full checkpoint but before deployment,
the planner returns `deploy-full` before considering backlog size. The next
dispatch deploys and records that exact checkpoint without repeating paid
model work, then either finishes or begins a new bounded backlog run.

A prior systemic full ledger never falls through the zero-candidate success
shortcut. When eligible work remains, the planner returns the explicit
`restart-full` recovery action under the same deployed canary authorization.
When no recoverable candidate exists, it fails closed for operator repair.
Terminal success and warning ledgers must have exact cursor, attempt, retry,
entry, publication, and deployment accounting before the planner accepts them.

## Verification

Required deterministic coverage:

- provider content normalization and sanitized diagnostics;
- retry requests containing the prior validation failure;
- seven-record deterministic representative selection;
- canary authorization with at least five successes and rejection below five;
- full `complete-with-errors` versus systemic `failed`;
- repeated project IDs producing one refresh manifest;
- orchestrator sequencing, batch checkpoint publication, resume, warning completion, and exact deployment wait;
- durable checkpoint recovery, duplicate deployment avoidance, and exact-SHA checkout;
- immediate systemic failure, deferred canary IDs, and bounded preparation stabilization;
- workflow reduced to one orchestrator command with shared catalog concurrency;
- complete repository check and static export.
