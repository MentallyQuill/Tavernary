# Project registry schema reference (`data/schemas/project.schema.json`)

Tavernary registry records are schema versioned (`schema_version: 5`).

## Required fields

- `schema_version`: integer `5`
- `id`: kebab-case identifier
- `name`: non-empty string
- `kind`: `frontend | extension | preset`
- `summary`: 1-220 characters
- `metadata_status`: `provisional | curated`
- `source`: one of four source object shapes
- `frontends`: array of frontend IDs
- `primary_function`: structural `frontend`/`preset`, or one of the six
  controlled Extension primary-function IDs
- `capabilities`: array of capability IDs
- `cataloged_at`: ISO date-time
- `catalog_cohort`: `seed | standard`
- `visibility`: `published | quarantined | disabled`
- `visibility_reason`: null or one reason enum
- `refresh_policy`: `automatic | paused`
- `enrichment_policy`: `automatic | manual`
- `enrichment_note`: required only when enrichment is manual

## Source object

### `github`

- `type`: `github`
- `repository`: `owner/repo`
- `repository_id`: positive integer or null

### `codeberg`

- `type`: `codeberg`
- `repository`: `owner/repo`
- `repository_id`: positive integer

### `github-organization`

- `type`: `github-organization`
- `organization`: owner org string
- `url`: URI

### `url`

- `type`: `url`
- `url`: URI
- `published_at`: ISO date-time or null
- `version`: string or null
- `artifact_size_bytes`: integer >= 0 or null
- `license_status`: `osi-approved | proprietary | missing | pending`
- `license_spdx_id`: string or null

## Visibility rules

- Published records require `visibility_reason: null`.
- Quarantined/disabled entries require one non-null reason:
  - `identity-change`
  - `source-unavailable`
  - `removed`
  - `safety-review`

## Integrity rules

- `additionalProperties: false`.
- `frontends`, `capabilities`, and `id` lists are deduplicated.
- Registry ID and source identity should be stable across editorial edits.
- URL-preset records should normally use source `refresh_policy: paused` unless explicitly revalidated.
- Frontends always use `primary_function: "frontend"`.
- System Presets always use `primary_function: "preset"`.
- Extensions use only `memory-retrieval`, `generation-reasoning`,
  `character-worldbuilding`, `rpg-systems`, `interface-workflow`, or
  `developer-infrastructure`.
- Enrichment may update summary, `metadata_status`, and capabilities, but never
  `primary_function`.
