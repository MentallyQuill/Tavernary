# Tavernary Full Catalog Provisional Launch Design

## Purpose

Publish the complete Tavernary seed catalog before record-by-record editorial
review is finished. The launch uses the existing validated registry and
generated-catalog architecture; it does not make the application read the
historical intake file directly.

This is a pre-alpha bulk launch. Thin metadata is acceptable when it is marked
honestly and does not invent project facts. The design favors deterministic,
repeatable migration and progressive GitHub enrichment over delaying
publication for complete curation.

Where this document differs from the five-card production vertical-slice
design, this document controls the full-catalog expansion.

## Catalog Scope

The public seed catalog contains 214 unique projects:

- 213 entries from `data/catalog/projects.json`;
- five existing curated registry records;
- four IDs shared by both sources; and
- SillyTavern as the one registry-only record.

The migration creates 209 new registry records and preserves the five existing
curated records. When an intake ID already exists in the registry, the existing
curated record is authoritative and the migration does not overwrite it.

The resulting source distribution is:

- 204 GitHub repository projects, including SillyTavern;
- one GitHub organization entry, Tavern RPG Suite; and
- nine URL-backed System Presets.

All 214 records are published. No record is held back merely because editorial
metadata or a GitHub snapshot is incomplete.

## Chosen Approach

Use a one-time, deterministic migration from the historical intake file into
the canonical per-project registry.

Rejected approaches are:

- reading `projects.json` directly at runtime, because that creates a second
  public data model and bypasses registry validation;
- requiring full manual enrichment before launch, because the owner explicitly
  accepts provisional pre-alpha cards; and
- hand-authoring 209 files, because repeatable transformation and a migration
  report are safer and easier to audit.

After migration, `data/registry/projects/*.json` remains the only curated
catalog authority. `projects.json` remains a historical intake artifact and is
not part of the runtime build.

## Registry Schema

The curated project schema moves to version 2. Because Tavernary is pre-alpha,
all existing records, scripts, fixtures, and tests update in place; no legacy
schema compatibility path is retained.

Version 2 adds:

- `metadata_status`: `provisional` or `curated`;
- `uncategorized` as a valid primary function;
- a nullable GitHub `repository_id` while identity verification is pending;
- `github-organization` as an explicit source type; and
- enough URL-source nullability to represent unverified seed facts without
  claiming that they are known.

Existing hand-curated records become `metadata_status: curated`. Migrated
records become `metadata_status: provisional`.

Schema migration and intake migration are separate operations. A focused
schema upgrade updates the five existing curated records to version 2. The
subsequent intake migration creates only missing records and never edits those
five authoritative files.

### GitHub Repository Source

A provisional GitHub source contains:

```json
{
  "type": "github",
  "repository": "owner/repository",
  "repository_id": null
}
```

`repository_id: null` means identity verification has not completed. It does
not mean the repository lacks an ID. A successful refresh records the immutable
GitHub ID in the generated snapshot. A later deterministic identity-backfill
step updates the curated record and changes no editorial fields.

Once `repository_id` is populated, refresh validation retains the existing
identity-mismatch and quarantine behavior.

### GitHub Organization Source

Tavern RPG Suite is represented explicitly:

```json
{
  "type": "github-organization",
  "organization": "tavern-rpg-suite",
  "url": "https://github.com/tavern-rpg-suite"
}
```

This is a seed-catalog exception, not a general relaxation of the submission
rule. It is published as a project collection, uses paused refresh, and does
not receive repository activity, release, community, size, or license facts.
Future Frontend and Extension submissions still require their own public GitHub
repository unless a later product design changes that rule.

### URL Source

All nine non-repository entries are System Presets. Their stable source URL is
preserved. Unknown publication date, version, artifact size, and license fields
remain `null` or `pending`; the migration does not infer them from filenames,
posts, or hosting services.

URL sources use paused refresh and remain eligible for later manual curation.

## Deterministic Migration Rules

The migration script reads `data/catalog/projects.json`, validates the complete
input before writing, and generates only missing registry records.

### Identity and Names

- Preserve the intake `id` and `name`.
- Reject duplicate IDs or duplicate normalized canonical sources.
- Normalize GitHub repository URLs into `owner/repository`.
- Remove harmless trailing slashes from canonical URLs.
- Fail the migration if an entry has no usable canonical source.
- Never overwrite an existing registry file.

### Project Kind

Classification order is:

1. preserve an explicit valid `kind`;
2. classify entries tagged `Presets` or `Prompts` as `preset`;
3. classify Tavern RPG Suite as `extension`;
4. classify every other intake entry as `extension`.

SillyTavern remains the registry-only Frontend. The three explicit intake
Frontends remain Frontends. This produces the intended four-Frontend catalog:
SillyTavern, Sonder Engine, Lumiverse, and Marinara Engine.

### Frontends

Legacy display labels map to controlled IDs:

- `SillyTavern` to `sillytavern`;
- `Lumiverse` to `lumiverse`;
- `Marinara Engine` to `marinara-engine`; and
- `Sonder Engine` to `sonder-engine`.

Unknown frontend labels fail the migration and must be added to the controlled
vocabulary deliberately.

### Editorial Metadata

For migrated records:

