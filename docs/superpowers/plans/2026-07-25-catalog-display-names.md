# Catalog Display Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide a leading `SillyTavern` prefix on catalog cards while preserving canonical project names and non-leading occurrences.

**Architecture:** Add a pure formatter in the catalog card module and derive one display name per rendered card. Use it only for the visible title and card link accessible name, leaving catalog data, search, sorting, Kit surfaces, and repository identity unchanged.

**Tech Stack:** TypeScript, React 19, Testing Library, Vitest

## Global Constraints

- Match `SillyTavern` case-insensitively only at the start of a name.
- Require whitespace, hyphen, or underscore after the prefix.
- Preserve the standalone name `SillyTavern`.
- Do not modify generated or canonical catalog data.
- Do not alter search or sorting behavior.

---

### Task 1: Catalog card display-name normalization

**Files:**
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`

**Interfaces:**
- Consumes: `CatalogProject.name: string`
- Produces: `projectDisplayName(name: string): string`

- [ ] **Step 1: Write the failing component test**

Add a table-driven test that renders `ProjectCard` with the literal input/output pairs:

```ts
[
  ["SillyTavern ReMemory", "ReMemory"],
  ["sillytavern-Namegen", "Namegen"],
  ["SillyTavern_Extension Mermaid", "Extension Mermaid"],
  ["RPG Tracker for SillyTavern", "RPG Tracker for SillyTavern"],
  ["datacat SillyTavern Browser", "datacat SillyTavern Browser"],
  ["SillyTavern", "SillyTavern"],
]
```

For each case, assert that the real card link has the expected accessible name and that its title text matches that name.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npx.cmd vitest run tests/unit/project-card.test.tsx
```

Expected: the leading-prefix case fails because the card still exposes the canonical name.

- [ ] **Step 3: Implement the minimal formatter**

Add this formatter near the component's other presentation helpers:

```ts
export function projectDisplayName(name: string) {
  const withoutPrefix = name.replace(/^sillytavern[\s_-]+/i, "");
  return withoutPrefix || name;
}
```

Derive `displayName` once in `ProjectCard`, then use it for the link `aria-label` and title text. Do not replace any other use of `project.name`.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
npx.cmd vitest run tests/unit/project-card.test.tsx
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands exit successfully with zero test failures, type errors, or lint errors.

- [ ] **Step 5: Review the diff**

Run:

```powershell
git diff -- src/features/catalog/components/project-card.tsx tests/unit/project-card.test.tsx docs/superpowers/specs/2026-07-25-catalog-display-names-design.md docs/superpowers/plans/2026-07-25-catalog-display-names.md
```

Confirm the diff changes only card presentation, its regression test, and these design records.
