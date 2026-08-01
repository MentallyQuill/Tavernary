# Tavernary TavernKeeper Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tavernary publish exact-SHA scan targets, import and validate TavernKeeper's immutable report summaries, and render the approved inline scan indicator/popover on every supported project card.

**Architecture:** Tavernary remains the target and freshness authority. Its static catalog build emits one healthy GitHub target per repository ID and derives each card's local green/yellow/gray state from a tracked, atomically imported TavernKeeper report index; GitHub Pages publishes the target manifest, and two input-free workflows provide immediate wake-ups plus six-hour reconciliation.

**Tech Stack:** Existing Tavernary Next.js static export, React 19, TypeScript 6, Node.js 24, Ajv 8, Vitest 4, Testing Library, Playwright, GitHub Actions, GitHub Pages

## Global Constraints

- Preserve the frozen Tavernary commit `174bf44f` as reviewable starting material; reuse its valid exact-SHA/schema work but replace anything that differs from the approved written design.
- Tavernary is the only automatic target authority. A public form, issue, comment, URL parameter, or TavernKeeper payload cannot request a scan.
- Publish targets for active, public, healthy GitHub repository sources only, deduplicated by immutable positive GitHub repository ID and bound to a full lowercase 40-character head SHA.
- Do not publish targets or scan indicators for Codeberg, URL-only, or GitHub-organization sources.
- Derive canonical GitHub URLs from Tavernary's validated source record, not a remote notification or imported report.
- Treat TavernKeeper wake payloads as non-authoritative; always fetch the configured public report index independently.
- Reject cross-origin redirects, unknown fields/schema versions, invalid identities/SHAs/dates/results/counts, duplicate preferred identities, unsafe URLs, oversized responses, and mismatches against Tavernary's source registry.
- Preserve the previous valid local report summary file when a fetch or validation fails.
- Derive current/outdated state locally from Tavernary's healthy snapshot SHA; never trust TavernKeeper to label a report current or choose a card color.
- A complete exact-SHA report displays green or yellow. Pending, outdated, unavailable-current-source, and failed-without-current-report display gray. Unsupported sources display no scan indicator.
- Green means only that the completed policy found no active medium-confidence review-level finding; never write safe, verified, trusted, approved, or certified.
- Place the fixed-size scan indicator directly after the title's final visible character, not in a card corner. Long titles ellipsize earlier to reserve its space.
- The scan indicator is an independent button and must never be nested inside the project link. Preserve whole-card repository navigation with a semantic card container and stretched primary link.
- The popover contains only `TavernKeeper Scan Results`, plain state, nonzero severity counts, scanned SHA/date, and a full-report link when one exists.
- Support pointer hover, keyboard focus, touch tap, Escape, outside click, focus exit, viewport collision, anti-flicker pointer delay, and reduced motion.
- Wake TavernKeeper only after the new target manifest is live on Pages. Wake failures do not invalidate publication; six-hour reconciliation repairs them.
- Wake credentials belong to a destination-only GitHub App installed on TavernKeeper with `Actions: write` and no Contents write permission.
- Keep the implementation static: no Tavernary runtime server, database, webhook receiver, or API route.
- Pin all first-party Actions to full commit SHAs.

---

## File and Interface Map

### Target manifest

- `data/schemas/tavernkeeper-targets.schema.json`: producer-owned strict schema.
- `scripts/security/tavernkeeper-targets.mjs` and `.d.mts`: pure target builder and atomic writer.
- `public/security/tavernkeeper-targets.json`: ignored generated build artifact copied into static export.
- `tests/unit/tavernkeeper-targets.test.ts`: target eligibility, deduplication, identity, and ordering.

### Report import and card state

- `data/schemas/tavernkeeper-report-index.schema.json`: pinned consumer copy of TavernKeeper's V1 index schema.
- `data/security/tavernkeeper-report-summaries.json`: tracked last-known-valid sanitized import.
- `scripts/security/tavernkeeper-reports.mjs` and `.d.mts`: bounded fetch, strict validation, registry matching, and atomic write.
- `scripts/security/import-tavernkeeper-reports.mjs`: workflow CLI.
- `src/features/catalog/tavernkeeper-status.ts`: pure local freshness/status derivation.
- `scripts/catalog/build.mjs`: loads imported summaries, emits card status, target manifest, and catalog schema version 6.
- `src/features/catalog/catalog-types.ts`: discriminated `TavernKeeperCardStatus` contract.

