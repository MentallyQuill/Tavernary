# Fork-Aware Contributor Attribution Design

## Goal

Prevent GitHub forks from inheriting upstream contributor identities in
Tavernary while preserving genuine historical contributors to the fork without
walking deep branch or commit ancestry.

## Attribution Policy

Tavernary will use repository-specific evidence according to repository type:

- Original repositories continue to use GitHub's repository contributors API.
- Forks use authors of pull requests merged into the fork.
- Repository owners remain the visible creator and are removed from the
  additional-contributor list by the existing catalog build.
- Bot and AI identities remain searchable and disclosed, but remain excluded
  from the visible human-contributor count.

Merged pull-request authors are historical evidence. Once observed, an author
remains attributed even if the corresponding commits are later merged upstream
or otherwise cease to be unique to the fork.

This policy intentionally does not attempt to discover non-owner collaborators
who only push commits directly to a fork. Detecting those contributors requires
commit-provenance analysis, whose API and runtime cost is outside this change.

## Repository Observation

The existing GitHub GraphQL observation will request `isFork` for every
repository and promote it into the repository observation and snapshot facts.
Newly generated snapshots will contain a boolean `fork` property. The property
remains optional in schema version 2 so checked-in snapshots created before this
change remain valid until their next normal refresh.

Contributor collection receives the observed repository facts rather than only
an owner and repository name. This makes the selection between contributor
strategies deterministic and avoids a second repository-metadata request.

## Bounded Fork Collection

Fork collection will request closed pull requests ordered by most recently
updated, with 100 records per page. It will retain only rows with a non-null
`merged_at` and a linked GitHub `user` identity.

Each repository refresh may consume at most two pull-request pages. The
collector returns:

- the deduplicated accounts observed so far;
- the number of REST requests consumed;
- a continuation page when more history remains;
- the watermark used for an incremental refresh;
- whether the historical baseline is complete.

During an initial baseline, the snapshot stores accumulated accounts and the
next page. A later refresh resumes that page instead of restarting. When no
next page remains, the baseline becomes complete and records its completion
watermark.

After baseline completion, a later refresh starts at page one and stops when
it reaches pull requests whose `updated_at` is not newer than the prior
watermark. Newly observed accounts are unioned with historical accounts, so
genuine attribution never disappears.

The two-request budget applies separately to each fork and prevents contributor
collection from turning into a deep history scan. Existing refresh concurrency
limits remain unchanged.

## Snapshot and Catalog Status

Contributor snapshots will record their evidence method and fork scan state.
The supported methods are:

- `repository-contributors`;
- `merged-pull-requests`.

Fork attribution is `partial` while its initial merged-pull-request baseline
has a continuation page. The generated catalog will preserve that status.
Visible bylines may use the accounts already discovered, while tooltip and
accessible text append `Contributor history still scanning`.

Once the baseline completes, attribution becomes `current`. If collection
fails, existing accounts and scan progress are preserved and the contributor
snapshot becomes `stale` using the current failure-recovery behavior. A first
request failure still leaves contributor evidence pending rather than
inventing an empty result.

## Error Handling

The fork collector will use the contributor collector's existing authentication,
rate-limit, systemic-failure, request-counting, pagination, and malformed-data
conventions.

Malformed pull-request rows fail that repository's contributor collection.
Authentication and rate exhaustion remain systemic and abort the refresh.
Project-specific failures preserve the prior contributor snapshot and mark it
stale.

If a continuation URL would leave the GitHub API origin or the expected
repository pull-request route, collection fails rather than following it.

## Tests

The implementation will use test-driven development and cover:

- GraphQL observation and snapshot persistence of the fork flag;
- unchanged contributor collection for original repositories;
- fork collection accepting only merged pull-request authors;
- owner, human, bot, duplicate, and missing-identity behavior;
- the two-page request budget and persisted continuation;
- resuming an incomplete baseline without restarting;
- incremental collection stopping at the prior watermark;
- historical union preserving previously observed authors;
- partial, current, pending, and stale catalog statuses;
- an Aikobots-shaped regression where inherited SillyTavern contributors never
  enter the snapshot while a genuine merged-PR author does.

Focused unit tests will prove collection and persistence. Catalog build and
attribution tests will prove the generated status and user-facing disclosure.
The full repository check will verify schema validation, type checking, tests,
build, and static export.

## Non-Goals

- Walking fork branches or comparing commit ancestry.
- Detecting fork collaborators who only push directly.
- Rewriting activity, popularity, licensing, or repository-health collection.
- Calling GitHub from browser code.
- Automatically mutating existing snapshots outside the normal refresh path.
