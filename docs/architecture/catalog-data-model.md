# Catalog data model

Tavernary uses two authoritative data layers and one browser output artifact.

## Layer 1 - curated registry

Canonical records live in `data/registry/projects/*.json`.

- Schema: `data/schemas/project.schema.json`
- Schema version: `5`
- Mutated only by PRs or approved workflows
- `source.type` determines source behavior:
  - `github` for regular frontends and extensions
  - `codeberg` for regular frontends and extensions hosted on Codeberg
  - `github-organization` for source collections
  - `url` for curated preset-like entries
- `enrichment_policy` is canonical maintainer-owned rollout eligibility:
  - `automatic` when the source has a registered automatic enrichment adapter
    (currently GitHub repositories, Codeberg repositories, and canonical Reddit
    post permalinks)
  - `manual` for unsupported external URLs, organization collections, and
    documented repository exceptions
- Manual records require `enrichment_note`; automatic records forbid it.
- `refresh_policy` controls source evidence refresh and is independent of
  `enrichment_policy`, which protects model-written editorial fields.

## Layer 2 - evidence snapshots

Machine evidence lives in `data/snapshots/github/*.json` and
`data/snapshots/codeberg/*.json`.

- Schema: `data/schemas/repository-snapshot.schema.json`
- Schema version: `3`
- Refreshed by `npm run catalog:refresh`.
- Contains: provider-qualified repository identity and head, linked
  provider-local contributor identities, neutral community counts, license,
  activity evidence, API refresh timestamps, and health state.

Repository snapshot v3 may contain generated `contributors` facts: each linked
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

A registry record is visible when:

- `visibility: published`
- snapshot source health is not `identity-change`, `deleted`, or `private`
- kind/source pair passes the same boundary rules as production code.

`source_health: unavailable` keeps a published record visible with stale indicators.

## Repository identity flow

1. New GitHub-backed record can start with `repository_id: null`; Codeberg
   admission resolves the immutable ID before review.
2. Successful refresh can establish repository identity.
3. `npm run catalog:backfill-identities -- --write` copies identity into registry.
4. `identity-change` requires curator repair before re-publication.

## Seed and counts

The current V1 catalog has:

- 275 registry records
- 273 curated, 2 provisional
- 265 GitHub repositories
- 1 GitHub organization source
- 9 URL-backed records
- 266 automatic-enrichment records and 9 manual-enrichment records

These numbers are audit context and may change with intake and curation.

## Query surface

The UI supports:

- search: `q`
- views: `all`, `active`, `new`, `released`
- sort: `recent`, `sustained`, `popularity`, `alphabetical`
- category, frontends, kind, capabilities, development, license
- density and kit mode query set

See `src/features/catalog/catalog-query.ts` for exact canonical params.
