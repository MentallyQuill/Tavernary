# Catalog data model

Tavernary uses two authoritative data layers and one browser output artifact.

## Layer 1 - curated registry

Canonical records live in `data/registry/projects/*.json`.

- Schema: `data/schemas/project.schema.json`
- Schema version: `3`
- Mutated only by PRs or approved workflows
- `source.type` determines source behavior:
  - `github` for regular frontends and extensions
  - `github-organization` for source collections
  - `url` for curated preset-like entries

## Layer 2 - evidence snapshots

Machine evidence lives in `data/snapshots/github/*.json`.

- Schema: `data/schemas/repository-snapshot.schema.json`
- Schema version: `2`
- Refreshed by `npm run catalog:refresh`.
- Contains: repo identity+head, community counts, license, activity evidence,
  API refresh timestamps, and health state.

## Layer 3 - generated runtime catalog

`src/generated/catalog.json` is the browser artifact loaded by the Next.js app.

- Schema shape: `Catalog` in `src/features/catalog/catalog-types.ts`
- Includes: curated fields + snapshot-derived computed values + `generatedAt`
- Generated deterministically by `npm run catalog:build`
- Never edited manually.

## Source status model

Generated project objects expose `sourceStatus`:

- `pending`: no snapshot yet
- `healthy`: snapshot exists and refresh is current
- `stale`: snapshot existed but is retaining prior values due to recoverable failure
- `manual`: non-GitHub (`url`) sources and curated organization entries

`manual` status also covers any source that is intentionally excluded from GitHub refresh automation.

## Publication gates

A registry record is visible when:

- `visibility: published`
- snapshot source health is not `identity-change`, `deleted`, or `private`
- kind/source pair passes the same boundary rules as production code.

`source_health: unavailable` keeps a published record visible with stale indicators.

## Repository identity flow

1. New GitHub-backed record can start with `repository_id: null`.
2. Successful refresh can establish repository identity.
3. `npm run catalog:backfill-identities -- --write` copies identity into registry.
4. `identity-change` requires curator repair before re-publication.

## Seed and counts

V1 seed set currently has:

- 214 registry records
- 5 curated, 209 provisional
- 204 GitHub repositories
- 1 GitHub organization source
- 9 URL-backed records

These numbers are audit context and may change with intake and curation.

## Query surface

The UI supports:

- search: `q`
- views: `all`, `active`, `new`, `released`
- sort: `recent`, `sustained`, `popularity`, `alphabetical`
- category, frontends, kind, capabilities, development, license
- density and kit mode query set

See `src/features/catalog/catalog-query.ts` for exact canonical params.
