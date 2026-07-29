# Tavernary

Tavernary is a search and discovery catalog for AI roleplay tools. It indexes
public project information and links visitors to each creator's GitHub,
Codeberg, or curated source page. Tavernary does not host, mirror, redistribute,
or install cataloged project files.

This repository contains the historical intake file, curated registry,
generated repository snapshots, static Next.js site, submission forms, and the
automation that publishes the catalog.

Read the [Tavernary documentation](docs/README.md) for the product overview,
catalog guide, contribution paths, and local development setup.

The canonical registry contains 304 projects, with 302 currently published in
the browser catalog. Repository enrichment and editorial review may improve
summaries and capabilities without changing a project's primary function.

## Local development

Use Node.js 24 and install from the committed lockfile:

```powershell
npm ci
npm run dev
```

The primary verification commands are:

```powershell
npm run check
npm run test:e2e
npm run test:visual
```

`npm run check` validates formatting, lint, palette policy, curated records,
generated catalog data, TypeScript, unit tests, the production build, and the
static export. The visual commands assert browser layout and geometry without
committed screenshot baselines; locally generated Playwright snapshots are
ignored.
Playwright's first local run may also require:

```powershell
npx playwright install chromium
```

The Kit fixture proof is isolated from production catalog data:

```powershell
npm run build:test-kits
npm run test:kits-e2e
npm run test:kits-visual
```

The fixture builder leaves the deterministic Kit export in `out/` for the two
browser suites and restores `src/generated/catalog.json` from the production
registry before it exits.

For contributor-oriented setup and verification guidance, see
[docs/contributing/development-setup.md](docs/contributing/development-setup.md).

## Catalog data

Tavernary keeps four distinct layers:

- indexed repositories and source pages are the external destinations linked by
  each catalog card;
- catalog data lives in-repo under `data/`;
- site source lives under `src/`, `public/`, and `tests/`; and
- hosting is the static export in `out/`, deployed by GitHub Pages.

`data/catalog/projects.json` is the historical 213-row intake file. It is not a
runtime input. Canonical catalog records live in `data/registry/projects/`, and
source refreshes never edit those files. Provider-derived facts live in
`data/snapshots/github/` and `data/snapshots/codeberg/`, and
`npm run catalog:build` joins registry records, snapshots, and controlled
vocabularies into `src/generated/catalog.json`.
`data/snapshots/github-refresh.json` is the legacy-named provider refresh
manifest; it records aggregate and provider-isolated counts, API usage, timings,
and the catalog-wide refresh timestamp for the latest completed run.

Registry records use schema version 5. Every record carries
`metadata_status: "curated"` or `"provisional"`. Provisional GitHub records may
publish with `source.repository_id: null` until a successful refresh and
identity backfill fill the immutable GitHub repository ID.

Frontends and Extensions require a public GitHub or Codeberg repository.
System Presets may use another stable public HTTPS page. Non-GitHub presets are
manually processed once and use `refresh_policy: paused`. Tavern RPG Suite is
the sole `github-organization` exception and also uses `refresh_policy: paused`.

Recent Activity sorts by the latest qualifying source change or release.
Sustained Activity sorts by the number of fixed UTC weeks with qualifying
source activity, then recency. `N/12` means activity occurred in N of the
current twelve Monday-based UTC weeks; it does not count or weight commits.
The twelve graph ticks run oldest to newest. A complete baseline with no
qualifying change reports no source activity in the last twelve weeks.

Snapshotless published repository records stay visible. The site renders them as
pending enrichment rather than as zero activity or verified missing metadata.
Every record already has an authoritative category: Frontends use `frontend`,
System Presets use `preset`, and Extensions use one of the six functional
categories.

## Refresh operations

Refresh every automatic repository source:

```powershell
npm run catalog:refresh -- --mode incremental
```

Refresh one exact source, using its current evidence to decide whether a
baseline is needed:

```powershell
npm run catalog:refresh -- --mode project --project-id mentallyquill-recursion
```

Process the next dynamically selected provisional baseline batch:

```powershell
npm run catalog:refresh -- --mode baseline --batch-size 12
```

Force one bounded Git inspection for diagnosis:

```powershell
npm run catalog:refresh -- --mode forensic --project-id mentallyquill-recursion
```

Backfill immutable repository IDs into provisional curated records after
successful refreshes:

```powershell
npm run catalog:backfill-identities -- --write
```

Rebuild the browser catalog artifact explicitly:

```powershell
npm run catalog:build
```

The scheduled repository workflow runs incremental refreshes once daily. Normal
incremental runs batch repository metadata, compare only changed heads, and
clone only when a baseline or bounded fallback is required. Manual dispatch
supports `incremental`, `baseline`, `project`, and `forensic`; `project_id` is
required for the last two modes, while `batch_size` is bounded to 1-24.

