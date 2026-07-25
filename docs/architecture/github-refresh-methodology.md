# GitHub refresh methodology

The GitHub refresher treats curated project files as read-only inputs. It writes
version 2 repository evidence under `data/snapshots/github/` and one sanitized
run manifest at `data/snapshots/github-refresh.json`.

## Activity evidence

`N/12` means qualifying source activity occurred in N of the current twelve
fixed, Monday-based UTC weeks. It does not count commits or weight busy weeks.
The twelve binary graph ticks run oldest to newest.

Documentation-only, lockfile-only, generated/vendor-only, merge-only, and
whitespace-only changes do not count as source activity. Root license changes
are tracked as license evidence, not source activity. A complete baseline with
no qualifying change reports no source activity in the last twelve weeks.

Exact baseline evidence records the qualifying commit timestamp for each active
week. A safe GitHub comparison can add interval evidence after that baseline.
Provisional tiles retain migrated twelve-week display evidence until their
exact baseline succeeds. Three failed baseline attempts mark the evidence
degraded so the dynamic queue can advance.

## Incremental observation

Daily incremental refreshes batch up to 25 repositories per GraphQL request.
An unchanged head updates repository, release, and community facts without a
REST comparison or Git clone. A changed head uses GitHub's compare API when the
delta is complete, current, under the response limits, and does not cross an
ambiguous multiweek interval.

A bounded Git inspection is used only for:

- provisional baselines;
- explicit forensic runs;
- divergent, stale, oversized, unavailable, or malformed comparisons; and
- changed root-license evidence that needs exact classification.

Git inspection uses a partial no-checkout clone with a 100-day
`--shallow-since` boundary. Every Git command has a five-minute timeout and
bounded output, temporary directories are always removed, and at most three
inspections run concurrently.

## Modes

- `incremental` observes every automatic GitHub source.
- `baseline` selects the next 1–24 provisional snapshots by evidence status.
- `project` observes one exact project and baselines it when its evidence is
  incomplete.
- `forensic` forces one bounded Git inspection for one exact project.

The baseline queue has no start index or catalog-size constant. After a
successful baseline commit, the workflow dispatches another batch only when the
committed manifest still reports provisional snapshots.

## Failure and publication

Soft repository failures preserve last-known-good facts and set `stale_since`.
Deleted, private, unavailable, and immutable repository-ID mismatch states
retain their visibility and curator-review rules. Authentication, exhausted API
budget, malformed batch identity data, validation failure, build failure, or
publication failure aborts the run before candidate publication.

Candidate snapshots and the manifest are staged together. The complete
candidate record/snapshot set is schema-validated and built before committed
files are replaced. The refresher never edits names, summaries, compatibility,
taxonomy, visibility, moderation controls, or anything under `data/registry/`.

The manifest records run mode, completion time, outcome counts, remaining
provisional/degraded evidence, GraphQL and REST usage, clone reasons, bounded
project timings, snapshot changes, and deployment intent. It contains no
tokens, response bodies, repository clone paths, or credential-bearing URLs.
The public catalog's `generatedAt` value comes from this manifest.

The GitHub Action stages only snapshots and the manifest. Before pushing, it
fetches and rebases onto `main` with at most three attempts, never force-pushes,
and reports conflicting snapshot paths. A successful committed change triggers
the Pages deployment workflow.
