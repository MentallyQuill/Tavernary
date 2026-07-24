# Tavernary

Tavernary is a search and discovery catalog for AI roleplay tools. It indexes
public project information and links visitors to each creator's GitHub
repository or source page. Tavernary does not host, mirror, redistribute, or
install cataloged project files.

This repository contains the historical intake file, curated registry,
generated GitHub snapshots, static Next.js site, submission forms, and the
automation that publishes the catalog.

The public seed catalog contains 214 projects. Five records are curated and
209 are visibly provisional while repository enrichment and editorial review
continue.

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

Tavernary keeps four distinct layers:

- indexed repositories and source pages are the external destinations linked by
  each catalog card;
- catalog data lives in-repo under `data/`;
- site source lives under `src/`, `public/`, and `tests/`; and
- hosting is the static export in `out/`, deployed by GitHub Pages.

`data/catalog/projects.json` is the historical 213-row intake file. It is not a
runtime input. Canonical catalog records live in `data/registry/projects/`, and
source refreshes never edit those files. GitHub-derived facts live in
`data/snapshots/github/`, and `npm run catalog:build` joins registry records,
snapshots, and controlled vocabularies into `src/generated/catalog.json`.

Registry records use schema version 2. Every record carries
`metadata_status: "curated"` or `"provisional"`. Provisional GitHub records may
publish with `source.repository_id: null` until a successful refresh and
identity backfill fill the immutable GitHub repository ID.

Frontends and Extensions require a public `github.com/owner/repository` source.
System Presets may use another stable public HTTPS page. Non-GitHub presets are
manually processed once and use `refresh_policy: paused`. Tavern RPG Suite is
the sole `github-organization` exception and also uses `refresh_policy: paused`.

Recent Activity sorts by the latest meaningful commit. Activity Strength is the
number of active weeks in the last 12 weeks, with commit recency used as the
tiebreaker. More than 12 weeks without a meaningful commit is dormant.

Snapshotless published GitHub records stay visible. The site renders them as
pending enrichment rather than as zero activity or verified missing metadata.
Imported seed records also remain visibly `uncategorized` until a maintainer
replaces the provisional editorial metadata.

## Refresh operations

Audit the deterministic seed migration:

```powershell
npm run catalog:migrate
```

After the seed files exist, this is a rerunnable audit command. A healthy rerun
should report `writes_required: 0`.

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

Backfill immutable repository IDs into provisional curated records after
successful refreshes:

```powershell
npm run catalog:backfill-identities -- --write
```

Rebuild the browser catalog artifact explicitly:

```powershell
npm run catalog:build
```

The scheduled GitHub workflow runs incremental refreshes once daily. Its manual
dispatch supports the same mode, start index, batch size, and optional project
ID inputs. It validates the complete site before committing only changed
snapshot files, then explicitly dispatches the Pages deployment.

### Quarantine and recovery

A repository-ID mismatch sets `source_health: identity-change` and removes the
entry from the public build. Confirmed deleted or private repositories also
stay out of the public build. Transient unavailable or rate-limited refreshes
preserve the last known good facts and record staleness instead of unpublishing
the project. Curators can also set `refresh_policy: paused` to stop automatic
processing or change `visibility` to hide or disable a record.

Before clearing a quarantine:

1. Confirm the canonical repository and immutable GitHub repository ID.
2. Correct the curated record only when the identity is verified.
3. Run a single-project refresh.
4. Run `npm run catalog:backfill-identities -- --write` if the refresh restored
   a healthy repository identity.
5. Run `npm run check`.
6. Commit the curated correction and refreshed snapshot separately when both
   changed.

## Submissions and moderation

The **Submit Project** link opens a structured GitHub issue. Automation checks
source eligibility and obvious duplicates, but never creates or edits a
production record. A maintainer must vet and add every accepted entry.

Kits are community-authored, ordered collections of 3â€“50 catalog projects.
The browser builder keeps drafts only in memory and hands a stable JSON
manifest to GitHub. New Kits and edits are validated automatically, but a
maintainer publishes them only after review. Support is derived from eligible
`+1` reactions on the Kit's source issue; it is catalog evidence rather than
a user-rating system. Tavernary remains a static, build-time catalog with no
accounts, database service, or runtime API.

The Help chooser provides project-information reports, website bug reports,
help requests, a private security path, and an Other form. Maintainers can pause
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
