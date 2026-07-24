# Incremental Catalog Activity Design

**Date:** 2026-07-24
**Status:** Proposed for written-spec review

## Context

Tavernary currently refreshes GitHub-backed projects by processing repositories
one at a time. When a repository has no prior snapshot or its head changed, the
refresher creates a temporary partial clone with up to 500 commits, walks that
history, reads root license files, writes the snapshot, deletes the clone, and
only then begins the next project.

This preserves Tavernary's distinction between meaningful source development
and documentation-only or generated changes, but it scales poorly. A baseline
or broadly changed catalog can require hundreds of serial clones. The
commit-count boundary also does not match the product's twelve-week activity
window: 500 commits can represent hours in one repository and years in another.

The replacement keeps transparent source-development evidence while making
normal refreshes incremental. Repository cloning becomes a bounded baseline and
recovery mechanism, not the default refresh operation.

## Goals

- Preserve source-aware activity rather than substituting popularity.
- Keep the tile's `5/12`-style activity summary and activity graph.
- Make unchanged repositories cheap to observe.
- Inspect only the delta for repositories whose default-branch head changed.
- Make the first baseline finite and dynamically sized to the catalog.
- Keep Tavernary static and GitHub Pages-native, without a runtime service.
- Preserve last-known-good facts when an upstream repository cannot be read.
- Expose enough run diagnostics to explain slow or degraded refreshes.

## Non-goals

- Real-time webhook ingestion.
- A Tavernary backend, database, queue service, or GitHub App.
- Exact commit-volume ranking.
- Rewarding projects for stars, reviews, raw commit counts, or repository size.
- Searching indefinitely for source activity older than the twelve-week
  product window.
- Permanent compatibility with version 1 repository snapshots.

## Activity Metric

The public activity model has three independent facts:

1. `latest_source_activity_at`: the latest known source-bearing activity.
2. `active_weeks_12`: the number of fixed UTC weeks containing at least one
   source-bearing change during the current twelve-week window.
3. `latest_release_at`: the latest published GitHub release.

A source-bearing change touches at least one path that is not excluded by the
existing documentation, lockfile, generated, vendored, empty, whitespace-only,
or merge-only rules.

Commit volume does not affect ranking. One source-bearing change activates a
week; additional changes in the same week do not increase its value.

`Recent Activity` sorts by the newest of `latest_source_activity_at` and
`latest_release_at`, then by `active_weeks_12`, then by project name.
`Sustained Activity` sorts by `active_weeks_12`, then by the same recency value,
then by project name.

Releases do not activate source-week ticks. They remain separately visible
evidence and may affect recency sorting.

## Fixed Week Contract

- Weeks begin Monday at `00:00:00 UTC`.
- Snapshots retain the current week and the previous eleven weeks.
- Each retained week records only whether source activity occurred and the
  latest activity timestamp observed in that week.
- `latest_source_activity_at` remains available after its week ages out.
- When a complete 100-day baseline finds no source-bearing change, the public
  label is `No source activity in the last 12 weeks`. Tavernary does not imply
  that the repository has never had source activity.

## Repository Snapshot Version 2

Version 2 replaces the current rolling commit counts and weighted strength with
evidence that can be incrementally maintained.

```json
{
  "schema_version": 2,
  "project_id": "example-project",
  "repository": {
    "id": 123,
    "owner": "example",
    "name": "project",
    "url": "https://github.com/example/project",
    "default_branch": "main",
    "head_sha": "0123456789012345678901234567890123456789",
    "head_committed_at": "2026-07-22T18:31:00.000Z",
    "archived": false,
    "created_at": "2025-01-10T12:00:00.000Z",
    "size_kb": 1200
  },
  "source_health": "healthy",
  "activity": {
    "latest_source_activity_at": "2026-07-22T18:31:00.000Z",
    "source_weeks": [
      {
        "week_start": "2026-07-20",
        "latest_at": "2026-07-22T18:31:00.000Z",
        "precision": "exact"
      }
    ],
    "provisional_weeks": null,
    "latest_release_at": "2026-07-10T12:00:00.000Z",
    "evidence_status": "complete",
    "baseline_completed_at": "2026-07-24T19:00:00.000Z",
    "baseline_attempts": 1
  },
  "community": {
    "stargazers_count": 10,
    "forks_count": 2,
    "subscribers_count": 3,
    "aggregate": 15
  },
  "license": {
    "status": "osi-approved",
    "spdx_id": "MIT",
    "source_path": "LICENSE"
  },
  "refreshed_at": "2026-07-24T19:00:00.000Z",
  "stale_since": null
}
```

