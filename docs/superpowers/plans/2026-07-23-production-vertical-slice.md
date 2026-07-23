# Tavernary Production Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a production-quality five-project Tavernary catalog on GitHub Pages with the approved responsive interface, real catalog data, daily GitHub enrichment, abuse-safe editorial boundaries, and working About, Help, and Submit Project flows.

**Architecture:** Human-curated project records and machine-generated source snapshots remain separate and are joined into an ignored browser-ready catalog before every static Next.js build. GitHub Actions validates, refreshes, tests, exports, and deploys the site; the browser performs search, filtering, sorting, density changes, and URL-state restoration without a runtime backend.

**Tech Stack:** Node.js 24 LTS, npm, Next.js 16 App Router with static export, React 19, TypeScript, plain CSS, Ajv, Vitest, Testing Library, Playwright, GitHub Actions, and GitHub Pages.

## Global Constraints

- The approved `catalog-wall-responsive-v7.html` fixture controls appearance, copy, spacing, responsive behavior, and interactions.
- V1 contains one card per independently indexed project; do not add family, fork, port, or successor grouping.
- Frontends and Extensions require a public GitHub repository. Only System Presets may use another stable public URL.
- Public summaries are curated and never overwritten from mutable README or GitHub-description text.
- Curated records, generated snapshots, and generated browser data are separate authorities.
- `Recent Activity` sorts by the newest meaningful commit.
- `Activity Strength` uses twelve weekly buckets and is never displayed as a normalized score.
- A project is dormant only when its latest meaningful commit is more than twelve weeks old.
- Seed records never enter the New view merely because Tavernary imported them at launch.
- Non-GitHub presets remain visible after GitHub projects in activity sorts and order by `cataloged_at`, then name.
- Tavernary links to creator-controlled sources and never hosts, mirrors, redistributes, or installs project files.
- V1 has no accounts, runtime server, production database, reviews, ratings, comments, internal project pages, or browser editor.
- Do not add Tailwind, a component library, a global state library, or an animation framework.
- Use Node.js `24` locally and in Actions. Next.js `16.2.11` and React `19.2.7` are the starting framework versions; commit the resulting lockfile.
- Preserve user changes in `data/catalog/projects.json`; do not reformat or replace the intake file.
- Every task ends with focused verification and a small intentional commit.

## Source Authorities

1. `docs/superpowers/specs/2026-07-23-production-vertical-slice-design.md`
2. `.superpowers/brainstorm/1335-1784816109/content/catalog-wall-responsive-v7.html`
3. Focused approved UI specifications under `docs/superpowers/specs/`

## Target File Map

```text
.github/
  ISSUE_TEMPLATE/
    config.yml                         # Help chooser and private-security link
    help.yml                           # Request-help form
    other.yml                          # General report form
    project-information.yml           # Incorrect or unsafe listing report
    project-submission.yml             # Structured project intake
    website-bug.yml                    # Tavernary UI/behavior bug report
  workflows/
    ci.yml                             # Pull-request validation
    deploy-pages.yml                   # Static export and Pages deployment
    refresh-catalog.yml                # Daily source refresh and redeploy
    triage-submission.yml              # Eligibility and duplicate checks
  dependabot.yml
data/
  catalog/projects.json                # Preserved historical intake
  registry/projects/
    mentallyquill-recursion.json
    sillytavern-sillytavern.json
    platberlitz-sillytavern-image-gen.json
    purrfect-logic-4-max-mini.json
    zorgonatis-stabs-edh.json
  schemas/
    project.schema.json
    repository-snapshot.schema.json
  snapshots/github/                    # Committed last-known-good snapshots
  vocabularies/
    capabilities.json
    frontends.json
    primary-functions.json
docs/
  architecture/
    catalog-data-model.md
    github-refresh-methodology.md
  reference/
    assets/icons/
    assets/tavernary-logo.png
    mockups/catalog-wall-responsive-v7.html
scripts/
  catalog/
    build.mjs                          # Join curated and generated data
    refresh-github.mjs                 # GitHub orchestration and persistence
    validate.mjs                       # Schema and cross-record validation
  submissions/
    validate-submission.mjs            # Pure issue-body eligibility checks
  verify-static-export.mjs
src/
  app/
    about/page.tsx
    globals.css
    layout.tsx
    not-found.tsx
    page.tsx
  components/icons/category-icon.tsx
  components/ui/tooltip.tsx
  features/catalog/
    activity.ts
    catalog-query.ts
    catalog-selectors.ts
    catalog-types.ts
    components/
      active-query.tsx
      activity-sparkline.tsx
      catalog-page.tsx
      catalog-toolbar.tsx
      category-navigation.tsx
      filter-panel.tsx
      project-card.tsx
      project-grid.tsx
      site-header.tsx
    use-catalog-query.ts
  generated/.gitkeep
  lib/catalog/load-catalog.ts
  lib/github/
    activity.ts
    license.ts
    repository-metrics.ts
  styles/
    catalog.css
    motion.css
    responsive.css
    tokens.css
tests/
  e2e/
    catalog.spec.ts
    contribution-links.spec.ts
    mobile.spec.ts
    static-export.spec.ts
  fixtures/
    github/
    visual-catalog.json
  unit/
    activity.test.ts
    build-catalog.test.ts
    catalog-selectors.test.ts
    validate-catalog.test.ts
  visual/
    catalog.visual.spec.ts
```

---

### Task 1: Preserve the Approved Reference

**Files:**
- Create: `docs/reference/mockups/catalog-wall-responsive-v7.html`
- Create: `docs/reference/assets/tavernary-logo.png`
- Create: `docs/reference/assets/icons/memory.svg`
- Create: `docs/reference/assets/icons/generation.svg`
- Create: `docs/reference/assets/icons/feather.svg`
- Create: `docs/reference/assets/icons/d20.svg`
- Create: `docs/reference/assets/icons/preset.svg`
- Create: `docs/reference/assets/icons/collapse.svg`
- Create: `docs/reference/README.md`

