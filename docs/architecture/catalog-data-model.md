# Catalog data model

Tavernary uses a curated project-card registry, a curated source registry,
provider evidence snapshots, and one generated browser artifact.

## Layer 1 - curated registry

Canonical project cards live in `data/registry/projects/*.json`. Canonical
source identity and source lifecycle live separately in
`data/registry/sources/*.json`.

- Schema: `data/schemas/project.schema.json`
- Schema version: `6`
- Mutated only by PRs or approved workflows
- Each card references exactly one stable `source_id`; multiple cards may
  intentionally share that source.
- `tags` contains zero to six controlled Goals and traits IDs.
- `metadata_policy.summary` and `metadata_policy.tags` independently select
  automatic or trusted-manual maintenance. Manual fields require a bounded
  provenance note.
- Source schema: `data/schemas/source.schema.json`, version `1`
- A source record owns `status`, `status_reason`, `refresh_policy`, and its
  provider identity. `type` determines source behavior:
  - `github` for regular frontends and extensions
  - `codeberg` for regular frontends and extensions hosted on Codeberg
  - `github-organization` for source collections
  - `url` for curated preset-like entries
- `refresh_policy` controls source evidence refresh and is independent of both
  card-owned metadata policies.
- Delisting is source-level and removes every linked card from publication;
  retiring or editing one card does not delist its source or siblings.

## Layer 2 - evidence snapshots

Machine evidence lives in `data/snapshots/github/*.json` and
`data/snapshots/codeberg/*.json`.

- Schema: `data/schemas/repository-snapshot.schema.json`
- Schema version: `4`
- Refreshed by `npm run catalog:refresh`.
- Contains: provider-qualified repository identity and head, linked
  provider-local contributor identities, neutral community counts, license,
  activity evidence, API refresh timestamps, and health state.

Repository snapshot v4 may contain generated `contributors` facts: each linked
account's provider, login, and account type, the last successful contributor
refresh timestamp, and contributor-specific staleness. Codeberg contributor
evidence is derived from bounded recent commit and merged-pull-request scans.
Absence means contributor collection is pending, not that the repository has an
empty contributor set.

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
- `manual`: non-repository (`url`) sources and curated organization entries

`manual` status also covers any source that is intentionally excluded from
repository refresh automation.

## Enrichment source contract

Automatic enrichment dispatches through a registered source adapter and gives
the model one normalized source object: source kind, canonical identity, and
bounded untrusted text.

- Repository adapters select a usable README first and fall back to the short
  repository description only when the README is missing or unusable.
- The Reddit adapter reads only the canonical post's bounded machine-readable
  body, falling back to its title. If Reddit blocks the listing endpoint, a
  separately bounded official oEmbed response may supply an identity-checked
  title; the embedded HTML is never used as source text.
- Unsupported external URLs have no automatic adapter and must remain manual.
- Source bodies, prompts, credentials, and raw provider responses are never
  written to durable reports. Reports retain only safe provenance such as the
  source identity, README path/ref, or Reddit post ID.

`refresh_policy` remains independent from this contract. For example, a Reddit
record can pause repository-style evidence refresh while still allowing
automatic editorial enrichment.

## Publication gates

A project card is visible when:

- `listing_status` is `active`;
- its source `status` is `active`;
- snapshot source health is not `identity-change`, `deleted`, or `private`; and
- kind/source pair passes the same boundary rules as production code.

`source_health: unavailable` keeps a published record visible with stale indicators.

## Repository identity flow

1. Admission resolves the provider's immutable repository ID.
2. The source ID is derived from provider plus that immutable ID.
3. Repository owner/name and canonical URL may refresh after a rename without
   changing the source ID or any linked project ID.
4. `identity-change` requires curator repair before re-publication.

## Seed and counts

The current catalog has:

- 309 project cards: 295 curated and 14 provisional
- 309 sources: 307 active and 2 delisted
- 298 GitHub repositories
- 1 Codeberg repository
- 1 GitHub organization source
- 9 URL-backed records

These numbers are audit context and may change with intake and curation.

## Query surface

The UI supports:

- search: `q`
- views: `all`, `active`, `new`, `released`
- sort: `recent`, `sustained`, `popularity`, `alphabetical`
- category, frontends, kind, Goals, Traits, development, license
- density and kit mode query set

See `src/features/catalog/catalog-query.ts` for exact canonical params.
