# Kit Upvote Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Tavernary's automatically refreshed GitHub `+1` count as a plain orange numeral immediately left of each Kit upvote arrow, while removing component-level repository hardcoding and proving the refresh workflow remains data-driven.

**Architecture:** A single canonical site configuration supplies the GitHub repository identity to catalog generation. Generated `CatalogKit` entries expose a complete `sourceIssueUrl`, while the existing support snapshot pipeline continues to calculate `supporterCount`; the Kit card renders those two generated values without reconstructing backend data. The scheduled refresh remains registry-driven and environment-driven, with focused tests locking its pagination, URL derivation, snapshot staging, validation, and redeployment contracts.

**Tech Stack:** TypeScript 6, React 19, Next.js static export, Node.js 24 ESM scripts, Vitest, Testing Library, Playwright, GitHub Actions YAML.

## Global Constraints

- The vote count is only the decimal numeral immediately left of the arrow.
- The count uses the shared orange theme token and has no background, border, icon, or visible label.
- Numeric zero renders as `0`; unavailable `null` support renders no count.
- The metadata row must not repeat `N supporter(s)`.
- GitHub remains the voting surface; Tavernary adds no account, OAuth, runtime API, or voting database.
- Only eligible active GitHub `+1` reactions count; stale refreshes retain the last valid snapshot.
- Components must not hardcode repository names, Kit IDs, issue numbers, or vote totals.
- The upvote arrow retains the project-card plus control's geometry and interaction treatment.
- Preserve unrelated working-tree changes and commit locally only unless the user separately requests a push.

---

## File Structure

- Create `data/site.json`: canonical repository identity used during catalog generation.
- Modify `scripts/catalog/build.mjs`: read/inject site configuration and generate each Kit's complete source issue URL.
- Modify `src/features/kits/kit-types.ts`: add the generated `sourceIssueUrl` contract.
- Modify `src/generated/catalog.json`: regenerated output only.
- Modify `tests/unit/build-catalog.test.ts`: prove repository identity and issue number become a literal canonical URL without component hardcoding.
- Modify Kit fixtures in `tests/unit/*.test.ts(x)` that construct `CatalogKit` values: provide `sourceIssueUrl`.
- Modify `src/features/kits/components/kit-upvote-control.tsx`: consume the complete URL and numeric/null support count.
- Modify `src/features/kits/components/kit-card.tsx`: remove supporter metadata and pass generated upvote data.
- Modify `src/styles/catalog.css`: position and style the plain orange count beside the unchanged arrow target.
- Modify `tests/unit/kit-card.test.tsx`: prove numeric, zero, null, label-removal, link, and event behavior.
- Modify `tests/unit/visual-alignment-contract.test.ts`: protect count placement and semantic token use.
- Modify `tests/kits-e2e/kits.spec.ts`: prove rendered count placement, color, and unchanged arrow geometry.
- Modify `tests/kits-e2e/kits.visual.spec.ts` and affected snapshots: retain rendered visual proof.
- Modify `scripts/kits/refresh-reactions.mjs`: expose and use a pure repository/issue/page URL builder with validation.
- Modify `scripts/kits/refresh-reactions.d.mts`: type the new URL builder.
- Modify `tests/unit/refresh-kit-reactions.test.ts`: prove dynamic URL construction and keep the existing discovery/pagination semantics covered.
- Modify `tests/unit/workflows.test.ts`: parse the workflow and prove the refresh, staging, validation, and deployment steps are wired without enumerated Kits.

---

### Task 1: Generate Canonical Kit Issue URLs

**Files:**

- Create: `data/site.json`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/kits/kit-types.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `src/generated/catalog.json`
- Modify: Kit fixtures under `tests/unit/` that construct `CatalogKit`

**Interfaces:**

- Consumes: `{ "github_repository": string }` from `data/site.json`.
- Produces: `CatalogKit.sourceIssueUrl: string`.
- Produces: `buildCatalog({ siteConfig?: { github_repository: string } })`.