### Scan indicator, card, and static export

- `src/components/icons/tavernkeeper-scan-icon.tsx`: supplied Remix Icon `scan-2-fill` path rendered with `currentColor`.
- `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`: scan indicator icon, state copy, portal popover, and interaction.
- `src/features/catalog/components/project-card.tsx`: semantic container, stretched primary link, inline title row, scan indicator.
- `src/styles/catalog.css`: inline title reservation, state colors, popover positioning, z-index, and reduced motion.
- `scripts/security/tavernkeeper-publication.mjs` and `.d.mts`: semantic digest comparison and public post-deploy verification.
- `scripts/verify-static-export.mjs`: verifies exported target manifest and security-bearing catalog.

### Workflows and tests

- `.github/workflows/import-tavernkeeper-reports.yml`: input-free wake/six-hour import, commit, test, and deploy.
- `.github/workflows/deploy-pages.yml`: compare target manifest, deploy, verify public bytes, wake TavernKeeper.
- `tests/unit/tavernkeeper-reports.test.ts`: importer security and atomicity.
- `tests/unit/tavernkeeper-status.test.ts`: exact freshness/color derivation.
- `tests/unit/tavernkeeper-scan-indicator.test.tsx`: concise content and interaction.
- `tests/unit/project-card.test.tsx`: nonnested controls and title placement.
- `tests/unit/build-catalog.test.ts`: source-to-report/card mapping.
- `tests/unit/workflows.test.ts`: triggers, Apps, permissions, schedules, and non-authoritative dispatch.
- `tests/e2e/catalog.spec.ts`: hydrated pointer/keyboard/touch behavior.
- `tests/visual/catalog.visual.spec.ts`: long-title desktop/mobile scan indicator layout.

---

### Task 1: Finish the Exact-SHA Target Manifest Producer

**Files:**
- Modify: `.gitignore`
- Create or replace: `data/schemas/tavernkeeper-targets.schema.json`
- Create or replace: `scripts/security/tavernkeeper-targets.mjs`
- Create or replace: `scripts/security/tavernkeeper-targets.d.mts`
- Modify: `scripts/catalog/build.mjs`
- Create or replace: `tests/unit/tavernkeeper-targets.test.ts`

**Interfaces:**
- Produces: `buildTavernKeeperTargets({ sources, snapshots, publishedSourceIds, generatedAt })` and `writeTavernKeeperTargets(manifest, outputPath?)`.
- Output: `public/security/tavernkeeper-targets.json` with one repository entry per GitHub repository ID.

- [ ] **Step 1: Extend the frozen tests with public-card eligibility, repository-ID deduplication, and source-derived URL assertions**

```ts
test("publishes one target only when the healthy GitHub source backs a public card", () => {
  const manifest = buildTavernKeeperTargets({
    sources: [source("github-42", 42, "Owner/Repo")],
    snapshots: [snapshot("github-42", 42, "Owner/Repo", fullSha)],
    publishedSourceIds: new Set(["github-42"]),
    generatedAt,
  });
  expect(manifest.repositories).toEqual([{
    source_id: "github-42",
    provider: "github",
    repository_id: 42,
    repository: "Owner/Repo",
    target_sha: fullSha,
    canonical_url: "https://github.com/Owner/Repo",
  }]);
});

test("omits a healthy source with no public Tavernary card", () => {
  expect(buildTavernKeeperTargets({ sources, snapshots, publishedSourceIds: new Set(), generatedAt }).repositories).toEqual([]);
});
```

- [ ] **Step 2: Run the target tests and verify the frozen implementation fails the added requirements**

Run: `npm test -- tests/unit/tavernkeeper-targets.test.ts`

Expected: FAIL because the frozen builder does not require a published card and uses the snapshot URL instead of deriving it from the source.

- [ ] **Step 3: Implement strict target selection and deduplication**

Require source type/status, public-source membership, matching healthy GitHub snapshot, matching positive repository ID, matching repository full name, and full head SHA. Construct `canonical_url` with `canonicalSourceUrl(source)`. Key by repository ID, reject conflicting duplicate identities, and sort numerically by repository ID.

- [ ] **Step 4: Wire target generation to the completed catalog build**