`repository.head_committed_at` is required but may be `null` only while a
migrated snapshot remains provisional. The first successful GraphQL observation
replaces it with the default-branch head commit timestamp.

### Activity fields

- `latest_source_activity_at` is a date-time or `null`.
- `source_weeks` contains at most twelve unique Monday UTC week starts, sorted
  newest to oldest.
- `precision` is:
  - `exact` when commit paths and timestamps were classified by a bounded Git
    inspection;
  - `interval` when a daily aggregate comparison proved that a source-bearing
    change occurred but could not associate paths with individual commits.
- `provisional_weeks` is either `null` or a twelve-boolean migration summary
  ordered oldest to newest and derived from a version 1 snapshot. It is allowed only while
  `evidence_status` is `provisional` or `degraded`, and is removed after a
  successful baseline.
- `evidence_status` is:
  - `provisional`: awaiting the first version 2 baseline;
  - `complete`: the twelve-week window has complete evidence;
  - `degraded`: the baseline or later recovery could not complete after bounded
    attempts.
- `baseline_completed_at` is non-null only after a successful baseline.
- `baseline_attempts` records bounded baseline attempts and resets to zero only
  when an operator explicitly requests a new baseline cycle.

The snapshot does not store `active_weeks_12`, weighted `strength`, or
`dormant`. The build derives these values.

## Migration

A one-time migration rewrites every existing snapshot to schema version 2.
There is no long-lived version 1 reader after migration.

The migration preserves:

- repository identity and metadata;
- current head SHA;
- `latest_meaningful_commit_at` as `latest_source_activity_at`;
- latest release;
- community facts;
- license facts;
- health and staleness state.

Version 1 stores the current week first, so migration reverses the twelve
positions and converts each nonzero count to `true`. The resulting
`provisional_weeks` runs oldest to newest like the final tile graph. The tile
displays this as approximate evidence until the baseline completes. Version 1
counts do not become fixed-week `source_weeks`, because their sliding
boundaries cannot be converted without false precision.

Projects without a snapshot receive a provisional version 2 snapshot after
their first successful metadata observation. They show activity as pending
until baseline evidence exists.

## Tile Activity Presentation

The tile retains the numeric summary, such as `5/12`.

The existing graph groups twelve commit-count buckets into six variable-height
bars. Version 2 replaces it with twelve equal weekly ticks:

- oldest week on the left;
- current week on the right;
- active week in the normal activity color;
- inactive week in the subdued track color;
- no height or intensity variation;
- the number of active ticks always equals the `N` in `N/12`.

For complete evidence, the accessible label and tooltip are:

`Source activity in 5 of the last 12 weeks`

For migrated provisional evidence, the numeric label is prefixed with `~` and
the tooltip is:

`Approximate activity in 5 of the last 12 weeks; baseline pending`

For degraded evidence, the tile keeps any valid evidence but adds:

`Activity evidence is incomplete`

`Last commit` copy becomes `Last source activity`. A complete baseline with no
source-bearing change in the window displays:

`No source activity in the last 12 weeks`

## Refresh Components

The current all-in-one refresh script is split into focused modules.

### Catalog observer

The observer loads automatic registry records and their snapshots, then queries
GitHub GraphQL in serial batches of at most 25 repositories. Each alias returns:

- immutable repository database ID;
- owner, name, URL, creation date, size, and archive state;
- default branch name, head SHA, and head commit timestamp;
- star, fork, and watcher/subscriber counts;
- latest release timestamp;
- GitHub's coarse license metadata.

Each batch also requests GraphQL rate-limit cost and remaining points.
Partial GraphQL responses are handled per repository. Authentication failure,
malformed batch data, or an exhausted rate budget is systemic and aborts
publication.

### Delta inspector

An unchanged head reuses existing source and license evidence without a clone.

A changed head is compared through GitHub's REST compare endpoint using
`previous_head...current_head`. The delta inspector accepts the result only
when:

- history is strictly ahead rather than behind or diverged;
- every intervening commit is represented;
- fewer than 300 changed files are returned;
- the previous successful observation is no more than 48 hours old;
- the interval can be assigned to a week without ambiguous multiweek history.

When accepted, aggregate paths are classified with the existing exclusion
rules. A source-bearing delta updates `latest_source_activity_at` and the
corresponding fixed week with `precision: "interval"`. A documentation-only or
otherwise excluded delta advances the stored head without activating a week.

A root license candidate in the delta triggers detailed license refresh.
Otherwise the prior detailed license result is retained.

REST comparisons are serial. Rate-limit and retry headers are authoritative.

### Baseline and fallback inspector

The Git inspector runs when:

- evidence is provisional;
- the prior SHA is missing;
- history is behind or diverged;
- compare output exceeds commit or file limits;
- the last successful observation is older than 48 hours;
- weekly assignment would be ambiguous;
- an operator explicitly requests forensic inspection.

The inspector uses a partial, no-checkout clone bounded by a 100-day timestamp.
It classifies commit paths and timestamps, root license text, and current head.
It never deepens indefinitely to find older activity.

At most three Git inspections run concurrently. Each inspection has a
five-minute timeout, bounded output, and guaranteed temporary-directory
cleanup.

### Evidence reducer

The reducer is a pure module that:

- merges baseline or interval evidence into a snapshot;
- normalizes timestamps;
- enforces Monday UTC week starts;
- keeps at most twelve fixed weeks;
- removes provisional evidence after baseline success;
- derives public active-week and dormancy facts;
- preserves last-known-good evidence on soft failure.

### Publisher

Refresh work writes candidate snapshots to a temporary staging directory.
The publisher validates all candidate snapshots and builds the complete
browser catalog before replacing committed files.

Successful projects can publish even when isolated repositories fail softly.
Systemic failures or any validation/build failure publish nothing.

## Refresh Manifest

Each completed run writes `data/snapshots/github-refresh.json`, separate from
the per-project snapshot directory.

It records:

- schema version and run mode;
- start and completion timestamps;
- total, checked, changed, unchanged, provisional, degraded, unavailable, and
  failed project counts;
- GraphQL request count and point cost;
- REST request count;
- accepted compare count;
- baseline and fallback clone counts;
- total duration;
- bounded per-project timings and outcomes;
- whether snapshot changes and deployment were produced.

The website's catalog-refresh timestamp comes from this manifest. Per-project
snapshots change only when project facts, evidence, or health change, avoiding
timestamp-only churn across every snapshot.

The manifest contains no tokens, response bodies, clone paths, or other
sensitive runtime data.

## Workflow Modes

The workflow supports:

- `incremental`: scheduled daily observation of all automatic projects;
- `baseline`: process the next bounded set of provisional projects;
- `project`: observe and, when required, baseline one exact project ID;
- `forensic`: force bounded Git inspection for one exact project ID.

`baseline` accepts a bounded batch size with a default of 12 and a maximum of
24. It does not accept a start index.

After a successful baseline batch commits, the workflow reads the post-run
`counts.provisional` value from `data/snapshots/github-refresh.json` and
dispatches another baseline run only while that value is greater than zero.
The queue is derived from current records, so catalog additions, removals, and
ordering changes cannot skip projects.