**Interfaces:**
- Consumes: approved local mockup and source assets
- Produces: immutable tracked acceptance fixtures used by Task 7 visual tests

- [ ] **Step 1: Record source hashes**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  .superpowers\brainstorm\1335-1784816109\content\catalog-wall-responsive-v7.html, `
  .superpowers\brainstorm\1335-1784816109\content\Tavernary_logo.png, `
  C:\Users\Keptin\Downloads\memory.svg, `
  C:\Users\Keptin\Downloads\generation.svg, `
  C:\Users\Keptin\Downloads\feather.svg, `
  C:\Users\Keptin\Downloads\d20.svg, `
  C:\Users\Keptin\Downloads\preset.svg, `
  C:\Users\Keptin\Downloads\collapse.svg
```

Expected: eight `SHA256` rows and no missing-file errors.

- [ ] **Step 2: Copy the fixtures without transforming them**

Use `Copy-Item -LiteralPath` for each binary or immutable source artifact. Do
not open and rewrite the HTML through a formatter.

```powershell
New-Item -ItemType Directory -Force docs\reference\mockups,docs\reference\assets\icons
Copy-Item -LiteralPath .superpowers\brainstorm\1335-1784816109\content\catalog-wall-responsive-v7.html -Destination docs\reference\mockups\catalog-wall-responsive-v7.html
Copy-Item -LiteralPath .superpowers\brainstorm\1335-1784816109\content\Tavernary_logo.png -Destination docs\reference\assets\tavernary-logo.png
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\memory.svg -Destination docs\reference\assets\icons\memory.svg
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\generation.svg -Destination docs\reference\assets\icons\generation.svg
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\feather.svg -Destination docs\reference\assets\icons\feather.svg
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\d20.svg -Destination docs\reference\assets\icons\d20.svg
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\preset.svg -Destination docs\reference\assets\icons\preset.svg
Copy-Item -LiteralPath C:\Users\Keptin\Downloads\collapse.svg -Destination docs\reference\assets\icons\collapse.svg
```

- [ ] **Step 3: Document fixture authority**

Create `docs/reference/README.md` with:

```markdown
# Production References

`mockups/catalog-wall-responsive-v7.html` is the immutable visual and
interaction acceptance fixture for Tavernary V1. Production code transcribes
it into maintainable components but never imports or modifies it.

Assets in `assets/` preserve the approved source artwork. Production copies
live under `public/` or in React icon components.
```

- [ ] **Step 4: Verify byte identity**

Run the source and destination `Get-FileHash` commands and compare each pair.

Expected: every source hash equals its tracked destination hash.

- [ ] **Step 5: Commit**

```powershell
git add docs/reference
git commit -m "docs: preserve catalog reference"
```

---

### Task 2: Scaffold the Static Application and Test Harness