After `projects` is finalized, derive `publishedSourceIds` from the published project records. Write the target manifest only when `options.write !== false`, after the catalog JSON succeeds, using an adjacent temporary file and atomic rename.

- [ ] **Step 5: Run focused tests and static formatting**

Run: `npm test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/build-catalog.test.ts && npm run format:check`

Expected: PASS; Codeberg, stale, missing, malformed, unpublished, and identity-changing sources produce no target.

- [ ] **Step 6: Commit the target producer**

```bash
git add .gitignore data/schemas/tavernkeeper-targets.schema.json scripts/security/tavernkeeper-targets.mjs scripts/security/tavernkeeper-targets.d.mts scripts/catalog/build.mjs tests/unit/tavernkeeper-targets.test.ts
git commit -m "feat(security): publish exact scan targets"
```

### Task 2: Add the Strict TavernKeeper Report-Index Importer

**Files:**
- Create: `data/schemas/tavernkeeper-report-index.schema.json`
- Create: `data/security/tavernkeeper-report-summaries.json`
- Create: `scripts/security/tavernkeeper-reports.mjs`
- Create: `scripts/security/tavernkeeper-reports.d.mts`
- Create: `scripts/security/import-tavernkeeper-reports.mjs`
- Modify: `package.json`
- Create: `tests/fixtures/tavernkeeper/report-index.valid.json`
- Create: `tests/unit/tavernkeeper-reports.test.ts`

**Interfaces:**
- Produces: `TAVERNKEEPER_REPORT_INDEX_URL`, `ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION`, `fetchAndValidateTavernKeeperIndex(options)`, `validateReportIndex(index, registry)`, and `writeReportSummaries(index, outputPath)`.
- CLI: `npm run security:import-reports`.
- Configured origin: `https://mentallyquill.github.io`; configured path prefix: `/TavernKeeper/reports/`.

- [ ] **Step 1: Vendor TavernKeeper's exact V1 index schema and valid fixture**

Copy the reviewed producer schema and fixture byte-for-byte from TavernKeeper. Add a parity test that compares their parsed structures to the copies checked into this repository during cross-repository rollout.

- [ ] **Step 2: Write failing fetch, schema, identity, duplicate, redirect, size, and atomic-preservation tests**

```ts
await expect(fetchAndValidateTavernKeeperIndex({ ...options, fetchImpl: crossOriginRedirect })).rejects.toThrow(/origin/u);
await expect(fetchAndValidateTavernKeeperIndex({ ...options, fetchImpl: oversizedBody })).rejects.toThrow(/size/u);
expect(() => validateReportIndex(indexWithUnknownField, registry)).toThrow(/schema/u);
expect(() => validateReportIndex(indexWithWrongRepositoryId, registry)).toThrow(/identity/u);
expect(() => validateReportIndex(indexWithDuplicatePreferredIdentity, registry)).toThrow(/duplicate/u);
await expect(failedImport).rejects.toThrow();
expect(await readFile(outputPath, "utf8")).toBe(previousValidBytes);
```

- [ ] **Step 3: Run importer tests and verify failure**

Run: `npm test -- tests/unit/tavernkeeper-reports.test.ts`

Expected: FAIL because importer modules and local summary storage do not exist.

- [ ] **Step 4: Implement bounded same-origin fetching**

Set `TAVERNKEEPER_REPORT_INDEX_URL` to `https://mentallyquill.github.io/TavernKeeper/reports/index.json` and `ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION` to `"1"`. Use a 10-second timeout, two-megabyte maximum body, manual redirects, at most two same-origin redirects, public DNS resolution, exact HTTPS origin, and exact path. Reject authentication, ports other than 443, cross-origin redirects, non-2xx status, non-JSON content type, content-length excess, and streamed body excess.

- [ ] **Step 5: Implement strict index and registry validation**

Compile the vendored schema with Ajv and date-time/URI formats. Reject unknown schema versions/fields, invalid full SHAs, invalid report IDs, non-green/yellow results, negative/mismatched totals, unsafe URLs, duplicate report IDs, and more than one preferred entry for the same repository ID/SHA/scanner-policy tuple. Match `repository_id` first, then require `source_id` and canonical full name to match Tavernary's active GitHub source. Drop otherwise-valid entries for sources no longer known; do not invent entries.

