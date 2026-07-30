# Catalog lifecycle and publication states

This document tracks how a submission becomes visible in the public catalog and how data quality degrades or recovers over time.

## Record layers

### 1) Canonical project record (`data/registry/projects/*.json`)

Each record includes:

- `schema_version`
- `id`, `name`, `kind`, `summary`
- `source_id` (stable reference to `data/registry/sources/*.json`)
- `frontends` and zero to six `tags`
- `primary_function`
- `metadata_status` (`provisional` or `curated`)
- `cataloged_at`, `catalog_cohort`
- `listing_status` (`active`/`quarantined`/`retired`)
- `listing_status_reason`
- `metadata_policy.summary` and `metadata_policy.tags`, each independently
  `automatic` or `manual` with a trusted provenance note

The linked source record owns provider identity, source status, delisting, and
`refresh_policy`. Several cards may share one source. Card retirement and
editing are ordinary maintenance; source delisting is the destructive action
that suppresses every linked card.

Project kinds:

- `frontend`
- `extension`
- `preset`

Primary function is a human-owned classification with a structural kind
contract. Frontends always use `frontend`; System Presets always use `preset`;
Extensions use one of the six functional Extension categories. There is no
Uncategorized state.

## Draft -> reviewed -> public

1. A submission issue is intake, not a second approval surface. Manifest
   version 4 carries independent requested summary/tag modes but no trusted
   provenance. The submitted Extension primary function is authoritative.
   Frontend and Preset values are derived structurally before URL
   normalization, duplicate identity, source probing, and frontend
   reconciliation run.
2. Confirmed duplicates close before PR generation. Correctable failures remain
   open with `needs-information`.
3. An admitted issue creates one deterministic
   `automation/project-submission-<issue-number>` branch and one generated pull
   request. The PR is the sole human review and may be corrected directly by
   maintainers.
4. A generated project can begin as curated or provisional, but never without
   a valid kind/primary-function pair. An intake-only model review may confirm
   the submitted Extension value or attach a `classification-review` mismatch
   warning. It does not mutate the proposal.
5. The linked source record must satisfy rules:
   - `github` requires `repository` and a resolved `repository_id`.
   - `codeberg` requires `repository` and a resolved `repository_id`.
   - `github-organization` identifies collection-style sources.
   - `url` is restricted to preset/source-like entries.
6. An active card can still be provisional for metadata, as long as the linked
   source and required constraints pass.
7. Merge places the reviewed record on `main`, closes the linked issue, and
   publishes through the normal static build. Closing the generated PR without
   merge declines the submission and does not publish it.
8. Curated metadata may still evolve after merge if a reviewed human update
   changes summary, primary function, tags, or card listing status. The owner
   workflow can also add up to ten sibling cards from one source in one
   maintainer-approved request.

External System Presets follow the same PR review boundary. Their source
refresh can remain paused, while editorial enrichment may be automatic only
when a registered adapter recognizes the canonical source.

## Enrichment eligibility and durable scope

Regular GitHub and Codeberg cards default both metadata fields to `automatic`,
including repository-hosted presets. Canonical Reddit post sources may also use
automatic metadata because Tavernary has a bounded allowlisted adapter for
them. Unsupported external URLs and GitHub organization collections default
both fields to `manual` with a required reason. A trusted editor may lock or
unlock summary and tags independently.

The enrichment action offers two selection scopes:

- `pending`: cards with an automatic field whose editorial metadata still
  needs work.
- `all-automatic`: every card with at least one automatic field, including
  already curated cards.

Cards with both fields manual are excluded from both. A run persists its
`selection_mode` and `manual_exclusions` in the canary and full reports, then
uses that frozen scope for every resume. The write boundary re-reads the
canonical record before replacement, so a newly added per-field manual lock
wins even after selection.

Enrichment owns summary, tags, and `metadata_status`, but writes only fields
whose current metadata policy is automatic. Its optional classification result
exists only to support the intake warning path and never changes the canonical
`primary_function`.

`refresh_policy` remains separate: it controls source observation and snapshot
updates, not permission to overwrite editorial enrichment.

For repository sources, enrichment selects a usable README before considering
the short repository description. Reddit enrichment uses only the canonical
post body or title. Both paths normalize the selected input to source kind,
canonical identity, and bounded untrusted text before provider invocation.
Arbitrary external URLs are never fetched automatically.

## Source-health and snapshot layer

Snapshot records in `data/snapshots/github/*.json` and
`data/snapshots/codeberg/*.json` include:

- `source_health`: `healthy|unavailable|identity-change|deleted|private`
- the provider's observed `fork` flag and immediate `parent` repository identity
- `activity` evidence and timestamps
- `community` aggregate
- `license` and repository metadata

### Health impact on visibility

- `healthy`: normal update path; an active card with an active source is
  visible.
- `unavailable`: the card stays visible if its card and source remain active,
  with `stale` status and `stale_since`.
- `identity-change`: removed from public build until curator confirms identity and updates registry.
- `deleted` / `private`: removed from public build.

### Fork relationship projection

The snapshot is the private observation layer: it retains the immediate
upstream repository ID, owner/name, and URL needed for refresh and identity
matching. The generated public catalog projects only the safe relationship:
the upstream's display name, its Tavernary project ID when that project is
published, and `published`, `not-listed`, or `unavailable` status.

A delisted upstream therefore leaves name-only provenance on its child. Its
repository coordinates, URL, and former public Tavernary identifier are not
published. A published relationship opens a temporary two-card catalog scope
with the immediate parent first and child second. The parent may offer its own
upward relationship, but Tavernary does not expose children, fork counts, or a
fork-family browser.

The relationship URL preserves ordinary query parameters while temporarily
suspending their rendering. Removing the `Fork: Parent -> Child` token returns
to the prior query when the relationship was opened locally, or removes only
the relationship parameter from a shared URL. Existing **Clear all** and
**Clear filters** actions reset the relationship and ordinary filters together.

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

## Listing and source exceptions

- Card `listing_status: quarantined` or `retired` is removed from public cards
  without changing sibling cards.
- A non-active card requires `listing_status_reason: safety-review` or
  `owner-request`.
- Source `status: delisted` removes all linked cards and requires
  `status_reason: removed` plus `refresh_policy: paused`.

## Backfill and recovery

- `npm run catalog:backfill-identities -- --write` copies repository IDs after successful observation.
- `npm run submissions:backfill-forks` reports fork snapshot updates and
  missing-upstream submission candidates without writing. The same command
  with `-- --apply` is an explicit operator-controlled mutation.
- Recovering from transient failure is usually a refresh plus validation
  decision; it does not require changing durable card/source lifecycle state.
- Source identity mismatch requires explicit curator repair path (record identity check, fix, refresh, validate, then writeback).