- [ ] **Step 1: Write the failing catalog-generation test**

Add an injected site configuration to the existing Kit build test:

```ts
const catalog = await buildCatalog({
  write: false,
  now: "2026-07-25T00:00:00.000Z",
  siteConfig: { github_repository: "fixture-owner/fixture-repository" },
  records,
  snapshots: [],
  kitRecords: [fixtureKit({ source_issue_number: 241 })],
  kitSnapshots: [fixtureKitSnapshot()],
  blockedUsers: { schema_version: 1, blocked: [] },
});

expect(catalog.kits[0]).toMatchObject({
  sourceIssueNumber: 241,
  sourceIssueUrl:
    "https://github.com/fixture-owner/fixture-repository/issues/241",
});
```

This test catches a component rebuilding the URL, a fixed production
repository literal, or use of the wrong Kit issue number.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/build-catalog.test.ts
```

Expected: FAIL because `sourceIssueUrl` is absent.

- [ ] **Step 3: Add canonical configuration and minimal generation**

Create:

```json
{
  "github_repository": "MentallyQuill/Tavernary"
}
```

Extend the `buildCatalog()` input load with:

```js
options.siteConfig ?? readJson("data/site.json")
```

Generate the URL from configuration and canonical Kit data:

```js
sourceIssueNumber: kit.source_issue_number,
sourceIssueUrl:
  `https://github.com/${siteConfig.github_repository}` +
  `/issues/${kit.source_issue_number}`,
```

Add to `CatalogKit`:

```ts
sourceIssueUrl: string;
```

Do not add a fallback repository literal to `build.mjs`.

- [ ] **Step 4: Update typed fixtures and generated output**

For hand-built `CatalogKit` fixtures, add a fixture-owned value such as:

```ts
sourceIssueUrl: "https://github.com/fixture/fixture/issues/41",
```

Then regenerate:

```powershell
npm.cmd run catalog:build
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- data/site.json scripts/catalog/build.mjs src/features/kits/kit-types.ts src/generated/catalog.json tests/unit
git commit -m "feat(kits): generate source issue URLs"
```

---

### Task 2: Move the Generated Count Beside the Arrow

**Files:**

- Modify: `src/features/kits/components/kit-upvote-control.tsx`
- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `tests/unit/kit-card.test.tsx`

**Interfaces:**

- Consumes: `sourceIssueUrl: string`.
- Consumes: `supporterCount: number | null`.
- Produces: `KitUpvoteControl({ sourceIssueUrl, supporterCount })`.

- [ ] **Step 1: Write one failing rendered behavior test**

Replace the old metadata assertion and extend the upvote test with:

```ts
renderCard(
  kit({
    sourceIssueUrl: "https://github.com/fixture/catalog/issues/241",
    supporterCount: 12,
  }),
);

const upvote = screen.getByRole("link", { name: "Upvote on GitHub" });
const count = screen.getByText("12");

expect(upvote).toHaveAttribute(
  "href",
  "https://github.com/fixture/catalog/issues/241",
);
expect(count).toHaveClass("kit-upvote-count");
expect(count.parentElement).toContainElement(upvote);
expect(screen.queryByText(/supporters?/i)).not.toBeInTheDocument();
```

This test catches a hardcoded repository URL, a duplicated metadata label, or a
count rendered outside the upvote cluster.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-card.test.tsx
```

Expected: FAIL because the component still renders `12 supporters` in metadata
and reconstructs its own URL.

- [ ] **Step 3: Implement the minimal numeric rendering**

Change the upvote control signature to:

```ts
export function KitUpvoteControl({
  sourceIssueUrl,
  supporterCount,
}: {
  sourceIssueUrl: string;
  supporterCount: number | null;
}) {
```

Inside a `kit-upvote-cluster`, render:

```tsx
{supporterCount === null ? null : (
  <span className="kit-upvote-count">{supporterCount}</span>
)}
<a href={sourceIssueUrl} ...>
```

