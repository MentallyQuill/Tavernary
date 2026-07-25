# Catalog enrichment report (`data/reports/enrichment-report.json`)

This file is a durable run-state and outcome artifact written by
`scripts/catalog/enrich-readmes.mjs` and surfaced through the
`enrich-catalog` workflow.

## Schema and provenance

- Source of truth: `scripts/catalog/enrichment-report.mjs`
- File path: `data/reports/enrichment-report.json`
- Current schema version: `1`
- File format: JSON
- Intended retention: one committed report file in repository history per enrichment run.

## Top-level fields

- `schema_version`: integer (`1`)
- `run_id`: string run identifier
- `mode`: `canary` or `full`
- `status`: `running`, `awaiting-deployment`, `passed`, `failed`, or `complete`
- `phase`: `primary`, `retry`, or `complete`
- `expected_model`: configured model name (for example `MiniMax-M3`)
- `batch_size`: integer
- `concurrency`: integer
- `created_at`, `updated_at`: ISO timestamps
- `manifest`: ordered project IDs selected for the run
- `primary_cursor`: index into `manifest` for resume behavior
- `retry_queue`: project IDs pending retry
- `retry_cursor`: index into `retry_queue`
- `attempts`: map from project ID to attempt count
- `entries`: ordered map from project ID to per-project sanitized entry
- `deployment`: null or `{ commit_sha, run_id, verified_at }`
- `aggregates`: counts by sanitized outcome

## Entry fields

Each `entries` item includes:

- `id`: project ID
- `attempt`: `1` or `2`
- `phase`: `primary` or `retry`
- `outcome`: one of:
  - `enriched`
  - `fallback`
  - `source-not-ready`
  - `retry-pending`
  - `retry-enriched`
  - `retry-fallback`
  - `final-failure`
  - `skipped`
- optional `source_kind`, `repository_id`, `head_sha`, `readme_path`,
  `readme_ref`
- optional `requested_model`, `returned_model`, `latency_ms`
- optional `reason_code`
- `message` (generated from controlled `reason_code` family)
- `completed_at`: ISO timestamp

## Operational meaning

- `running` means a workflow cycle is in progress and may be resumed from saved
  cursors.
- `awaiting-deployment` is a canary-only terminal pre-approval state after all
  primary/retry attempts and before verified deployment approval.
- `passed` means canary run approval has completed and deployment metadata is
  validated.
- `failed` means the run is blocked for an unrecoverable canary outcome.
- `complete` means full-run work finished and all IDs have been processed.

## Relation to other contracts

- This report is written alongside registry project snapshots during enrichment
  operations, not during `catalog:refresh` runs.
- `catalog:refresh` has a separate manifest at
  `data/snapshots/github-refresh.json`; that manifest documents GitHub snapshot
  collection only.
