# Compact Activity Status Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace clipped source-activity status sentences with compact labels while preserving the full explanations in hover tooltips and accessible names.

**Architecture:** Keep the evidence-state mapping in `ProjectCard`, where the activity state is already interpreted. Render the existing `Tooltip` component for both missing-timestamp and unavailable-metrics states; no refresh, schema, sorting, graph, or shared-tooltip behavior changes are required.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest

## Global Constraints

- Visible labels are exactly `Quiet`, `Pending`, `Partial`, and `No data`.
- Full explanations remain exactly `No source activity in the last 12 weeks`, `Source activity baseline pending`, `Source activity evidence incomplete`, and `Activity unavailable`.
- The full explanation is both the tooltip content and the short label's accessible name.
- Existing activity evidence, sorting, refresh behavior, and graphs remain unchanged.

---

### Task 1: Render compact activity labels with full tooltips

**Files:**
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`

**Interfaces:**
- Consumes: `CatalogProject["activity"]` fields `latestSourceActivityAt`, `activeWeeks12`, `weeklyActivity`, and `evidenceStatus`.
- Produces: compact visible activity-state text wrapped by the existing `Tooltip` component with exact full labels.

- [ ] **Step 1: Update the component tests to require compact labels and full tooltip labels**

Import `fireEvent` alongside the existing Testing Library imports. In the
complete, provisional, degraded, and unavailable activity tests, replace the
old visible-text expectations with:

```tsx
expect(screen.getByText("Quiet")).toBeVisible();
expect(
  screen.getByLabelText("No source activity in the last 12 weeks"),
).toBeInTheDocument();

expect(screen.getByText("Pending")).toBeVisible();
expect(
  screen.getByLabelText("Source activity baseline pending"),
).toBeInTheDocument();

expect(screen.getByText("Partial")).toBeVisible();
expect(
  screen.getByLabelText("Source activity evidence incomplete"),
).toBeInTheDocument();

expect(screen.getByText("No data")).toBeVisible();
expect(screen.getByLabelText("Activity unavailable")).toBeInTheDocument();
```

Add one focused hover assertion for the complete state. Define a desktop
`matchMedia` stub in that test, hover `Quiet`, and require the portal tooltip:

```tsx
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    media: "(max-width: 760px)",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  }),
});

fireEvent.pointerEnter(screen.getByText("Quiet"));
expect(
  screen.getByRole("tooltip", {
    name: "No source activity in the last 12 weeks",
  }),
).toBeVisible();
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
```

Expected: FAIL because the card still renders the long status sentences and
does not render a tooltip for unavailable activity.

- [ ] **Step 3: Replace long status text with compact tooltip-backed labels**

Immediately after the existing `hasActivityMetrics` declaration, add the
evidence-specific mapping below. It is non-null only when metrics exist but no
latest source timestamp exists:

```tsx
const missingSourceActivity =
  hasActivityMetrics && !latestSourceActivityAt
    ? evidenceStatus === "complete"
      ? {
          short: "Quiet",
          full: "No source activity in the last 12 weeks",
        }
      : evidenceStatus === "provisional"
        ? {
            short: "Pending",
            full: "Source activity baseline pending",
          }
        : {
            short: "Partial",
            full: "Source activity evidence incomplete",
          }
    : null;
```

In the `hasActivityMetrics` branch, replace the plain
`commit-age no-source-activity` span with:

```tsx
<Tooltip
  id={commitId}
  label={missingSourceActivity!.full}
  ariaLabel={missingSourceActivity!.full}
  className="commit-age no-source-activity"
>
  {missingSourceActivity!.short}
</Tooltip>
```

In the unavailable-metrics branch, replace the plain span with:

```tsx
<Tooltip
  id={activityId}
  label="Activity unavailable"
  ariaLabel="Activity unavailable"
  className="development-unavailable"
>
  No data
</Tooltip>
```

Keep the existing `0/12`, `~0/12`, sparkline, source timestamp, and activity
summary logic unchanged.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
```

Expected: PASS, including visible-copy, accessible-name, and hover-tooltip
assertions.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Expected: all commands exit successfully.

- [ ] **Step 6: Commit the implementation**

```powershell
git add src/features/catalog/components/project-card.tsx tests/unit/project-card.test.tsx docs/superpowers/plans/2026-07-24-compact-activity-status-tooltips.md
git commit -m "fix(catalog): shorten activity status labels"
```
