# GitHub refresh methodology

The GitHub refresher treats curated project files as read-only inputs and writes
machine-owned snapshots under `data/snapshots/github/`.

For each repository it reads public repository and release facts from GitHub,
then inspects a partial, shallow Git clone for commit paths, substantive patch
content, the current head, and root license text. Documentation-only,
lockfile-only, generated/vendor-only, merge-only, and whitespace-only commits
do not count as meaningful activity.

The twelve activity buckets run newest to oldest. Each active week contributes
`(12 - weekNumber) * 100`, plus at most five tie points for its commit count.
A project becomes dormant only when its latest meaningful commit is more than
84 days old.

An unchanged head retains the prior activity history and license while cheap
repository and release facts are refreshed. Failed upstream requests preserve
the last known good snapshot and set `stale_since`. Deleted or private sources
are marked unavailable. A permanent repository-ID mismatch is marked
`identity-change` and requires curator review.

Writes are atomic. The refresher never edits names, summaries, compatibility,
taxonomy, visibility, moderation controls, or any file under `data/registry/`.