- [ ] **Step 6: Implement deterministic atomic local storage and CLI**

Sort by repository ID, SHA, policy version, mode, and report version. Write to an adjacent temporary file, fsync/close, then rename only after the entire index validates. On any failure leave `data/security/tavernkeeper-report-summaries.json` byte-identical.

Initialize the tracked file as:

```json
{
  "schema_version": 1,
  "generated_at": "1970-01-01T00:00:00.000Z",
  "reports": []
}
```

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- tests/unit/tavernkeeper-reports.test.ts && npm run typecheck`

```bash
git add data/schemas/tavernkeeper-report-index.schema.json data/security/tavernkeeper-report-summaries.json scripts/security/tavernkeeper-reports.mjs scripts/security/tavernkeeper-reports.d.mts scripts/security/import-tavernkeeper-reports.mjs package.json tests/fixtures/tavernkeeper tests/unit/tavernkeeper-reports.test.ts
git commit -m "feat(security): import validated scan summaries"
```

### Task 3: Derive Exact Local Card State and Add It to Catalog Schema V6

**Files:**
- Create: `src/features/catalog/tavernkeeper-status.ts`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `tests/unit/build-catalog.test.ts`
- Create: `tests/unit/tavernkeeper-status.test.ts`
- Modify: `tests/helpers/generated-catalog.ts`
- Modify: `tests/fixtures/visual-catalog.json`
- Modify: `tests/e2e/static-export.spec.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Produces: `deriveTavernKeeperCardStatus({ source, snapshot, preferredReports }): TavernKeeperCardStatus | null`.
- Catalog field: `project.tavernKeeper`.

- [ ] **Step 1: Define the discriminated card-state contract in a failing type/unit test**

```ts
export interface TavernKeeperReportSummary {
  reportId: string;
  result: "green" | "yellow";
  scannedSha: string;
  scannedAt: string;
  reportUrl: string;
  severity: { critical: number; high: number; medium: number; low: number; info: number };
}

export type TavernKeeperCardStatus =
  | { state: "green" | "yellow"; reason: "current"; currentSha: string; report: TavernKeeperReportSummary }
  | { state: "gray"; reason: "pending" | "outdated" | "source-unavailable"; currentSha: string | null; report: TavernKeeperReportSummary | null };
```

`CatalogProject.tavernKeeper` is `TavernKeeperCardStatus | null`; `null` is the only unsupported-source representation.

- [ ] **Step 2: Write failing state tests for current, outdated, pending, unavailable, unsupported, and shared-source cards**

```ts
expect(deriveTavernKeeperCardStatus(currentGreen)).toMatchObject({ state: "green", reason: "current" });
expect(deriveTavernKeeperCardStatus(differentSha)).toMatchObject({ state: "gray", reason: "outdated" });
expect(deriveTavernKeeperCardStatus(noReport)).toMatchObject({ state: "gray", reason: "pending" });
expect(deriveTavernKeeperCardStatus(staleSnapshot)).toMatchObject({ state: "gray", reason: "source-unavailable" });
expect(deriveTavernKeeperCardStatus(codebergSource)).toBeNull();
expect(firstSibling.tavernKeeper).toEqual(secondSibling.tavernKeeper);
```

- [ ] **Step 3: Run state/build tests and verify failure**

Run: `npm test -- tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts`

Expected: FAIL because card security state and report-index build input do not exist.

- [ ] **Step 4: Implement preferred-report selection and local freshness**

For an active GitHub source, select the single producer-designated preferred entry for its repository ID, SHA, and active scanner-policy version; TavernKeeper has already applied newest adjudication, otherwise deep, otherwise standard precedence, and Tavernary's importer has rejected duplicate preferred tuples. If the snapshot is not healthy/current, return gray `source-unavailable`. If no report exists for the confirmed current SHA, retain the newest older preferred report as gray `outdated` or return gray `pending`. Only an exact report SHA match may return its green/yellow result.

- [ ] **Step 5: Load summaries in `buildCatalog` and bump the generated catalog contract**

Add `options.tavernKeeperReports` for tests and otherwise read `data/security/tavernkeeper-report-summaries.json`. Attach one derived object to every card sharing a source. Set `schemaVersion: 6` in output and `Catalog.schemaVersion: 6` in TypeScript. Update fixture/helper schema versions and give unsupported fixture projects `tavernKeeper: null`.

