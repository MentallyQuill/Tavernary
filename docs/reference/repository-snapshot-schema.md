# Repository snapshot schema reference

GitHub and Codeberg snapshot files are machine-written evidence validated by
`data/schemas/repository-snapshot.schema.json` (`schema_version: 3`).

## Required top-level fields

- `schema_version`: `3`
- `provider`: `github | codeberg`
- `project_id`
- `repository`
- `source_health`
- `activity`
- `community`
- `license`
- `refreshed_at`
- `stale_since`

## Source health

- `healthy`
- `unavailable`
- `identity-change`
- `deleted`
- `private`

## Repository block

- `id`: integer > 0
- `owner`, `name`, `url`, `default_branch`
- `description`: string or null
- `head_sha`: 40-char git SHA
- `head_committed_at`: date-time or null
- `archived`: boolean
- `fork`: optional boolean
- `parent`: optional immediate provider-local parent object or null, with immutable
  repository `id`, `owner`, `name`, and `url`
- `created_at`: date-time
- `size_kb`: integer >= 0

## Activity block

- `latest_source_activity_at`: date-time or null
- `source_weeks`: 0-12 week points with `week_start` + `latest_at` + `precision`
- `provisional_weeks`: 12-length boolean array or null
- `latest_release_at`: date-time or null
- `evidence_status`: `provisional | complete | degraded`
- `baseline_completed_at`: date-time or null
- `baseline_attempts`: integer >= 0

## Community block

- `stars_count`, `forks_count`, `watchers_count`, `aggregate`

Provider responses are normalized into these neutral fields. On Codeberg,
`watchers_count` is the repository's watcher count; it is not inferred from
stars.

## Contributors

When present, `contributors.accounts` contains provider-qualified linked
accounts. GitHub evidence uses repository contributors for normal repositories
and merged-pull-request authors for forks. Codeberg evidence is derived from
bounded recent commit-author and merged-pull-request scans, followed by
provider-local account verification. Unlinked commit identities are not
invented as Codeberg accounts.

## License block

- `status`: `osi-approved | proprietary | missing`
- `spdx_id`: string or null
- `source_path`: string or null

## Refresh metadata

- `refreshed_at`: observation timestamp
- `stale_since`: null while healthy, timestamp when failures began leaving last-known values

## Notes

- Snapshot writes are gated by `npm run catalog:refresh`.
- GitHub files live in `data/snapshots/github/*.json`; Codeberg files live in
  `data/snapshots/codeberg/*.json`.
- A transient refresh that omits a known parent retains the last-known parent
  while the provider still reports the repository as a fork.
- Parent data is rejected for non-forks and cannot point back to the repository
  itself.
- Registry source-of-truth is independent; snapshots never rewrite registry fields.