Every run validates the complete site before committing only
the exact GitHub and Codeberg snapshot directories and the global refresh
manifest. The action log
ends with outcome counts and bounded per-project timings, so fallback clone
time is visible. A successful snapshot commit explicitly dispatches Pages.
Baseline runs continue only while the manifest reports provisional evidence;
there is no index or fixed catalog-size ceiling.

### Quarantine and recovery

A repository-ID mismatch sets `source_health: identity-change` and removes the
entry from the public build. Confirmed deleted or private repositories also
stay out of the public build. Transient unavailable or rate-limited refreshes
preserve the last known good facts and record staleness instead of unpublishing
the project. Maintainers can also set `refresh_policy: paused` to stop automatic
processing or change `visibility` to hide or disable a record.

Before clearing a quarantine:

1. Confirm the canonical repository and its provider-local immutable repository
   ID.
2. Correct the curated record only when the identity is verified.
3. Run a single-project refresh.
4. Run `npm run catalog:backfill-identities -- --write` if the refresh restored
   a healthy repository identity.
5. Run `npm run check`.
6. Commit the curated correction and refreshed snapshot separately when both
   changed.

## Submissions and moderation

The **Submit Project** link opens Tavernary's static submission builder. Its
frontend choices come from the current catalog, and it prepares a structured
GitHub issue with a stable manifest. The native GitHub issue form remains
available as a readable fallback. Only Extension submissions choose a primary
function. That submitted Extension category is authoritative; Frontends and
System Presets receive their structural values automatically. Intake may add a
`classification-review` warning when source evidence suggests a mismatch, but
the model never changes the submitted value.

Automation normalizes the source, checks eligibility and obvious duplicates,
and prepares admitted submissions as a generated pull request. Duplicates close
before a PR is created, while correctable problems remain open with
`needs-information`. The generated PR is the sole maintainer review: maintainers
may correct the proposed registry record and snapshot directly, then merge to
publish and close the issue. Closing that PR without merging declines the
submission and applies `submission-declined`. No account, database service, or
runtime API is involved.

Frontend and Extension submissions require a public GitHub or Codeberg
repository.
External System Presets remain manually curated and publish with automatic
refresh paused. See the
[submission and review flow](docs/contributing/submission-and-review.md) and
[maintainer runbook](docs/maintenance/operations-runbook.md) for the complete
lifecycle and recovery procedure.

Kits are community-authored, ordered collections of 3-50 catalog projects.
The browser builder keeps drafts only in memory and hands a stable JSON
manifest to GitHub. Valid new Kits and edits publish automatically after triage
and a second validation in the apply workflow. Support is derived from eligible
`+1` reactions on the Kit's source issue; it is catalog evidence rather than a
user-rating system. Tavernary remains a static, build-time catalog with no
accounts, database service, or runtime API.

The [Help hub](/help/) is the contextual entry point for existing listings and
site support. It offers five ordinary public paths: **Manage your project
listing** (`/help/manage-project/`), **Report a project listing**
(`/help/report-project/`), **Report a website problem**
(`/help/report-website/`), **Report a Kit** (`/help/report-kit/`), and **Get
other help** (`/help/other/`). Ordinary report text is public on GitHub, so it
must not include secrets or private personal information. Tavernary does not
provide support for third-party projects; use the listed project's own
repository or support channel.

A verified personal GitHub repository owner can use the automated owner path
for that repository. Reviewed Tavernary owners, admins, and maintainers listed
by immutable GitHub ID in
`data/maintenance/trusted-tavernary-editors.json` may use the same reviewed
request for any card. A current trusted repository association is also
required; association alone does not grant authority. Automation creates
`automation/project-owner-request-<issue-number>` and a generated review PR.
Merging publishes the reviewed change; closing the PR without merge declines
it. Summary or capability edits switch enrichment to manual, while a
classification-only edit preserves the existing enrichment policy.
`refresh_policy` controls repository evidence collection, while
`enrichment_policy` controls model-written summary and capabilities; neither
allows enrichment to change `primary_function`.

For a Tavernary vulnerability, use the private security route
`/help/security/` or GitHub's private form at
`https://github.com/MentallyQuill/Tavernary/security/advisories/new`, never a
public issue.

See the [contribution overview](docs/contributing/contribution-overview.md) for
issue-form routing and contribution boundaries.

## GitHub Pages

Repository settings must use **GitHub Actions** as the Pages source. The
`Deploy Pages` workflow validates the project, builds the static export with
the repository base path, uploads `out/`, and deploys the `github-pages`
environment. It can be dispatched manually for recovery.

The first public URL is the GitHub Pages project URL. The planned primary
domain is `tavernary.org`; adding it will require the Pages custom-domain and
DNS configuration, plus a committed `CNAME` if appropriate. Forwarding
`tavernary.net` to `tavernary.org` is external to this repository and must be
configured with the domain or DNS provider.