- [ ] **Step 6: Run focused and catalog-wide tests**

Run: `npm test -- tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/e2e/static-export.spec.ts && npm run typecheck`

Expected: PASS; no unmatched or unhealthy SHA produces green/yellow.

- [ ] **Step 7: Commit catalog integration**

```bash
git add src/features/catalog/tavernkeeper-status.ts src/features/catalog/catalog-types.ts scripts/catalog/build.mjs tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/helpers/generated-catalog.ts tests/fixtures/visual-catalog.json tests/e2e/static-export.spec.ts
git commit -m "feat(catalog): derive current scan state"
```

### Task 4: Build the Concise Accessible Scan Indicator and Popover

**Files:**
- Create: `src/components/icons/tavernkeeper-scan-icon.tsx`
- Create: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Create: `tests/unit/tavernkeeper-scan-indicator.test.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `LICENSING.md`
- Create: `LICENSES/Remix-Icon-License-v1.0.txt`

**Interfaces:**
- Produces: `<TavernKeeperScanIndicator projectId status />`.
- Trigger is a button with `aria-expanded`, `aria-controls`, and state-specific accessible label.

- [ ] **Step 1: Write failing content tests that forbid extra scanner details**

```tsx
const { container } = render(<TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />);
fireEvent.click(screen.getByRole("button", { name: /TavernKeeper scan: review suggested/u }));
const panel = screen.getByRole("dialog", { name: "TavernKeeper Scan Results" });
expect(panel).toHaveTextContent("Review suggested");
expect(panel).toHaveTextContent("1 high");
expect(panel).toHaveTextContent("Scanned abc1234 on July 31, 2026");
expect(within(panel).getByRole("link", { name: "View full report" })).toHaveAttribute("href", yellowStatus.report.reportUrl);
expect(panel).not.toHaveTextContent(/Gitleaks|OpenGrep|policy|coverage|excluded/u);
expect(container.querySelector('svg[data-icon="scan-2-fill"]')).toBeInTheDocument();
```

- [ ] **Step 2: Write failing interaction tests**

Use fake timers to prove pointer hover opens, trigger-to-panel movement cancels the close delay, pointer exit closes after 150 ms, focus opens, focus within the panel stays open, Escape/outside pointer/focus exit closes, touch click toggles, a second scan indicator closes the first, and reduced-motion media removes transitions.

- [ ] **Step 3: Run the scan indicator tests and verify failure**

Run: `npm test -- tests/unit/tavernkeeper-scan-indicator.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the state icon and minimal copy**

Render the supplied Remix Icon `scan-2-fill` path as one local inline SVG with `viewBox="0 0 24 24"`, `fill="currentColor"`, `aria-hidden`, and `data-icon="scan-2-fill"`. Keep the asset under its Remix Icon License v1.0 and record that exception in `LICENSING.md`; never present the glyph as a logo, protection mark, or certification. Use text labels:

```ts
const stateCopy = {
  green: "No review-level findings",
  yellow: "Review suggested",
  pending: "Current scan pending",
  outdated: "Previous result does not cover this commit",
  "source-unavailable": "Current source state unavailable",
} as const;
```

Render only nonzero severity counts in critical/high/medium/low/informational order. For any retained report, show short SHA, accessible full SHA, UTC date, and full-report link.

- [ ] **Step 5: Implement the portal interaction and collision positioning**

Use refs for trigger/panel, a 150 ms pointer-exit timer, document `pointerdown` and `keydown`, focus containment, viewport margin 8 px, gap 8 px, and resize/scroll repositioning. Use `role="dialog"`, a visible heading exactly `TavernKeeper Scan Results`, and no modal focus trap.

- [ ] **Step 6: Add focused state styles**

