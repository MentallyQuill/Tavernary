# Tavernary Production Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Tavernary catalog mockup into a production-quality,
static Next.js application hosted on GitHub Pages, driven by a validated,
GitHub-refreshed project registry.

**Architecture:** Tavernary is a static catalog, not a hosted application
backend. Human-curated project records and generated repository snapshots live
in version control; GitHub Actions validates and enriches them before Next.js
builds a static export. The browser receives normalized catalog data and handles
search, filters, sorting, responsive layout, and URL query state locally.

**Tech Stack:** Node.js 24 LTS, npm, Next.js App Router with static export,
React, TypeScript, plain CSS, JSON Schema with Ajv, Vitest, Testing Library,
Playwright, GitHub Actions, and GitHub Pages.

## Global Constraints

- The production frontend must reproduce the approved `v7` mockup exactly in
  appearance, spacing, copy, information hierarchy, responsive behavior, and
  interaction behavior. This is a transcription into maintainable components,
  not an opportunity to redesign it.
- The homepage opens directly into the searchable catalog. There is no splash
  page or promotional hero.
- Tavernary does not host project packages. It indexes, normalizes, validates,
  and links to canonical project sources.
- There is no runtime server, account system, production database, rating
  system, review system, comment system, or internal project details page in
  the initial release.
- The whole project card opens the canonical repository or source page.
- Popularity is an optional sort based only on
  `stargazers_count + forks_count + subscribers_count`; it is not the default
  and is not represented as quality.
- Project Kind has exactly three values: `frontend`, `extension`, and `preset`.
  “System Presets” is the top-navigation label; “Preset” remains the singular
  project-kind label.
- A root `LICENSE*` file recognized as an OSI-approved license is shown by SPDX
  identifier. No root license is `Missing`. A present but unrecognized,
  source-available, custom, or restrictive license is `Proprietary`.
- Frontend compatibility selections use OR logic. Metadata selections use OR
  logic. Different filter groups combine with AND logic. With no filters,
  every project is visible.
- Generated files are never hand-edited. Human-authored records, generated
  snapshots, and browser-ready catalog output remain separate.
- Do not add Tailwind, a component library, a global state library, or an
  animation framework. The approved mockup already contains the required
  design system and can be reproduced with CSS and small React state helpers.

---

## 1. Authority Order and Existing Source Files

When two records disagree, use this order:

1. The approved `v7` mockup controls visual and interaction behavior.
2. The product design controls catalog semantics, provenance, activity,
   compatibility, and initial scope.
3. Focused design specifications explain approved refinements when the mockup
   alone does not make the intent clear.
4. Older implementation plans are historical context only.

### 1.1 Approved visual and behavioral reference

Current workspace source:

```text
.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html
```

Supporting logo copy:

```text
.superpowers/brainstorm/1335-1784816109/content/Tavernary_logo.png
```

Both files are currently ignored by `/.superpowers/`. They will not survive a
fresh clone or a new Git worktree. The first implementation task must copy them
unchanged into tracked reference locations:

```text
docs/reference/mockups/catalog-wall-responsive-v7.html
docs/reference/assets/tavernary-logo.png
```

The mockup includes base64-embedded logo data, its SVG symbol set, final CSS,
fourteen deterministic example cards, and the JavaScript behavior used during
design review. Keep the tracked HTML unchanged as the acceptance fixture. Do
not turn it into the production page and do not continue editing it after
production implementation begins.

The following original icon assets still exist outside the repository and
should also be copied into `docs/reference/assets/icons/` so their provenance is
not lost:

```text
C:/Users/Keptin/Downloads/memory.svg
C:/Users/Keptin/Downloads/generation.svg
C:/Users/Keptin/Downloads/feather.svg
C:/Users/Keptin/Downloads/d20.svg
C:/Users/Keptin/Downloads/preset.svg
C:/Users/Keptin/Downloads/collapse.svg
```

Production React icon components should be transcribed from these tracked
assets and the final mockup sprite. Production code must not refer to
`C:/Users/Keptin/Downloads` or `.superpowers`.

### 1.2 Product and design records

Primary semantic source:

```text
docs/superpowers/specs/2026-07-23-tavernary-product-design.md
```

Focused approved refinements:

```text
docs/superpowers/specs/2026-07-23-compact-catalog-controls-design.md
docs/superpowers/specs/2026-07-23-controlled-tag-taxonomy-design.md
docs/superpowers/specs/2026-07-23-project-licensing-design.md
docs/superpowers/specs/2026-07-23-quill-logo-spacing-design.md
docs/superpowers/specs/2026-07-23-card-identity-wordmark-alignment-design.md
```

The product design predates the final “System Presets” navigation item in one
section. The approved `v7` mockup wins on that visible navigation detail.

### 1.3 Existing catalog

The current file is not in the repository root. Its actual committed path is:

```text
data/catalog/projects.json
```

Current shape as of 2026-07-23:

- 211 candidate records;
- 202 GitHub repositories;
- 9 non-GitHub canonical sources;
- frontend coverage: SillyTavern 167, Lumiverse 25, Marinara Engine 21, and
  Sonder Engine 1;
- fields present on every record: `id`, `name`, `frontends`, `status`,
  `submission`, and `submitted_at`;
- optional fields: `repository`, `source_url`, `source_type`, `source_post`,
  and `tags`.