Remove `kitUpvoteUrl()` and remove the supporter item from
`.kit-card-metadata`. Pass:

```tsx
<KitUpvoteControl
  sourceIssueUrl={kit.sourceIssueUrl}
  supporterCount={kit.supporterCount}
/>
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the zero/null boundary test and verify RED/GREEN**

Add one table-driven test:

```ts
test.each([
  { supporterCount: 0, visible: true },
  { supporterCount: null, visible: false },
])("renders support value $supporterCount correctly", ({ supporterCount, visible }) => {
  renderCard(kit({ supporterCount }));
  const count = screen.queryByText("0");
  expect(Boolean(count)).toBe(visible);
  expect(screen.queryByText(/supporters?|votes?/i)).not.toBeInTheDocument();
});
```

Run the focused test before and after any needed adjustment. The zero case must
not use a truthiness check.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/features/kits/components/kit-upvote-control.tsx src/features/kits/components/kit-card.tsx tests/unit/kit-card.test.tsx
git commit -m "feat(kits): show count beside upvote"
```

---

### Task 3: Lock the Orange Count's Rendered Layout

**Files:**

- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: affected files under `tests/kits-e2e/kits.visual.spec.ts-snapshots/`

**Interfaces:**

- Consumes: `.kit-upvote-cluster`, `.kit-upvote-count`, and the existing
  `.project-kit-control`.
- Produces: plain orange numeric text immediately left of the unchanged
  44-pixel arrow target.

- [ ] **Step 1: Write the failing CSS contract**

Add:

```ts
expect(css).toMatch(
  /\.kit-upvote-cluster\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4px[^}]*right:\s*4px[^}]*display:\s*flex[^}]*align-items:\s*center/s,
);
expect(css).toMatch(
  /\.kit-upvote-count\s*\{[^}]*color:\s*var\(--color-functional\)[^}]*background:\s*transparent/s,
);
```

This catches layout drift and use of a literal color or badge background.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because these selectors do not exist.

- [ ] **Step 3: Add minimal layout styles**

Replace the single-target absolute wrapper with a flex cluster:

```css
.kit-upvote-cluster {
  position: absolute;
  z-index: 4;
  right: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
}

.kit-upvote-count {
  color: var(--color-functional);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
```

Keep `.project-kit-control` at 44 by 44 pixels and
`.project-kit-control-face` at 28 by 28 pixels. Increase the footer's right
gutter only enough to prevent Copy/Report overlap with a multi-digit count and
the arrow.

- [ ] **Step 4: Verify the CSS contract GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts tests/unit/kit-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add rendered browser assertions**

In the existing Kit upvote E2E test, assert:

```ts
const count = card.locator(".kit-upvote-count");
await expect(count).toHaveText("2");

const countBox = await count.boundingBox();
const arrowBox = await upvote.boundingBox();
expect(countBox).not.toBeNull();
expect(arrowBox).not.toBeNull();
expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(arrowBox!.x);
expect(await count.evaluate((node) => getComputedStyle(node).color)).toBe(
  "rgb(225, 138, 36)",
);
```

Retain the existing exact arrow/plus geometry comparison.

- [ ] **Step 6: Run browser RED/GREEN and update visual baselines**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual -- --update-snapshots
npm.cmd run test:kits-visual
```

Expected: E2E and visual suites PASS after intentional baseline updates.
Inspect each changed PNG to confirm the only intended change is the orange
numeral and required footer spacing.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts tests/kits-e2e/kits.visual.spec.ts-snapshots
git commit -m "style(kits): align upvote count"
```

---

### Task 4: Prove Refresh Automation Is Dynamic

**Files:**

