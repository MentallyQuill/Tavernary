# Tavernary system overview (V1 architecture)

Tavernary is a static, build-time catalog for AI roleplay tooling discovery. It does not host binaries, models, telemetry data, or project artifacts.

## Core architecture

```text
data/registry/projects/*.json   ->  canonical curated record
                \
                 \ (build join + validation + vocabulary lookup)
                  -> src/generated/catalog.json (runtime artifact)

data/snapshots/github/*.json  ->  machine-collected GitHub evidence
data/snapshots/github-refresh.json -> run manifest
                 /
                /
GitHub repository APIs (observation source)
```

Runtime behavior is entirely client-side:

- Next.js serves a static export in `out/`.
- Browser loads `src/generated/catalog.json`.
- Client-side filtering, search, and sorting are pure in-memory logic.

## Source-of-truth boundaries

- `data/registry/projects/*.json` is canonical project metadata and editorial layer.
- `data/snapshots/github/*.json` is machine-generated activity/community/license evidence.
- `src/generated/catalog.json` is the single browser input produced by `npm run catalog:build`.
- `data/snapshots/github-refresh.json` stores sanitized run telemetry.
- Generated files are never edited manually.

Canonical source-of-truth intent:

- [Catalog data model](catalog-data-model.md): object/field contracts.
- [Catalog lifecycle](catalog-lifecycle.md): publication, stale, and quarantine behavior.
- [GitHub refresh methodology](github-refresh-methodology.md): evidence update policy.

## Data boundaries and edit rights

- Human edits: project records, vocabularies, workflows, site source, and issue templates.
- Automated mutation: `npm run catalog:refresh` writes GitHub snapshots and manifest only.
- Automated mutation: `npm run catalog:enrich` writes curated registry metadata only after explicit approval pipeline (workflow mode gates).
- Manual maintenance can update registry fields when moderation or editorial correction is required.

## Runtime visibility rules

- A project appears when:
  - `visibility` is `published`
  - and no snapshot visibility-blocking source-health exists (`identity-change`, `deleted`, `private`)
  - or snapshot is absent for a published source (then it may still render with pending facts)

- Hidden states keep data for later diagnosis:
  - `visibility: quarantined|disabled`
  - `source_health: identity-change|deleted|private`

## Pipeline scripts

- `npm run catalog:migrate`: converts intake shape into schema-compliant registry files (audit-oriented).
- `npm run catalog:validate`: validates registry + snapshots + generated manifest.
- `npm run catalog:build`: regenerates `src/generated/catalog.json`.
- `npm run catalog:refresh`: updates GitHub snapshots and manifest.
- `npm run catalog:enrich`: updates registry project metadata from allowed enrichment sources.
- `npm run catalog:backfill-identities`: copies confirmed immutable GitHub repository IDs into registry source blocks.
- `npm run check`: full local gate used before PR and release.

## Query model

- URL state is normalized through `CatalogQuery` and parsed from:
  - `q`, `view`, `sort`, `category`
  - `frontend`, `kind`, `capability`, `development`, `license`
  - `density`, `mode=projects|kits`
- Project mode queries `kinds` and `frontends`.
- Kit mode supports separate filters (`frontends`, `purpose`, `includes`, size bounds, pick flag, sort).

## Operational cadence

- Daily scheduled refresh runs `catalog:refresh -- --mode incremental`.
- Baseline mode is queue-driven and continues across manifest state while provisional snapshots remain.
- Enrichment runs separately through `catalog:enrich`.
- Repository enrichment prefers bounded README content, then uses the
  repository description as fallback. Registered external adapters such as
  Reddit follow the same normalized source contract; arbitrary URLs remain
  manual.
- Pages deployment is static export only; content changes only through committed generated output and workflow-triggered commits.

## Why static-first

- No accounts, no server-side session state.
- No search API, no recommendation service, no usage telemetry backend.
- Reproducible catalog from repository inputs and scripts.