Create `.tavernkeeper-scan-indicator-{green,yellow,gray}`, `.tavernkeeper-popover`, and `.tavernkeeper-severity-counts`. Color is supplemental; accessible labels and text carry state. Use a 16 px scan indicator glyph, an 18 px layout box, and a transparent `::before` hit area expanded to at least 32 px so accessibility does not push the visible scan indicator away from the title.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- tests/unit/tavernkeeper-scan-indicator.test.tsx && npm run typecheck && npm run format:check`

```bash
git add src/components/icons/tavernkeeper-scan-icon.tsx src/features/catalog/components/tavernkeeper-scan-indicator.tsx src/styles/catalog.css tests/unit/tavernkeeper-scan-indicator.test.tsx LICENSING.md LICENSES/Remix-Icon-License-v1.0.txt
git commit -m "feat(catalog): add scan result popover"
```

### Task 5: Refactor Project Cards to a Semantic Container and Inline Scan Indicator

**Files:**
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/kit-project-stack.test.tsx`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`

**Interfaces:**
- `ProjectCard` keeps the same props.
- Root becomes a semantic `.project-card` container; `.project-card-primary-link` is the only repository link and owns a stretched `::after` hit surface; TavernKeeper, Kit, and relationship buttons remain independent higher-layer controls.

- [ ] **Step 1: Add failing markup and placement tests**

```tsx
const card = container.querySelector("article.project-card");
const link = screen.getByRole("link", { name: "A Very Long Project Name" });
const indicator = screen.getByRole("button", { name: /TavernKeeper scan/u });
expect(card).toContainElement(link);
expect(card).toContainElement(indicator);
expect(link).not.toContainElement(indicator);
expect([...(card?.querySelector("h2.card-title-row")?.children ?? [])]).toEqual([link, indicator]);
expect(link.querySelector(".card-title")).toHaveTextContent("A Very Long Project Name");
```

- [ ] **Step 2: Run card tests and verify the current anchor-root design fails**

Run: `npm test -- tests/unit/project-card.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/catalog-batch-flow.test.tsx`

Expected: FAIL because `.project-card` is currently the repository anchor and cannot contain an independent scan indicator button.

- [ ] **Step 3: Refactor markup without changing card information**

Return `<article className="project-card">`. Place the title link and scan indicator as direct children of `<h2 className="card-title-row">`; keep hidden accessible description linked from the primary link. Keep all existing top metrics, attribution, state notes, summary, search evidence, chips, and license as siblings in the card container. Update tests that previously queried metadata as descendants of the link to query the containing article.

- [ ] **Step 4: Implement stretched-link and independent-control layering**

```css
.project-card-primary-link::after {
  position: absolute;
  z-index: 1;
  inset: 0;
  content: "";
}

.card-title-row,
.project-card .tooltip-anchor,
.tavernkeeper-scan-indicator-trigger {
  position: relative;
  z-index: 2;
}
```

Keep existing Kit and relationship controls at their established higher layers. Recreate hover/focus/active card styling with `:has(.project-card-primary-link:hover)`, `:has(.project-card-primary-link:focus-visible)`, and shell active selectors.

- [ ] **Step 5: Implement exact inline title sizing**

`.card-title-row` is `display:flex; min-width:0; align-items:center; gap:4px`. The primary link and `.card-title` use `min-width:0; width:max-content; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. The scan indicator uses `flex:none`. It never shrinks or moves to the right edge; short titles leave unused space after the scan indicator.

- [ ] **Step 6: Run card/Kit tests and commit**

Run: `npm test -- tests/unit/project-card.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/catalog-batch-flow.test.tsx && npm run typecheck`

```bash
git add src/features/catalog/components/project-card.tsx src/features/catalog/components/project-grid.tsx src/styles/catalog.css tests/unit/project-card.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/catalog-batch-flow.test.tsx
git commit -m "refactor(catalog): keep card controls outside links"
```

### Task 6: Verify Static Export, Hydrated Interaction, and Long-Title Layout

