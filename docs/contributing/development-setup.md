# Development setup

Tavernary is a static Next.js application with catalog-building and GitHub
automation scripts. Local development uses Node.js 24 and the committed npm
lockfile.

## Install and run the site

```powershell
npm ci
npm run dev
```

The development server serves the catalog application. The production build
generates the static export that GitHub Pages deploys.

## Core verification

Run the full repository gate before opening a pull request:

```powershell
npm run check
```

This validates formatting, lint, palette policy, catalog data, TypeScript, unit
tests, the production build, and the static export.

For browser verification, install Chromium once if needed and run:

```powershell
npx playwright install chromium
npm run test:e2e
npm run test:visual
```

The visual commands verify layout and geometry without committed screenshot
baselines. Any Playwright snapshots generated during local investigation are
ignored.

Use focused Vitest or Playwright commands while iterating, then run the full
gate before handing off the change.

## Kits fixture verification

Kits browser tests use a deterministic fixture export isolated from production
catalog data:

```powershell
npm run build:test-kits
npm run test:kits-e2e
npm run test:kits-visual
```

The fixture builder writes the test export under `out/` and restores the
production generated catalog when it exits.

## Data boundaries

Do not hand-edit generated output. The important boundaries are:

- `data/registry/projects/` - canonical human-authored project records;
- `data/snapshots/github/` - machine-authored GitHub facts;
- `data/snapshots/codeberg/` - machine-authored Codeberg facts;
- `data/catalog/projects.json` - historical intake preserved for migration and
  auditability;
- `src/generated/catalog.json` - generated browser-ready catalog data; and
- `src/`, `public/`, and `tests/` - application source, assets, and verification.

When a change affects catalog data, use the relevant validation or build script
and inspect the resulting diff before committing.

## Windows notes

PowerShell execution-policy settings may block the `npm` and `npx` script
shims. In that case, use `npm.cmd` and `npx.cmd` for the same commands.

The repository's [contribution overview](contribution-overview.md) explains
which changes belong in issues, pull requests, or private security reports.
