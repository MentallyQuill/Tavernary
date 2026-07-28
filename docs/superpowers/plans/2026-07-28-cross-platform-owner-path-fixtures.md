# Cross-platform Owner Path Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete Ubuntu deployment gate pass without weakening owner-request path, write-order, or rollback coverage.

**Architecture:** Keep production path resolution unchanged. Give the owner-request tests platform-native absolute fixture roots and derive their expected canonical paths from those roots, so Node exercises the same containment and mutation behavior on Windows and POSIX.

**Tech Stack:** Node.js 24 path utilities, TypeScript, Vitest, GitHub Actions, GitHub Pages

## Global Constraints

- Production path handling remains unchanged.
- The report fixture remains outside the repository fixture root.
- Existing ownership, containment, write-order, and rollback assertions remain active.
- The complete `npm run check` command must pass before publishing.

---

### Task 1: Replace drive-qualified owner-request fixtures

**Files:**

- Modify: `tests/unit/generate-project-owner-request.test.ts`
- Modify: `tests/unit/triage-project-owner-request.test.ts`
- Verify: `.github/workflows/deploy-pages.yml`

**Interfaces:**

- Consumes: `generateProjectOwnerRequest(input)` and `processProjectOwnerTriage(input)` with their existing `root`, `reportPath`, `readFile`, and `writeFile` inputs.
- Produces: platform-native absolute fixture inputs and normalized expected paths; no production API changes.

- [x] **Step 1: Confirm the failing regression**

Use GitHub Actions run `30388162494` as the POSIX red proof.

Expected: six owner-request failures where Ubuntu receives paths prefixed with
`/home/runner/work/Tavernary/Tavernary/C:/`.

- [x] **Step 2: Correct the transaction fixture paths**

Import `resolve` from `node:path`, define an absolute repository fixture root
and a sibling report fixture path, and derive registry/snapshot expectations
from those inputs:

```ts
import { resolve } from "node:path";

const ownerRepositoryRoot = resolve("test-fixtures", "owner-request-repo");
const ownerReportPath = resolve(
  "test-fixtures",
  "owner-request-artifacts",
  "owner-123.json",
);
const normalizedOwnerRepositoryRoot = ownerRepositoryRoot.replaceAll("\\", "/");
const normalizedOwnerReportPath = ownerReportPath.replaceAll("\\", "/");
```

Replace each `root: "C:/repo"`, `reportPath: "C:/artifacts/owner-123.json"`,
and matching storage/expectation literal with these platform-native values.

- [x] **Step 3: Run the transaction test file**

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-owner-request.test.ts
```

Expected: all tests in the file pass, including the five that failed on Ubuntu.

- [x] **Step 4: Correct the triage fixture path**

Use the same platform-native repository-root pattern in
`triage-project-owner-request.test.ts` and build the expected read chronology
from its normalized root.

- [x] **Step 5: Run both affected test files**

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-owner-request.test.ts tests/unit/triage-project-owner-request.test.ts
```

Expected: both files pass with zero failures.

- [x] **Step 6: Run the deployment gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all unit tests, production build, and static-export verification pass.

- [ ] **Step 7: Publish and verify**

Commit only the plan and two test files, push `main`, and watch the resulting
`Site: Deploy to GitHub Pages` run. Confirm its build and deploy jobs succeed,
the GitHub Pages deployment SHA equals the pushed commit, and the four recent
project records from issues `#133`, `#136`, `#138`, and `#140` are present in
the published catalog.
