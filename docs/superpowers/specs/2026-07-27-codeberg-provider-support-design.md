# First-Class Codeberg Provider Support

**Date:** 2026-07-27

**Status:** Approved design

**Issue:** [#66](https://github.com/MentallyQuill/Tavernary/issues/66)

## Summary

Tavernary will accept public Codeberg repositories as first-class sources for
Frontends, Extensions, and System Presets. Codeberg projects will use the same
submission review, repository evidence, enrichment, catalog, search, sorting,
and Kit behavior as GitHub projects.

The implementation will introduce a repository-provider boundary shared by the
existing GitHub implementation and a new Codeberg adapter. The Codeberg adapter
will target only `codeberg.org`; this design does not add generic Forgejo or
GitLab support.

Cross-provider mirror detection is deferred. A project hosted on both GitHub
and Codeberg may initially appear as two distinct records unless a maintainer
catches the relationship during review.

## Context

Issue #66 reports that Tavernary rejects:

`https://codeberg.org/targren/Lumiverse-SwipeScrubber`

The current submission builder and admission pipeline require Frontends and
Extensions to use exact public GitHub repository URLs. The restriction extends
beyond the form:

- canonical project sources recognize GitHub repositories but not Codeberg
  repositories;
- source identity and duplicate detection use GitHub-specific keys;
- initial project generation invokes GitHub observers, activity inspectors,
  contributor collectors, and README enrichment;
- repository snapshots live in `data/snapshots/github/`;
- scheduled refresh, validation, catalog build, and workflow path
  classification assume GitHub snapshot paths;
- catalog attribution assumes GitHub accounts.

Accepting a Codeberg URL without addressing these downstream contracts would
publish a second-class record with missing or misleading repository evidence.

Codeberg runs Forgejo and exposes a public REST API under
`https://codeberg.org/api/v1`. Its live API provides the repository, commits,
commit details, contents, pull requests, releases, users, branches, and
community facts required by Tavernary. It does not expose a GitHub-style
aggregate contributors endpoint, so contributor evidence must be derived from
bounded commit and merged-pull-request scans.

## Goals

- Accept exact public GitHub or Codeberg repository URLs for every
  repository-backed project type.
- Preserve Tavernary's existing GitHub-hosted issue and maintainer-review PR
  workflow.
- Resolve permanent Codeberg repository identity before admission.
- Generate an initial Codeberg evidence snapshot with the submission PR.
- Refresh Codeberg evidence automatically on the scheduled catalog path.
- Normalize GitHub and Codeberg observations into the same catalog behavior.
- Keep rate limits, failures, and stale-state handling isolated by provider.
- Make owner and contributor attribution provider-aware.
- Preserve the static, build-time Tavernary architecture.

## Non-goals

- GitLab support.
- Arbitrary Forgejo or Gitea instances.
- Cross-provider mirror detection.
- Mirror declarations or repository synchronization.
- Combining GitHub and Codeberg community statistics.
- Requiring a Codeberg account or token from submitters.
- Moving Tavernary submission issues away from GitHub.
- Runtime browser calls to GitHub or Codeberg.

## Chosen Approach

Introduce a provider-neutral repository contract with two concrete adapters:

- `GitHubRepositoryProvider`
- `CodebergRepositoryProvider`

The adapters own host-specific URL parsing, API requests, response validation,
and status interpretation. Shared submission, snapshot, catalog, and
enrichment code consumes normalized identities and observations.

This avoids duplicating the complete catalog pipeline while keeping Codeberg
scope explicit. A generic Forgejo adapter is not appropriate because arbitrary
instances introduce host trust, API-version, availability, and server-side
request forgery concerns that Codeberg-only support does not require.

## Canonical Source Contract

The project schema keeps schema version 5 and adds a `codeberg` source variant:

```json
{
  "type": "codeberg",
  "repository": "targren/Lumiverse-SwipeScrubber",
  "repository_id": 1699613
}
```

The existing GitHub source shape remains unchanged. Adding a new source variant
does not require rewriting existing registry records.

Repository identity becomes provider-qualified:

```ts
interface RepositoryIdentity {
  provider: "github" | "codeberg";
  canonicalUrl: string;
  repository: string;
  repositoryId: number | null;
  owner: string;
  name: string;
}
```

Numeric repository IDs are unique only within a provider. Every identity,
duplicate key, snapshot, and attribution reference must therefore interpret
identity as `(provider, repositoryId)`.

## Provider Contract

Each repository provider supplies these operations:

```ts
interface RepositoryProvider {
  parseUrl(value: string): RepositoryIdentity | null;
  resolveIdentity(identity: RepositoryIdentity): Promise<ResolvedIdentity>;
  observeRepository(identity: ResolvedIdentity): Promise<RepositoryObservation>;
  inspectActivity(input: ActivityInspectionInput): Promise<ActivityInspection>;
  collectContributors(input: ContributorInput): Promise<ContributorEvidence>;
  readRootContents(input: RootContentsInput): Promise<RootContentEvidence>;
  listReleases(input: ReleaseInput): Promise<ReleaseEvidence>;
}
```

The shared contract is intentionally behavioral rather than a thin HTTP
wrapper. Each provider may use different upstream endpoints as long as it
returns validated normalized evidence.

The Codeberg adapter:

- accepts only `https://codeberg.org/<owner>/<repository>`;
- accepts an optional trailing slash or `.git`;
- rejects credentials, query strings, fragments, and extra path components;
- canonicalizes to `https://codeberg.org/<owner>/<repository>`;
- calls only the fixed `https://codeberg.org/api/v1` origin;
- uses public unauthenticated reads initially;
- supports an optional read-only token later without making it a launch
  dependency.

The fixed API origin prevents submitted URLs from selecting arbitrary upstream
hosts.

## Submission and Publication Flow

1. The static submission builder recognizes exact GitHub and Codeberg
   repository URLs.
2. The stable project manifest continues to carry the submitted `source_url`;
   no provider selector is added to the form.
3. GitHub opens Tavernary's existing structured issue form for submitter
   review.
4. Triage parses the source URL, chooses the provider, resolves permanent
   repository identity, and verifies public visibility.
5. Duplicate detection compares provider-qualified canonical URL, repository
   name, and permanent ID.
6. Frontend reconciliation and all existing admission rules run unchanged.
7. Submission generation calls the selected provider to create normalized
   repository, activity, contributor, license, and release evidence.
8. The generated review PR contains:
   - `data/registry/projects/<project-id>.json`;
   - `data/snapshots/codeberg/<project-id>.json` for a Codeberg source;
   - any required frontend vocabulary change.
9. Maintainers review the same submitted, observed, inferred, and warning
   report used for GitHub submissions.
10. Merging publishes through the normal catalog build and Pages deployment.

Codeberg project IDs use the current normalized owner-and-repository slug. A
same-slug record collision across providers is not silently overwritten. The
generator reports the collision for maintainer resolution because registry
project IDs remain globally unique.

## Duplicate Policy

Initial automated duplicate detection is provider-local.

A Codeberg submission is a duplicate when an existing Codeberg record has:

- the same permanent repository ID;
- the same canonical owner/repository identity; or
- the same canonical Codeberg URL.

A GitHub record and Codeberg record are not considered duplicates merely
because their owner, repository name, README, commits, or files resemble each
other. Similarity heuristics would create false positives and cannot establish
which host is authoritative.

Maintainers may reject an obvious mirror during review. A future design may add
explicit mirror metadata, but this implementation does not infer or persist
mirror relationships.

## Snapshot and Runtime Schemas

Repository snapshot schema moves from version 2 to version 3.

Version 3:

- adds `provider` at the top level;
- interprets repository IDs within that provider;
- renames community fields to:
  - `stars_count`;
  - `forks_count`;
  - `watchers_count`;
  - `aggregate`;
- uses the top-level provider to qualify `repository.owner`;
- adds `provider` to each contributor identity;
- retains the existing source-health, activity, license, refresh, and stale
  semantics.

All existing GitHub snapshots receive one deterministic mechanical migration
to snapshot schema v3. The migration does not recalculate evidence.

Snapshot storage remains provider-specific:

- `data/snapshots/github/*.json`
- `data/snapshots/codeberg/*.json`

Keeping the existing GitHub directory avoids relocating hundreds of files and
preserves Kit reaction snapshots under `data/snapshots/github/kits/`.

The generated runtime catalog moves to schema version 3 so community and
attribution fields are provider-neutral. Catalog build loads and unions both
repository snapshot directories before joining by project ID.

## Codeberg Evidence Mapping

The Codeberg repository response supplies:

- permanent repository ID;
- canonical owner and name;
- public/private and archived state;
- description;
- default branch;
- repository size;
- creation and update timestamps;
- stars, forks, and watchers.

Commit listing and commit-detail endpoints supply the bounded 12-week source
activity scan. The same meaningful-source-change policy used for GitHub applies
after Codeberg responses are normalized.

Root contents supply README and license candidates. Existing license
classification remains shared.

The releases endpoint supplies the latest release timestamp. A repository with
no releases is a valid empty-release state even when Codeberg represents that
state with a not-found response from the releases route.

Codeberg contributor evidence is derived automatically from:

- account-backed authors in the bounded commit scan; and
- authors of merged pull requests in the bounded contributor scan.

Unique logins are resolved through Codeberg's user endpoint so account type and
profile identity are provider-qualified. Unlinked Git commit author names and
emails are not exposed as public attribution identities.

## Refresh and Rate-Limit Behavior

Scheduled refresh selects automatic repository records, groups them by
provider, and sends each group to the corresponding adapter.

GitHub and Codeberg maintain separate:

- request counters;
- concurrency limits;
- retry state;
- success and failure counts;
- snapshot-change counts.

The refresh manifest records provider-level telemetry without storing tokens or
response bodies.

Codeberg's current public response advertises a baseline of 2,000 requests per
10 minutes. The implementation must treat response headers as authoritative,
use conservative bounded concurrency, and stop or defer work before exhausting
the observed budget. GitHub request capacity is unaffected by Codeberg work.

Baseline, incremental, project-targeted, and forensic refresh modes retain
their existing semantics. Provider selection follows the target record rather
than requiring a separate operator workflow.

## Failure Handling

During intake:

- invalid or noncanonical URL: definitive `needs-information`;
- repository not found: definitive `needs-information`;
- private repository: definitive `needs-information`;
- archived repository: admitted with a warning;
- timeout, rate limit, or upstream server failure: retryable;
- malformed upstream payload: retryable provider failure;
- identity changing between resolution and generation: generation stops
  without publishing inconsistent files.

During scheduled refresh:

- successful evidence replaces the prior provider snapshot;
- recoverable failure preserves the last known good snapshot and marks it
  stale;
- deleted, private, or permanent identity-change states use the existing
  visibility gates;
- one provider's failure does not discard successful snapshots from the other
  provider;
- a missing releases route for an otherwise healthy repository is normalized
  as no releases, not as repository deletion.

## User Experience

Submission copy becomes:

> Frontends and Extensions require a public GitHub or Codeberg repository.

The project URL placeholder may show either provider without adding a provider
selector. Provider detection follows the URL.

The existing `Continue to GitHub` button and handoff status remain accurate
because Tavernary submissions still use GitHub issues.

Project cards:

- open the canonical source host;
- use provider-aware owner and contributor profile links;
- include provider in attribution tooltips and accessible text;
- include Codeberg owners and contributors in search;
- use provider-neutral `stars`, `forks`, and `watchers` community language.

No permanent provider badge is added to the compact card. The canonical link
and attribution context disclose the host without adding another visual chip.

About-page language that currently promises creator-owned GitHub repositories
changes to creator-owned repositories. Text referring specifically to
Tavernary's own GitHub issue, license, or source workflow remains GitHub-specific.

## Workflow and CI Changes

Workflow path allowlists and content classification add:

`data/snapshots/codeberg/*.json`

Generated Codeberg submission records and snapshots use the existing
content-aware project-submission validation route. Empty, malformed, unknown,
mixed, code, schema, moderation, test, configuration, workflow, documentation,
and historical-intake changes continue to fail closed to the full repository
gate.

Catalog validation loads both snapshot directories, rejects duplicate project
snapshots across directories, and verifies that each snapshot provider matches
the canonical record source.

Scheduled refresh stages only recognized provider snapshot paths and the
refresh manifest. It must not use an unrestricted snapshot glob that could
publish unknown files.

## Security

- Only public repositories are eligible.
- Codeberg requests use a fixed API origin, never an origin derived from a
  submitted hostname.
- URL parsing rejects embedded credentials and non-HTTPS sources.
- Redirect handling does not leave the Codeberg origin.
- API response sizes, pagination, commit scans, pull-request scans, and root
  content reads are bounded.
- Untrusted repository content remains data; it is not executed during
  admission, enrichment, or refresh.
- Optional future Codeberg credentials are read-only secrets and never emitted
  into manifests, snapshots, logs, or generated reports.

## Verification Strategy

Implementation follows test-driven development with provider contracts tested
independently from orchestration.

### Unit and contract tests

- GitHub and Codeberg URL parsing, canonicalization, and rejection cases.
- Provider-qualified source duplicate keys.
- Same-provider duplicate rejection.
- Cross-provider records remaining distinct.
- Global project-ID collision reporting.
- GitHub and Codeberg adapters producing the same normalized observation shape.
- Codeberg repository, commit, commit-detail, contents, release, user, pull
  request, pagination, and error fixtures.
- Codeberg contributor derivation from commit and merged-PR authors.
- Snapshot v2-to-v3 migration.
- Provider/source/snapshot consistency validation.
- Shared activity, community, license, attribution, and stale-state behavior.

### Submission and workflow tests

- Builder acceptance of the issue reporter's Codeberg URL shape.
- Stable manifest handoff into the existing GitHub issue form.
- Triage admission of a public Codeberg repository.
- Initial Codeberg record and snapshot generation.
- Codeberg snapshot inclusion in generated-PR path validation.
- Content-only CI classification for recognized Codeberg snapshot changes.
- Full-CI fallback for unknown or mixed changes.
- Provider-isolated refresh telemetry and staging.

### Catalog and rendered tests

- Mixed GitHub and Codeberg catalog build.
- Sorting and filtering with normalized Codeberg activity and community facts.
- Search by Codeberg owner and contributor.
- Codeberg canonical links in project cards and Kit components.
- Provider-aware attribution tooltip and accessible text.
- Desktop and mobile rendered proof for a Codeberg-backed card.

### Live proof

After deterministic tests pass, run one read-only smoke inspection against:

`https://codeberg.org/targren/Lumiverse-SwipeScrubber`

The smoke proves current live API compatibility and normalized output. Automated
tests remain fixture-based and do not depend on Codeberg availability.

## Rollout Sequence

1. Introduce provider-neutral types and contract tests without changing
   production output.
2. Adapt the existing GitHub path to the provider contract and prove no catalog
   behavior regression.
3. Add snapshot schema v3 and mechanically migrate GitHub snapshots.
4. Add the Codeberg client and normalized evidence collectors.
5. Extend submission parsing, triage, generation, schemas, validation, build,
   and refresh orchestration.
6. Update user-facing copy, attribution, search, and rendered tests.
7. Run full deterministic verification.
8. Run the live read-only Codeberg smoke.
9. Process issue #66 through the normal submission flow after deployment.

## Acceptance Criteria

- The reported Codeberg URL passes the static builder and automated admission.
- A review PR is generated with a canonical Codeberg record and initial
  Codeberg snapshot.
- The resulting project has automated activity, community, license, release,
  repository-size, owner, and contributor evidence.
- Scheduled refresh updates Codeberg snapshots and preserves stale evidence on
  recoverable failure.
- GitHub catalog behavior remains unchanged except for approved
  provider-neutral schema and wording migrations.
- Same-provider duplicates are blocked.
- Cross-provider records remain independent without heuristic mirror matching.
- All repository gates and the live Codeberg smoke pass before issue #66 is
  closed.