This is an intake list, not a complete production view model. Move it without
changing its contents to:

```text
data/intake/projects.json
```

Then migrate accepted records into one canonical file per project:

```text
data/registry/projects/<project-id>.json
```

Keeping one record per file avoids merge conflicts, produces readable pull
requests, and gives project submissions a stable review boundary. The original
211-record intake file remains preserved for provenance and conversion status.

## 2. Locked Visual and Functional Contract

### 2.1 Palette

Use these exact tokens:

| Role | Value |
| --- | --- |
| Page background | `#07181D` |
| Primary surface | `#0B2229` |
| Card surface | `#102B33` |
| Raised or active surface | `#173740` |
| Border | `#284A52` |
| Strong border | `#3B6068` |
| Primary text | `#F3F1E8` |
| Secondary text | `#CBD6D3` |
| Missing, proprietary, or muted | `#6F7E82` |
| Tavernary and Extension | `#E18A24` |
| Frontend | `#D62839` |
| Preset and fresh activity | `#57C5A3` |

Retain the mockup’s `8px` radius and Inter-first font stack. Ship Inter through
`@fontsource-variable/inter` so the rendered result does not depend on a
visitor having Inter installed.

Only icons receive the category accent colors in the top navigation. Their
text remains the same near-white as “All Projects.” Project-kind color appears
on card type symbols and Project Kind checkbox outlines, not across whole card
surfaces. Frontends uses crimson, System Presets uses mint, and all six
functional-category icons use heritage orange.

### 2.2 Header and navigation

The production header contains:

- `Tavernary` in heritage orange;
- the exact tagline `Where AI roleplay tools gather`;
- the approved inkwell-and-quill image positioned to the right of the
  wordmark block;
- universal search with `/` keyboard focus;
- `About`;
- `Submit Project`, capitalized exactly and colored heritage orange.

The desktop category bar, in order:

1. All Projects
2. Frontends
3. System Presets
4. Memory & Retrieval
5. Generation & Reasoning
6. Character & Worldbuilding
7. RPG Systems & Suites
8. Interface & Workflow
9. Developer Infrastructure

The bar has no native horizontal scrollbar. Mobile replaces it with the
approved compact `Browse / All Projects` selector.

### 2.3 Filters and catalog controls

Desktop uses the left filter rail. Mobile uses the full-width filter sheet
opened by the symbol-only filter button.

Filter groups:

- Compatible Frontend, with a search field, SillyTavern, Lumiverse, and
  Marinara visible by default, plus a clickable `+N more frontends` expansion;
- Project Kind, with colored checkbox outlines and no separate color dots;
- Capabilities & Characteristics, as a wrapping non-scrolling chip cloud;
- Development;
- License.

The capability cloud displays approximately four rows when collapsed. Its
button reads `+ N more tags`; expanded state reads `Show fewer tags`. Selected
tags remain visible, appear first, and use a checkmark, raised surface, strong
border, and primary text. Searching tags changes only the available tag cloud;
it does not filter cards until a tag is selected.

The catalog toolbar contains:

- result count;
- compact/standard card density toggle using the approved collapse icon;
- `Catalog refreshed <relative time>` as a subtitle, not a boxed status;
- mobile filter button;
- All, Active, New, and Released segmented views;
- sort choices: Recently active, Popularity, and Alphabetical.

View semantics:

- `All`: no lifecycle-view restriction;
- `Active`: last meaningful source change is within 30 days;
- `New`: the project’s accepted catalog date is within 30 days;
- `Released`: the most recent release or preset publication is within 30 days.

### 2.4 Cards

Standard cards contain:

- function icon and project kind at upper left with the icon’s left edge
  aligned to the title and an `8px` icon-to-label gap;
- active-weeks ratio and miniature graph in the upper-right header, immediately
  left of the last meaningful commit age or preset source age;
- GitHub community aggregate and repository size on the second header row when
  available;
- title;
- summary clamped to four lines, with no expansion control;
- up to two visible rows of chips;
- every compatible frontend as leading chips;
- OSI SPDX identifier, `Proprietary`, or `Missing` at bottom right.

Cards contain no project artwork or banners. This keeps the catalog uniform,
avoids moderation overhead, and does not penalize repositories without visual
assets.

Compact cards contain only:

- one-line icon, kind, activity ratio/graph, and recency header;
- title;
- one chip row;
- license.

Compact cards omit summary, aggregate score, repository size, and a second chip
row. The type icon has no surrounding box in either card density.

Tooltips must cover:

- activity: `Active 7 of the last 12 weeks`;
- recency: `Last commit 12d ago`;
- community aggregate: individual stars, forks, and subscribers/watchers;
- repository size;
- frontend chips: `Compatible with SillyTavern`;
- capability chips: `Contains Tracking Features`;
- licenses: `MIT, OSI-approved open-source license`, `License missing`, or
  `Proprietary license`.

Fresh recency starts at `#57C5A3` for Today and interpolates toward `#6F7E82`
over 30 days. License labels use secondary text for OSI-approved licenses and
muted text for both Missing and Proprietary. Labels and tooltips, not color
alone, distinguish the latter two states.

GitHub projects display:

```text
community_score =
  stargazers_count + forks_count + subscribers_count
```

