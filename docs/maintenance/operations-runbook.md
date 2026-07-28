# Maintainer operations runbook (V1)

This document captures live maintainer operations, submission automation, and
release controls added after initial implementation.

## Repo boundaries

Do not edit generated artifacts manually.

- Human-authored:
  - `data/registry/projects/*.json`
  - `data/registry/kits/*.json`
  - `data/moderation/*.json`
  - issue templates and workflow files
- Generated:
  - `data/snapshots/github/*.json`
  - `data/snapshots/codeberg/*.json`
  - `data/snapshots/github-refresh.json`
  - `data/snapshots/github/kits/*.json`
  - `data/reports/enrichment-report.json`
  - `src/generated/catalog.json`

## Issue intake and triage

### Issue admission

`.github/workflows/admit-issue.yml` runs on `opened` and `reopened` issue
events. External accounts may keep their oldest 10 issues open across every
public issue type. Ordering uses creation time and then issue number; pull
requests do not count. Repository owners, members, and collaborators bypass
this public-intake cap.

Admission labels are workflow state:

- `issue-admitted` allows initial Project or Kit submission triage.
- `issue-limit-reached` records a per-issue queue decision, not an account
  block.

Closing an issue restores capacity immediately; there are no stored counters to
reset. Reopening a limited issue reruns admission. If the open-issue lookup
fails, admission fails open so a legitimate report is not discarded or
stranded.

After a GitHub API outage, rerun failed admission workflows. Do not manually
publish a submission that has not passed its normal Project or Kit validation.

### Submission triage

Two workflow handlers run on admitted-label and edited events for dedicated
triage automation:

- `.github/workflows/triage-submission.yml`
  - `[Project submission]` only (title-prefixed project submission issues)
- `.github/workflows/triage-kit-submission.yml`
  - `[Kit submission]` only (title-prefixed kit submission issues)

Other public issue flows are queue-only and reviewed manually:

- `[Project information]` (`02-project-information.yml`) stays on maintainer-driven review.
- `[Kit report]` (`06-kit-report.yml`) stays on maintainer-driven review.
- `[Website bug]` (`03-website-bug.yml`) goes to maintainer engineering triage.
- `[Other]` (`04-other.yml`) is a catch-all maintainer queue.
- `[Kit withdrawal]` (`07-kit-withdrawal.yml`) uses apply workflow after maintainer review.

`triage-issue.mjs` enforces project states:

- `needs-maintainer-review` while an admitted proposal is ready to generate
- `waiting-on-fork-parent` while its immediate upstream submission is open
- `needs-information` when a correctable source or metadata problem remains
- `duplicate-candidate` before automatically closing a confirmed duplicate
- `submission-retryable` when an external dependency failed transiently
- `submission-pr-open` while the generated PR is the active review surface
- `submission-declined` after that PR is closed without merging

`triage-kit-issue.mjs` owns the Kit-specific
`kit-publication-ready`/`needs-information`/`duplicate-candidate` flow. A
near-duplicate warning does not block publication; an exact duplicate does.

The triage workflow posts/updates one comment marker:

- `<!-- tavernary-submission-validation -->`
- `<!-- tavernary-kit-submission-validation -->`

Project triage does not publish a catalog record. An admitted decision
dispatches the separate generation workflow.

Valid Kit triage dispatches the separate serialized Kit publisher
automatically. Invalid Kit issues remain open for correction; edit the issue to
rerun triage.

## Project submission path

Repository Actions settings must permit **Allow GitHub Actions to create and
approve pull requests** so the workflow token can create the review PR.
Automation creates but never approves its own PR; branch protection and the
normal maintainer review still apply.

1. The static Tavernary builder or `01-project-submission.yml` creates an issue
   carrying `project-submission`.
2. `triage-submission.yml` normalizes the URL, maintains the generated title,
   inspects source facts, reconciles frontend vocabulary, and checks duplicates.
3. A duplicate receives the triage explanation and closes before generation. A
   correctable failure remains open with `needs-information`; edit the issue to
   rerun triage.
