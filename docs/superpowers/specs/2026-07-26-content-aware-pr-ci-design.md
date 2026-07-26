# Content-Aware Pull Request CI Design Contract

## Purpose

Tavernary's existing `Site: Validate changes` workflow runs the complete static,
unit, browser, Windows visual, and Kit test stack for every pull request. That
is appropriate for application changes, but it makes routine catalog proposals
prove more than 800 unrelated checks before maintainers can merge them.

The workflow will route routine published-content changes through a smaller
content validation stack while preserving the complete stack for application
changes. This is an internal change to `.github/workflows/ci.yml`, not a new
GitHub Action or a replacement for Tavernary's existing project submission,
Kit, catalog maintenance, or deployment workflows.

## Scope

This design changes only pull request validation behavior and the repository
code and tests needed to support it.

The following existing workflows remain behaviorally unchanged:

- project submission admission, triage, generation, and lifecycle;
- Kit submission, publication, editing, and withdrawal;
- catalog refresh, enrichment, and repository-identity backfill;
- GitHub Pages deployment.

The project submission workflow's existing explicit dispatch of `ci.yml`
continues to work. The CI workflow classifies that dispatched branch against
`main`, so action-created pull requests receive the same content route as
ordinary pull request events.

## Routing Policy

The workflow has two routes:

- `content`: every changed file is routine published catalog content;
- `full`: at least one changed file is outside the content allowlist, the diff
  is empty, or classification cannot be completed safely.

The content allowlist is:

- `data/registry/projects/*.json`;
- `data/registry/kits/*.json`;
- `data/snapshots/github/*.json`;
- `data/snapshots/github/kits/*.json`;
- `data/snapshots/github-refresh.json`;
- `data/vocabularies/*.json`.

This covers extension, frontend, and preset records; Kit submissions and edits;
GitHub project and Kit snapshots; the refresh manifest; and controlled
vocabulary updates.

The following remain full-CI changes:

- source code, scripts, tests, and configuration;
- GitHub workflows;
- schemas, because they change validation behavior;
- moderation data, because it changes an abuse-control boundary;
- enrichment reports, which are operational ledgers rather than published site
  content;
- historical intake data under `data/catalog`;
- documentation and all other unrecognized paths.

The policy evaluates the complete diff. A mixed content-and-code pull request
always receives the full route. Branch names, labels, authors, and pull request
titles do not grant the content route.

## Classifier

A small repository-owned Node module will classify a list of changed paths. It
will be the single source of truth for the allowlist and will expose a pure
function for unit testing plus a command-line entry point for CI.

The classifier will:

1. normalize Git path separators to `/`;
2. reject empty paths and paths that escape or do not match the allowlist;
3. return `content` only when every path matches;
4. return `full` for empty input and any unknown input;
5. emit a GitHub Actions output when invoked by the workflow.

For `pull_request` events, CI compares the event's base SHA with its head SHA.
For `workflow_dispatch`, CI fetches `main`, finds the merge base with the
dispatched branch, and classifies the resulting diff. Failure to obtain either
diff falls back to `full`.

Classification runs inside the existing Linux `verify` job before dependency
installation. No third-party path-filter Action or additional routing workflow
is introduced.

## Content Validation Stack

The existing `verify` job keeps its stable name. On the `content` route it runs:

1. repository formatting validation;
2. complete catalog schema, identity, duplicate, relationship, and Kit
   validation;
3. catalog generation;
4. focused catalog build, full-data, Kit, and static-export unit tests;
5. a production static build;
6. static-export verification;
7. one focused Chromium static-export smoke suite proving that the catalog
   renders at the configured GitHub Pages base path, that every public card has
   a canonical external link, and that intake-only metadata is absent.

The exact focused unit file list will be owned by one package script so the
workflow does not become a second test-selection table.

The content route does not run application component tests, the complete
browser suite, Windows screenshot comparisons, or deterministic Kit Builder UI
fixtures. Those checks protect code and presentation behavior that content-only
diffs cannot alter.

## Full Validation Stack

The `full` route preserves the existing checks:

- `npm run check`;
- the complete browser suite;
- the Windows catalog visual suite;
- the deterministic Kit fixture build, functional browser suite, and visual
  suite.

The Windows `visual` job runs only when the classifier returns `full`. Unknown
or failed classification therefore increases coverage instead of reducing it.

## Durable Catalog Assertions

Current tests freeze global totals such as `211 projects`, exact kind
distributions, and exact GitHub-source totals. Those assertions make every
legitimate catalog addition require unrelated test edits and would leave the
next full CI run stale after a content-only merge.

The implementation will replace frozen totals with dataset-derived expectations
or durable invariants:

- registry IDs are unique;
- every eligible registry record produces one public catalog entry;
- output is sorted and contains only supported statuses;
- kind, source, and enrichment-policy values are valid;
- known manual records retain their explicit manual-source contract;
- rendered headings and card counts equal the generated catalog length;
- every rendered public card has a canonical external URL.

Exact counts remain only where the number itself is a product rule or a
purpose-built fixture contract, such as Kit size limits or a fixed test fixture.

## Error Handling

- Empty or malformed changed-path input selects `full`.
- A missing base or head commit selects `full`.
- Any unrecognized or mixed path selects `full`.
- Content validation failures fail the stable `verify` job normally.
- The visual job is skipped only after successful `content` classification.
- Manual dispatch on `main` with no branch diff selects `full`.

No CI result is inferred from a branch prefix, issue label, or untrusted pull
request text.

## Testing

Classifier unit tests will cover:

- each allowed content family;
- extensions, frontends, and presets sharing the project-record path;
- Kit records and Kit snapshots;
- multiple allowed content files;
- mixed content and source files;
- schemas, moderation, reports, historical intake, workflows, and docs;
- empty input, blank paths, traversal-like paths, and Windows separators.

Workflow contract tests will prove:

- the existing workflow and `verify` job names remain stable;
- pull request and manual-dispatch diffs are both classified;
- content and full steps are mutually routed;
- the Windows visual job requires the full route;
- existing permissions remain read-only;
- no new external path-filter Action is introduced.

The implementation will use a red-green-refactor sequence: classifier and
workflow tests must fail against the current workflow before production changes
are made.

## Success Criteria

- A generated extension, frontend, or preset proposal runs the content stack
  without the complete 800-plus-test matrix.
- A content-only Kit or catalog-maintenance pull request receives the same
  content stack.
- A mixed or application pull request receives every existing full-CI check.
- Existing submission and maintenance Actions are unchanged.
- A content-only merge does not make the next full CI run fail because of stale
  global catalog totals.
- The focused content stack validates, builds, exports, and renders the real
  catalog successfully.
