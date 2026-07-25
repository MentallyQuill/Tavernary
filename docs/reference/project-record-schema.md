# Project registry schema reference (`data/schemas/project.schema.json`)

Tavernary registry records are schema versioned (`schema_version: 3`).

## Required fields

- `schema_version`: integer `3`
- `id`: kebab-case identifier
- `name`: non-empty string
- `kind`: `frontend | extension | preset`
- `summary`: 1-140 characters
- `metadata_status`: `provisional | curated`
- `source`: one of three source object shapes
- `frontends`: array of frontend IDs
- `primary_function`: one of controlled primary-function IDs
- `capabilities`: array of capability IDs
- `cataloged_at`: ISO date-time
- `catalog_cohort`: `seed | standard`
- `visibility`: `published | quarantined | disabled`
- `visibility_reason`: null or one reason enum
- `refresh_policy`: `automatic | paused`

## Source object

### `github`

- `type`: `github`
- `repository`: `owner/repo`
- `repository_id`: positive integer or null

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

