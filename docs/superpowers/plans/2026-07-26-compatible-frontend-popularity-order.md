# Compatible Frontend Popularity Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order Compatible frontend filters in Projects and Kits modes by the popularity score on each frontend's catalog card.

**Architecture:** Add one pure catalog-domain helper that maps frontend option IDs to scored frontend project cards and returns a deterministic popularity order. Both filter panels keep ownership of their existing option sources and contextual counts, but pass those options through the shared helper before rendering.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Next.js static export

## Global Constraints

- Use the matched frontend card's existing `community.aggregate` value.
- Scored frontend cards sort first by descending aggregate.
- Equal, missing, or unmatched scores sort by ascending label and then ID.
- Extensions that declare frontend compatibility must not supply popularity.
- Projects and Kits modes must use the same ordering.
- Do not change counts, search, selection, collapsed visibility, or query semantics.
- Do not change card popularity calculations or any other filter/result ordering.
- Preserve the unrelated untracked `docs/superpowers/plans/2026-07-26-preset-card-metadata.md`.

---

### Task 1: Shared Frontend Option Ordering

**Files:**
- Create: `src/features/catalog/frontend-option-order.ts`
- Create: `tests/unit/frontend-option-order.test.ts`

**Interfaces:**
- Consumes: `CatalogProject` from `src/features/catalog/catalog-types.ts`
- Produces: `orderFrontendOptionsByPopularity<T extends { id: string; label: string }>(options: readonly T[], projects: readonly CatalogProject[]): T[]`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/unit/frontend-option-order.test.ts` with a compact project-card
fixture and these assertions:

```ts
import { describe, expect, test } from "vitest";

import { orderFrontendOptionsByPopularity } from "@/features/catalog/frontend-option-order";
import type { CatalogProject } from "@/features/catalog/catalog-types";

const option = (id: string, label: string) => ({ id, label });
const card = ({
  id,
  name,
  frontendId,
  kind = "frontend",
  aggregate,
}: {
  id: string;
  name: string;
  frontendId: string;
  kind?: CatalogProject["kind"];
  aggregate: number | null;
}) =>
  ({
    id,
    name,
    kind,
    frontends: [{ id: frontendId, label: name, description: "Frontend." }],
    community:
      aggregate === null
        ? null
        : { stars: aggregate, forks: 0, subscribers: 0, aggregate },
  }) as CatalogProject;