- Modify: `scripts/kits/refresh-reactions.mjs`
- Modify: `scripts/kits/refresh-reactions.d.mts`
- Modify: `tests/unit/refresh-kit-reactions.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:
  `githubReactionUrl({ repository, issueNumber, page, perPage }): string`.
- Retains:
  `refreshKitReactions({ kits, snapshots, blockedUsers, fetchPage, now })`.

- [ ] **Step 1: Write the failing URL-boundary test**

Add:

```ts
expect(
  githubReactionUrl({
    repository: "fixture-owner/fixture-catalog",
    issueNumber: 241,
    page: 3,
    perPage: 100,
  }),
).toBe(
  "https://api.github.com/repos/fixture-owner/fixture-catalog/issues/241/reactions?per_page=100&page=3",
);
```

This catches a fixed production repository, fixed issue number, or lost
pagination argument.

- [ ] **Step 2: Run the reaction tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/refresh-kit-reactions.test.ts
```

Expected: FAIL because `githubReactionUrl` is not exported.

- [ ] **Step 3: Add the pure URL builder and use it**

Implement:

```js
export function githubReactionUrl({
  repository,
  issueNumber,
  page,
  perPage,
}) {
  if (!repository) throw new Error("GitHub repository is required");
  return (
    `https://api.github.com/repos/${repository}/issues/${issueNumber}` +
    `/reactions?per_page=${perPage}&page=${page}`
  );
}
```

Call it from `githubReactionPage()` with
`repository: process.env.GITHUB_REPOSITORY` and
`issueNumber: kit.source_issue_number`. Add the matching declaration to the
`.d.mts` file.

- [ ] **Step 4: Verify URL and reaction semantics GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/refresh-kit-reactions.test.ts
```

Expected: PASS, including existing pagination, deduplication, eligibility,
removal, re-addition, and stale fallback tests.

- [ ] **Step 5: Add the parsed workflow contract**

Parse `refresh-catalog.yml` using the existing YAML test helper and assert:

```ts
const document = await workflow("refresh-catalog");
const steps = allSteps(document) as Array<{ name?: string; run?: string }>;
const stepRun = (name: string) =>
  steps.find((step) => step.name === name)?.run ?? "";

expect(document.permissions.issues).toBe("read");
expect(stepRun("Refresh Kit community support")).toBe(
  "node scripts/kits/refresh-reactions.mjs",
);
expect(stepRun("Commit snapshot changes")).toContain(
  'data/snapshots/github/kits/*.json',
);
expect(stepRun("Commit snapshot changes")).toContain("npm run check");
expect(stepRun("Redeploy refreshed catalog")).toContain(
  "gh workflow run deploy-pages.yml --ref main",
);
```

Also assert that the workflow command does not contain any canonical Kit ID or
source issue number from the registry fixtures.

- [ ] **Step 6: Run workflow and refresh tests**

Run:

```powershell
npx.cmd vitest run tests/unit/refresh-kit-reactions.test.ts tests/unit/workflows.test.ts
```

Expected: PASS. No workflow production edit is required if the current dynamic
wiring satisfies the new contract.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- scripts/kits/refresh-reactions.mjs scripts/kits/refresh-reactions.d.mts tests/unit/refresh-kit-reactions.test.ts tests/unit/workflows.test.ts
git commit -m "test(kits): lock dynamic vote refresh"
```

---

### Task 5: Final Verification and Local Commit Audit

**Files:**

- Verify all files changed by Tasks 1-4.

**Interfaces:**

- Produces: a locally committed `main` containing the reviewed upvote count and
  automated refresh safeguards.

- [ ] **Step 1: Run focused Kit verification**

```powershell
npx.cmd vitest run tests/unit/build-catalog.test.ts tests/unit/kit-card.test.tsx tests/unit/refresh-kit-reactions.test.ts tests/unit/visual-alignment-contract.test.ts tests/unit/workflows.test.ts
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 2: Run the full repository gate**

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all Vitest tests, production build, and static-export verification PASS.

- [ ] **Step 3: Audit the final local state**

```powershell
git status --short
git log -8 --oneline --decorate
git diff origin/main...HEAD --stat
```

Expected: no uncommitted implementation files; all new commits are local.
Do not push or dispatch deployment.