4. An admitted issue dispatches `generate-project-submission.yml` with its issue
   number. The workflow creates
   `automation/project-submission-<issue-number>`, writes only declared registry,
   snapshot, and optional frontend-vocabulary files, validates/builds them, and
   opens one PR marked with `Closes #<issue-number>`.
5. The issue changes to `submission-pr-open`. Treat that PR as the sole
   maintainer review surface. Correct proposed generated files directly on the
   branch; do not separately approve the issue.
6. Merge publishes through the normal `main` build and closes the linked issue.
   `project-submission-lifecycle.yml` removes transient review labels and deletes
   the generated branch only when its SHA still matches the closed PR.
7. Close without merging only when declining the submission. Lifecycle
   automation applies `submission-declined`, posts one marked explanation,
   closes the issue as not planned, and performs the same guarded branch cleanup.

### Manual generation and recovery

Run **Generate project submission review** manually when an admitted issue did
not dispatch or a retryable dependency has recovered:

1. Open Actions -> **Generate project submission review** -> **Run workflow** on
   `main`.
2. Enter `issue_number`.
3. Leave `force_regeneration` false for the normal non-destructive path.

The branch and PR are deterministic, so a safe rerun updates the existing
proposal rather than creating a second review. If the PR head no longer matches
the generation marker, the workflow stops because a maintainer changed the
branch. Keep those corrections and continue review without regeneration.

Set `force_regeneration: true` only after reviewing the PR and deciding that
automation may replace every marker-owned generated path. Forced regeneration
rebases the branch onto current `main`, replaces only the declared generated
paths, preserves unrelated branch files, and pushes with `--force-with-lease`.
It never uses an unguarded force push. If the generated branch moved after PR
closure, lifecycle cleanup leaves it intact for manual inspection.

### Fork dependency recovery

For a child labeled `waiting-on-fork-parent`, inspect the marked validation
comment for the upstream issue number. If that upstream is still open, review
its generated PR normally; do not remove the waiting label or generate the
child early.

When the upstream PR merges, `project-submission-lifecycle.yml` dispatches
`retry-fork-dependencies.yml`. If the upstream is declined, deleted, private,
or otherwise terminal, the same retry admits the child with name-only upstream
provenance. The child is not blocked by the parent's publication outcome.

If the retry workflow fails:

1. inspect the failed `retry-fork-dependencies.yml` run;
2. fix the transient GitHub/API or workflow problem;
3. rerun **Retry fork-dependent submissions** on `main`;
4. confirm the child moves from `waiting-on-fork-parent` to either another
   immediate-parent wait or `needs-maintainer-review`.

If two system-created upstream issues exist for one repository identity, keep
the oldest valid issue, close the duplicate as a duplicate, and rerun the retry
workflow. Do not manually copy the child to a different issue; the ancestry
marker and stable repository ID are the deduplication authority.

A cycle or a chain reaching the 16-repository limit intentionally stops at
`needs-maintainer-review`. Inspect the ancestry marker, correct a bad repository
identity if present, or review the affected project manually. Do not raise the
bound to force automation through an unverified graph.

### Fork dependency backfill

Preview the exact snapshot paths and missing-upstream candidates:

```powershell
$env:GITHUB_TOKEN = gh auth token
npm run submissions:backfill-forks
Remove-Item Env:GITHUB_TOKEN
```

The default is read-only. After reviewing that report and explicitly approving
the mutation, apply it with:

```powershell
$env:GITHUB_TOKEN = gh auth token
$env:GITHUB_REPOSITORY = gh repo view --json nameWithOwner --jq .nameWithOwner
npm run submissions:backfill-forks -- --apply
Remove-Item Env:GITHUB_TOKEN
Remove-Item Env:GITHUB_REPOSITORY
```

The apply path updates only the reported GitHub snapshots, creates or reuses
normal upstream submission issues, and dispatches their triage. Run
`npm run catalog:build`, inspect the resulting public relationships, then use
the manual catalog verification checklist below before committing.

## Project information + website bug

- `[Project information]` helps maintainers patch or quarantine records.
- `[Website bug]` belongs to app/code changes in source and PR workflow.
- `[Other]` supports non-catalog escalations.

