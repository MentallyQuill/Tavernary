# Catalog data model

Tavernary is a link aggregator. It indexes project metadata and points visitors
to each project's canonical source; it does not host project files.

## Current launch state

As of Friday, July 24, 2026, the public seed catalog is a 214-project union:

- 213 historical intake rows in `data/catalog/projects.json`;
- 214 canonical registry files in `data/registry/projects/`;
- 5 curated records;
- 209 provisional records; and
- 1 registry-only record, `sillytavern-sillytavern`.

The current source mix in the canonical registry is:

- 204 GitHub repositories;
- 1 GitHub organization entry, `tavern-rpg-suite`; and
- 9 URL-backed presets.

`data/catalog/projects.json` is historical intake only. It is preserved for
auditability and deterministic reruns of `npm run catalog:migrate`, but it is
not a runtime input and does not override the canonical registry.

## Authority boundaries

- Canonical project records in `data/registry/projects/` are the curated source
  of truth. They contain schema-version-2 editorial data and source identity.
- Repository snapshots in `data/snapshots/github/` are machine-authored GitHub
  refresh outputs. They contain activity, repository, community, and license
  facts.
- The generated browser catalog in `src/generated/catalog.json` joins published
  registry records, snapshots, and vocabularies into the static site artifact.

No script should treat `data/catalog/projects.json` or `src/generated/catalog.json`
as the authoring source of truth.

## Registry schema v2

Every canonical project record uses `schema_version: 2`.

Key launch fields:

- `metadata_status`: `"curated"` or `"provisional"`;
- `source.type`: `"github"`, `"github-organization"`, or `"url"`;
- `source.repository_id: null` allowed only for provisional GitHub records
  pending identity enrichment;
- `primary_function: "uncategorized"` for imported provisional editorial data;
- `visibility` for publication state; and
- `refresh_policy` for automation state.

The current seed launch intentionally publishes provisional records before full
editorial enrichment is complete. Missing enrichment is shown as pending facts,
not as confirmed absence and not as synthetic zeroes.

## Source rules

Frontend and extension records normally require a GitHub repository source.
Presets may instead use a stable HTTPS source URL. URL-backed presets are
manually processed and use `refresh_policy: "paused"`.

`tavern-rpg-suite` is the sole `github-organization` exception. It is a
provisional paused extension record that represents a project collection rather
than a single repository snapshot target.

## Snapshot publication model

Published GitHub records do not require a healthy snapshot to appear in the
catalog.

- No snapshot yet: the project stays public with pending GitHub-derived facts.
- `source_health: "unavailable"`: keep the last known good facts and mark the
  record stale.
- `source_health: "identity-change"`: remove the project from the public build
  until curator review resolves the mismatch.
- `source_health: "deleted"` or `"private"`: remove the project from the public
  build.

This distinction is intentional: transient refresh failure is recoverable
staleness, while identity failure or confirmed source removal is a safety
boundary.

## Repository identity backfill

GitHub identity is established in two phases:

1. the canonical registry may publish a provisional GitHub record with
   `repository_id: null`;
2. a successful refresh writes a healthy snapshot with the immutable GitHub
   repository ID; and
3. `npm run catalog:backfill-identities -- --write` copies that verified ID
   into the canonical registry record.

Backfill updates source identity only. It does not auto-curate summaries,
functions, capabilities, or visibility.

## Seed-launch semantics

The `seed` cohort is excluded from the New view so the July 2026 bulk import
does not present all 209 imported records as newly released. Standard records
use `cataloged_at` for that view; repository creation time remains separate
snapshot metadata.

Imported seed records remain visibly provisional until a curator replaces the
generated summary, `uncategorized` function, and empty capability set with
reviewed editorial metadata.