Do not use GitHub’s `watchers_count`; it duplicates the star count. Non-GitHub
presets replace repository-specific metrics with version, source age, and
artifact size when those fields are known.

### 2.5 Interaction and responsive behavior

- Search covers names, aliases, summaries, maintainers, repositories,
  frontends, project kind, primary function, and controlled tags.
- Search, category, lifecycle view, sort, frontend filters, kind filters, and
  metadata filters compose without clearing one another.
- Frontends selected together are OR. Kinds selected together are OR. Tags
  selected together are OR. Filter groups and the selected category are AND.
- Selected filters appear as removable active-query chips.
- Query state is encoded in `URLSearchParams` and restored on reload and shared
  links.
- Recently active is the default sort. Popularity places unscored projects
  after scored projects and preserves stable ordering on ties.
- Reordering uses restrained CSS transitions and never loses current filters.
- Activity bars animate once when revealed.
- `prefers-reduced-motion: reduce` removes nonessential animation.
- Cards remain keyboard-accessible external links with visible focus.
- Desktop, tablet, and mobile must not gain a horizontal page scrollbar.
- The prototype-only Desktop/Mobile preview toggle is not included in
  production.

## 3. Target Repository Structure

The root should contain only project-wide configuration and these clear
top-level directories:

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── project-submission.yml
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy-pages.yml
│   │   └── refresh-catalog.yml
│   ├── CODEOWNERS
│   ├── SECURITY.md
│   ├── dependabot.yml
│   └── pull_request_template.md
├── data/
│   ├── intake/
│   │   └── projects.json
│   ├── registry/
│   │   └── projects/
│   │       └── <project-id>.json
│   ├── schemas/
│   │   ├── project.schema.json
│   │   └── repository-snapshot.schema.json
│   ├── snapshots/
│   │   └── github/
│   │       └── <project-id>.json
│   └── vocabularies/
│       ├── capabilities.json
│       ├── frontends.json
│       └── primary-functions.json
├── docs/
│   ├── architecture/
│   │   ├── production-development-handoff.md
│   │   ├── catalog-data-model.md
│   │   └── github-refresh-methodology.md
│   ├── reference/
│   │   ├── assets/
│   │   │   ├── icons/
│   │   │   └── tavernary-logo.png
│   │   └── mockups/
│   │       └── catalog-wall-responsive-v7.html
│   └── superpowers/
│       ├── plans/
│       └── specs/
├── public/
│   └── brand/
│       └── tavernary-logo.png
├── scripts/
│   ├── catalog/
│   │   ├── build.mjs
│   │   ├── migrate-intake.mjs
│   │   ├── refresh-github.mjs
│   │   └── validate.mjs
│   └── verify-static-export.mjs
├── src/
│   ├── app/
│   │   ├── about/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── icon.png
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── icons/
│   │   │   ├── category-icon.tsx
│   │   │   ├── community-icon.tsx
│   │   │   ├── density-icon.tsx
│   │   │   └── filter-icon.tsx
│   │   └── ui/
│   │       ├── tooltip.tsx
│   │       └── visually-hidden.tsx
│   ├── features/
│   │   └── catalog/
│   │       ├── components/
│   │       │   ├── active-query.tsx
│   │       │   ├── activity-sparkline.tsx
│   │       │   ├── catalog-page.tsx
│   │       │   ├── catalog-toolbar.tsx
│   │       │   ├── category-navigation.tsx
│   │       │   ├── filter-panel.tsx
│   │       │   ├── frontend-filter.tsx
│   │       │   ├── metadata-filter.tsx
│   │       │   ├── project-card.tsx
│   │       │   ├── project-grid.tsx
│   │       │   └── site-header.tsx
│   │       ├── catalog-query.ts
│   │       ├── catalog-selectors.test.ts
│   │       ├── catalog-selectors.ts
│   │       ├── catalog-types.ts
│   │       └── use-catalog-query.ts
│   ├── generated/
│   │   └── catalog.json
│   ├── lib/
│   │   ├── catalog/
│   │   │   ├── load-catalog.ts
│   │   │   └── relative-time.ts
│   │   └── github/
│   │       ├── activity.ts
│   │       ├── license.ts
│   │       └── repository-metrics.ts
│   └── styles/
│       ├── catalog.css
│       ├── motion.css
│       ├── responsive.css
│       └── tokens.css
├── tests/
│   ├── e2e/
│   │   ├── catalog.spec.ts
│   │   ├── mobile.spec.ts
│   │   └── static-export.spec.ts
│   ├── fixtures/
│   │   └── visual-catalog.json
│   └── visual/
│       ├── catalog.visual.spec.ts
│       └── catalog.visual.spec.ts-snapshots/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .prettierignore
├── CONTRIBUTING.md
├── eslint.config.mjs
├── LICENSE
├── next.config.ts
├── package-lock.json
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.json
├── vitest.config.ts
└── vitest.setup.ts
```

`src/generated/catalog.json` is produced by `npm run catalog:build` and ignored
by Git. Keep `src/generated/.gitkeep` tracked so the destination exists in a
fresh checkout. `data/snapshots/github/*.json` is committed because it
preserves the last known successful upstream values and makes a deployed
catalog reproducible.

Do not add a nested `site/` directory. Tavernary is one application, so placing
the Next.js project at the repository root avoids a second package root and
keeps GitHub Actions, dependency updates, and local commands straightforward.

## 4. Naming and File Conventions

- Directories and non-component files: lowercase kebab-case.
- React component filenames: lowercase kebab-case; exports: PascalCase.
- TypeScript functions and values: camelCase.
- TypeScript types and interfaces: PascalCase.
- Constants shared across modules: SCREAMING_SNAKE_CASE.
- CSS custom properties: semantic kebab-case such as
  `--color-surface-card`, never names such as `--blue-3`.
- JSON keys: snake_case to preserve the existing catalog style.
- Project, frontend, tag, and relationship identifiers: lowercase kebab-case.
- Canonical record filename equals its `id`: `recursion.json`.
- GitHub snapshot filename equals the Tavernary project ID, not the repository
  owner/name, so renames do not orphan history.
- Timestamps: UTC ISO 8601 strings ending in `Z`.
- SPDX identifiers: canonical casing, such as `MIT`, `Apache-2.0`, and
  `AGPL-3.0-only`.
- Boolean fields describe facts (`archived`, `has_release`), not vague state.
- Avoid `utils.ts`, `helpers.ts`, `common.ts`, and barrel `index.ts` files.
  Name modules for their single responsibility.
- Controlled tags are identical in records, card chips, and filter chips.
  There is no hidden display-name mapping layer.

## 5. Data Boundaries and Interfaces

### 5.1 Curated project record

`data/registry/projects/<id>.json` is human-authored and validated by
`data/schemas/project.schema.json`. Its required conceptual fields are:

```ts
type ProjectKind = "frontend" | "extension" | "preset";

type PrimaryFunction =
  | "frontend"
  | "memory-retrieval"
  | "generation-reasoning"
  | "character-worldbuilding"
  | "rpg-systems"
  | "interface-workflow"
  | "developer-infrastructure";

type CanonicalSource =
  | { kind: "github"; owner: string; repository: string; url: string }
  | { kind: "website" | "discord" | "community"; url: string };

interface ProjectRecord {
  schema_version: 1;
  id: string;
  name: string;
  aliases: string[];
  kind: ProjectKind;
  primary_function: PrimaryFunction;
  summary: string;
  canonical_source: CanonicalSource;
  frontends: string[];
  capabilities: string[];
  compatibility: CompatibilityRecord[];
  relationships: ProjectRelationship[];
  maintainers: Maintainer[];
  requirements: TechnicalRequirements;
  announcements: Announcement[];
  lifecycle:
    | "experimental"
    | "active"
    | "maintenance-only"
    | "deprecated"
    | "superseded"
    | "archived";
  accepted_at: string;
  submitted_at: string;
  submission_source?: string;
}

interface CompatibilityRecord {
  frontend_id: string;
  implementation:
    | "native"
    | "ported"
    | "forked"
    | "cross-platform";
  status:
    | "verified"
    | "maintainer-reported"
    | "community-reported"
    | "experimental"
    | "planned"
    | "broken"
    | "unknown";
  minimum_version: string | null;
  maximum_version: string | null;
  evidence_url: string | null;
  checked_at: string | null;
  modes: string[];
  runtime: "browser" | "server" | "full-stack" | "external";
}

interface ProjectRelationship {
  type:
    | "fork-of"
    | "port-of"
    | "based-on"
    | "successor-to"
    | "superseded-by"
    | "rewrite-of"
    | "bundles"
    | "requires"
    | "optional-integration";
  target_project_id: string;
  evidence_url: string;
}

interface Maintainer {
  name: string;
  url: string | null;
}

interface TechnicalRequirements {
  automatic_model_calls: boolean | null;
  external_providers: string[];
  local_companion_server: boolean | null;
  runtimes: string[];
  installation_method: string | null;
  supported_languages: string[];
}

interface Announcement {
  title: string;
  source_url: string;
  published_at: string;
  discovered_at: string;
}
```

Compatibility and relationship evidence is part of the canonical record, but
repository measurements are not. Do not collapse canonical source,
compatibility, and GitHub snapshot data into one ambiguous object.

### 5.2 Generated repository snapshot

`data/snapshots/github/<id>.json` is machine-authored:

```ts
interface RepositorySnapshot {
  schema_version: 1;
  project_id: string;
  repository: {
    owner: string;
    name: string;
    url: string;
    default_branch: string;
    archived: boolean;
    size_kb: number;
  };
  activity: {
    last_meaningful_commit_at: string | null;
    active_weeks_12: number;
    meaningful_commits_30d: number;
    meaningful_commits_90d: number;
    additions_90d: number;
    deletions_90d: number;
    release_at: string | null;
  };
  community: {
    stargazers_count: number;
    forks_count: number;
    subscribers_count: number;
    aggregate: number;
  };
  license: {
    status: "osi-approved" | "proprietary" | "missing";
    spdx_id: string | null;
    source_path: string | null;
  };
  refreshed_at: string;
  stale_since: string | null;
}
```

Meaningful activity excludes documentation-only, lockfile-only, generated,
vendored, formatting-only, and merge-only changes. The refresh script records
which default branch was inspected and preserves the prior snapshot when the
upstream request fails.

### 5.3 Browser-ready catalog

`scripts/catalog/build.mjs` joins curated records, controlled vocabularies, and
snapshots into `src/generated/catalog.json`. `src/app/page.tsx` reads that file
at build time and passes it to the client-side `CatalogPage`. Visitors never
call the GitHub API.

The browser-ready card record has already-computed display facts, including:

- canonical URL;
- normalized searchable text;
- frontend and capability labels;
- license display label and tooltip;
- activity ratio and six display-bar heights;
- relative-time timestamp source;
- community aggregate;
- repository or artifact size;
- catalog refresh timestamp.

Use this stable boundary between the build pipeline and React:

```ts
interface CatalogProject {
  id: string;
  name: string;
  kind: ProjectKind;
  primaryFunction: PrimaryFunction;
  summary: string;
  canonicalUrl: string;
  acceptedAt: string;
  lifecycle: ProjectRecord["lifecycle"];
  frontends: Array<{ id: string; label: string }>;
  capabilities: Array<{ id: string; label: string }>;
  searchableText: string;
  activity: {
    lastMeaningfulCommitAt: string | null;
    activeWeeks12: number | null;
    sparklineBars: [number, number, number, number, number, number] | null;
    latestReleaseAt: string | null;
  };
  community: {
    stars: number;
    forks: number;
    subscribers: number;
    aggregate: number;
  } | null;
  repositorySizeKb: number | null;
  license: {
    status: "osi-approved" | "proprietary" | "missing";
    label: string;
    tooltip: string;
  };
  preset: {
    version: string | null;
    publishedAt: string | null;
    artifactSizeBytes: number | null;
  } | null;
  refreshedAt: string;
  staleSince: string | null;
}
```

Compute relative text such as `12d ago` in the browser from absolute timestamps
so it does not become stale between deployments.

### 5.4 URL query state

Use one explicit query shape:

```ts
type CatalogCategory =
  | "all"
  | "frontend"
  | "preset"
  | Exclude<PrimaryFunction, "frontend">;

type CatalogView = "all" | "active" | "new" | "released";
type CatalogSort = "recent" | "popularity" | "alphabetical";

interface CatalogQuery {
  search: string;
  category: CatalogCategory;
  view: CatalogView;
  sort: CatalogSort;
  frontends: string[];
  kinds: ProjectKind[];
  capabilities: string[];
}

interface CatalogQueryController {
  query: CatalogQuery;
  replace(next: CatalogQuery): void;
  patch(next: Partial<CatalogQuery>): void;
  clearAll(): void;
}
```

## 6. Static Next.js and GitHub Pages Configuration

Next.js must use `output: "export"` and emit `out/`. Static export supports
build-time Server Components but not runtime server features such as Server
Actions, redirects, ISR, or default image optimization. Use
`images.unoptimized: true` and `trailingSlash: true`.

`next.config.ts` owns the project-page base path:

```ts
import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isProjectPage =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName.length > 0 &&
  !repositoryName.endsWith(".github.io");
const basePath = process.env.TAVERNARY_BASE_PATH ??
  (isProjectPage ? `/${repositoryName}` : "");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
```

Tests must cover both an empty base path and `/Tavernary`. A future custom
domain can set `TAVERNARY_BASE_PATH` to an empty value through an explicit
workflow variable and a small config adjustment; it does not require changing
components.

Use Node.js 24 in `.nvmrc`, local development, and Actions. Node 24 is an LTS
line as of this handoff, while Next.js currently requires Node 20.9 or newer.

Official references:

- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 7. Package Scripts

Define these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "npm run catalog:build && next dev",
    "build": "npm run catalog:build && next build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test tests/e2e",
    "test:visual": "playwright test tests/visual",
    "catalog:migrate": "node scripts/catalog/migrate-intake.mjs",
    "catalog:validate": "node scripts/catalog/validate.mjs",
    "catalog:refresh": "node scripts/catalog/refresh-github.mjs",
    "catalog:build": "node scripts/catalog/build.mjs",
    "verify:export": "node scripts/verify-static-export.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run catalog:validate && npm test && npm run build && npm run verify:export"
  }
}
```

Use npm and commit `package-lock.json`. Add `"engines": { "node": ">=24 <25" }`
and a `packageManager` value generated by the installed npm version.

## 8. Required GitHub Workflows

Use only first-party GitHub actions in the initial workflows:

- `actions/checkout@v6`
- `actions/setup-node@v6`
- `actions/configure-pages@v5`
- `actions/upload-pages-artifact@v4`
- `actions/deploy-pages@v4`

When implementation begins, pin each action to its current full commit SHA and
retain the major version in a comment. Dependabot should update those pins.

### 8.1 `.github/workflows/ci.yml`

Triggers:

- pull requests targeting `main`;
- manual `workflow_dispatch`.

Permissions:

```yaml
permissions:
  contents: read
```

Jobs:

1. Checkout.
2. Set up Node from `.nvmrc` with npm cache.
3. `npm ci`.
4. `npm run check`.
5. Install Playwright Chromium with system dependencies.
6. `npm run test:e2e`.
7. `npm run test:visual`.

Use `concurrency.group: ci-${{ github.ref }}` and
`cancel-in-progress: true`.

### 8.2 `.github/workflows/deploy-pages.yml`

Triggers:

- push to `main`;
- manual `workflow_dispatch`.

Permissions:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

Build job:

1. Checkout the triggering commit.
2. Set up Node from `.nvmrc`.
3. `npm ci`.
4. `npm run catalog:validate`.
5. `npm test`.
6. `npm run build`.
7. `npm run verify:export`.
8. `actions/configure-pages@v5`.
9. `actions/upload-pages-artifact@v4` with `path: ./out`.

Deploy job:

- `needs: build`;
- environment name `github-pages`;
- environment URL `${{ steps.deployment.outputs.page_url }}`;
- `actions/deploy-pages@v4` with step ID `deployment`.

Use `concurrency.group: pages` and do not cancel an in-progress deployment.
In repository Settings → Pages, select **GitHub Actions** as the publishing
source.

GitHub requires the deploy job to have `pages: write` and `id-token: write`, to
depend on the build artifact, and to target an environment. The official Pages
workflow documentation is the authority for these constraints.

### 8.3 `.github/workflows/refresh-catalog.yml`

Triggers:

- nightly `schedule` at a non-round UTC minute;
- manual `workflow_dispatch` with:
  - `mode`: `incremental` or `backfill`;
  - `start_index`: number, default `0`;
  - `batch_size`: number, default `20`;
  - `project_id`: optional exact project ID.

Permissions:

```yaml
permissions:
  contents: write
  actions: write
```

Steps:

1. Checkout `main` with enough history to commit.
2. Set up Node and run `npm ci`.
3. Run `npm run catalog:refresh --` with the event inputs.
4. Run `npm run catalog:validate`.
5. Run `npm test`.
6. Run `npm run build`.
7. Commit only changed files under `data/snapshots/github/` using
   `github-actions[bot]`.
8. Push the snapshot commit to `main`.
9. Dispatch `deploy-pages.yml` on `main` with `gh workflow run`.

The final dispatch is required because a normal push made with the repository
`GITHUB_TOKEN` does not start another workflow run. `workflow_dispatch` is an
explicit exception.

Use `concurrency.group: catalog-refresh` with `cancel-in-progress: false` so two
jobs never write snapshots concurrently. In pre-alpha, allow the bot’s
validated snapshot commit to update `main`. When branch protection is enabled,
replace that write path with a GitHub App-authenticated refresh pull request;
do not use a long-lived personal access token.

The built-in `GITHUB_TOKEN` currently receives 1,000 REST requests per hour per
repository. The first backfill must therefore run in explicit batches. Later
scheduled runs are incremental: request repository metadata once, list only
commits newer than the saved snapshot, and inspect changed files only for those
new commits.

Official references:

- [Using `GITHUB_TOKEN`](https://docs.github.com/actions/how-tos/security-for-github-actions/security-guides/automatic-token-authentication)
- [Workflow triggering and `GITHUB_TOKEN`](https://docs.github.com/en/enterprise-cloud@latest/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### 8.4 `.github/dependabot.yml`

Configure weekly updates for:

- npm dependencies;
- GitHub Actions.

Group non-major development dependencies. Keep Next.js and React updates in a
separate group so framework changes receive deliberate review.

## 9. Implementation Tasks

### Task 1: Preserve approved reference artifacts

**Files:**

- Create: `docs/reference/mockups/catalog-wall-responsive-v7.html`
- Create: `docs/reference/assets/tavernary-logo.png`
- Create: `docs/reference/assets/icons/memory.svg`
- Create: `docs/reference/assets/icons/generation.svg`
- Create: `docs/reference/assets/icons/feather.svg`
- Create: `docs/reference/assets/icons/d20.svg`
- Create: `docs/reference/assets/icons/preset.svg`
- Create: `docs/reference/assets/icons/collapse.svg`
- Create: `tests/fixtures/visual-catalog.json`

**Interfaces:**

- Consumes: the ignored approved mockup and original local assets listed in
  Section 1.
- Produces: immutable tracked reference inputs for UI transcription and visual
  regression tests.

- [ ] Copy each source artifact byte-for-byte to its tracked destination.
- [ ] Record SHA-256 hashes before and after each copy and confirm they match.
- [ ] Extract the fourteen mockup project examples into
  `tests/fixtures/visual-catalog.json` without changing displayed values.
- [ ] Add a note at the top of the tracked HTML stating that it is an immutable
  acceptance fixture and not production source.
- [ ] Confirm `git check-ignore` does not report any tracked destination.
- [ ] Commit as `docs: preserve approved catalog reference`.

### Task 2: Scaffold the static application and root configuration

**Files:**

- Create all project-wide root configuration files shown in Section 3.
- Create `src/app/layout.tsx`, `src/app/page.tsx`, and style entry files.
- Modify: `.gitignore`

**Interfaces:**

- Consumes: Node 24 and the existing repository root.
- Produces: a static-exporting Next.js shell whose empty homepage builds to
  `out/index.html`.

- [ ] Add `.nvmrc` containing `24`.
- [ ] Initialize npm and install Next.js, React, TypeScript, ESLint, Prettier,
  Ajv, `json-schema-to-ts`, `@fontsource-variable/inter`, Vitest, Testing
  Library, and Playwright.
- [ ] Add the exact package scripts from Section 7.
- [ ] Write `next.config.ts` from Section 6.
- [ ] Add strict TypeScript settings, the `@/*` alias, and JSON module support.
- [ ] Add `src/generated/` and ignore generated catalog output while retaining
  `.gitkeep`.
- [ ] Write a failing static-export test that expects `out/index.html`,
  `out/404.html`, and `_next` assets beneath both root and project-page base
  paths.
- [ ] Build the minimal app and make that test pass.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Commit as `build: scaffold static Tavernary app`.

### Task 3: Normalize the intake catalog

**Files:**

- Move: `data/catalog/projects.json` to `data/intake/projects.json`
- Create: `data/schemas/project.schema.json`
- Create: `data/schemas/repository-snapshot.schema.json`
- Create: `data/vocabularies/frontends.json`
- Create: `data/vocabularies/capabilities.json`
- Create: `data/vocabularies/primary-functions.json`
- Create: `scripts/catalog/migrate-intake.mjs`
- Create: `scripts/catalog/validate.mjs`
- Create: `scripts/catalog/build.mjs`
- Create: `src/features/catalog/catalog-types.ts`
- Create: `src/lib/catalog/load-catalog.ts`

**Interfaces:**

- Consumes: candidate records from `data/intake/projects.json`.
- Produces: validated per-project registry records and the generated browser
  catalog consumed by `src/app/page.tsx`.

- [ ] Write schema tests for IDs, source types, three project kinds,
  controlled frontend IDs, controlled capabilities, required summaries, and
  canonical URLs.
- [ ] Run the tests and confirm the candidate intake cannot yet masquerade as
  complete canonical records.
- [ ] Implement the one-time migration command so it creates deterministic,
  sorted `<id>.json` files without deleting the intake source.
- [ ] Convert only records that satisfy the canonical schema; leave unresolved
  candidates in intake with their original status.
- [ ] Implement cross-record checks for duplicate IDs, duplicate canonical
  sources, unknown frontend IDs, and invalid relationship targets.
- [ ] Implement `catalog:build` to join curated records and snapshots, sort
  arrays deterministically, and emit `src/generated/catalog.json`.
- [ ] Run `npm run catalog:migrate`, `npm run catalog:validate`, and
  `npm run catalog:build` twice; confirm the second run creates no diff.
- [ ] Commit as `feat(data): add validated project registry`.

### Task 4: Implement catalog query behavior test-first

**Files:**

- Create: `src/features/catalog/catalog-query.ts`
- Create: `src/features/catalog/catalog-selectors.ts`
- Create: `src/features/catalog/catalog-selectors.test.ts`
- Create: `src/features/catalog/use-catalog-query.ts`
- Create: `src/lib/catalog/relative-time.ts`

**Interfaces:**

- Consumes: browser-ready catalog records and URL query parameters.
- Produces:
  - `parseCatalogQuery(searchParams): CatalogQuery`
  - `serializeCatalogQuery(query): URLSearchParams`
  - `selectProjects(projects, query): CatalogProject[]`
  - `useCatalogQuery(): CatalogQueryController`

- [ ] Write failing tests for no-filter visibility, full-text search, category
  selection, three within-group OR cases, cross-group AND, lifecycle views,
  recently active sort, popularity stable ties, unscored popularity ordering,
  alphabetical sort, and URL round-tripping.
- [ ] Implement the smallest pure selectors that satisfy the tests.
- [ ] Implement immutable query updates and browser history replacement.
- [ ] Add tests for `/` search focus separately in the component task.
- [ ] Run `npm test`.
- [ ] Commit as `feat(catalog): add searchable query model`.

### Task 5: Transcribe the approved mockup into components

**Files:**

- Create the icon, UI, catalog component, and style files shown in Section 3.
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/catalog.spec.ts`
- Create: `tests/e2e/mobile.spec.ts`
- Create: `tests/visual/catalog.visual.spec.ts`

**Interfaces:**

- Consumes: `CatalogProject[]`, `CatalogQueryController`, and the tracked
  reference mockup.
- Produces: the exact standard/compact desktop and mobile catalog UI.

- [ ] Write Playwright interaction tests from Section 2 before implementing
  components.
- [ ] Write visual tests at 1440×1000, 1024×900, and 390×844 using
  `tests/fixtures/visual-catalog.json`.
- [ ] Port the mockup’s CSS custom properties and layout rules into
  `tokens.css`, `catalog.css`, `responsive.css`, and `motion.css` without
  changing values.
- [ ] Port each SVG symbol into the focused icon components.
- [ ] Implement header, category navigation, filters, toolbar, active-query
  chips, project cards, tooltips, and empty state.
- [ ] Implement mobile category selection and filter sheet.
- [ ] Implement standard/compact density without changing the card grid’s
  column alignment.
- [ ] Add focus states, keyboard operation, `/` search focus, semantic external
  card links, and reduced-motion behavior.
- [ ] Capture approved visual baselines only after side-by-side comparison with
  the tracked `v7` mockup.
- [ ] Run `npm run test:e2e` and `npm run test:visual`.
- [ ] Commit as `feat(ui): reproduce approved catalog mockup`.

### Task 6: Implement GitHub enrichment and activity snapshots

**Files:**

- Create: `src/lib/github/repository-metrics.ts`
- Create: `src/lib/github/activity.ts`
- Create: `src/lib/github/license.ts`
- Create: `scripts/catalog/refresh-github.mjs`
- Create: `docs/architecture/github-refresh-methodology.md`
- Create fixtures and unit tests beside each GitHub domain module.

**Interfaces:**

- Consumes: GitHub canonical sources, prior snapshots, `GITHUB_TOKEN`, and
  refresh mode inputs.
- Produces: validated `RepositorySnapshot` files while preserving last known
  values on upstream failure.

- [ ] Write fixtures for active, dormant, archived, renamed, rate-limited,
  missing-license, custom-license, and recognized-OSI repositories.
- [ ] Implement root `LICENSE*` detection and SPDX classification using an
  explicit OSI-approved identifier set.
- [ ] Implement community aggregate using `subscribers_count`, not
  `watchers_count`.
- [ ] Implement incremental commit retrieval and meaningful-file
  classification.
- [ ] Calculate active weeks across the trailing twelve seven-day buckets and
  six deterministic sparkline bars.
- [ ] Preserve prior successful fields when a refresh fails and set
  `stale_since`.
- [ ] Add `--mode`, `--start-index`, `--batch-size`, and `--project-id`
  arguments.
- [ ] Run fixture tests and a manual single-project refresh before any batch.
- [ ] Document every exclusion rule and formula.
- [ ] Commit as `feat(catalog): generate GitHub activity snapshots`.

### Task 7: Add CI, refresh, and GitHub Pages deployment

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `.github/workflows/refresh-catalog.yml`
- Create: `.github/dependabot.yml`
- Create: `scripts/verify-static-export.mjs`
- Create: `tests/e2e/static-export.spec.ts`

**Interfaces:**

- Consumes: package scripts and static `out/` build.
- Produces: validated pull requests, scheduled catalog snapshots, and the
  deployed GitHub Pages artifact.

- [ ] Implement the exact workflow responsibilities and least-privilege
  permissions in Section 8.
- [ ] Pin first-party actions to current full SHAs with version comments.
- [ ] Add a static-export check that searches generated HTML, CSS, and asset
  URLs for incorrect root-relative paths.
- [ ] Run the complete workflow command sequence locally.
- [ ] Push a branch and confirm CI passes.
- [ ] Set Settings → Pages → Source to GitHub Actions.
- [ ] Manually dispatch `deploy-pages.yml` and verify the returned page URL.
- [ ] Manually dispatch one-project refresh and confirm snapshot validation.
- [ ] Run one explicit backfill batch of twenty projects and inspect the diff
  before continuing.
- [ ] Commit as `ci: deploy and refresh Tavernary catalog`.

### Task 8: Contribution surface and final acceptance

**Files:**

- Create: `.github/ISSUE_TEMPLATE/project-submission.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `LICENSE` after the repository owner selects Tavernary’s own
  OSI-approved project license
- Create: `docs/architecture/catalog-data-model.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: final schemas, workflows, and application behavior.
- Produces: a discoverable submission and maintenance process without an
  administrative backend.

- [ ] Document local setup, exact commands, catalog record rules, generated
  file boundaries, and deployment behavior.
- [ ] Make `Submit Project` link to the structured GitHub issue form.
- [ ] Add a PR checklist for schema validity, source evidence, compatibility
  evidence, controlled tags, and generated-file policy.
- [ ] Run `npm run check`, `npm run test:e2e`, and `npm run test:visual`.
- [ ] Test the deployed project-page URL on desktop and a real 390px mobile
  viewport.
- [ ] Confirm no production code imports from `docs/reference`,
  `.superpowers`, or `C:/Users/Keptin/Downloads`.
- [ ] Confirm a default visit shows every catalog project.
- [ ] Confirm the production page has no mockup preview toggle.
- [ ] Confirm every visible project card opens its canonical external source.
- [ ] Commit as `docs: add Tavernary contribution guide`.

## 10. Definition of Done

Development is ready for its first public pre-alpha only when:

1. A fresh clone contains the approved mockup, logo, and icon sources.
2. `npm ci && npm run check` succeeds on Node 24.
3. `npm run build` produces a working `out/` static export.
4. Root hosting and `/Tavernary/` project-page hosting both pass.
5. Desktop, tablet, mobile, standard-card, and compact-card screenshots match
   the approved fixture within a strict visual-diff threshold.
6. Search, categories, all filter groups, lifecycle views, sorting, query
   restoration, density, tooltips, and mobile controls pass Playwright.
7. The default page shows all projects until a user adds a search or filter.
8. Catalog input, canonical records, generated snapshots, and browser output
   are visibly separate and schema-validated.
9. The browser makes no GitHub API calls.
10. GitHub Pages deploys only an artifact produced by a passing build.
11. A failed upstream refresh retains the last known good snapshot and marks it
    stale.
12. The repository root contains no mockups, loose JSON data, downloaded
    icons, build output, or ad hoc scripts.

## 11. Suggested Opening Prompt for the Next Codex Task

```text
Implement the Tavernary production development plan at
docs/architecture/production-development-handoff.md.

Begin with Task 1 and continue task-by-task using test-driven development.
Treat docs/reference/mockups/catalog-wall-responsive-v7.html as the exact
visual and behavioral acceptance fixture. Do not redesign the interface, do not
add a backend, and do not hand-code project cards from the mockup; production
cards must come from the validated catalog pipeline.

Before editing, inspect the current worktree and preserve unrelated changes.
After each task, run its specified verification and review the diff against the
plan.
```
