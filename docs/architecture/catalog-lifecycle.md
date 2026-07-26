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
- `enrichment_policy` (`automatic`/`manual`)
- `enrichment_note` (required only for manual enrichment)

Project kinds:

- `frontend`
- `extension`
- `preset`

## Draft -> reviewed -> public

1. A submission issue is intake, not a second approval surface. URL
   normalization, duplicate identity, source probing, and frontend
   reconciliation run before any catalog proposal is created.
2. Confirmed duplicates close before PR generation. Correctable failures remain
   open with `needs-information`.
3. An admitted issue creates one deterministic
   `automation/project-submission-<issue-number>` branch and one generated pull
   request. The PR is the sole human review and may be corrected directly by
   maintainers.
4. A generated project can begin as curated or provisional.
5. `source` must satisfy rules:
   - `github` requires `repository` and optional `repository_id` (nullable before identity confirmed).
   - `github-organization` identifies collection-style sources.
   - `url` is restricted to preset/source-like entries.
6. A record can be in `published` visibility and still be provisional for
   metadata, as long as required source constraints pass.
7. Merge places the reviewed record on `main`, closes the linked issue, and
   publishes through the normal static build. Closing the generated PR without
   merge declines the submission and does not publish it.
8. Curated metadata is still expected to evolve after merge if maintainers
   update summary/function/capabilities/visibility.

External System Presets follow the same PR review boundary but remain manually
curated after acceptance: their source refresh is paused because Tavernary
cannot verify a non-GitHub source through repository identity.

## Enrichment eligibility and durable scope

Regular GitHub repositories default to `enrichment_policy: automatic`,
including GitHub-hosted presets. External URL sources and GitHub organization
collections default to `manual` with a required reason. A maintainer may also
lock a GitHub repository to manual when its structure requires human review.

The enrichment action offers two selection scopes:

- `pending`: automatic records whose editorial metadata still needs work.
- `all-automatic`: every automatic record, including already curated records.

Manual records are excluded from both. A run persists its `selection_mode` and
`manual_exclusions` in the canary and full reports, then uses that frozen scope
for every resume. The write boundary re-reads the canonical record before
replacement, so a newly added manual lock wins even after selection.

`refresh_policy` remains separate: it controls GitHub observation and snapshot
updates, not permission to overwrite editorial enrichment.

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
