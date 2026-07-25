# Catalog lifecycle and publication states

This document tracks how a submission becomes visible in the public catalog and how data quality degrades or recovers over time.

## Record layers

### 1) Canonical project record (`data/registry/projects/*.json`)

Each record includes:

- `schema_version`
- `id`, `name`, `kind`, `summary`
- `source` (`github` | `github-organization` | `url`)
- `frontends` and `capabilities`
- `primary_function`
- `metadata_status` (`provisional` or `curated`)
- `cataloged_at`, `catalog_cohort`
- `visibility` (`published`/`quarantined`/`disabled`)
- `visibility_reason` (only nullable when visible)
- `refresh_policy` (`automatic`/`paused`)

Project kinds:

- `frontend`
- `extension`
- `preset`

## Draft -> reviewed -> public

1. Project can begin as curated or provisional.
2. `source` must satisfy rules:
   - `github` requires `repository` and optional `repository_id` (nullable before identity confirmed).
   - `github-organization` identifies collection-style sources.
   - `url` is restricted to preset/source-like entries.
3. Record can be in `published` visibility and still be provisional for metadata, as long as required source constraints pass.
4. Curated metadata is still expected to evolve after merge if maintainers update summary/function/capabilities/visibility.

## Source-health and snapshot layer

Snapshot records in `data/snapshots/github/*.json` include:

- `source_health`: `healthy|unavailable|identity-change|deleted|private`
- `activity` evidence and timestamps
- `community` aggregate
- `license` and repository metadata

### Health impact on visibility

- `healthy`: normal update path; project visible when `visibility: published`.
- `unavailable`: snapshot stays visible if already published, with `stale` status and `stale_since`.
- `identity-change`: removed from public build until curator confirms identity and updates registry.
- `deleted` / `private`: removed from public build.

## Public project rendering behavior

`src/lib/catalog/load-catalog.ts` hydrates `src/generated/catalog.json` from:

- curated registry records
- snapshot evidence when available
- controlled vocabularies
- manifest generation time

When snapshot is missing or stale, curated records can still render as pending-data states (`sourceStatus`, source-activity placeholders, pending license state).

## Development and activity state

- `sourceStatus` in generated project model:
  - `pending` (no snapshot yet)
  - `healthy` (snapshot current)
  - `stale` (`unavailable`/transient failure with previous retained)
  - `manual` (`url` or non-GitHub preset-like sources)

- Activity evidence:
  - `provisional`: no full baseline yet.
  - `complete`: stable 12-week graph available.
  - `degraded`: baseline attempted repeatedly without completion.

## Visibility exceptions

- `visibility: quarantined` or `disabled` is always removed from public cards.
- `visibility_reason` must be non-null for non-published entries and one of:
  - `identity-change`
  - `source-unavailable`
  - `removed`
  - `safety-review`

## Backfill and recovery

- `npm run catalog:backfill-identities -- --write` copies repository IDs after successful observation.
- Recovering from transient failure is usually a refresh + validation + visibility decision.
- Source identity mismatch requires explicit curator repair path (record identity check, fix, refresh, validate, then writeback).