describe("orderFrontendOptionsByPopularity", () => {
  test("orders scored options by their frontend cards without mutating input", () => {
    const options = [
      option("alpha", "Alpha"),
      option("beta", "Beta"),
      option("gamma", "Gamma"),
    ];
    const projects = [
      card({ id: "alpha-card", name: "Alpha", frontendId: "alpha", aggregate: 8 }),
      card({ id: "beta-card", name: "Beta", frontendId: "beta", aggregate: 21 }),
      card({ id: "gamma-card", name: "Gamma", frontendId: "gamma", aggregate: 13 }),
    ];

    expect(
      orderFrontendOptionsByPopularity(options, projects).map(({ id }) => id),
    ).toEqual(["beta", "gamma", "alpha"]);
    expect(options.map(({ id }) => id)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("ignores extension popularity and orders unscored ties by label then ID", () => {
    const options = [
      option("zeta", "Shared"),
      option("alpha", "Shared"),
      option("missing", "Able"),
      option("scored", "Zulu"),
    ];
    const projects = [
      card({ id: "scored-card", name: "Scored", frontendId: "scored", aggregate: 1 }),
      card({
        id: "popular-extension",
        name: "Popular extension",
        frontendId: "missing",
        kind: "extension",
        aggregate: 999,
      }),
      card({ id: "unscored-card", name: "Alpha", frontendId: "alpha", aggregate: null }),
    ];

    expect(
      orderFrontendOptionsByPopularity(options, projects).map(({ id }) => id),
    ).toEqual(["scored", "missing", "alpha", "zeta"]);
  });
});
```

- [ ] **Step 2: Run the helper test to verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/frontend-option-order.test.ts
```

Expected: FAIL because
`@/features/catalog/frontend-option-order` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create `src/features/catalog/frontend-option-order.ts`:

```ts
import type { CatalogProject } from "./catalog-types";

type FrontendOption = {
  id: string;
  label: string;
};

export function orderFrontendOptionsByPopularity<T extends FrontendOption>(
  options: readonly T[],
  projects: readonly CatalogProject[],
): T[] {
  const scores = new Map<string, number>();

  for (const project of projects) {
    if (project.kind !== "frontend" || project.community === null) continue;
    for (const frontend of project.frontends) {
      const current = scores.get(frontend.id);
      if (current === undefined || project.community.aggregate > current) {
        scores.set(frontend.id, project.community.aggregate);
      }
    }
  }

  return [...options].sort((left, right) => {
    const leftScore = scores.get(left.id);
    const rightScore = scores.get(right.id);
    if (leftScore !== undefined && rightScore !== undefined) {
      const scoreOrder = rightScore - leftScore;
      if (scoreOrder !== 0) return scoreOrder;
    } else if (leftScore !== undefined) {
      return -1;
    } else if (rightScore !== undefined) {
      return 1;
    }

    return (
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
    );
  });
}
```

- [ ] **Step 4: Run the helper test to verify GREEN**

Run:

```powershell
npm.cmd test -- --run tests/unit/frontend-option-order.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the helper cycle**

```powershell
git add -- src/features/catalog/frontend-option-order.ts tests/unit/frontend-option-order.test.ts
git commit -m "feat: order frontends by card popularity"
```

---

### Task 2: Apply the Shared Order to Both Filter Panels

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Create: `tests/unit/frontend-filter-order.test.tsx`

**Interfaces:**
- Consumes: `orderFrontendOptionsByPopularity(options, projects)` from Task 1
- Produces: identical popularity-first Compatible frontend rendering in `FilterPanel` and `KitFilterPanel`

- [ ] **Step 1: Write failing component tests for both modes**

Create `tests/unit/frontend-filter-order.test.tsx`. Build complete
`CatalogProject` fixtures for Aikobots, CrossRoads, and Lumiverse whose
aggregates are 8, 21, and 13.
Render `FilterPanel` with `DEFAULT_QUERY`, then render `KitFilterPanel` with
`DEFAULT_KIT_QUERY` and no Kits. In each render, scope to the
`Compatible frontend` group and assert that its first three checkboxes are:

```ts
expect(
  within(group)
    .getAllByRole("checkbox")
    .slice(0, 3)
    .map((checkbox) => checkbox.getAttribute("aria-label")),
).toEqual(["CrossRoads", "Lumiverse", "Aikobots"]);
```

Use the matching `aikobots`, `crossroads`, and `lumiverse` frontend IDs. The
Projects panel also renders the remaining vocabulary options after these scored
cards; the Kits panel derives only these three options from the supplied
projects. Provide no-op callbacks and `now="2026-07-26T00:00:00Z"` to the
Projects panel.

- [ ] **Step 2: Run the component test to verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/frontend-filter-order.test.tsx
```

Expected: FAIL because both panels render their current alphabetical order.

- [ ] **Step 3: Apply the helper in Projects mode**

In `src/features/catalog/components/filter-panel.tsx`, import the helper:

```ts
import { orderFrontendOptionsByPopularity } from "../frontend-option-order";
```

Change only the Compatible frontend options expression:

```tsx
options={withCounts(
  orderFrontendOptionsByPopularity(frontendOptions, projects),
  projects,
  "frontends",
  now,
)}
```

- [ ] **Step 4: Apply the helper in Kits mode**

In `src/features/kits/components/kit-filter-panel.tsx`, import:

```ts
import { orderFrontendOptionsByPopularity } from "@/features/catalog/frontend-option-order";
```

Remove the alphabetical `.sort(...)` from `frontendOptions`, then change the
Compatible frontend options expression:

```tsx
options={countedOptions(
  orderFrontendOptionsByPopularity(frontendOptions(projects, kits), projects),
  kits,
  query,
  "frontends",
  search,
)}
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```powershell
npm.cmd test -- --run tests/unit/frontend-option-order.test.ts tests/unit/frontend-filter-order.test.tsx tests/unit/kit-filter-panel.test.tsx tests/unit/catalog-license-filter-contract.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 6: Run repository verification**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run lint
npm.cmd run build
```

Expected: all unit tests PASS, lint exits 0, and the static production build
exits 0.

- [ ] **Step 7: Review the final diff and constraints**

Run:

```powershell
git diff --check
git status --short
git diff -- src/features/catalog/frontend-option-order.ts src/features/catalog/components/filter-panel.tsx src/features/kits/components/kit-filter-panel.tsx tests/unit/frontend-option-order.test.ts tests/unit/frontend-filter-order.test.tsx
```

Confirm the unrelated preset-card metadata plan remains untracked and
unchanged, no other filter order changed, and frontend counts remain contextual
rather than becoming popularity counts.

- [ ] **Step 8: Commit the integration**

```powershell
git add -- src/features/catalog/components/filter-panel.tsx src/features/kits/components/kit-filter-panel.tsx tests/unit/frontend-filter-order.test.tsx
git commit -m "feat: rank compatible frontend filters"
```