**Files:**
- Create: `.nvmrc`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/generated/.gitkeep`
- Create: `scripts/verify-static-export.mjs`
- Create: `tests/e2e/static-export.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run check`, static `out/`, `@/*` imports, Vitest and Playwright execution

- [ ] **Step 1: Write the failing export test**

Create `tests/e2e/static-export.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("serves the catalog from the configured base path", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
  await expect(page).not.toHaveTitle(/404/);
});
```

Run:

```powershell
npx playwright test tests/e2e/static-export.spec.ts
```

Expected: FAIL because no application or Playwright configuration exists.

- [ ] **Step 2: Add pinned runtime and dependencies**

Create `.nvmrc` containing:

```text
24
```

Create the initial `package.json`:

```json
{
  "name": "tavernary",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test tests/e2e",
    "test:visual": "playwright test tests/visual",
    "verify:export": "node scripts/verify-static-export.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run verify:export"
  }
}
```

Install:

```powershell
npm install next@16.2.11 react@19.2.7 react-dom@19.2.7 ajv@8.20.0 @fontsource-variable/inter
npm install --save-dev typescript eslint eslint-config-next prettier vitest@4.1.10 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test@1.61.1 @types/node @types/react @types/react-dom
```

Expected: `package-lock.json` exists and `npm ls --depth=0` exits `0`.

- [ ] **Step 3: Configure static export**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const projectPage =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName.length > 0 &&
  !repositoryName.endsWith(".github.io");
const basePath =
  process.env.TAVERNARY_BASE_PATH ??
  (projectPage ? `/${repositoryName}` : "");

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true }
};

export default config;
```

Create `src/app/layout.tsx`:

```tsx
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Tavernary",
  description: "Where AI roleplay tools gather"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function Page() {
  return <main><h1>5 projects</h1></main>;
}
```

- [ ] **Step 4: Add export verification**

Create `scripts/verify-static-export.mjs`:

```js
import { access, readFile } from "node:fs/promises";

await access("out/index.html");
const html = await readFile("out/index.html", "utf8");
if (!html.includes("5 projects")) {
  throw new Error("Static export does not contain the catalog heading");
}
if (html.includes('href="/_next/') || html.includes('src="/_next/')) {
  throw new Error("Static export contains root-only Next.js asset URLs");
}
console.log("Static export verified");
```

- [ ] **Step 5: Make the scaffold pass**

Add strict TypeScript, ESLint, Vitest, and Playwright configuration. Configure
Playwright's `webServer.command` as `npm run dev` and `baseURL` as
`http://127.0.0.1:3000`.

Run:

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:export
npm run test:e2e -- tests/e2e/static-export.spec.ts
```

Expected: every command exits `0`; export verification prints
`Static export verified`; Playwright reports `1 passed`.

- [ ] **Step 6: Commit**

```powershell
git add .nvmrc .gitignore package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs vitest.config.ts vitest.setup.ts playwright.config.ts scripts/verify-static-export.mjs src tests/e2e/static-export.spec.ts
git commit -m "build: scaffold static Tavernary app"
```

---

### Task 3: Define and Validate the Five Curated Records

**Files:**
- Create: `data/schemas/project.schema.json`
- Create: `data/schemas/repository-snapshot.schema.json`
- Create: `data/vocabularies/frontends.json`
- Create: `data/vocabularies/primary-functions.json`
- Create: `data/vocabularies/capabilities.json`
- Create: five files under `data/registry/projects/`
- Create: `scripts/catalog/validate.mjs`
- Create: `tests/unit/validate-catalog.test.ts`
- Create: `docs/architecture/catalog-data-model.md`

**Interfaces:**
- Produces: validated `ProjectRecord` files and `validateCatalog(): ValidationResult`
- Invariant: `source.type === "github"` for frontend/extension; URL sources only for preset

- [ ] **Step 1: Write failing schema and source-rule tests**

Create `tests/unit/validate-catalog.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { validateCatalog } from "../../scripts/catalog/validate.mjs";

describe("catalog validation", () => {
  test("accepts the five production records", async () => {
    const result = await validateCatalog();
    expect(result.errors).toEqual([]);
    expect(result.projectCount).toBe(5);
  });

  test("rejects a non-GitHub extension", async () => {
    const result = await validateCatalog({
      records: [{
        schema_version: 1,
        id: "bad-extension",
        name: "Bad Extension",
        kind: "extension",
        summary: "Invalid source fixture.",
        source: { type: "url", url: "https://example.com/tool" },
        frontends: ["sillytavern"],
        primary_function: "generation-reasoning",
        capabilities: [],
        cataloged_at: "2026-07-23T00:00:00Z",
        catalog_cohort: "seed",
        visibility: "published",
        refresh_policy: "automatic"
      }]
    });
    expect(result.errors).toContain(
      "bad-extension: extension requires source.type github"
    );
  });
});
```

Run:

```powershell
npx vitest run tests/unit/validate-catalog.test.ts
```

Expected: FAIL because `validateCatalog` does not exist.

- [ ] **Step 2: Define the exact curated contract**

The JSON Schema must require:

```ts
type ProjectKind = "frontend" | "extension" | "preset";
type Visibility = "published" | "quarantined" | "disabled";
type RefreshPolicy = "automatic" | "paused";

type ProjectSource =
  | {
      type: "github";
      repository: `${string}/${string}`;
      repository_id: number;
    }
  | {
      type: "url";
      url: string;
      published_at: string | null;
      version: string | null;
      artifact_size_bytes: number | null;
      license_status: "osi-approved" | "proprietary" | "missing";
      license_spdx_id: string | null;
    };

interface ProjectRecord {
  schema_version: 1;
  id: string;
  name: string;
  kind: ProjectKind;
  summary: string;
  source: ProjectSource;
  frontends: string[];
  primary_function:
    | "frontend"
    | "memory-retrieval"
    | "generation-reasoning"
    | "character-worldbuilding"
    | "rpg-systems"
    | "interface-workflow"
    | "developer-infrastructure";
  capabilities: string[];
  cataloged_at: string;
  catalog_cohort: "seed" | "standard";
  visibility: Visibility;
  refresh_policy: RefreshPolicy;
}

interface RepositorySnapshot {
  schema_version: 1;
  project_id: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    default_branch: string;
    head_sha: string;
    archived: boolean;
    created_at: string;
    size_kb: number;
  };
  source_health: "healthy" | "unavailable" | "identity-change";
  activity: {
    latest_meaningful_commit_at: string | null;
    weekly_meaningful_commits: [
      number, number, number, number, number, number,
      number, number, number, number, number, number
    ];
    active_weeks_12: number;
    strength: number;
    dormant: boolean;
    latest_release_at: string | null;
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

Use `additionalProperties: false` at every object level and ISO UTC date-time
formats for timestamps.

- [ ] **Step 3: Resolve permanent GitHub IDs**

Run:

```powershell
gh api repos/SillyTavern/SillyTavern --jq .id
gh api repos/MentallyQuill/Recursion --jq .id
gh api repos/platberlitz/sillytavern-image-gen --jq .id
gh api repos/Zorgonatis/Stabs-EDH --jq .id
```

Expected: four positive integers. Put those exact integers into the four
GitHub project records; never invent IDs.

- [ ] **Step 4: Create vocabularies and five records**

Use stable IDs:

```json
{
  "frontends": [
    { "id": "sillytavern", "label": "SillyTavern" },
    { "id": "lumiverse", "label": "Lumiverse" },
    { "id": "marinara-engine", "label": "Marinara Engine" },
    { "id": "sonder-engine", "label": "Sonder Engine" }
  ]
}
```

Create one record for each ID:

```text
sillytavern-sillytavern
mentallyquill-recursion
platberlitz-sillytavern-image-gen
zorgonatis-stabs-edh
purrfect-logic-4-max-mini
```

Use `kind: frontend` for SillyTavern, `kind: extension` for Recursion and Image
Gen, and `kind: preset` for both preset records. Use the real Purrfect Logic
source URL already present in `data/catalog/projects.json`. Set all five to
`catalog_cohort: seed`, `visibility: published`, and GitHub records to
`refresh_policy: automatic`. Set the non-GitHub preset to
`refresh_policy: paused`.

- [ ] **Step 5: Implement validation**

Export:

```js
export async function validateCatalog(options = {}) {
  // load schemas, vocabularies, and records unless options.records is supplied
  // return { projectCount, errors } with stable "id: message" strings
}
```

Validation must reject duplicate IDs, duplicate canonical sources, unknown
frontend/function/capability IDs, unsafe URL protocols, non-GitHub
frontend/extension sources, GitHub records without permanent numeric identity,
and non-preset URL sources.

- [ ] **Step 6: Wire validation into package scripts**

Add:

```json
{
  "scripts": {
    "catalog:validate": "node scripts/catalog/validate.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run catalog:validate && npm test && npm run build && npm run verify:export"
  }
}
```

- [ ] **Step 7: Verify red to green**

Run:

```powershell
npx vitest run tests/unit/validate-catalog.test.ts
npm run catalog:validate
```

Expected: Vitest reports all tests passed; validation prints
`Validated 5 projects`.

- [ ] **Step 8: Commit**

```powershell
git add data/registry data/schemas data/vocabularies scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts docs/architecture/catalog-data-model.md
git add package.json package-lock.json
git commit -m "feat(data): define curated project registry"
```

---

### Task 4: Implement GitHub Activity and Snapshot Refresh

**Files:**
- Create: `src/lib/github/activity.ts`
- Create: `src/lib/github/license.ts`
- Create: `src/lib/github/repository-metrics.ts`
- Create: `scripts/catalog/refresh-github.mjs`
- Create: `tests/unit/activity.test.ts`
- Create: fixtures under `tests/fixtures/github/`
- Create: `docs/architecture/github-refresh-methodology.md`
- Create: four files under `data/snapshots/github/`

**Interfaces:**
- Produces: `classifyCommit()`, `calculateActivity()`, `refreshProject()`
- Snapshot authority: machine facts only; curated files are read-only inputs

- [ ] **Step 1: Write failing activity tests**

Create `tests/unit/activity.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  calculateActivity,
  classifyCommit
} from "@/lib/github/activity";

test("excludes documentation and lockfile-only commits", () => {
  expect(classifyCommit(["README.md"])).toBe("excluded");
  expect(classifyCommit(["package-lock.json"])).toBe("excluded");
  expect(classifyCommit(["src/runtime.ts", "README.md"])).toBe("meaningful");
});

test("weights active weeks and caps commit tie points", () => {
  const activity = calculateActivity({
    now: "2026-07-23T00:00:00Z",
    commits: [
      ...Array.from({ length: 20 }, (_, index) => ({
        sha: `current-${index}`,
        committedAt: "2026-07-22T00:00:00Z",
        files: ["src/index.ts"]
      })),
      {
        sha: "older",
        committedAt: "2026-07-14T00:00:00Z",
        files: ["src/index.ts"]
      }
    ]
  });
  expect(activity.activeWeeks12).toBe(2);
  expect(activity.strength).toBe(1200 + 5 + 1100 + 1);
});

test("marks a project dormant only after 84 days", () => {
  const boundary = calculateActivity({
    now: "2026-07-23T00:00:00Z",
    commits: [{
      sha: "boundary",
      committedAt: "2026-04-30T00:00:00Z",
      files: ["src/index.ts"]
    }]
  });
  expect(boundary.dormant).toBe(false);
});
```

Run:

```powershell
npx vitest run tests/unit/activity.test.ts
```

Expected: FAIL because activity modules do not exist.

- [ ] **Step 2: Implement deterministic activity**

Use:

```ts
export interface CommitFixture {
  sha: string;
  committedAt: string;
  files: string[];
}

export interface ActivityResult {
  latestMeaningfulCommitAt: string | null;
  weeklyMeaningfulCommits: [
    number, number, number, number, number, number,
    number, number, number, number, number, number
  ];
  activeWeeks12: number;
  strength: number;
  dormant: boolean;
}

export function calculateActivity(input: {
  now: string;
  commits: CommitFixture[];
}): ActivityResult;
```

For week number `0..11`, add `(12 - weekNumber) * 100` when active, plus
`min(commitCount, 5)`. Use `> 84 * 24 * 60 * 60 * 1000` for dormant so the
boundary itself remains inside the window.

- [ ] **Step 3: Implement source exclusions and licensing**

Exclude case-insensitive documentation extensions and names, lockfiles,
generated/vendor directories, merge-only commits, and commits whose patch is
whitespace-only. Treat any remaining source file as meaningful.

License classification must inspect root `LICENSE*` files, return an
OSI-approved SPDX ID only when recognized, and otherwise return
`proprietary` or `missing`. Package metadata never overrides root text.

- [ ] **Step 4: Implement refresh modes and last-known-good writes**

Support:

```text
node scripts/catalog/refresh-github.mjs --project-id mentallyquill-recursion
node scripts/catalog/refresh-github.mjs --mode incremental
node scripts/catalog/refresh-github.mjs --mode backfill --start-index 0 --batch-size 20
```

On an unchanged head, retain weekly history and update only cheap repository
facts. On rate limits or upstream failures, preserve the prior snapshot and set
`stale_since` if it is not already set. On repository ID mismatch, write
`source_health: identity-change`; on private/deleted sources write
`source_health: unavailable`. Never modify `data/registry/`.

- [ ] **Step 5: Wire the refresh command**

Add to `package.json`:

```json
{
  "scripts": {
    "catalog:refresh": "node scripts/catalog/refresh-github.mjs"
  }
}
```

- [ ] **Step 6: Generate the four real snapshots**

Run:

```powershell
npm run catalog:refresh -- --project-id sillytavern-sillytavern
npm run catalog:refresh -- --project-id mentallyquill-recursion
npm run catalog:refresh -- --project-id platberlitz-sillytavern-image-gen
npm run catalog:refresh -- --project-id zorgonatis-stabs-edh
```

Expected: four schema-valid snapshot files with matching permanent repository
IDs, absolute UTC timestamps, and `source_health: healthy`.

- [ ] **Step 7: Verify**

Run:

```powershell
npx vitest run tests/unit/activity.test.ts
npm run catalog:validate
git diff -- data/registry
```

Expected: tests pass; five projects and four snapshots validate; the final
command prints no changes.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json src/lib/github scripts/catalog/refresh-github.mjs tests/fixtures/github tests/unit/activity.test.ts data/snapshots/github docs/architecture/github-refresh-methodology.md
git commit -m "feat(catalog): add GitHub activity refresh"
```

---

### Task 5: Build the Browser Catalog

**Files:**
- Create: `src/features/catalog/catalog-types.ts`
- Create: `scripts/catalog/build.mjs`
- Create: `src/lib/catalog/load-catalog.ts`
- Create: `tests/unit/build-catalog.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: curated records, vocabularies, repository snapshots
- Produces: `src/generated/catalog.json` and `loadCatalog(): Catalog`

- [ ] **Step 1: Write the failing join test**

Create `tests/unit/build-catalog.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildCatalog } from "../../scripts/catalog/build.mjs";

const fixtureProject = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  id: "fixture",
  name: "Fixture",
  kind: "preset",
  summary: "Fixture summary.",
  source: {
    type: "url",
    url: "https://example.com/fixture",
    published_at: null,
    version: null,
    artifact_size_bytes: null,
    license_status: "missing",
    license_spdx_id: null
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: [],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "paused",
  ...overrides
});

const fixtureSnapshot = (overrides: Record<string, unknown> = {}) => ({
  project_id: "fixture",
  source_health: "healthy",
  ...overrides
});

test("builds five public cards without leaking intake metadata", async () => {
  const catalog = await buildCatalog({ write: false });
  expect(catalog.projects).toHaveLength(5);
  expect(catalog.projects.map((project) => project.id)).toContain(
    "purrfect-logic-4-max-mini"
  );
  expect(JSON.stringify(catalog)).not.toContain("submitted_at");
  expect(JSON.stringify(catalog)).not.toContain("submission");
});

test("excludes curator and source quarantine states", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({ id: "disabled", visibility: "disabled" }),
      fixtureProject({ id: "unsafe" })
    ],
    snapshots: [
      fixtureSnapshot({ project_id: "unsafe", source_health: "identity-change" })
    ]
  });
  expect(catalog.projects).toEqual([]);
});
```

Run:

```powershell
npx vitest run tests/unit/build-catalog.test.ts
```

Expected: FAIL because `buildCatalog` does not exist.

- [ ] **Step 2: Define the browser contract**

Use:

```ts
export interface CatalogProject {
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  primaryFunction: string;
  summary: string;
  canonicalUrl: string;
  catalogedAt: string;
  catalogCohort: "seed" | "standard";
  frontends: Array<{ id: string; label: string }>;
  capabilities: Array<{ id: string; label: string }>;
  searchableText: string;
  activity: {
    latestMeaningfulCommitAt: string | null;
    activeWeeks12: number | null;
    twoWeekBars: [number, number, number, number, number, number] | null;
    strength: number | null;
    dormant: boolean;
  };
  latestReleaseAt: string | null;
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
  refreshedAt: string | null;
  staleSince: string | null;
}
```

- [ ] **Step 3: Implement the join**

The builder must:

- exclude `visibility !== published`;
- exclude critical snapshot source-health states;
- require a healthy snapshot for GitHub records;
- accept manual data for non-GitHub presets;
- compute `community.aggregate = stars + forks + subscribers`;
- produce six raw two-week totals from adjacent weekly counts; the card scales
  them relative to that project's largest total and renders a `7%` visual
  baseline for zero so the approved graph structure remains visible;
- build lowercase searchable text from visible curated fields;
- sort output by stable project ID before writing;
- write formatted JSON ending with one newline.

- [ ] **Step 4: Wire generation into development and builds**

Set these final scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "npm run catalog:build && next dev",
    "build": "npm run catalog:build && next build",
    "catalog:build": "node scripts/catalog/build.mjs"
  }
}
```

- [ ] **Step 5: Verify generated-file discipline**

Add `/src/generated/catalog.json` to `.gitignore` while retaining
`src/generated/.gitkeep`.

Run:

```powershell
npx vitest run tests/unit/build-catalog.test.ts
npm run catalog:build
git check-ignore src/generated/catalog.json
```

Expected: tests pass; the builder prints `Built 5 projects`; `git check-ignore`
reports `src/generated/catalog.json`.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore package.json package-lock.json scripts/catalog/build.mjs src/features/catalog/catalog-types.ts src/lib/catalog/load-catalog.ts src/generated/.gitkeep tests/unit/build-catalog.test.ts
git commit -m "feat(catalog): build browser-ready catalog"
```

---

### Task 6: Implement Query, Views, and Sorting Test-First

**Files:**
- Create: `src/features/catalog/catalog-query.ts`
- Create: `src/features/catalog/catalog-selectors.ts`
- Create: `src/features/catalog/activity.ts`
- Create: `src/features/catalog/use-catalog-query.ts`
- Create: `tests/unit/catalog-selectors.test.ts`

**Interfaces:**
- Produces: `parseCatalogQuery()`, `serializeCatalogQuery()`, `selectProjects()`
- Consumes: `CatalogProject[]`

- [ ] **Step 1: Write failing selector tests**

Create tests covering:

```ts
expect(selectProjects(projects, DEFAULT_QUERY)).toHaveLength(5);
expect(selectProjects(projects, { ...DEFAULT_QUERY, search: "recursion" }))
  .toHaveLength(1);
expect(selectProjects(projects, {
  ...DEFAULT_QUERY,
  frontends: ["sillytavern", "marinara-engine"]
})).toEqual(expect.arrayContaining([multiFrontendProject]));
expect(selectProjects(
  projects,
  { ...DEFAULT_QUERY, view: "new" },
  { now: "2026-07-23T00:00:00Z" }
)).not.toContainEqual(expect.objectContaining({ catalogCohort: "seed" }));
```

Also assert:

- OR within frontend, kind, and capability groups;
- AND across groups and category;
- Active uses 30 days;
- Released uses release/publication within 30 days;
- Recent Activity uses latest meaningful commit;
- Activity Strength uses the stored internal value;
- Popularity places unscored records last;
- non-GitHub activity-sort ties use `catalogedAt`, then name;
- Alphabetical uses `Intl.Collator("en", { sensitivity: "base" })`;
- invalid URL values are discarded.

Run:

```powershell
npx vitest run tests/unit/catalog-selectors.test.ts
```

Expected: FAIL because selector modules do not exist.

- [ ] **Step 2: Define query state**

```ts
export interface CatalogQuery {
  search: string;
  category: string;
  view: "all" | "active" | "new" | "released";
  sort: "recent" | "strength" | "popularity" | "alphabetical";
  density: "standard" | "compact";
  frontends: string[];
  kinds: Array<"frontend" | "extension" | "preset">;
  capabilities: string[];
  development: Array<"active-month" | "new-release" | "dormant">;
  licenses: Array<"open-source" | "proprietary" | "missing">;
}
```

Arrays serialize as repeated query parameters in stable sorted order. Defaults
are omitted. Use `history.replaceState`, not navigation, for interaction
updates.

- [ ] **Step 3: Implement pure selectors and URL parsing**

Keep all time-sensitive functions parameterized by `now` for deterministic
tests. Do not read `window`, `Date.now()`, or React state inside selectors.
Use the exact selector boundary:

```ts
export function selectProjects(
  projects: CatalogProject[],
  query: CatalogQuery,
  context: { now: string }
): CatalogProject[];
```

- [ ] **Step 4: Verify**

Run:

```powershell
npx vitest run tests/unit/catalog-selectors.test.ts
npm test
```

Expected: all unit tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/activity.ts src/features/catalog/use-catalog-query.ts tests/unit/catalog-selectors.test.ts
git commit -m "feat(catalog): add query and sorting model"
```

---

### Task 7: Transcribe the Approved Catalog Interface

**Files:**
- Create: components and styles listed in the Target File Map
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/catalog.spec.ts`
- Create: `tests/e2e/mobile.spec.ts`
- Create: `tests/visual/catalog.visual.spec.ts`
- Create: `tests/fixtures/visual-catalog.json`

**Interfaces:**
- Consumes: `loadCatalog()`, query controller, selectors
- Produces: exact desktop/mobile catalog UI with accessible interactions

- [ ] **Step 1: Write failing interaction tests**

Create Playwright assertions for:

```ts
await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
await page.getByRole("searchbox", { name: "Search projects" }).fill("Recursion");
await expect(page.getByRole("heading", { name: "1 project" })).toBeVisible();
await page.getByRole("button", { name: "Use compact cards" }).click();
await expect(page.locator("body")).toHaveClass(/compact-cards/);
await page.getByRole("button", { name: "New" }).click();
await expect(page.getByText("No projects match this view")).toBeVisible();
```

Add tests for `/` focus, composed filters, active-query removal, all four
sorts, query restoration after reload, external-card URLs, and clear-all.

Create mobile tests at `390x844` for Browse selector, filter sheet open/close,
focus return, body scroll lock, and no horizontal document overflow.

Run:

```powershell
npx playwright test tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected: FAIL because the catalog components do not exist.

- [ ] **Step 2: Port design tokens and icons**

Create `src/styles/tokens.css` with the approved values:

```css
:root {
  --color-page: #07181d;
  --color-surface-primary: #0b2229;
  --color-surface-card: #102b33;
  --color-surface-raised: #173740;
  --color-border: #284a52;
  --color-border-strong: #3b6068;
  --color-text-primary: #f3f1e8;
  --color-text-secondary: #cbd6d3;
  --color-muted: #6f7e82;
  --color-kind-extension: #e18a24;
  --color-kind-frontend: #d62839;
  --color-kind-preset: #57c5a3;
  --radius: 8px;
}
```

Transcribe the approved SVG paths into typed React icon components. Production
code must not import from `docs/reference` or `.superpowers`.

- [ ] **Step 3: Implement semantic components**

`src/app/page.tsx` remains a build-time server component:

```tsx
import { CatalogPage } from "@/features/catalog/components/catalog-page";
import { loadCatalog } from "@/lib/catalog/load-catalog";

export default async function Page() {
  return <CatalogPage catalog={await loadCatalog()} />;
}
```

`CatalogPage` is the client boundary. Cards are keyboard-accessible external
links with one clear focus target. Tooltips use `aria-describedby`; do not
place buttons or nested links inside the card link.

- [ ] **Step 4: Reproduce the approved layouts**

Port the final mockup rules for:

- wordmark, tagline, quill placement, About, Help, and Submit Project;
- desktop categories and mobile Browse selector;
- desktop rail and mobile filter sheet;
- toolbar, views, four sort options, and density toggle;
- standard and compact cards;
- four-line summary clamp and chip-row limits;
- activity ratio, graph, recency, community, size, and license tooltips;
- selected chips, counts, empty states, and stable reordering;
- reduced-motion behavior;
- no horizontal page scrollbar.

Do not copy the mockup's Desktop/Mobile preview control into production.

- [ ] **Step 5: Add visual baselines**

Test `1440x1000`, `1024x900`, and `390x844`. First compare production and the
tracked mockup side by side, then approve baseline screenshots only after
layout, typography, colors, spacing, card density, and control behavior match.

- [ ] **Step 6: Verify**

Run:

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
```

Expected: all checks pass; no unexpected visual diffs.

- [ ] **Step 7: Commit**

```powershell
git add src/app src/components src/features/catalog/components src/styles tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/fixtures/visual-catalog.json tests/visual
git commit -m "feat(ui): reproduce production catalog"
```

---

### Task 8: Add About, Help, Submission, and Moderation Surfaces

**Files:**
- Create: `src/app/about/page.tsx`
- Create: GitHub issue files listed in Target File Map
- Create: `scripts/submissions/validate-submission.mjs`
- Create: `tests/unit/validate-submission.test.ts`
- Create: `SECURITY.md`
- Create: `tests/e2e/contribution-links.spec.ts`
- Modify: header/link components

**Interfaces:**
- Produces: working `About`, `Help`, `Submit Project`, and private security paths

- [ ] **Step 1: Write failing route and link tests**

Assert:

```ts
await page.getByRole("link", { name: "About" }).click();
await expect(page.getByRole("heading", { name: "About Tavernary" })).toBeVisible();
await expect(page.getByText(/does not host, mirror, redistribute, or install/i))
  .toBeVisible();
await expect(page.getByRole("link", { name: "Submit Project" }))
  .toHaveAttribute("href", /issues\/new\?template=project-submission\.yml/);
await expect(page.getByRole("link", { name: "Help" }))
  .toHaveAttribute("href", /issues\/new\/choose/);
```

Run:

```powershell
npx playwright test tests/e2e/contribution-links.spec.ts
```

Expected: FAIL because routes and issue files do not exist.

- [ ] **Step 2: Implement the About page**

Lead with:

```text
Tavernary is a search and discovery catalog for AI roleplay tools. It
indexes public project information and sends visitors to each creator's own
GitHub repository or source page. Tavernary does not host, mirror,
redistribute, or install project files.
```

Explain source eligibility, the System Preset exception, curated versus
automated facts, activity and license methodology, non-endorsement, and links
to submission and help.

- [ ] **Step 3: Implement Submit Project**

The issue form must collect name, kind, source URL, frontends, factual summary,
primary function, capabilities, and supporting context. Required
acknowledgements:

```text
I understand that Frontends and Extensions require a public GitHub repository.
I understand that submission does not publish the project automatically.
```

State that non-GitHub System Presets are locked after acceptance except for
curator moderation.

- [ ] **Step 4: Implement the Help chooser**

Configure exactly:

```text
Report project information
Report a website bug
Request help
Report a security vulnerability
Other
```

The security item is a `contact_link` to the repository security policy and
must not open a public issue. Disable blank issues.

- [ ] **Step 5: Write failing submission-triage tests**

Create `tests/unit/validate-submission.test.ts` around:

```ts
import { expect, test } from "vitest";
import { validateSubmission } from "../../scripts/submissions/validate-submission.mjs";

test("rejects an extension without GitHub", () => {
  expect(validateSubmission({
    kind: "Extension",
    sourceUrl: "https://example.com/tool",
    existingSources: []
  })).toEqual({
    labels: ["needs-information"],
    errors: ["Frontends and Extensions require a public GitHub repository."]
  });
});

test("accepts a non-GitHub System Preset for curator review", () => {
  expect(validateSubmission({
    kind: "System Preset",
    sourceUrl: "https://example.com/preset",
    existingSources: []
  })).toEqual({ labels: ["needs-curator-review"], errors: [] });
});

test("flags an existing canonical source", () => {
  expect(validateSubmission({
    kind: "Extension",
    sourceUrl: "https://github.com/MentallyQuill/Recursion",
    existingSources: ["https://github.com/mentallyquill/recursion"]
  }).labels).toContain("duplicate-candidate");
});
```

Run:

```powershell
npx vitest run tests/unit/validate-submission.test.ts
```

Expected: FAIL because the validation module does not exist.

- [ ] **Step 6: Implement submission triage**

Export:

```js
export function validateSubmission({
  kind,
  sourceUrl,
  existingSources
}) {
  const errors = [];
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return {
      labels: ["needs-information"],
      errors: ["Canonical source URL must be a valid HTTPS URL."]
    };
  }
  if (parsed.protocol !== "https:") {
    errors.push("Canonical source URL must be a valid HTTPS URL.");
  }
  const parts = parsed.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
  const githubRepository =
    parsed.hostname.toLowerCase() === "github.com" && parts.length === 2;
  if ((kind === "Frontend" || kind === "Extension") && !githubRepository) {
    errors.push("Frontends and Extensions require a public GitHub repository.");
  }
  const canonical = `${parsed.hostname.toLowerCase()}${parsed.pathname
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase()}`;
  const duplicate = existingSources.some((source) => {
    const candidate = new URL(source);
    return `${candidate.hostname.toLowerCase()}${candidate.pathname
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "")
      .toLowerCase()}` === canonical;
  });
  if (duplicate) {
    return { labels: ["duplicate-candidate"], errors };
  }
  return {
    labels: [errors.length ? "needs-information" : "needs-curator-review"],
    errors
  };
}
```

Normalize URL scheme, host casing, trailing slash, and GitHub `.git` suffix
before duplicate comparison. Accept only `https:` URLs. Require
`github.com/owner/repository` for Frontend and Extension; permit any valid
HTTPS source for System Preset.

Document the workflow input contract as the issue-form fields `Project kind`
and `Canonical source URL`. Task 9 will connect this pure validator to GitHub
after resolving pinned action SHAs.

- [ ] **Step 7: Add static issue-form validation**

Install the YAML parser used only by tests:

```powershell
npm install --save-dev yaml@2
```

Add a Vitest test that parses every issue-form YAML file, asserts unique names,
required description/title/body fields, and verifies the exact five chooser
labels. Assert that project submission contains the source-rule
acknowledgements.

- [ ] **Step 8: Verify**

Run:

```powershell
npm test
npx playwright test tests/e2e/contribution-links.spec.ts
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json .github/ISSUE_TEMPLATE SECURITY.md scripts/submissions src/app/about src/features/catalog/components/site-header.tsx tests/e2e/contribution-links.spec.ts tests/unit
git commit -m "feat: add contribution and help flows"
```

---

### Task 9: Add CI, Daily Refresh, and GitHub Pages Deployment

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `.github/workflows/refresh-catalog.yml`
- Create: `.github/dependabot.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: validated pull requests, daily snapshots, static deployment, manual recovery

- [ ] **Step 1: Resolve and pin first-party action SHAs**

For `actions/checkout@v6`, `actions/setup-node@v6`,
`actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and
`actions/deploy-pages@v4`, run:

```powershell
gh api repos/actions/checkout/git/ref/tags/v6 --jq .object.sha
gh api repos/actions/setup-node/git/ref/tags/v6 --jq .object.sha
gh api repos/actions/configure-pages/git/ref/tags/v5 --jq .object.sha
gh api repos/actions/upload-pages-artifact/git/ref/tags/v4 --jq .object.sha
gh api repos/actions/deploy-pages/git/ref/tags/v4 --jq .object.sha
```

If a returned object is an annotated tag, dereference it with
`gh api repos/OWNER/REPO/git/tags/SHA --jq .object.sha`. Use the resulting full
40-character commit SHA in workflow `uses:` values and retain the major tag in
a comment.

- [ ] **Step 2: Implement submission triage**

Create `triage-submission.yml` for opened and edited issues whose title begins
`[Project submission]`. Grant `contents: read` and `issues: write`. Parse the
issue-form fields, run `validate-submission.mjs`, create
`needs-curator-review`, `needs-information`, and `duplicate-candidate` labels
when absent, apply the returned labels, and post one idempotent validation
comment when errors exist. The workflow must never create or edit a production
record.

- [ ] **Step 3: Implement CI**

On pull requests to `main` and manual dispatch, use read-only contents
permission and run:

```text
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:visual
```

Use `concurrency.group: ci-${{ github.ref }}` and cancel superseded runs.

- [ ] **Step 4: Implement Pages deployment**

On `main` push and manual dispatch:

1. validate and test;
2. build and verify `out/`;
3. configure Pages;
4. upload `out/`;
5. deploy to the `github-pages` environment.

Use `contents: read`, `pages: write`, and `id-token: write`. Use one `pages`
concurrency group and do not cancel an in-progress deployment.

- [ ] **Step 5: Implement daily refresh**

Schedule at a non-round UTC minute and allow:

```yaml
workflow_dispatch:
  inputs:
    mode:
      type: choice
      options: [incremental, backfill]
      default: incremental
    start_index:
      type: number
      default: 0
    batch_size:
      type: number
      default: 20
    project_id:
      type: string
      required: false
```

Use one `catalog-refresh` concurrency group without cancellation. Refresh,
validate, test, and build before committing only
`data/snapshots/github/*.json`. Dispatch the Pages workflow explicitly after
the bot push because a normal `GITHUB_TOKEN` push does not trigger another
workflow.

- [ ] **Step 6: Add Dependabot and operator documentation**

Configure weekly npm and GitHub Actions updates. Document local commands,
manual refresh, backfill batches, quarantine recovery, Pages configuration,
and the planned `tavernary.org` custom-domain migration. State that
`tavernary.net` forwarding is external to this repository.

- [ ] **Step 7: Validate workflows locally**

Run:

```powershell
npm run check
npm run test:e2e
npm run test:visual
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 8: Commit**

```powershell
git add .github README.md
git commit -m "ci: deploy and refresh Tavernary catalog"
```

---

### Task 10: Publish and Prove the Live Vertical Slice

**Files:**
- Modify only files required by evidence-backed failures
- Record: GitHub Actions run URLs and deployed Pages URL in the task handoff

**Interfaces:**
- Consumes: completed Tasks 1-9
- Produces: publicly reachable, verified five-card production slice

- [ ] **Step 1: Run the complete local gate**

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:visual
```

Expected: clean install succeeds and every check passes from the committed
lockfile.

- [ ] **Step 2: Push the implementation branch and verify CI**

Push the branch, open the Actions run, and confirm every CI step is green. Do
not infer success from local tests.

- [ ] **Step 3: Configure and deploy Pages**

Set repository Pages source to GitHub Actions. Manually dispatch
`deploy-pages.yml` and record the returned project-page URL.

Expected: deployment environment reports success and the URL returns HTTP 200.

- [ ] **Step 4: Prove refresh behavior**

Manually dispatch `refresh-catalog.yml` for
`mentallyquill-recursion`. Confirm:

- only its snapshot changes when upstream facts changed;
- validation and tests run before commit;
- no curated record changes;
- Pages redeploys explicitly;
- the site displays the new refresh timestamp.

- [ ] **Step 5: Run live desktop and mobile acceptance**

At `1440x1000` and `390x844`, verify:

- five cards load;
- every card opens its canonical source;
- all filters, views, sorts, density, and URL restoration work;
- New shows the seed-safe empty state;
- non-GitHub preset ordering is stable;
- About, Help, and Submit Project open the correct destinations;
- no horizontal overflow exists;
- keyboard focus and reduced motion work.

- [ ] **Step 6: Prove failure recovery**

Using fixtures or a temporary test-only override, run the refresh with a rate
limit, repository-ID mismatch, and unavailable repository. Confirm
last-known-good preservation, stale marking, source quarantine, and no curated
record mutation. Remove the override before the final gate.

- [ ] **Step 7: Run the final gate and commit evidence-backed fixes**

Run:

```powershell
npm run check
npm run test:e2e
npm run test:visual
git status --short
```

Expected: all checks pass and only intentional evidence/fix files remain.
Commit any required fixes with focused Conventional Commit messages. Do not
commit screenshots, traces, secrets, or temporary overrides.

## Vertical-Slice Exit Criteria

- Five real cards are publicly reachable on GitHub Pages.
- The approved mockup is reproduced at desktop, tablet, and mobile widths.
- Every catalog control is functional and URL-restorable.
- Curated text cannot be overwritten by source refreshes.
- Dormant, stale, identity-change, pause, quarantine, and recovery behavior are tested.
- Submit Project and all five Help choices work.
- Daily refresh and explicit redeployment are proven in GitHub Actions.
- A clean checkout passes the full local gate.
- Expansion to all 214 records requires data migration and review, not architectural redesign.

The 214-record expansion is deliberately a follow-on plan after this live
slice proves the production machinery.
