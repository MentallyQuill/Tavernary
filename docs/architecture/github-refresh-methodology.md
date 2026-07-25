# GitHub refresh methodology

This reflects the current implementation in `scripts/catalog/refresh-github.mjs`.

## What refresh does

- Reads canonical GitHub-backed registry records (`refresh_policy: automatic`)
- Selects observation targets from mode and history
- Queries GitHub repository state and snapshots
- Preserves prior values on non-systemic failure
- Computes evidence fields and license/activity/community fields
- Writes changed snapshots to `data/snapshots/github/*.json`
- Writes a sanitized manifest to `data/snapshots/github-refresh.json`
- Leaves registry files untouched

## Modes

- `incremental` (default): all automatic GitHub sources (batched).
- `baseline`: provisional snapshot queue slice (`--batch-size`, bounded by workflow input, currently 1-24).
- `project`: single repository, baseline/forensic decision path.
- `forensic`: forced deep inspection for diagnosis.

## Fallback mechanics

- Baseline and non-incremental modes may trigger direct Git inspection if:
  - no previous snapshot
  - baseline still provisional
  - baseline/project request
  - `forensic`
  - incremental compare path fails and needs recovery
- Git inspection uses shallow/no-checkout clone from default branch.
- Max clone depth window is adaptive:
  - full shallow boundary based on 100-day age rule from head commit.
- Concurrency for fallback jobs is capped at 3 (`mapConcurrent`).

## Activity evidence

- Weekly windows are Monday-based UTC.
- `derivePublicActivity` returns 12 booleans + active-week count.
- `N/12` means activity occurred in `N` of the current 12 weekly bins.
- `provisional_weeks` and `evidence_status` represent baseline completion state.
- Dormant = complete evidence + no source activity in last 12 weeks.

## Failure and health transitions

- GitHub compare/REST failures are mostly non-fatal:
  - stale values retained
  - `stale_since` set when transitioning from clean state
- `source_health` transitions:
  - to `unavailable` on HTTP 404 in failure path
  - to `identity-change` when observed repository no longer matches registry identity
  - remains `healthy` when recoverable failure can be tolerated as stale
- `baseline_attempts` increments per failed baseline attempt.
- `evidence_status` enters `degraded` after repeated failed baseline attempts.

## Manifest

`data/snapshots/github-refresh.json` contains:

- mode, start/completion timestamps
- counts (total/checked/changed/unchanged/degraded/unavailable/.../fallback/provisional)
- API usage counters
- project timing entries (`project_id`, outcome, duration, error_code)
- `snapshot_changes`
- `deployment_requested`

Outcomes include:

- `unchanged`, `compare-source`, `compare-excluded`, `baseline`, `fallback`,
  `unavailable`, `identity-change`, `failed`

Kit reaction refresh is handled in the same workflow after target project refresh:

- `.github/workflows/refresh-catalog.yml` runs `scripts/kits/refresh-reactions.mjs`
  every execution.

## Workflow controls

- `.github/workflows/refresh-catalog.yml` dispatches by mode.
- Scheduled run uses `incremental` and a fixed UTC minute.
- Baseline mode uses continuation checks:
  - captures provisional count before run
  - dispatches next batch only if provisional count decreases
- Snapshot commit + rebase retry with bounded attempts before hard fail.
- `npm run check` gates snapshot publication.