**Files:**
- Modify: `scripts/verify-static-export.mjs`
- Modify: `scripts/verify-static-export.d.mts`
- Modify: `tests/unit/static-export-verification.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Add: approved scan indicator snapshots under `tests/visual/catalog.visual.spec.ts-snapshots/`

**Interfaces:**
- Static verifier proves `out/security/tavernkeeper-targets.json` exists and validates.
- Browser tests prove actual portal interaction and card navigation after hydration.

- [ ] **Step 1: Add failing static-export assertions**

```ts
expect(await readJson("out/security/tavernkeeper-targets.json")).toMatchObject({
  schema_version: 1,
  repositories: expect.any(Array),
});
expect(catalog.projects.find(({ id }) => id === fixtureId)?.tavernKeeper).toBeDefined();
```

- [ ] **Step 2: Add Playwright pointer, keyboard, touch, and navigation tests**

Test green, yellow, gray, and unsupported cards; exact concise panel contents; hover retention; Escape; outside click; tab focus; touch toggle; full-report external link; primary card link navigation; and independent Kit/relationship buttons. Assert no `a button` or `button a` nesting exists.

- [ ] **Step 3: Add deterministic long-title visual cases**

At desktop, compact-card, and phone widths, use a short title and a title long enough to ellipsize. Assert the scan indicator's left edge follows the rendered title rather than the card's right padding, the scan indicator remains fully visible, and the popover stays in the viewport without card clipping.

- [ ] **Step 4: Run focused browser and visual gates**

Run: `npm run build && npm run verify:export && npm run test:e2e -- tests/e2e/catalog.spec.ts && npm run test:visual -- tests/visual/catalog.visual.spec.ts`

Expected: PASS with reviewed snapshot changes limited to the new scan indicator/card semantics.

- [ ] **Step 5: Commit export and browser coverage**

```bash
git add scripts/verify-static-export.mjs scripts/verify-static-export.d.mts tests/unit/static-export-verification.test.ts tests/e2e/catalog.spec.ts tests/visual/catalog.visual.spec.ts tests/visual/catalog.visual.spec.ts-snapshots
git commit -m "test(catalog): verify scan indicators end to end"
```

### Task 7: Add Report Reconciliation and TavernKeeper Wake Workflows

**Files:**
- Create: `scripts/security/tavernkeeper-publication.mjs`
- Create: `scripts/security/tavernkeeper-publication.d.mts`
- Create: `tests/unit/tavernkeeper-publication.test.ts`
- Create: `.github/workflows/import-tavernkeeper-reports.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Produces: `manifestDigest(path)`, `readPublicManifest(url)`, and `verifyPublicManifest(url, expectedDigest)`.
- Import workflow has input-free `workflow_dispatch` plus six-hour schedule.
- Deploy workflow wakes TavernKeeper only after the public target digest matches the built digest and differs from the prior public digest.

- [ ] **Step 1: Write failing publication digest and workflow-policy tests**

```ts
expect(manifestDigest(first)).toBe(manifestDigest(structurallyIdentical));
await expect(verifyPublicManifest(url, wrongDigest)).rejects.toThrow(/digest/u);
expect(importWorkflow.on.schedule).toEqual([{ cron: "41 */6 * * *" }]);
expect(importWorkflow.on.workflow_dispatch).toBeNull();
expect(deployWorkflow.jobs["wake-tavernkeeper"].needs).toEqual(["build", "deploy"]);
expect(JSON.stringify(deployWorkflow)).not.toContain("contents: write\n      actions: write");
```

- [ ] **Step 2: Run publication/workflow tests and verify failure**

Run: `npm test -- tests/unit/tavernkeeper-publication.test.ts tests/unit/workflows.test.ts`

Expected: FAIL because reconciliation/wake workflows and digest helpers do not exist.

- [ ] **Step 3: Implement `import-tavernkeeper-reports.yml`**

Use `schedule: 41 */6 * * *` and input-free `workflow_dispatch`. Check out `main`, install Node 24 dependencies, import the public index, run `npm run check`, commit only `data/security/tavernkeeper-report-summaries.json` when bytes changed, rebase/push with three bounded attempts, and dispatch `deploy-pages.yml` with the exact committed SHA. Failed import leaves the prior file unchanged and the workflow visibly fails; it never requests a scan.

- [ ] **Step 4: Compare target manifests during the Pages build**

Before deployment, fetch the existing public target manifest with the same origin/size protections; treat missing prior publication as changed. After `npm run check` produces `out/security/tavernkeeper-targets.json`, output prior digest, built digest, and changed boolean from the build job.

- [ ] **Step 5: Verify Pages and wake TavernKeeper through the destination-only App**

After the existing deploy job succeeds, poll the public manifest until its digest equals the build output. If it changed, create an installation token with:

```yaml
uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349
with:
  app-id: ${{ secrets.TAVERNKEEPER_WAKE_APP_ID }}
  private-key: ${{ secrets.TAVERNKEEPER_WAKE_APP_PRIVATE_KEY }}
  owner: MentallyQuill
  repositories: TavernKeeper
```