## Refresh automation

Workflow: `.github/workflows/refresh-catalog.yml`

- Schedule: `17 7 * * *` UTC via `cron`.
- Manual modes:
  - `incremental` (default)
  - `baseline` with `--batch-size` (1-24)
  - `project` with `--project-id`
  - `forensic` with `--project-id`
- `catalog-refresh` concurrency: `catalog-refresh`, non-canceling.
- `if` guard allows scheduled or `refs/heads/main` manual dispatch.
- Steps:
  1. `npm run catalog:refresh -- --mode ...`
  2. `npm run check`
  3. stage snapshot writes only
  4. commit only when staged changes exist
  5. bounded rebase/push retry (up to 3 attempts, no force-push)
  6. dispatch `deploy-pages.yml` only when snapshots changed.

Baseline mode loops while provisional queue remains > 0 by reading
`data/snapshots/github-refresh.json` counts.

The refresh manifest uses schema version 2. Its aggregate counts remain the
dashboard contract, while `providers.github` and `providers.codeberg` report
isolated checked, changed, failed, request, and remaining-budget values.
Provider failures do not discard successful work from the other provider.

For Codeberg rate limits or outages:

1. Inspect `providers.codeberg` and the affected snapshots' `stale_since`.
2. Leave last-known evidence in place; do not hand-edit snapshot facts.
3. Retry a single project after the provider budget recovers.
4. Escalate repeated 404 or identity-change results for source verification.

Only `codeberg.org` is supported. Do not redirect the adapter to an arbitrary
Forgejo/Gitea origin or infer that GitHub and Codeberg repositories are mirrors.

## Enrichment automation

Workflow: `.github/workflows/enrich-catalog.yml`

- One manual action owns preflight, canary, deployment approval, full-run
  preparation, batching, and resume behavior through the tested durable
  orchestrator.
- `enrichment_scope` controls selection:
  - `pending` (default) processes automatic records that still need enrichment.
  - `all-automatic` re-enriches every automatic record and is intended for
    provider-contract migrations such as a one-time summary rewrite.
- `model_timeout_seconds` defaults to `120` and applies independently to each
  provider request, not to a batch or the five-hour workflow job.
- Neither scope overrides a record's manual enrichment policy.
- Preflight retries transient provider timeouts, network failures, rate limits,
  and server errors three times after the initial request, waiting 5, 15, and
  30 seconds between attempts. Exhausted preflight retries remain fatal.
- Canary:
  - a representative pool of 5-7 unique project IDs is selected within the
    chosen scope
  - preps snapshot and registry writes in one gated commit
  - waits deployment (`gh run watch`) before approval transition
  - requires `--mode approve-canary` after deployment to mark pass
- Full run:
  - `start` initializes full enrichment manifest
  - `resume` advances until state is no longer `running`
  - required gate `npm run check` between batches
  - isolated project failures remain provisional after their durable retry and
    produce a successful `complete-with-errors` Action conclusion
  - systemic configuration, authentication, model, state, write, publication,
    deployment, or notification failures produce a failed Action conclusion
- `concurrency` also `catalog-refresh`.
- Deployment summary writes include manifest mode/phase/cursor checkpoints.
- Durable reports freeze `selection_mode` and list `manual_exclusions`, so a
  resumed run cannot silently change scope.
- A successful partial run creates, updates, or reopens one
  `Catalog enrichment errors` issue with sanitized terminal errors. A later
  clean completed run closes it. Recovered first-attempt errors are omitted.

Provider mode uses environment secrets:

- `TAVERNARY_ENRICHMENT_API_URL`
- `TAVERNARY_ENRICHMENT_API_KEY`
- `TAVERNARY_ENRICHMENT_MODEL`

### Excluding a project from model enrichment

The canonical toggle lives on the project record in
`data/registry/projects/<id>.json`. To require manual processing, set:

```json
"enrichment_policy": "manual",
"enrichment_note": "Multi-repository suite; requires manual curation."
```

