# Project registry schema reference (`data/schemas/project.schema.json`)

Tavernary project-card records are schema versioned (`schema_version: 6`).

## Required fields

- `schema_version`: integer `6`
- `id`: kebab-case identifier
- `source_id`: stable reference to `data/registry/sources/<source-id>.json`
- `name`: non-empty string
- `kind`: `frontend | extension | preset`
- `summary`: 1-220 characters
- `metadata_status`: `provisional | curated`
- `frontends`: array of frontend IDs
- `primary_function`: structural `frontend`/`preset`, or one of the six
  controlled Extension primary-function IDs
- `tags`: zero to six controlled Goals and traits IDs
- `cataloged_at`: ISO date-time
- `catalog_cohort`: `seed | standard`
- `listing_status`: `active | quarantined | retired`
- `listing_status_reason`: null, `safety-review`, or `owner-request`
- `metadata_policy`: independent `summary` and `tags` policies; each is either
  `{ "mode": "automatic" }` or
  `{ "mode": "manual", "note": "<trusted provenance>" }`

## Source record

Source identity and lifecycle are not embedded in each card. Source records use
`data/schemas/source.schema.json` version 1 and may be shared by multiple
project cards. Every source carries `status`, `status_reason`, and
`refresh_policy`.

### `github` and `codeberg`

- `id`: `<provider>-<immutable-repository-id>`
- `type`: `github` or `codeberg`
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

## Lifecycle rules

- Active cards require `listing_status_reason: null`.
- Quarantined or retired cards require `safety-review` or `owner-request`.
- Active sources require `status_reason: null`.
- Delisted sources require `status_reason: removed` and
  `refresh_policy: paused`; all linked cards are excluded from publication.

## Integrity rules

- `additionalProperties: false`.
- `frontends`, `tags`, and compatibility ID lists are deduplicated.
- `tags` has a maximum of six values and every value must exist in the
  controlled vocabulary and apply to the card kind.
- Registry ID and source identity should be stable across editorial edits.
- Repository renames update the source record's repository coordinates without
  changing its ID or linked card IDs.
- URL sources use `refresh_policy: paused`.
- Frontends always use `primary_function: "frontend"`.
- System Presets always use `primary_function: "preset"`.
- Extensions use only `memory-retrieval`, `generation-reasoning`,
  `character-worldbuilding`, `rpg-systems`, `interface-workflow`, or
  `developer-infrastructure`.
- Enrichment may update summary, tags, and `metadata_status` only where the
  corresponding metadata policy is automatic. It never changes
  `primary_function`.