A failed baseline increments `baseline_attempts`. After three failed attempts,
the project becomes degraded and the queue advances. `project` or `forensic`
can explicitly retry it.

The repository-level `catalog-refresh` concurrency group remains
non-cancelling. Only one refresh workflow may publish at a time.

## Failure Semantics

Soft per-project failures include transient upstream errors, timeouts, and
temporary clone failures when prior evidence exists. They:

- preserve last-known-good facts;
- set `stale_since` on the first failure;
- record a sanitized outcome in the run manifest;
- allow unrelated project updates to publish.

Confirmed deleted, private, unavailable, and identity-change states retain the
existing visibility and curator-review behavior.

Systemic failures include:

- missing or invalid authentication;
- exhausted API budget before the observation sweep completes;
- malformed batch responses that make repository identity unsafe;
- staging, schema validation, catalog build, or publication failure.

Systemic failures abort the candidate publication. The prior committed catalog
remains deployable.

Retries are bounded and honor `retry-after` and rate-limit reset headers.
Publication never force-pushes. If `main` advanced, the workflow fetches and
rebases with bounded retries; snapshot conflicts fail with project-specific
diagnostics.

## Logging

The action log reports:

- selected mode and project count;
- GraphQL batch progress and point cost;
- each changed repository's compare outcome;
- each baseline/fallback start, completion, and elapsed time;
- periodic aggregate progress;
- final counts and timing table.

Unchanged projects are summarized by batch rather than logged individually.
No project may appear to consume the whole step without a start line and
elapsed-time result.

## Testing

### Unit tests

- Monday UTC week normalization and twelve-week pruning.
- Exact and interval evidence reduction.
- Source-path exclusions.
- One activity event per active week regardless of commit volume.
- Provisional version 1 summary migration.
- Complete baseline removal of provisional evidence.
- Sort behavior for recent and sustained activity.
- Compare acceptance and every fallback condition.
- Retry and stale-state transitions.
- Manifest sanitization and aggregation.

### Schema and build tests

- Version 2 accepts complete, provisional, and degraded snapshots.
- Version 1 snapshots are rejected after migration.
- Generated catalog activity is derived from evidence.
- Twelve activity ticks contain exactly `active_weeks_12` active values.
- Release recency remains separate from source-week activity.

### Component tests

- Complete evidence renders `5/12` and twelve ticks with five active.
- Provisional evidence renders `~5/12` and the baseline tooltip.
- Degraded and unavailable states remain accessible.
- `Last source activity` replaces `Last commit`.
- The graph is decorative while the tooltip and hidden card description expose
  the full meaning.

### Refresh integration tests

Mock GraphQL, REST compare, and Git operations to prove:

- 204 unchanged projects require no clone;
- one changed source repository creates one interval event;
- excluded-only changes advance the head without activity;
- oversized, divergent, stale, and ambiguous deltas use fallback;
- one project failure does not discard valid candidates;
- systemic failure publishes nothing;
- the baseline queue is status-driven and has no hardcoded catalog ceiling.

### Workflow tests

- Modes and input bounds are exact.
- Snapshot and manifest paths are the only staged refresh outputs.
- Validation precedes replacement and commit.
- Deployment occurs only after a successful snapshot commit.
- Baseline continuation depends on current provisional status.
- The workflow retains the serialized catalog concurrency group.

## Acceptance Criteria

- A complete tile can still show `5/12` and a graph representing those exact
  five active weeks.
- The graph uses twelve binary ticks rather than commit-volume heights.
- An unchanged full-catalog incremental run performs zero Git clones.
- Normal API observation is batched and exposes rate usage.
- Changed repositories use delta comparison before any clone.
- Git history inspection is time-bounded and has concurrency of at most three.
- Baseline progression is driven by evidence status and covers catalogs of any
  size.
- Version 1 snapshots are migrated in place and no permanent compatibility path
  remains.
- The action log and refresh manifest explain run time and fallback usage.
- A complete candidate catalog passes the repository's full validation, test,
  export, and accessibility checks before publication.
