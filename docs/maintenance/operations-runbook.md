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

`triage-issue.mjs` and `triage-kit-issue.mjs` enforce:

- `needs-maintainer-review` when automation passes
- `needs-information` when required source fields are invalid or missing
- `duplicate-candidate` on clear duplicate risk

The triage workflow posts/updates one comment marker:

- `<!-- tavernary-submission-validation -->`
- `<!-- tavernary-kit-submission-validation -->`

It does not publish any catalog record.

## Project submission path

1. Submitter opens issue through `01-project-submission.yml`.
2. Triage labels + comment run automatically.
3. If labeled `needs-maintainer-review`, maintainer:
   - updates canonical record in `data/registry/projects/<id>.json`
   - runs normal project change PR flow
   - validates catalog and build gates before merge

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

## Enrichment automation

Workflow: `.github/workflows/enrich-catalog.yml`

- One manual action owns preflight, canary, deployment approval, full-run
  preparation, batching, and resume behavior through the tested durable
  orchestrator.
- `enrichment_scope` controls selection:
  - `pending` (default) processes automatic records that still need enrichment.
  - `all-automatic` re-enriches every automatic record and is intended for
    provider-contract migrations such as a one-time summary rewrite.
- Neither scope overrides a record's manual enrichment policy.
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
- `concurrency` also `catalog-refresh`.
- Deployment summary writes include manifest mode/phase/cursor checkpoints.
- Durable reports freeze `selection_mode` and list `manual_exclusions`, so a
  resumed run cannot silently change scope.

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
one. This setting is independent of `refresh_policy`: refresh controls GitHub
evidence collection, while enrichment controls model-written editorial fields.

## Kit workflow

Workflow set:

- `.github/ISSUE_TEMPLATE/05-kit-submission.yml` issues route to
  `[Kit submission]`.
- `.github/workflows/triage-kit-submission.yml` applies labels:
  `needs-maintainer-review`, `needs-information`, `duplicate-candidate`.
- `.github/workflows/apply-kit-submission.yml` applies approved edit/create issues:
  - validates issue content again
  - writes/updates `data/registry/kits/<kit-id>.json`
  - validates and builds catalog
  - commits `feat(kits): publish issue #<n>`
  - dispatches deploy workflow
- `.github/workflows/apply-kit-withdrawal.yml` + `scripts/kits/apply-withdrawal.mjs`:
  - only Kit author numeric ID may withdraw
  - writes withdrawn tombstone status
  - closes withdrawal issue and deploys.

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
