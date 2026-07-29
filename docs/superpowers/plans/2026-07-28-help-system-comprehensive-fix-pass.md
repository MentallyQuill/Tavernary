# Help System Comprehensive Fix Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every confirmed Help UI defect and prevent unrelated pull requests from running the owner-request lifecycle job.

**Architecture:** Add missing layout at the shared form boundary, strengthen the existing shared field primitives instead of hand-patching individual markup, and preserve every manifest and GitHub handoff contract. Gate the owner lifecycle job before setup while retaining its existing script checks as defense in depth.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Vitest, Testing Library, Playwright, GitHub Actions YAML.

## Global Constraints

- Keep Tavernary static and build-time only; add no account, database, API, or runtime service.
- Do not change request manifest schemas, Issue Form field IDs, labels, or URLs.
- Preserve 44px control targets and prevent horizontal overflow at 320px.
- Use one-test Red-Green-Refactor cycles and retain unrelated workspace changes.
- Do not commit, push, or open a pull request unless the user separately asks.

## File map

- `src/styles/help.css`: shared Help form and choice-group geometry.
- `src/features/help/components/help-form-fields.tsx`: accessible select and choice-group primitives.
- `src/features/help/components/help-review.tsx`: focus restoration after Back or Cancel.
- `src/features/help/components/*-form.tsx`: adopt shared primitives, map validation errors, and provide focus targets.
- `src/app/help/report-kit/page.tsx`: remove duplicate author guidance and repair loading punctuation.
- `.github/workflows/project-owner-request-lifecycle.yml`: skip unrelated PR jobs before setup.
- `docs/maintenance/github-actions-user-guides.md`: document Help and owner-request operations.
- `tests/unit/*help*.test.tsx`, `tests/unit/project-*.test.tsx`, `tests/unit/workflows.test.ts`: component and workflow regressions.
- `tests/e2e/help-center.spec.ts`: real mobile geometry and rendered-copy regression.
- `tests/visual/theme.visual.spec.ts-snapshots/*`: update only Help snapshots changed by intentional spacing.

---

### Task 1: Shared Help form spacing

**Interfaces:**

- Produces: `.help-form { display: grid; min-width: 0; gap: 18px; }`.
- Consumes: existing `.help-field`, `.help-choice-group`, and `.help-actions` styles unchanged.

- [x] Add one Playwright regression that visits each interactive Help route at 320px, measures adjacent direct children of `.help-form`, and requires every gap to be at least 16px with no horizontal overflow.
- [x] Run `npm.cmd run build` followed by `node scripts/run-playwright.mjs tests/e2e/help-center.spec.ts -g "spaces every interactive Help form"` and verify the geometry assertion fails with a zero gap.
- [x] Add the minimal `.help-form` grid rule with an `18px` gap.
- [x] Rerun the focused Playwright test and verify it passes.

### Task 2: Accessible shared fields and review return focus

**Interfaces:**

- Produces:
  - `HelpSelectField(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & { id: string; label: ReactNode; hint?: ReactNode; error?: string })`.
  - `HelpChoiceGroup({ legend, children, hint?, error? })`.
  - `HelpReview({ ..., returnFocusId: string })`.
- Consumes: existing `describedBy`, `.help-field`, `.help-hint`, and `.help-field-error` contracts.

- [x] Add one component test proving a select's hint and inline error IDs are both present in its `aria-describedby`, and verify it fails because `HelpSelectField` does not exist.
- [x] Implement `HelpSelectField`, rerun that test, and keep it green.
- [x] Add one component test proving an errored choice group is invalid and describes both hint and error; verify it fails.
- [x] Extend `HelpChoiceGroup` plus the choice-group CSS spanning rule, then rerun the test.
- [x] Add one form test proving Back and Cancel restore focus to the declared field; verify the focus assertion fails.
- [x] Add `returnFocusId` to `HelpReview`, schedule focus after the form remount, wire all five forms, and rerun the focus test.
- [x] Replace raw Help select wrappers with `HelpSelectField`; pass project, Kit, website, other-help, and owner errors and conditional hints through the shared API.
- [x] Pass inline errors to owner request type, repository move, and delist confirmation controls.
- [x] Run the focused Help component suite and TypeScript typecheck.

### Task 3: Kit formatting and fieldset normalization

**Interfaces:**

- Consumes: `HelpSelectField` and the extended `HelpChoiceGroup` from Task 2.
- Produces: rendered Kit text containing `—`/`…`, exactly one author reminder, and no native affected-project fieldset.

- [x] Add one Kit regression asserting rendered select options use `—`, contain no `â`, and the affected-project group has `help-choice-group`; verify it fails on current output.
- [x] Replace the corrupt Kit punctuation and render affected projects with `HelpChoiceGroup`.
- [x] Remove the duplicate author reminder from the Kit page lead while retaining the form's two routing links.
- [x] Add one Playwright assertion for exactly one author reminder and no mojibake in rendered Kit Help text.
- [x] Run the focused Kit unit and Playwright tests.

### Task 4: Owner lifecycle routing and operator guide

**Interfaces:**

- Produces: `jobs.close.if === "startsWith(github.event.pull_request.head.ref, 'automation/project-owner-request-')"` in the parsed workflow.
- Preserves: the exact lifecycle planner, marker validation, issue updates, and branch-SHA deletion guard.

- [x] Add one parsed-workflow assertion for the job-level owner branch condition and verify it fails because the condition is absent.
- [x] Add the minimal job-level `if` to `project-owner-request-lifecycle.yml`.
- [x] Rerun the workflow test and verify it passes.
- [x] Add task-oriented Help triage and owner request sections to `docs/maintenance/github-actions-user-guides.md`, including the skipped-job limitation and manual rerun entrypoints.
- [x] Run workflow, Help documentation, formatting, and lint checks.

### Task 5: Comprehensive verification and visual baselines

**Interfaces:**

- Consumes all prior task outputs.
- Produces verification evidence only; no production behavior.

- [x] Run all Help/owner unit tests and all Help E2E specs.
- [x] Build and run the Help visual spec; update only intentional Help snapshots if spacing changes the baseline, then rerun it green.
- [x] Run `npm.cmd run check` and inspect the final output for formatting, lint, catalog, type, unit, and static-export failures.
- [x] Reopen the owner and Kit Help routes at 320px and 390px in the in-app browser; inspect screenshots for spacing, overlap, native fieldset, mojibake, and horizontal overflow.
- [x] Review `git diff --check`, `git diff --stat`, and the complete diff for accidental schema, URL, label, or unrelated changes.
