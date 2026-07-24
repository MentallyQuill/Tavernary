# Tavernary

Tavernary is a search and discovery catalog for AI roleplay tools. It indexes
public project information and links visitors to each creator's GitHub
repository or source page. Tavernary does not host, mirror, redistribute, or
install cataloged project files.

This repository contains the curated registry, generated GitHub snapshots,
static Next.js site, submission forms, and automation that publish the catalog.
The current production vertical slice contains five projects.

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

`npm run check` validates formatting, lint, curated records, generated catalog
data, TypeScript, unit tests, the production build, and the static export.
Playwright's first local run may also require:

```powershell
npx playwright install chromium
```

## Catalog data

Curated records live in `data/registry/projects/`. Source refreshes never edit
those files. GitHub-derived facts live in `data/snapshots/github/`, and
`npm run catalog:build` joins both layers into the browser artifact.

Frontends and Extensions require a public `github.com/owner/repository` source.
System Presets may use another stable public HTTPS page. Non-GitHub presets are
manually processed once and use `refresh_policy: paused`.

Recent Activity sorts by the latest meaningful commit. Activity Strength is the
number of active weeks in the last 12 weeks, with commit recency used as the
tiebreaker. More than 12 weeks without a meaningful commit is dormant.

## Refresh operations

Refresh every automatic GitHub source:

```powershell
npm run catalog:refresh -- --mode incremental
```

Refresh one source:

```powershell
npm run catalog:refresh -- --project-id mentallyquill-recursion
```

Process a bounded backfill batch:

```powershell
npm run catalog:refresh -- --mode backfill --start-index 0 --batch-size 20
```

The scheduled GitHub workflow runs incremental refreshes once daily. Its manual
dispatch supports the same mode, start index, batch size, and optional project
ID inputs. It validates the complete site before committing only changed
snapshot files, then explicitly dispatches the Pages deployment.

### Quarantine and recovery

A repository-ID mismatch sets `source_health: identity-change` and removes the
entry from the public build. An unavailable or rate-limited source preserves
the last known good facts and records staleness. Curators can also set
`refresh_policy: paused` to stop automatic processing or change `visibility`
to hide or disable a record.

Before clearing a quarantine:

1. Confirm the canonical repository and immutable GitHub repository ID.
2. Correct the curated record only when the identity is verified.
3. Run a single-project refresh.
4. Run `npm run check` and confirm the snapshot is healthy.
5. Commit the curated correction and refreshed snapshot separately when both
   changed.

## Submissions and moderation

The **Submit Project** link opens a structured GitHub issue. Automation checks
source eligibility and obvious duplicates, but never creates or edits a
production record. A curator must vet and add every accepted entry.

The Help chooser provides project-information reports, website bug reports,
help requests, a private security path, and an Other form. Curators can pause
refreshes, hide entries, or remove them when a source becomes unsafe or
abusive.

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
