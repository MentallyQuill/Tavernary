# About Page Copyedit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct grammar and unclear prose across Tavernary's About page without changing its structure, policy meaning, or community-focused voice.

**Architecture:** Keep the change entirely within the existing static About page component and its focused unit test. Add a regression assertion for the corrected lead, then make conservative sentence-level edits to the page while preserving headings, links, section order, and substantive claims.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Prettier, ESLint

## Global Constraints

- Preserve the existing headings, section order, navigation, actions, and links.
- Preserve all substantive statements about project eligibility, independence, TavernKeeper scans, reporting, removal, safety, and legal responsibility.
- Keep capitalization of catalog project types consistent with the product UI.
- Do not introduce layout, styling, navigation, responsive, catalog-behavior, submission-rule, security-classification, or reporting-workflow changes.

---

### Task 1: Copyedit and verify the About page

**Files:**
- Modify: `tests/unit/about-page.test.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: the existing `AboutPage` React component and Testing Library render helpers.
- Produces: corrected reader-facing About-page prose with an automated regression check for the lead paragraph.

- [ ] **Step 1: Add the failing lead-copy regression test**

Add this assertion immediately after `render(<AboutPage />);` in the existing About-page test:

```tsx
expect(
  screen.getByText(
    "Tavernary is a search and discovery catalog for AI roleplay tools in and around the SillyTavern community. It indexes public project information and directs visitors to each project's creator-owned repository or source page.",
  ),
).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/about-page.test.tsx
```

Expected: FAIL because the current lead contains `surrounding the SillyTavern community` and the duplicated phrase `repositories repository` rather than the approved copy.

- [ ] **Step 3: Apply the conservative full-page copyedit**

Replace the lead with:

```tsx
<p className="about-lead">
  Tavernary is a search and discovery catalog for AI roleplay tools in and
  around the SillyTavern community. It indexes public project information
  and directs visitors to each project&apos;s creator-owned repository or
  source page.
</p>
```

Then review every remaining paragraph in `src/app/about/page.tsx` and make only sentence-level edits that fix grammar, agreement, duplication, awkward constructions, or ambiguous antecedents. Do not change headings, IDs, links, actions, product rules, security color meanings, eligibility requirements, reporting authority, or legal qualifications.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/about-page.test.tsx
```

Expected: PASS with no warnings or errors.

- [ ] **Step 5: Format and inspect the scoped diff**

Run:

```powershell
npm.cmd exec prettier -- --write src/app/about/page.tsx tests/unit/about-page.test.tsx
git diff --check -- src/app/about/page.tsx tests/unit/about-page.test.tsx
git diff -- src/app/about/page.tsx tests/unit/about-page.test.tsx
```

Expected: no whitespace errors; the diff contains only copy edits and the focused regression assertion.

- [ ] **Step 6: Run the full repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: all formatting, lint, palette, catalog, security-report, type, unit, build, and static-export checks pass.

- [ ] **Step 7: Commit only the feature files and plan**

Run:

```powershell
git add -- src/app/about/page.tsx tests/unit/about-page.test.tsx docs/superpowers/plans/2026-08-06-about-page-copyedit.md
git commit -m "fix(about): polish page copy"
```

Do not stage or modify the unrelated TavernKeeper report files already present in the worktree.
