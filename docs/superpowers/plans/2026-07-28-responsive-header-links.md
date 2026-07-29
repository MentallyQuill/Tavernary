# Responsive Header Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show About and Help on tablet headers, and show Help immediately left of Submit Project on mobile headers.

**Architecture:** Preserve the existing header markup order and shared utility-link styling. Add link-specific classes so responsive CSS can hide only About on mobile, while an end-to-end browser test protects visibility and ordering at each breakpoint.

**Tech Stack:** Next.js 16, React 19, CSS media queries, Playwright

## Global Constraints

- Desktop above 1050px shows About, Help, and Submit Project.
- Tablet from 761px through 1050px shows About, Help, and Submit Project.
- Mobile up to 760px hides About and shows Help immediately left of Submit Project.
- Do not change link destinations, text, styling, accessibility semantics, or responsive breakpoints.
- Do not redesign the brand, search row, or category navigation.

---

### Task 1: Protect responsive site-action visibility and order

**Files:**
- Modify: `tests/e2e/contribution-links.spec.ts`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/styles/responsive.css`

**Interfaces:**
- Consumes: the existing `SiteHeader` site-actions navigation and the 760px/1050px CSS breakpoints.
- Produces: `about-link` and `help-link` CSS hooks while retaining `top-link`, plus browser-level responsive behavior.

- [ ] **Step 1: Write the failing responsive browser test**

Add a test that loads the catalog at representative tablet and mobile widths:

```ts
test("keeps responsive header help and utility actions available", async ({
  page,
}) => {
  const siteActions = page.getByRole("navigation", { name: "Site actions" });
  const about = siteActions.getByRole("link", { name: "About" });
  const help = siteActions.getByRole("link", { name: "Help", exact: true });
  const submit = siteActions.getByRole("link", { name: "Submit Project" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await expect(about).toBeVisible();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(about).toBeVisible();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(about).toBeHidden();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  const helpBox = await help.boundingBox();
  const submitBox = await submit.boundingBox();
  expect(helpBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(submitBox!.x);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node scripts/run-playwright.mjs tests/e2e/contribution-links.spec.ts
```

Expected: FAIL because About and Help are hidden at 900px; after the tablet assertion is reached, the current mobile rule would also hide Help.

- [ ] **Step 3: Add semantic link classes and narrow responsive hiding**

Change the site action markup to:

```tsx
<a className="top-link about-link" href="./about/">
  About
</a>
<Link className="top-link help-link" href="/help/">
  Help
</Link>
```

Remove the tablet `.header-actions .top-link { display: none; }` rule. Replace the mobile rule with:

```css
.header-actions .about-link {
  display: none;
}
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```powershell
node scripts/run-playwright.mjs tests/e2e/contribution-links.spec.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands exit 0 with the responsive browser test passing.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- tests/e2e/contribution-links.spec.ts src/features/catalog/components/site-header.tsx src/styles/responsive.css docs/superpowers/plans/2026-07-28-responsive-header-links.md
git commit -m "fix(header): show responsive help links"
```