Use a short, maintainer-facing note that explains why automation is unsafe or
insufficient. Selection, direct execution, and atomic writes all enforce the
manual lock.

To return the project to automatic enrichment, set:

```json
"enrichment_policy": "automatic"
```

Remove `enrichment_note` at the same time; automatic records must not retain
one. This setting is independent of `refresh_policy`: refresh controls
repository evidence collection, while enrichment controls model-written
editorial fields.

## Kit workflow

Workflow set:

- `.github/ISSUE_TEMPLATE/05-kit-submission.yml` issues route to
  `[Kit submission]`.
- `.github/workflows/triage-kit-submission.yml` applies labels:
  `kit-publication-ready`, `needs-information`, `duplicate-candidate`.
- Valid triage dispatches `.github/workflows/apply-kit-submission.yml`
  automatically with the issue number.
- `.github/workflows/apply-kit-submission.yml` applies valid edit/create issues:
  - re-fetches and validates issue content again, including the shared
    severe-language policy
  - writes/updates `data/registry/kits/<kit-id>.json`
  - validates and builds catalog
  - commits `feat(kits): publish issue #<n>`
  - serializes writes under `kit-registry` concurrency
  - treats an unchanged edit retry as a timestamp-preserving no-op
  - dispatches the deploy workflow for the exact pushed SHA
  - applies `kit-published` and closes the source issue only after deployment
    dispatch succeeds
- `.github/workflows/apply-kit-withdrawal.yml` + `scripts/kits/apply-withdrawal.mjs`:
  - only Kit author numeric ID may withdraw
  - writes withdrawn tombstone status
  - closes withdrawal issue and deploys.

If Kit validation fails, correct the manifest by editing the open issue.
Automation reruns triage. If publication fails after valid triage, rerun the
failed publisher from GitHub Actions; its current-`main` synchronization and
idempotent apply rules make retries safe. Do not hand-edit generated registry
or catalog artifacts. Label or issue-closure bookkeeping failures after the
canonical push and exact-SHA deployment request appear as warnings and do not
turn successful publication into a false failure.

## Identity and moderation maintenance

### Quarantine recovery

If `source_health: identity-change`:

1. inspect canonical source mapping in `data/registry/projects/<id>.json`
2. fix `source.repository` and `source.repository_id` if needed
3. re-run targeted refresh with `npm run catalog:refresh -- --mode project --project-id <id>`
4. backfill identity with `npm run catalog:backfill-identities -- --project-id <id> --write`
5. run `npm run catalog:validate` and commit minimal fix PR

### Repository identity backfill workflow

Use this workflow for reproducible identity persistence:

- Workflow: `.github/workflows/backfill-repository-identities.yml`
- Trigger: `workflow_dispatch` on `main`
- Inputs:
  - `project_ids`: optional newline-separated list of project IDs, empty means all
- Runtime command: `npm run catalog:backfill-identities -- --write --project-id <id>`
  for each provided ID (or no `--project-id` for full backfill)
- Concurrency: `catalog-refresh`
- Commit scope: only `data/registry/projects/*.json`
- Validation + guardrails:
  - `npm run catalog:validate`
  - unknown IDs, duplicate IDs, or validation failures block the run before write
  - bounded 3-attempt rebase/push retry loop

### Transient stale handling

- `source_health: unavailable` keeps last known values visible in pending state.
- No immediate manual action unless repeat incidents show prolonged stale patterns.

### Kit/record safety repair

- Follow `docs/maintenance/kits.md`.
- Keep provenance fields unless required to change.
- Preserve support snapshots and author identity where possible.

## Verification checklist for manual catalog mutations

Run from repo root:

```powershell
npm run catalog:validate
npm run catalog:build
npm run test
```

Use `npm run check` only when generated exports changed.

For refresh/enrichment-only mutations:

```powershell
npm run check
```

Deployment trigger sequence:

- Snapshot-only changes are published by `deploy-pages.yml` after `refresh-catalog`
  and manual approval path.
- Registry enrichment publish path is in `enrich-catalog` (commit + page dispatch).
- Kit changes publish through kit apply workflows only.
