# About Page Visitor Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the production About page with an accurate, visitor-facing explanation of Kits and discovery features.

**Architecture:** Modify only the existing static Next.js About page component. Preserve its current layout, metadata, tone, catalog-boundary explanation, and submission/help actions; add one section between “What Tavernary records” and “Independent projects.”

**Tech Stack:** Next.js App Router, React/TypeScript, existing About-page CSS, Vitest/Prettier/ESLint, static export.

## Global Constraints

- Keep the update visitor-facing; omit GitHub refresh, enrichment, repository snapshots, and maintainer operations.
- Use `Kits` terminology consistently.
- Describe draft persistence as browser-local behavior; do not imply accounts, a Tavernary backend, or server-side personal collections.
- Preserve existing catalog-boundary and independent-project language.

---

### Task 1: Add the visitor-facing Kits section

**Files:**
- Modify: `src/app/about/page.tsx` after the `What Tavernary records` section and before `Independent projects`.
- Test: existing About-page/content contract checks if present; otherwise `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run verify:export`.

**Interfaces:**
- Consumes: Existing About page component and current visitor-facing Kits behavior.
- Produces: A rendered `Explore and build Kits` section with concise prose covering browsing, discovery filters, project/creator search, personal Kit assembly, reordering, browser-local draft saving, sharing, and submission for review.

- [ ] **Step 1: Insert the focused section**

Add this section without changing surrounding sections or actions:

```tsx
        <section>
          <h2>Explore and build Kits</h2>
          <p>
            Kits are community-authored collections of catalog projects. Browse
            them alongside the catalog, search projects and creators, and use
            filters to find a combination that fits the frontend, purpose, and
            size you want.
          </p>
          <p>
            You can also assemble your own Kit from catalog projects, reorder
            the stack, save a draft in your browser, share it with others, and
            submit it for review. Tavernary links each project back to its own
            source rather than hosting the project files.
          </p>
        </section>
```

- [ ] **Step 2: Run formatting and static checks**

Run:

```text
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
```

Expected: all commands pass, with no changes required by formatting.

- [ ] **Step 3: Verify the production page/export**

Run:

```text
npm.cmd run build
npm.cmd run verify:export
```

Expected: the static build and export verification pass, and the generated
About page contains the new Kits section without changing the existing route.

- [ ] **Step 4: Review the final diff**

Run:

```text
git diff --check
git diff -- src/app/about/page.tsx
git status --short
```

Expected: only the About page has implementation changes; the approved design
and plan documents remain the only documentation changes.
