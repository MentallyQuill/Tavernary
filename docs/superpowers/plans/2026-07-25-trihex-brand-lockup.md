# Trihex Brand Lockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the supplied trihex emblem to the production header while retaining the exact live Tavernary wordmark and tagline.

**Architecture:** Treat the supplied PNG as an immutable public asset. Update the existing `SiteHeader` lockup and its desktop/mobile geometry, then verify the public asset through the static-export boundary.

**Tech Stack:** Next.js 16 static export, React 19, CSS, Vitest, Playwright

## Global Constraints

- Use `C:\Users\Keptin\Downloads\Tavernary-trihex.png` without changing its pixels or transparency.
- Keep `Tavernary` and `Where AI roleplay tools gather` as live text.
- Place the emblem before the wordmark/tagline block.
- Do not change catalog data, navigation behavior, favicon assets, footer copy, or unrelated visual styling.

---

### Task 1: Install and render the trihex lockup

**Files:**
- Create: `public/tavernary-trihex.png`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/e2e/static-export.spec.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: the supplied 244 by 244 transparent PNG and the existing `.brand`, `.brand-logo`, `.brand-copy`, and `.brand-tagline` contracts.
- Produces: `./tavernary-trihex.png`, rendered before `.brand-copy`, at 52 by 52 pixels on desktop and 48 by 48 pixels on mobile.

- [x] **Step 1: Write failing brand and export tests**

Update the existing assertions to require:

```ts
expect(header).toContain('src="./tavernary-trihex.png"');
expect(header.indexOf("brand-logo")).toBeLessThan(
  header.indexOf("brand-copy"),
);
expect(header).toContain("Where AI roleplay tools gather");
```

Require `52px` square desktop geometry, `48px` square mobile geometry, and a successful PNG response from `${sitePath()}tavernary-trihex.png`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the header still references `tavernary-gems.png`, the emblem follows `.brand-copy`, and the current geometry is not square.

- [x] **Step 3: Install the supplied asset and implement the lockup**

Copy the source PNG byte-for-byte to `public/tavernary-trihex.png`. In `SiteHeader`, render:

```tsx
<Image
  className="brand-logo"
  src="./tavernary-trihex.png"
  alt=""
  width={244}
  height={244}
  priority
/>
<span className="brand-copy">
  <span className="brand-name">Tavernary</span>
  <span className="brand-tagline">Where AI roleplay tools gather</span>
</span>
```

Set `.brand` to an `8px` gap, `.brand-logo` to `52px` square on desktop, and `48px` square on mobile.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
npm run build
npm run test:e2e -- tests/e2e/static-export.spec.ts tests/e2e/mobile.spec.ts tests/e2e/catalog.spec.ts
```

Expected: all focused tests pass and the static export serves the new PNG.

- [x] **Step 5: Verify the production-shaped result**

Run:

```powershell
npm run typecheck
npm run lint
npm run verify:export
git diff --check
```

Inspect desktop and mobile header screenshots to confirm the emblem is left of the wordmark, the tagline remains visible, and no header controls collide.

- [ ] **Step 6: Commit**

```powershell
git add public/tavernary-trihex.png src/features/catalog/components/site-header.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts tests/e2e/mobile.spec.ts tests/e2e/static-export.spec.ts tests/e2e/catalog.spec.ts docs/superpowers/plans/2026-07-25-trihex-brand-lockup.md
git commit -m "feat(brand): install trihex lockup"
```

### Task 2: Prevent the mobile server-render flicker

**Files:**
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `KitBuilderPanel`'s existing `data-motion-phase` attribute, which is present only when the panel is operating as an active phone sheet.
- Produces: a mobile server-rendered shell that hides the desktop-only Kit Builder panel before responsive client state initializes.

- [x] **Step 1: Write the failing cold-render test**

Create a mobile Playwright case with JavaScript disabled. Load the static export and assert that `.site-header` is visible while `.kit-builder-panel` is hidden.

- [x] **Step 2: Run the mobile test and verify RED**

Run:

```powershell
node scripts/run-playwright.mjs tests/e2e/mobile.spec.ts
```

Expected: FAIL because the server-rendered desktop Kit Builder receives the mobile full-screen sheet CSS before hydration.

- [x] **Step 3: Hide non-phone panel markup at the mobile breakpoint**

Inside `@media (max-width: 760px)`, add:

```css
.kit-builder-panel:not([data-motion-phase]) {
  display: none;
}
```

An active phone sheet retains `data-motion-phase` and remains visible.

- [x] **Step 4: Run the mobile test and verify GREEN**

Run:

```powershell
node scripts/run-playwright.mjs tests/e2e/mobile.spec.ts
```

Expected: all mobile tests pass, including the JavaScript-disabled cold-render case.