Dispatch only `repos/MentallyQuill/TavernKeeper/actions/workflows/reconcile.yml/dispatches` with `ref=main` and no inputs. Convert wake failure into a workflow warning after the valid deployment; the six-hour fallback remains authoritative.

- [ ] **Step 6: Assert narrow permissions and immutable Action pins**

Use existing full SHAs for checkout/setup/pages Actions and the verified App-token SHA. The App has destination `Actions: write` only. The workflow's built-in token never receives TavernKeeper access.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- tests/unit/tavernkeeper-publication.test.ts tests/unit/workflows.test.ts && npm run typecheck && npm run format:check`

```bash
git add scripts/security/tavernkeeper-publication.mjs scripts/security/tavernkeeper-publication.d.mts tests/unit/tavernkeeper-publication.test.ts .github/workflows/import-tavernkeeper-reports.yml .github/workflows/deploy-pages.yml tests/unit/workflows.test.ts
git commit -m "feat(security): reconcile scans across repositories"
```

### Task 8: Document the Handshake and Run Tavernary's Full Release Gate

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Create: `docs/tavernkeeper-integration.md`
- Modify: `tests/unit/classify-pr-paths.test.ts`
- Modify: `scripts/ci/classify-pr-paths.mjs`

**Interfaces:**
- Security/docs describe the exact public contracts, advisory semantics, App setup, failure recovery, and owner appeal boundary.
- CI route treats security code/schema/workflow changes as full-check changes.

- [ ] **Step 1: Add failing CI path-classification tests**

```ts
for (const path of [
  "scripts/security/tavernkeeper-reports.mjs",
  "data/schemas/tavernkeeper-report-index.schema.json",
  ".github/workflows/import-tavernkeeper-reports.yml",
  "src/features/catalog/components/tavernkeeper-scan-indicator.tsx",
]) {
  expect(classify([path])).toBe("full");
}
```

- [ ] **Step 2: Run classification tests and verify failure where routing is incomplete**

Run: `npm test -- tests/unit/classify-pr-paths.test.ts`

Expected: FAIL for any new path that the existing classifier would incorrectly treat as content-only.

- [ ] **Step 3: Update CI routing and documentation**

Document exact target/index URLs, schemas, six-hour schedules, two one-way Apps, secrets, workflow names, source/report identity checks, gray-state causes, green/yellow threshold, no automatic moderation, no owner notifications, no public scan request, static-only architecture, and recovery from missed wakes/import failure.

- [ ] **Step 4: Run Tavernary's complete local gate**

Run: `npm run check`

Expected: PASS across formatting, lint, palette audit, catalog validation/build, typecheck, unit tests, Next static build, and static-export verification.

- [ ] **Step 5: Run focused browser gates**

Run: `npm run test:e2e && npm run test:visual && npm run build:test-kits && npm run test:kits-e2e && npm run test:kits-visual`

Expected: PASS with scan indicator behavior present in ordinary and Kit-rendered project cards.

- [ ] **Step 6: Commit Tavernary documentation and release routing**

```bash
git add README.md SECURITY.md docs/tavernkeeper-integration.md scripts/ci/classify-pr-paths.mjs tests/unit/classify-pr-paths.test.ts
git commit -m "docs(security): document TavernKeeper handshake"
```

---

## Tavernary Completion Evidence

Before starting cross-repository rollout, capture:

1. `git status --short` is empty.
2. `npm run check` passes.
3. Browser and visual suites pass at desktop, compact, and phone widths.
4. `out/security/tavernkeeper-targets.json` validates and contains only public healthy GitHub exact-SHA targets.
5. Multiple cards sharing one GitHub repository ID share one imported report state.
6. An unmatched, stale, unavailable, malformed, or absent report never creates green/yellow.
7. Unsupported source types contain `tavernKeeper: null` and render no scan indicator.
8. The scan indicator is immediately after title text, remains visible beside an ellipsized long title, and is not nested in the repository link.
9. The popover contains only the approved concise fields and satisfies pointer, keyboard, touch, Escape, outside-click, focus, collision, and reduced-motion tests.
10. A failed report import preserves the previous tracked summary bytes.
11. Wake workflows send no target/SHA/mode/budget/report URL payload and use destination-only Apps with Actions write permission.
12. No runtime server, API route, webhook receiver, database, public scan request, Codeberg scan, or automatic listing moderation was added.
