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
- `status`: `running`, `awaiting-deployment`, `passed`, `failed`, `complete`,
  or `complete-with-errors`
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
- `provider_metrics`: cumulative model `call_count`, `repair_call_count`,
  `rate_limit_events`, and `latency_ms_total`
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
- optional cumulative `provider_calls`, `provider_repair_calls`,
  `provider_rate_limit_events`, and `provider_latency_ms_total`
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
- `failed` means a systemic error or unrecoverable canary outcome prevented a
  trustworthy completion.
- `complete` means full-run work finished and every selected project resolved.
- `complete-with-errors` means full-run work finished safely, but one or more
  selected projects remain provisional after their retries. This remains a
  successful workflow conclusion and may contain zero enriched projects when
  every terminal error is isolated.

## Relation to other contracts

- This report is written alongside registry project snapshots during enrichment
  operations, not during `catalog:refresh` runs.
- Enrichment writes only summary, `metadata_status`, and `capabilities` to a
  canonical project record. It cannot write or change `primary_function`.
- A provider classification result is an intake-only classification review. It
  can support a sanitized mismatch warning on a new submission, but is never
  canonical classification state and is not copied into this report.
- `catalog:refresh` has a separate manifest at
  `data/snapshots/github-refresh.json`; that manifest documents GitHub snapshot
  collection only.