- `primary_function` is `uncategorized`;
- `capabilities` is an empty array;
- `catalog_cohort` is `seed`;
- `visibility` is `published`;
- `refresh_policy` is `automatic` for GitHub repositories and `paused` for URL
  and organization sources;
- `cataloged_at` is the normalized UTC form of the intake `submitted_at`; and
- `metadata_status` is `provisional`.

When no curated summary exists, generate only a restrained structural summary:

> {Project name} is a {project kind} for {compatible frontend list}.

The displayed kind phrases are `frontend`, `extension`, and `System Preset`.
Multiple frontends use a comma-separated list with `and` before the final
frontend.

The generated summary may be awkward but must remain factual. It must not claim
features, quality, compatibility beyond the intake frontend list, maintenance,
license status, or creator intent.

## Browser Catalog Build

The browser catalog continues to be generated from registry records and
snapshots. Published records no longer require a healthy snapshot merely to
appear.

For a GitHub project without a snapshot:

- derive the canonical URL from `source.repository`;
- expose no activity or release facts;
- expose no community or repository-size facts;
- show license as `Pending`, not `Missing`;
- set refresh state to pending; and
- retain the provisional metadata status.

A healthy snapshot replaces pending derived facts during the next build.
Identity changes and confirmed deletion or private-source states are critical
and exclude the record. Transient unavailability or rate limiting preserves
the provisional card and any last known good facts. Absence of a snapshot means
“not enriched yet”; a failed verified identity means “unsafe to publish.”

URL and organization records remain public without snapshots and expose only
their curated facts.

## Public Presentation

Provisional cards remain fully searchable, filterable, sortable, and linked.
They include a quiet `Provisional details` treatment so visitors can
distinguish seed metadata from curated metadata.

Pending facts are presented honestly:

- license: `Pending`;
- activity: unavailable;
- release: unavailable;
- popularity: unavailable; and
- repository size: unavailable.

The UI must not render zero values where the fact is unknown.

`Uncategorized` appears as a controlled primary-function category and filter.
It uses the existing neutral/fallback category icon treatment rather than a new
project-kind color.

Sort behavior remains deterministic:

- enriched projects sort normally for activity, strength, and popularity;
- projects missing the selected metric follow enriched projects; and
- missing-metric ties resolve alphabetically by project name, then ID.

The seed cohort remains excluded from the `New` view. Projects without release
facts do not appear in the `Released` view.

## Progressive Enrichment

Publication and enrichment are separate operations.

After all records are public:

1. run GitHub refresh in bounded batches;
2. write validated snapshots for successful repositories;
3. rebuild the catalog after each accepted batch;
4. backfill immutable repository IDs deterministically;
5. retain provisional editorial status until a curator reviews the record; and
6. replace generated summaries, uncategorized functions, and empty capability
   sets through later curation.

GitHub enrichment never invents or automatically replaces editorial
classification. Repository descriptions and README text may inform later
curation, but they do not silently become permanent public summaries.

## Migration Reporting

The migration produces a deterministic report containing:

- total intake records;
- existing-registry overlaps;
- newly generated registry records;
- records by project kind and source type;
- provisional summary count;
- uncategorized count;
- null repository-ID count;
- normalized source changes;
- duplicate or invalid entries; and
- the expected final public union count.

The report must prove:

- intake count: 213;
- overlap count: 4;
- new registry records: 209;
- registry-only records: 1;
- final unique registry records: 214; and
- expected public browser records: 214.

Any mismatch fails the migration or verification command.

## Failure Behavior

- Invalid intake fails before registry writes begin.
- Registry writes use a staging location and move into place only after every
  generated record validates.
- Existing registry records are never overwritten by migration.
- Unknown vocabularies fail explicitly.
- Missing canonical sources fail explicitly.
- Missing snapshots do not hide otherwise valid published records.
- Verified identity changes and confirmed deleted or private sources continue
  to hide affected records.
- Refresh failures preserve the public provisional card and any last known good
  snapshot.
- Generated output remains deterministic and contains no intake-only
  submission metadata.

## Verification

The implementation requires:

- migration classification tests for Frontends, Extensions, Presets, prompt
  links, URL sources, and the organization source;
- overlap-precedence and no-overwrite tests;
- exact 213-input, 209-new, and 214-public count assertions;
- schema-version-2 tests;
- validation of nullable provisional repository IDs and required curated IDs;
- builder tests for missing, healthy, stale, and identity-failed snapshots;
- pending license and unavailable-metric presentation tests;
- deterministic missing-metric sort tests;
- search and filter coverage for provisional records and `uncategorized`;
- static-export proof with all 214 canonical project links;
- desktop, tablet, and mobile catalog checks at full data volume; and
- the complete `npm run check`, end-to-end, and visual test suites.

The migration is complete only when all 214 project cards are present in the
generated catalog, every card has a usable canonical destination, no
intake-only submission fields leak into browser data, and the full verification
suite passes.

## Delivery Boundary

This design covers:

- schema and vocabulary evolution;
- deterministic bulk migration;
- provisional registry records;
- pending-snapshot catalog behavior;
- public provisional presentation;
- progressive GitHub enrichment; and
- verification at the complete 214-project scale.

It does not add accounts, ratings, comments, automatic installation, hosted
project files, internal project-detail pages, or automated editorial
classification.
