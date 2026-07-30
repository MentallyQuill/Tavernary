# Tavernary-Authoritative GitHub Review Mirrors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tavernary the authoritative authoring and review surface for
every public issue-backed request, with GitHub limited to a generated
review/create-or-cancel mirror whose readable fields cannot override the
domain manifest.

**Architecture:** A shared browser handoff adapter owns URL sizing, clipboard
recovery, popup detection, and the opening/opened/recovery state machine. Each
project, owner, Kit, withdrawal, and Help domain continues to own validation,
review rows, manifest normalization, and readable prefill mapping. GitHub
automation accepts only a valid domain manifest; readable Issue Form fields
remain presentation and route labels remain dispatch metadata.

**Tech Stack:** Node.js 24 ES modules, TypeScript 6, React 19, Next.js 16 static
export, Vitest, Testing Library, Playwright, YAML GitHub Issue Forms, GitHub
Actions, GitHub CLI, PowerShell.

## Global Constraints

- Work only in
  `F:\git\Tavernary\.worktrees\tavernary-github-review-mirror` on
  `codex/tavernary-github-review-mirror`.
- Do not merge into `main`; stop when the branch is verified and ready for
  review.
- Preserve unrelated work in the primary checkout and every other worktree.
- Follow red-green-refactor for every behavior change: add one focused failing
  assertion, run it and confirm the intended failure, implement the smallest
  behavior, then rerun it green.
- Use `apply_patch` for source and documentation edits. Run formatters only as
  mechanical follow-up.
- Keep Tavernary static-first. Add no account system, OAuth flow, runtime
  backend, database, or per-visitor GitHub API call.
- Keep Node.js at `>=24 <25` and add no runtime dependency.
- Preserve project-submission manifest version 4 unchanged.
- Preserve owner-request manifest version 2 unchanged, including project and
  source fingerprints, repository identity, tag-vocabulary hash, one-to-ten
  add-card batches, metadata modes, source locks, and typed source-delisting
  confirmation.
- Preserve schema-v6 catalog records: `source_id`, zero-to-six controlled
  `tags`, independent `metadata_policy.summary` and `.tags`, card listing state,
  and source-owned refresh/delisting state.
- Preserve the existing unversioned Kit create/edit manifest shape. Introduce
  a version only for the new Kit-withdrawal manifest.
- A valid manifest is the sole automated payload. Titles and readable GitHub
  fields are presentation only and may drift without blocking, rejecting,
  closing, or mutating a request.
- Missing, malformed, unsupported, or stale manifests remain open, receive
  `needs-information`, and get the exact Tavernary return route. Do not rebuild
  intent from readable fields.
- Retain explicitly admitted historical compatibility, including project v3
  parsing only where the existing caller passes `allowLegacyV3: true`.
- Preserve private security reporting through GitHub private security
  advisories. Do not route it through a public Issue Form.
- Preserve the 7,000-character safe handoff threshold and clipboard/prompt
  recovery without mutating the serialized manifest.
- Opening GitHub, popup failure, clipboard failure, back/edit, and reopen must
  never discard project, owner batch, Help, or Kit draft state.
- Every review and handoff state must work at desktop widths and at 320 pixels,
  use at least the repository's existing touch-target size, announce status
  changes, and return focus predictably.
- Use GitHub CLI with network permission for GitHub inspection and live smoke
  work. If authentication is expired, stop and request reauthentication.
- Do not create a live public issue during verification without a separate,
  explicit user approval immediately before that action.

---

## File Map

### Shared handoff and review

- Create `src/features/submissions/github-handoff.ts`.
  - Own `MAX_PREFILL_URL_LENGTH`, URL construction, readable-prefill trimming,
    unchanged-manifest clipboard/prompt recovery, `window.open()` null
    detection, and a recoverable error carrying the prepared URL.
- Create
  `src/features/submissions/components/submission-review.tsx`.
  - Own review rows and the `idle -> opening -> opened | recovery` presentation
    contract, status announcements, back/edit focus, cancel, and regeneration.
- Modify `src/features/submissions/submission-transport.ts`.
  - Retain project display/prefill mapping and v4 serialization; delegate the
    browser handoff to the shared adapter.
- Modify
  `src/features/submissions/components/project-submission-builder.tsx`.
  - Adapt the current one-shot status branch to the shared result object's
    `.mode` without changing project form behavior before Task 5.
- Modify `src/features/kits/submission-transport.ts`.
  - Retain the exact Kit create/edit serializer and readable prefills; delegate
    the browser handoff to the shared adapter.
- Modify `src/features/help/help-transport.ts`.
  - Retain Help manifest serialization and the existing domain input API as a
    compatibility wrapper; delegate browser behavior to the shared adapter.
- Modify `src/styles/help.css`, `src/styles/submission.css`, and
  `src/styles/responsive.css`.
  - Style shared review, opened/recovery feedback, controls, long owner batches,
    and 320-pixel layouts without color-only state.
- Create `tests/unit/github-handoff.test.ts`.
  - Cover short URLs, 7,000-character boundary behavior, readable-prefill
    trimming, clipboard success/failure, prompt recovery, and blocked popups.
- Create `tests/unit/submission-review.test.tsx`.
  - Cover opening/opened/recovery transitions, accessible announcements,
    back/edit focus, cancel, and fresh regeneration.
- Modify `tests/unit/project-submission-transport.test.ts`,
  `tests/unit/submission-transport.test.ts`, and
  `tests/unit/help-transport.test.ts`.
  - Prove domain adapters preserve their serializers and prefill maps.
### Help authoring and automation

- Modify `src/features/help/components/help-review.tsx`.
  - Reduce it to a thin Help-named wrapper around the shared review component
    while migrating every existing Help call site in the same task.
- Modify `tests/unit/help-review.test.tsx`.
  - Preserve Help-specific public-safety copy while adopting shared state
    behavior.
- Modify
  `src/features/help/components/project-report-form.tsx`,
  `src/features/help/components/website-report-form.tsx`,
  `src/features/help/components/kit-report-form.tsx`, and
  `src/features/help/components/other-help-form.tsx`.
  - Replace duplicated `continuing`, `handoffError`, and `fallbackUrl` state
    with the shared review controller; retain manifest version 1 and every
    domain field.
- Modify `scripts/help/parse-help-issue.mjs`.
  - Parse and normalize only the `Help manifest` section; remove readable-field
    payload/category/origin reconstruction.
- Modify `scripts/help/triage-help-issue.mjs`.
  - Apply/remove `needs-information`, keep invalid issues open, and point
    correction comments to the exact Tavernary Help route.
- Modify `scripts/help/help-labels.mjs`.
  - Include the admission-owned `needs-information` label in Help triage
    cleanup without duplicating its repository label definition or changing
    category-label semantics.
- Modify `scripts/submissions/admit-issue.mjs`.
  - Remove public Help route recovery from readable heading sets as soon as
    `HELP_FALLBACK_HEADINGS` is removed; leave remaining heading recovery for
    the complete routing cutover.
- Modify `tests/unit/parse-help-issue.test.ts`,
  `tests/unit/triage-help-issue.test.ts`, and
  `tests/unit/help-labels.test.ts`.
  - Replace readable fallback expectations with manifest-only and recovery
    expectations.

### Project submission

- Modify
  `src/features/submissions/components/project-submission-builder.tsx`.
  - Start Project Type unselected, require deliberate selection, add complete
    Tavernary review, preserve state on back/edit/reopen, and serialize the
    current v4 manifest only at each handoff attempt.
- Modify `src/app/submit/project/page.tsx`.
  - Remove the advertised direct GitHub fallback and describe Tavernary review
    followed by GitHub creation.
- Modify `tests/unit/project-submission-builder.test.tsx`.
  - Cover the original Frontend-reset report plus Frontend, Extension, and
    Preset review/reopen behavior.
- Modify `scripts/submissions/parse-project-submission.mjs`.
  - Remove v4 construction from readable headings while retaining explicit
    manifest normalization and caller-controlled admitted v3 support.
- Modify `scripts/submissions/parse-project-submission.d.mts`.
  - Narrow parse-result source typing from `"manifest" | "headings"` to
    `"manifest"`.
- Modify `scripts/submissions/triage-issue.mjs`.
  - Replace issue-edit correction guidance with the Tavernary project route
    while preserving existing label and retry state.
- Modify `tests/unit/parse-project-submission.test.ts` and
  `tests/unit/triage-issue.test.ts`.
  - Prove readable drift is ignored, missing manifests stay
    `needs-information`, and valid manifest behavior remains unchanged.

### Owner and Multi Projects

- Modify `src/features/help/components/project-owner-builder.tsx`.
  - Use shared review state for all six v2 operations and correct the readable
    prefill IDs to match the Issue Form without changing the owner manifest.
- Modify `scripts/help/triage-project-owner-request.mjs`.
  - Require a valid owner manifest before loading identifiers or applying
    authority/publication logic; remove readable owner-operation construction.
- Modify `scripts/help/generate-project-owner-request.mjs`.
  - Stop using readable Project ID/Source ID as payload fallback.
- Modify `.github/workflows/triage-project-owner-request.yml`.
  - Synchronize an owner-triage marker comment that returns invalid requests to
    `/help/manage-project/`, and remove it after a valid retry.
- Modify `tests/unit/project-owner-builder.test.tsx`,
  `tests/unit/triage-project-owner-request.test.ts`, and
  `tests/unit/generate-project-owner-request.test.ts`.
  - Cover one-card and ten-card review/reopen, all six operations, exact v2
    values, missing/invalid manifest recovery, and unchanged authority locks.
- Modify `tests/unit/workflows.test.ts`.
  - Enforce owner needs-information comment synchronization and open-issue
    behavior.

### Kit create/edit and withdrawal

- Modify `src/features/kits/components/kit-builder.tsx` and
  `src/features/kits/components/kit-builder-panel.tsx`.
  - Add an in-panel Kit review stage and use shared opened/recovery feedback
    without replacing or clearing the draft.
- Modify `src/features/catalog/components/catalog-page.tsx`.
  - Remove `workspace.discardDraft()` from successful handoff; keep the
    explicit discard path unchanged.
- Modify `scripts/submissions/triage-kit-issue.mjs`.
  - Direct correctable Kit failures back to Tavernary rather than telling
    contributors to edit GitHub readable fields.
- Modify `tests/unit/catalog-batch-flow.test.tsx`,
  `tests/unit/kit-builder-panel.test.tsx`, and
  `tests/unit/submission-transport.test.ts`.
  - Cover review, back/edit, popup recovery, reopen with current values, draft
    persistence, and explicit discard.
- Modify `tests/unit/triage-kit-issue.test.ts`.
  - Enforce Tavernary return guidance while retaining open
    `needs-information` behavior.
- Create
  `src/features/kits/kit-withdrawal-manifest.mjs` and
  `src/features/kits/kit-withdrawal-manifest.d.mts`.
  - Define and normalize the version-1 Kit-withdrawal manifest.
- Create
  `src/features/help/components/kit-withdrawal-form.tsx` and
  `src/app/help/withdraw-kit/page.tsx`.
  - Resolve the selected published Kit, require explicit confirmation, review
    the stable Kit ID and public effect, and generate the GitHub review mirror.
- Modify `src/features/kits/components/kit-builder-panel.tsx`.
  - Route **Request withdrawal** to
    `/help/withdraw-kit/?kit=<encoded-kit-id>` in the same tab.
- Modify `scripts/kits/apply-withdrawal.mjs`.
  - Parse/normalize only the withdrawal manifest, retain numeric issue-author
    verification, and report an explicit applied/needs-information result.
- Modify `.github/workflows/apply-kit-withdrawal.yml`.
  - Gate validation, commit, close, and deploy on an applied result; leave
    invalid requests open with `needs-information` and Tavernary return
    guidance.
- Modify `tests/unit/apply-kit-withdrawal.test.ts` and create
  `tests/unit/kit-withdrawal-form.test.tsx`.
  - Cover manifest normalization, drift, author verification, recovery, and
    route preselection.

### GitHub review mirrors, routing, and documentation

- Modify all public templates:
  `.github/ISSUE_TEMPLATE/01-project-submission.yml`,
  `.github/ISSUE_TEMPLATE/02-project-information.yml`,
  `.github/ISSUE_TEMPLATE/03-website-bug.yml`,
  `.github/ISSUE_TEMPLATE/04-other.yml`,
  `.github/ISSUE_TEMPLATE/05-kit-submission.yml`,
  `.github/ISSUE_TEMPLATE/06-kit-report.yml`,
  `.github/ISSUE_TEMPLATE/07-kit-withdrawal.yml`, and
  `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`.
  - State that Tavernary authored the request, readable fields are review-only,
    corrections happen at the exact Tavernary route, and the manifest is the
    required automation payload.
- Modify `.github/ISSUE_TEMPLATE/config.yml`.
  - Keep blank issues disabled and add Tavernary contact links for project,
    Kit, owner, and public Help intake.
- Modify `scripts/submissions/admit-issue.mjs`.
  - Retire route recovery based on complete readable heading sets. Explicit
    route labels dispatch workflows but never provide payload.
- Modify `tests/unit/admit-issue.test.ts` and
  `tests/unit/issue-forms.test.ts`.
  - Enforce contact links, review-mirror wording, required manifests, exact
    return routes, and no readable-heading route recovery.
- Modify `docs/contributing/contribution-overview.md`,
  `docs/contributing/submission-and-review.md`,
  `docs/contributing/kits.md`, and
  `docs/maintenance/operations-runbook.md`.
  - Describe Tavernary-first intake and GitHub review/creation. Do not rewrite
    archived design specs or implementation plans.

### End-to-end verification

- Modify `tests/e2e/project-submission.spec.ts`.
  - Cover deliberate type selection, original-tab review, delayed/reopen state,
    and all three v4 project types.
- Modify `tests/e2e/help-project-report.spec.ts`,
  `tests/e2e/help-website-and-other.spec.ts`,
  `tests/e2e/help-project-owner.spec.ts`, and
  `tests/e2e/help-center.spec.ts`.
  - Cover Help/owner review, popup failure, reopen, exact routes, and security
    separation.
- Modify `tests/e2e/kits-builder-mobile.spec.ts`,
  `tests/kits-e2e/kit-builder-opening.spec.ts`, and
  `tests/kits-e2e/kits.spec.ts`.
  - Cover Kit review/draft persistence and Tavernary withdrawal routing.
- Modify `tests/e2e/mobile.spec.ts` and visual coverage only where a reviewed
  UI state needs an explicit 320-pixel baseline.
  - Cover a six-tag project review and ten-card owner review without clipping
    or inaccessible actions.

---

## Task 1: Centralize Safe GitHub Handoff

**Files:**

- Create: `src/features/submissions/github-handoff.ts`
- Create: `tests/unit/github-handoff.test.ts`
- Modify: `src/features/submissions/submission-transport.ts`
- Modify:
  `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/features/kits/submission-transport.ts`
- Modify: `src/features/help/help-transport.ts`
- Modify: `tests/unit/project-submission-transport.test.ts`
- Modify: `tests/unit/submission-transport.test.ts`
- Modify: `tests/unit/help-transport.test.ts`

- [ ] **Step 1: Add the failing shared-adapter tests**

  Define the public result and failure contract in the test:

  ```ts
  export interface GitHubHandoffResult {
    mode: "prefilled" | "clipboard";
    url: string;
  }

  export class GitHubHandoffError extends Error {
    readonly url: string | null;
  }
  ```

  Cover:

  - a short request opening once with the serialized manifest;
  - `window.open()` returning `null` and throwing `GitHubHandoffError` with the
    prepared URL;
  - an oversized request copying the exact original serialized manifest;
  - clipboard rejection opening `window.prompt()` with that exact manifest;
  - fallback readable-prefill trimming until the URL is at most 7,000
    characters; and
  - an unshrinkable base/template/manifest-placeholder URL failing without
    opening a tab.

- [ ] **Step 2: Run the focused red test**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/github-handoff.test.ts
  ```

  Expected: FAIL because `github-handoff.ts` does not exist.

- [ ] **Step 3: Implement the shared browser adapter**

  Use this input boundary:

  ```ts
  export interface GitHubHandoffInput {
    formUrl: string | URL;
    template: string;
    manifestFieldId: string;
    serializedManifest: string;
    prefills: readonly (readonly [fieldId: string, value: string])[];
    pasteInstruction: string;
    copyPrompt: string;
  }
  ```

  Implement one `openGitHubReview(input)` path that:

  1. clears inherited query parameters only for the clipboard recovery target;
  2. adds `template`, readable prefills, and the complete manifest;
  3. opens short URLs with `noopener,noreferrer`;
  4. copies/prompts the exact serialized manifest for oversized URLs;
  5. sets only the manifest field to the stable paste instruction in the
     recovery URL;
  6. adds readable prefills one at a time and removes any entry that crosses
     7,000 characters; and
  7. treats a null popup handle as recovery, never success.

- [ ] **Step 4: Make the domain transports thin adapters**

  Preserve all domain-specific serializers and readable mappings. Their
  exported open functions now return `Promise<GitHubHandoffResult>`, for
  example:

  ```ts
  return openGitHubReview({
    formUrl,
    template: "01-project-submission.yml",
    manifestFieldId: "project-manifest",
    serializedManifest: serializeProjectSubmissionManifest(manifest),
    prefills: readablePrefills(manifest),
    pasteInstruction: "Paste the project manifest copied by Tavernary here.",
    copyPrompt:
      "Copy this project manifest, then paste it into the GitHub review:",
  });
  ```

  Keep `HelpHandoffError` as a compatibility alias/re-export during call-site
  migration so this task does not require a partially broken Help tree.

- [ ] **Step 5: Adapt the current project call site**

  Until Task 5 replaces the one-shot status UI with `SubmissionReview`, change
  its branch from `handoff === "prefilled"` to
  `handoff.mode === "prefilled"`. This is an API adaptation only; retain the
  current user-visible behavior in this task.

- [ ] **Step 6: Run the shared and domain transport tests**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/github-handoff.test.ts tests/unit/project-submission-transport.test.ts tests/unit/submission-transport.test.ts tests/unit/help-transport.test.ts
  ```

  Expected: PASS, including null-popup recovery for all three domain adapters.

- [ ] **Step 7: Commit the transport**

  ```powershell
  git add src/features/submissions/github-handoff.ts src/features/submissions/submission-transport.ts src/features/submissions/components/project-submission-builder.tsx src/features/kits/submission-transport.ts src/features/help/help-transport.ts tests/unit/github-handoff.test.ts tests/unit/project-submission-transport.test.ts tests/unit/submission-transport.test.ts tests/unit/help-transport.test.ts
  git commit -m "refactor: centralize GitHub handoff"
  ```

## Task 2: Build the Shared Tavernary Review State

**Files:**

- Create:
  `src/features/submissions/components/submission-review.tsx`
- Create: `tests/unit/submission-review.test.tsx`
- Modify: `src/styles/help.css`
- Modify: `src/styles/submission.css`
- Modify: `src/styles/responsive.css`

- [ ] **Step 1: Add failing review-state tests**

  Render a review with rows and an `openReview` spy. Assert:

  - initial actions are **Back and edit**, **Cancel**, and
    **Continue on GitHub**;
  - continue immediately announces `Taking you to GitHub...`;
  - resolution announces
    `GitHub review opened in a new tab. Create the issue there, or return here to make changes.`;
  - the opened state offers **Back and edit** and
    **Open GitHub review again**;
  - reopening invokes `openReview` again instead of caching the first result;
  - rejection keeps all rows visible and exposes the prepared review URL from
    `GitHubHandoffError`;
  - clipboard mode announces that the unchanged manifest was copied or shown
    for pasting; and
  - back/edit runs the callback and focuses `returnFocusId`.

- [ ] **Step 2: Run the review red test**

  ```powershell
  npm.cmd test -- tests/unit/submission-review.test.tsx
  ```

  Expected: FAIL because the shared component and its opened/recovery states do
  not exist.

- [ ] **Step 3: Implement the component state machine**

  Use a discriminated local state, not independent booleans:

  ```ts
  type HandoffState =
    | { phase: "idle" }
    | { phase: "opening" }
    | { phase: "opened"; mode: GitHubHandoffResult["mode"] }
    | { phase: "recovery"; message: string; url: string | null };
  ```

  Accept `rows`, `returnFocusId`, `onBack`, `onCancel`, and
  `openReview: () => Promise<GitHubHandoffResult>`. Keep rows mounted in every
  phase. Use `role="status"` with `aria-live="polite"` for opening/opened and
  `role="alert"` for recovery. A plain anchor may reopen the exact prepared URL
  only in recovery; label it **Open prepared GitHub review**, never “fallback.”

- [ ] **Step 4: Add responsive styling**

  Reuse existing button tokens. Ensure:

  - long `<code>` values wrap;
  - owner card rows do not overflow;
  - action buttons stack at the existing phone breakpoint;
  - the live-status copy remains adjacent to the review actions; and
  - focus-visible and disabled states remain distinct.

- [ ] **Step 5: Run focused component and format checks**

  ```powershell
  npm.cmd test -- tests/unit/submission-review.test.tsx
  npm.cmd run typecheck
  npm.cmd exec prettier -- --check src/features/submissions/components/submission-review.tsx src/styles/help.css src/styles/submission.css src/styles/responsive.css
  ```

  Expected: all PASS.

- [ ] **Step 6: Commit the shared review**

  ```powershell
  git add src/features/submissions/components/submission-review.tsx src/styles/help.css src/styles/submission.css src/styles/responsive.css tests/unit/submission-review.test.tsx
  git commit -m "feat: add Tavernary handoff review state"
  ```

## Task 3: Move Every Existing Help Form onto Shared Review

**Files:**

- Modify:
  `src/features/help/components/project-report-form.tsx`
- Modify:
  `src/features/help/components/website-report-form.tsx`
- Modify:
  `src/features/help/components/kit-report-form.tsx`
- Modify:
  `src/features/help/components/other-help-form.tsx`
- Modify: `src/features/help/components/help-review.tsx`
- Modify: `tests/unit/help-review.test.tsx`
- Modify: `tests/unit/project-report-form.test.tsx`
- Modify: `tests/unit/website-report-form.test.tsx`
- Modify: `tests/unit/kit-report-form.test.tsx`
- Modify: `tests/unit/other-help-form.test.tsx`

- [ ] **Step 1: Add a failing form-level state-retention case per domain**

  For each form, fill valid data, enter review, open GitHub, return to edit,
  change one field, review again, and reopen. Assert the second URL contains a
  newly serialized version-1 manifest with the changed field while every
  untouched value remains present.

  Also add one blocked-popup case that proves the recovery link appears without
  clearing the form.

- [ ] **Step 2: Run the four focused suites red**

  ```powershell
  npm.cmd test -- tests/unit/project-report-form.test.tsx tests/unit/website-report-form.test.tsx tests/unit/kit-report-form.test.tsx tests/unit/other-help-form.test.tsx
  ```

  Expected: FAIL because existing forms own one-shot boolean/error state and do
  not expose persistent opened/reopen behavior.

- [ ] **Step 3: Replace duplicated handoff state**

  First make `HelpReview` a Help-named wrapper around `SubmissionReview`. It
  supplies the public-data warning and existing Help class names, and accepts
  the stateful `openReview` callback instead of `continuing` and `fallbackUrl`.
  Change the wrapper and all four call sites in this task so the tree remains
  type-correct.

  In each form:

  - retain validation and the domain payload calculation;
  - retain its exact `schema_version: 1`, `request_kind`, origin, and payload;
  - pass a closure to `HelpReview` that builds the manifest from current state
    and calls `openHelpRequest`;
  - delete `continuing`, `handoffError`, and `fallbackUrl`;
  - clear a previous handoff state by unmounting review only when the user
    explicitly returns to editing or cancels; and
  - preserve all entered values.

- [ ] **Step 4: Run focused Help frontend tests**

  ```powershell
  npm.cmd test -- tests/unit/project-report-form.test.tsx tests/unit/website-report-form.test.tsx tests/unit/kit-report-form.test.tsx tests/unit/other-help-form.test.tsx tests/unit/help-review.test.tsx tests/unit/help-transport.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the Help review migration**

  ```powershell
  git add src/features/help/components/help-review.tsx src/features/help/components/project-report-form.tsx src/features/help/components/website-report-form.tsx src/features/help/components/kit-report-form.tsx src/features/help/components/other-help-form.tsx tests/unit/help-review.test.tsx tests/unit/project-report-form.test.tsx tests/unit/website-report-form.test.tsx tests/unit/kit-report-form.test.tsx tests/unit/other-help-form.test.tsx
  git commit -m "feat(help): retain requests through handoff"
  ```

## Mandatory Gate: Audit Already-Admitted Public Requests

Complete this read-only gate after Tavernary review surfaces exist and before
Tasks 4, 6, 7, 9, or 10 remove any readable-field recovery.

- [ ] **Step 1: Verify GitHub CLI authentication**

  Use network-enabled GitHub CLI:

  ```powershell
  gh auth status
  gh repo view --json nameWithOwner,url,defaultBranchRef
  ```

  Expected: authenticated against `MentallyQuill/Tavernary`. If the token is
  expired, stop and ask the user to reauthenticate.

- [ ] **Step 2: Inventory the open admitted backlog**

  Run:

  ```powershell
  gh issue list --state open --limit 200 --json number,title,labels,body,url,createdAt,updatedAt,author
  gh pr list --state open --limit 200 --json number,title,headRefName,url,body
  ```

  Inspect every open `issue-admitted` issue routed as project, Kit, Kit
  withdrawal, owner, or public Help. Record whether it has a non-empty domain
  manifest, whether that manifest normalizes under the currently admitted
  version, and whether a generated publication/review PR or terminal automation
  result already exists.

- [ ] **Step 3: Reconcile without readable reconstruction**

  - A valid v4 project, v2 owner, existing Kit, or v1 Help manifest needs no
    change.
  - An admitted project v3 stays covered only through the existing explicit
    `allowLegacyV3` recovery caller.
  - A terminally processed issue remains an audit record and is not reopened or
    rewritten.
  - An open pending issue without a valid manifest remains open, is marked
    `needs-information`, and receives its exact Tavernary resubmission route.
  - Never construct a manifest from readable GitHub headings during this audit.

  If the audit finds an open pending request whose continuity requires editing
  external issue state, stop before the parser cutover and request explicit
  user approval for that named issue. Prefer a fresh Tavernary-authored review;
  a maintainer-authored recovery manifest is allowed only when an existing
  trusted automation artifact contains the complete payload.

- [ ] **Step 4: Capture the gate result**

  Add the counts and issue numbers to the implementation handoff notes, not to
  a runtime allowlist. This preserves historical admitted-version recovery
  without leaving a permanent readable-field bypass in production code.

## Task 4: Make Help Automation Manifest-Only

**Files:**

- Modify: `scripts/help/parse-help-issue.mjs`
- Modify: `scripts/help/triage-help-issue.mjs`
- Modify: `scripts/help/help-labels.mjs`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `tests/unit/parse-help-issue.test.ts`
- Modify: `tests/unit/triage-help-issue.test.ts`
- Modify: `tests/unit/help-labels.test.ts`
- Modify: `tests/unit/admit-issue.test.ts`

- [ ] **Step 1: Replace fallback tests with manifest-authority regressions**

  Add assertions that:

  - a valid manifest wins when every readable field differs;
  - empty, malformed, and unsupported manifests are invalid;
  - a complete set of readable fields cannot construct a payload;
  - invalid triage adds `needs-information`, retains the route label, writes a
    correction comment containing the exact route, and never closes the issue;
  - a later valid edit removes `needs-information` and the correction comment;
    and
  - valid category labels still derive only from the manifest.

- [ ] **Step 2: Run the parser/triage tests red**

  ```powershell
  npm.cmd test -- tests/unit/parse-help-issue.test.ts tests/unit/triage-help-issue.test.ts tests/unit/help-labels.test.ts
  ```

  Expected: FAIL because readable fallback construction still succeeds and
  invalid triage does not own `needs-information`.

- [ ] **Step 3: Reduce the parser to the manifest boundary**

  Keep only recognized-heading collection sufficient to locate and reject a
  duplicated `Help manifest`, fenced-JSON extraction, `JSON.parse`, and
  `normalizeHelpManifest`. Return:

  ```js
  {
    valid: false,
    errors: [
      "This issue needs the complete Help manifest generated by Tavernary.",
    ],
  }
  ```

  when the field is absent/empty. Delete fallback origins, display-category
  maps, payload builders, and `HELP_FALLBACK_HEADINGS`.

- [ ] **Step 4: Remove Help heading-based route recovery immediately**

  Remove the `HELP_FALLBACK_HEADINGS` import and generated Help route entries
  from `scripts/submissions/admit-issue.mjs`. Delete or invert the Help-specific
  admission tests that recovered a route from readable fields. Explicit Help
  labels continue to dispatch unchanged. Task 10 removes the remaining project,
  Kit, withdrawal, and owner heading recovery.

- [ ] **Step 5: Add route-specific return guidance and label lifecycle**

  Map the admitted route label (and, after successful parsing, the manifest
  request kind) to:

  - `/help/report-project/`
  - `/help/report-website/`
  - `/help/report-kit/`
  - `/help/other/`

  Invalid comments say the issue remains open and tell the contributor to
  return to Tavernary, regenerate, and create a new review. Export a Help
  constant for the already admission-owned `needs-information` label and
  include it in `PUBLIC_HELP_TRIAGE_LABELS`; do not duplicate the definition
  already created by issue admission. Valid triage removes it through the
  existing owned-label synchronization.

- [ ] **Step 6: Run focused and adjacent Help tests**

  ```powershell
  npm.cmd test -- tests/unit/parse-help-issue.test.ts tests/unit/triage-help-issue.test.ts tests/unit/help-labels.test.ts tests/unit/help-manifest.test.ts tests/unit/admit-issue.test.ts
  ```

  Expected: PASS. Do not retain exported fallback headings just to make old
  routing pass.

- [ ] **Step 7: Commit manifest-only Help**

  ```powershell
  git add scripts/help/parse-help-issue.mjs scripts/help/triage-help-issue.mjs scripts/help/help-labels.mjs scripts/submissions/admit-issue.mjs tests/unit/parse-help-issue.test.ts tests/unit/triage-help-issue.test.ts tests/unit/help-labels.test.ts tests/unit/admit-issue.test.ts
  git commit -m "fix(help): trust generated manifests only"
  ```

## Task 5: Fix Project Type and Add Project Review

**Files:**

- Modify:
  `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/app/submit/project/page.tsx`
- Modify: `tests/unit/project-submission-builder.test.tsx`
- Modify: `tests/e2e/project-submission.spec.ts`

- [ ] **Step 1: Write the reported-regression tests**

  Add component assertions that:

  - `Project Type` starts at `""` with
    **Select a project type** visible;
  - submission without a type focuses Project Type and reports a required
    error;
  - selecting Extension, typing/changing the source URL, entering review,
    returning to edit, and reopening never changes Extension;
  - the review shows Project Type, source URL, primary function, metadata
    modes/values, tags, compatibility, and additional context; and
  - the handoff URL's readable `project-type` and parsed v4 manifest both say
    Extension.

  Add parallel successful review cases for Frontend and System Preset.

- [ ] **Step 2: Run the project builder suite red**

  ```powershell
  npm.cmd test -- tests/unit/project-submission-builder.test.tsx
  ```

  Expected: FAIL because Project Type currently initializes to `frontend` and
  submit opens GitHub directly.

- [ ] **Step 3: Introduce deliberate type selection**

  Change state to:

  ```ts
  const [projectType, setProjectType] =
    useState<ProjectSubmissionType | "">("");
  ```

  Add `"project-type"` to `SubmissionField`. Validate it before calling
  `normalizeProjectSubmissionManifest`; the normalizer receives only a narrowed
  `ProjectSubmissionType`. The select contains:

  ```tsx
  <option value="">Select a project type</option>
  <option value="frontend">Frontend</option>
  <option value="extension">Extension</option>
  <option value="preset">System Preset</option>
  ```

  Keep existing resets only inside the Project Type `onChange`; source URL and
  other field edits never call `setProjectType`. While the value is empty,
  render no type-specific controls, use neutral Project URL guidance, and
  expose no applicable tags. Narrow to `ProjectSubmissionType` before calling
  `.includes()` on tag applicability or building the manifest.

- [ ] **Step 4: Separate validation from handoff**

  Store the normalized v4 manifest as the review snapshot only after validation
  succeeds. Render `SubmissionReview` instead of the form while reviewing.
  `Back and edit` returns to the form without clearing state. `openReview`
  normalizes/builds from current form state on every invocation and calls
  `openProjectSubmission`.

  The review labels values with human-readable vocabulary labels while the
  serialized manifest retains canonical IDs.

- [ ] **Step 5: Remove direct-GitHub fallback copy**

  Update the project page lead/actions to state that Tavernary validates and
  reviews the request before opening GitHub for creation. Keep the normal
  GitHub identity requirement.

- [ ] **Step 6: Run project frontend and E2E tests**

  ```powershell
  npm.cmd test -- tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/unit/project-submission-manifest.test.ts
  npm.cmd run test:e2e -- --grep "project submission"
  ```

  Expected: PASS. The Playwright test continues stubbing `window.open` but now
  asserts original-tab opened/reopen feedback and the final URL.

- [ ] **Step 7: Commit the project fix**

  ```powershell
  git add src/features/submissions/components/project-submission-builder.tsx src/app/submit/project/page.tsx tests/unit/project-submission-builder.test.tsx tests/e2e/project-submission.spec.ts
  git commit -m "fix: require reviewed project type"
  ```

## Task 6: Make Project Intake Manifest-Only

**Files:**

- Modify: `scripts/submissions/parse-project-submission.mjs`
- Modify: `scripts/submissions/parse-project-submission.d.mts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `tests/unit/parse-project-submission.test.ts`
- Modify: `tests/unit/triage-issue.test.ts`

- [ ] **Step 1: Add failing parser-authority tests**

  Prove:

  - a valid v4 manifest parses when every readable field contradicts it;
  - missing manifest returns invalid with `source: "manifest"`;
  - readable Frontend/URL/compatibility fields alone never form v4;
  - malformed JSON stays invalid;
  - v3 remains rejected by default and accepted only with
    `{ allowLegacyV3: true }`; and
  - triage leaves missing/invalid requests open as `needs-information`.

- [ ] **Step 2: Run the project parser tests red**

  ```powershell
  npm.cmd test -- tests/unit/parse-project-submission.test.ts tests/unit/triage-issue.test.ts
  ```

  Expected: FAIL because readable headings still construct v4.

- [ ] **Step 3: Delete readable payload construction**

  Retain the heading reader only to locate `Project manifest`, fenced JSON
  extraction, JSON parsing, and:

  ```js
  normalizeProjectSubmissionManifest(candidate, {
    allowLegacyV3: options.allowLegacyV3 === true,
    tagVocabulary,
  });
  ```

  Remove project-type mapping, readable frontend parsing, checkbox parsing,
  display-label vocabulary mapping, and metadata-mode inference. Return an
  actionable manifest-required error if the field is empty.

- [ ] **Step 4: Point correctable project failures back to Tavernary**

  In both validation-comment builders in `triage-issue.mjs`, preserve the
  existing marker, errors, labels, and open issue. Replace instructions to edit
  GitHub fields with:

  > Return to https://tavernary.org/submit/project/, correct the request, and
  > open a new GitHub review. This issue will remain open with
  > `needs-information`.

  Do not alter duplicate-closing, retryable transport, frontend dependency, or
  admitted publication behavior.

- [ ] **Step 5: Narrow the declaration contract**

  Update `ProjectSubmissionParseResult` so both valid and invalid results use
  `source: "manifest"` only. Keep `allowLegacyV3?: boolean`.

- [ ] **Step 6: Run the project automation regression**

  ```powershell
  npm.cmd test -- tests/unit/parse-project-submission.test.ts tests/unit/triage-issue.test.ts tests/unit/generate-project-submission.test.ts tests/unit/validate-submission.test.ts
  ```

  Expected: PASS; generation/publication remains unchanged for valid v4.

- [ ] **Step 7: Commit manifest-only project parsing**

  ```powershell
  git add scripts/submissions/parse-project-submission.mjs scripts/submissions/parse-project-submission.d.mts scripts/submissions/triage-issue.mjs tests/unit/parse-project-submission.test.ts tests/unit/triage-issue.test.ts
  git commit -m "fix: make project manifests authoritative"
  ```

## Task 7: Preserve All Owner and Multi-Project State Through Review

**Files:**

- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `tests/unit/project-owner-builder.test.tsx`
- Modify: `scripts/help/triage-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `.github/workflows/triage-project-owner-request.yml`
- Modify: `tests/unit/triage-project-owner-request.test.ts`
- Modify: `tests/unit/generate-project-owner-request.test.ts`
- Modify: `tests/unit/workflows.test.ts`

- [ ] **Step 1: Add failing owner review and authority tests**

  Cover all six operations:

  - edit card;
  - add cards;
  - retire card;
  - restore card;
  - move source; and
  - delist source.

  For `add-cards`, test one and ten complete drafts. Compare the decoded
  manifest before and after back/edit/reopen, including `source_id`,
  `repository_id`, vocabulary hash, card IDs, fingerprints, metadata modes,
  tags, compatibility, and explanations. For delisting, preserve typed
  confirmation and every affected sibling name.

  Add backend assertions that complete readable owner fields without a manifest
  cannot select a project/source or operation, and that readable drift cannot
  change a valid v2 request. Add workflow assertions that invalid owner
  requests stay open, receive a marker comment with
  `/help/manage-project/`, and lose that comment after a valid retry.

- [ ] **Step 2: Run the owner suites red**

  ```powershell
  npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts
  ```

  Expected: FAIL because owner handoff is one-shot and backend preliminary
  parsing still derives identifiers/operations from readable fields.

- [ ] **Step 3: Integrate shared review without flattening v2**

  Keep `reviewManifest` as a fully normalized `ProjectOwnerManifest`. Pass the
  existing operation-specific `reviewRows()` to `HelpReview`. Replace local
  handoff booleans with `openReview`.

  Correct prefills to actual Issue Form IDs:

  ```ts
  prefills: [
    ["request-type", operationLabels[manifest.operation]],
    ["source-id", manifest.source_id],
    ["project-id", "project_id" in manifest ? manifest.project_id : ""],
    ["repository", selected.sourceUrl ?? ""],
    ["explanation", manifest.explanation ?? ""],
  ];
  ```

  Do not use readable values to rebuild any omitted v2 field.

- [ ] **Step 4: Require the manifest before owner record lookup**

  In triage:

  1. locate and parse `Owner request manifest`;
  2. validate its operation, `source_id`, and operation-required `project_id`
     directly from that parsed object using the existing operation set and ID
     pattern;
  3. load the referenced canonical project/source;
  4. run the existing full normalization, authority, fingerprint, source-lock,
     exact-file, and publication logic.

  Delete `fallbackManifest`, readable metadata mode parsing, and readable
  identifier fallback. In the generator, accept only normalized manifest
  identifiers. Return `needs-information` with `/help/manage-project/` when the
  manifest is absent, malformed, or unsupported.

- [ ] **Step 5: Synchronize owner correction guidance**

  In `triage-project-owner-request.yml`, keep the issue open and existing label
  lifecycle. For `needs-information`, create or update one marker comment with
  `decision.message`, state that readable fields are not the payload, and link
  `/help/manage-project/`. For admitted/retryable outcomes, remove a prior
  correction marker when it no longer applies. Do not dispatch the generation
  workflow unless the outcome is admitted.

- [ ] **Step 6: Run owner and source-registry regression suites**

  ```powershell
  npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-authority.test.ts tests/unit/source-request-lock.test.ts tests/unit/workflows.test.ts
  ```

  Expected: PASS, including the existing manual-merge rule for add-card
  batches and all stale/fingerprint failures.

- [ ] **Step 7: Commit owner review and manifest authority**

  ```powershell
  git add src/features/help/components/project-owner-builder.tsx scripts/help/triage-project-owner-request.mjs scripts/help/generate-project-owner-request.mjs .github/workflows/triage-project-owner-request.yml tests/unit/project-owner-builder.test.tsx tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/workflows.test.ts
  git commit -m "fix(help): preserve owner review manifests"
  ```

## Task 8: Add Kit Create/Edit Review Without Draft Loss

**Files:**

- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `scripts/submissions/triage-kit-issue.mjs`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `tests/unit/kit-builder-panel.test.tsx`
- Modify: `tests/unit/submission-transport.test.ts`
- Modify: `tests/unit/triage-kit-issue.test.ts`
- Modify: `tests/kits-e2e/kit-builder-opening.spec.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`

- [ ] **Step 1: Add the failing Kit-draft regression**

  Create and edit Kit cases that:

  - enter Tavernary review before `window.open`;
  - show operation, Kit ID when editing, title, description, and every project;
  - return to edit with title/description/order intact;
  - survive successful handoff, null-popup recovery, and clipboard recovery;
  - reopen with a manifest containing the latest draft;
  - retain the draft after GitHub opens; and
  - still clear it after the existing explicit discard confirmation.

  Add a Kit triage assertion that an invalid manifest leaves the issue open
  with `needs-information` and directs correction to Tavernary instead of
  GitHub readable fields.

- [ ] **Step 2: Run the Kit unit tests red**

  ```powershell
  npm.cmd test -- tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/submission-transport.test.ts
  ```

  Expected: FAIL because Kit submit opens immediately and
  `catalog-page.tsx` calls `workspace.discardDraft()`.

- [ ] **Step 3: Add the in-panel review state**

  Keep Kit draft ownership in `useKitBuilder`. Make the builder's submit action
  mean **Review Kit request**. The panel renders `SubmissionReview` with rows
  derived from the current draft and an `openReview` closure that passes that
  same current draft to `openKitSubmission`. Change the `onSubmitDraft` prop
  from `() => void` to `() => Promise<GitHubHandoffResult>` so the shared review
  receives the real mode and popup failure rather than treating submission as
  fire-and-forget.

  Back/edit returns to the builder. Cancel exits review but retains the draft.
  Existing explicit discard remains the sole destructive action.

- [ ] **Step 4: Remove automatic draft disposal**

  In `catalog-page.tsx`, make the callback:

  ```ts
  () =>
    openKitSubmission(
      "https://github.com/MentallyQuill/Tavernary/issues/new",
      buildState.draft,
    )
  ```

  Do not call `workspace.discardDraft()` in success or error paths.

- [ ] **Step 5: Update correctable Kit guidance**

  Keep manifest-only Kit validation, triage marker synchronization, and label
  behavior. Change only the invalid comment tail to say:

  > Return to Tavernary's Kit builder, correct the draft, and open a new GitHub
  > review. This issue remains open with `needs-information`.

  Use the canonical `https://tavernary.org/?mode=kits` link. Do not alter
  automatic publication or moderation.

- [ ] **Step 6: Run focused Kit unit and E2E tests**

  ```powershell
  npm.cmd test -- tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/submission-transport.test.ts tests/unit/triage-kit-issue.test.ts
  npm.cmd run build:test-kits
  npm.cmd run test:kits-e2e -- --grep "Kit builder|submit|draft"
  ```

  Expected: PASS.

- [ ] **Step 7: Commit Kit review persistence**

  ```powershell
  git add src/features/kits/components/kit-builder.tsx src/features/kits/components/kit-builder-panel.tsx src/features/catalog/components/catalog-page.tsx scripts/submissions/triage-kit-issue.mjs tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/submission-transport.test.ts tests/unit/triage-kit-issue.test.ts tests/kits-e2e/kit-builder-opening.spec.ts tests/kits-e2e/kits.spec.ts
  git commit -m "fix(kits): retain drafts through review"
  ```

## Task 9: Move Kit Withdrawal into Tavernary

**Files:**

- Create: `src/features/kits/kit-withdrawal-manifest.mjs`
- Create: `src/features/kits/kit-withdrawal-manifest.d.mts`
- Create:
  `src/features/help/components/kit-withdrawal-form.tsx`
- Create: `src/app/help/withdraw-kit/page.tsx`
- Create: `tests/unit/kit-withdrawal-form.test.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `scripts/kits/apply-withdrawal.mjs`
- Modify: `.github/workflows/apply-kit-withdrawal.yml`
- Modify: `tests/unit/apply-kit-withdrawal.test.ts`
- Modify: `tests/e2e/help-center.spec.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`

- [ ] **Step 1: Write failing manifest and form tests**

  Define the only accepted new payload:

  ```json
  {
    "schema_version": 1,
    "request_kind": "kit-withdrawal",
    "kit_id": "stable-kit-id",
    "confirmation": true
  }
  ```

  Test exact keys, schema version, slug-like stable Kit ID, literal request kind,
  and `confirmation: true`. Test route preselection from `?kit=`, unknown Kit
  rejection, explicit checkbox validation, review, back/edit, popup recovery,
  and reopen.

  Backend tests prove:

  - readable Kit ID/share URL/checkbox drift is ignored;
  - no or malformed manifest returns `needs-information` without a write;
  - a valid manifest plus matching numeric GitHub author writes the tombstone;
  - a non-author receives a controlled no-write `needs-information` result and
    the issue stays open; and
  - an already withdrawn Kit stays idempotent.

- [ ] **Step 2: Run the withdrawal tests red**

  ```powershell
  npm.cmd test -- tests/unit/kit-withdrawal-form.test.tsx tests/unit/apply-kit-withdrawal.test.ts
  ```

  Expected: FAIL because no Tavernary flow/manifest exists and the script reads
  `Kit ID` directly.

- [ ] **Step 3: Implement the pure manifest normalizer**

  Follow existing `.mjs` plus `.d.mts` domain patterns. Reject extra keys,
  unsupported versions, non-slug IDs, false/missing confirmation, arrays, and
  non-objects. Export normalization and serialization helpers used by both
  frontend and script tests.

- [ ] **Step 4: Build the static Tavernary withdrawal page**

  Reuse `loadCatalog()` and the safe mapping pattern from
  `src/app/help/report-kit/page.tsx`. The form:

  - selects only a current published Kit;
  - warns that withdrawal is retained as a tombstone;
  - says GitHub numeric identity must match the Kit author;
  - requires **I request withdrawal of this Kit**;
  - reviews title, stable ID, author, and effect; and
  - calls `openGitHubReview` with template `07-kit-withdrawal.yml`, manifest
    field `withdrawal-manifest`, the domain's own version-1 serializer, and
    readable review prefills.

  Change the Kit panel link to the Tavernary route in the current tab.

- [ ] **Step 5: Make the application script return a controlled result**

  Add a parser for only the `Kit withdrawal manifest` section. Export a
  testable `processKitWithdrawal()` that returns:

  ```js
  { status: "applied", kitId, changed }
  ```

  or:

  ```js
  {
    status: "needs-information",
    errors,
    returnUrl: "https://tavernary.org/help/withdraw-kit/",
  }
  ```

  Append `?kit=<encoded-normalized-id>` only when a valid Kit ID was available.
  It must not write before the manifest, issue state/labels, numeric author,
  canonical Kit, and ownership all validate.

- [ ] **Step 6: Gate the workflow**

  Have the script write `status` and `kit_id` to `GITHUB_OUTPUT`. On
  `needs-information`, apply the label and synchronize a marker comment with
  the Tavernary route. Gate catalog validation, commit, close, and deploy steps
  with:

  ```yaml
  if: steps.withdraw.outputs.status == 'applied'
  ```

  On a later applied retry, remove `needs-information` before closing.

- [ ] **Step 7: Run withdrawal, Help, and Kit routing tests**

  ```powershell
  npm.cmd test -- tests/unit/kit-withdrawal-form.test.tsx tests/unit/apply-kit-withdrawal.test.ts tests/unit/kit-builder-panel.test.tsx
  npm.cmd run test:e2e -- --grep "withdraw"
  npm.cmd run build:test-kits
  npm.cmd run test:kits-e2e -- --grep "withdraw"
  ```

  Expected: PASS.

- [ ] **Step 8: Commit Tavernary withdrawal**

  ```powershell
  git add src/features/kits/kit-withdrawal-manifest.mjs src/features/kits/kit-withdrawal-manifest.d.mts src/features/help/components/kit-withdrawal-form.tsx src/app/help/withdraw-kit/page.tsx src/features/kits/components/kit-builder-panel.tsx scripts/kits/apply-withdrawal.mjs .github/workflows/apply-kit-withdrawal.yml tests/unit/kit-withdrawal-form.test.tsx tests/unit/apply-kit-withdrawal.test.ts tests/e2e/help-center.spec.ts tests/kits-e2e/kits.spec.ts
  git commit -m "feat(kits): author withdrawals in Tavernary"
  ```

## Task 10: Reframe GitHub as a Review Mirror

**Files:**

- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `.github/ISSUE_TEMPLATE/02-project-information.yml`
- Modify: `.github/ISSUE_TEMPLATE/03-website-bug.yml`
- Modify: `.github/ISSUE_TEMPLATE/04-other.yml`
- Modify: `.github/ISSUE_TEMPLATE/05-kit-submission.yml`
- Modify: `.github/ISSUE_TEMPLATE/06-kit-report.yml`
- Modify: `.github/ISSUE_TEMPLATE/07-kit-withdrawal.yml`
- Modify: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `tests/unit/issue-forms.test.ts`
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `docs/contributing/contribution-overview.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/contributing/kits.md`
- Modify: `docs/maintenance/operations-runbook.md`

- [ ] **Step 1: Replace Issue Form tests with the review-mirror contract**

  Assert for every public Issue Form:

  - name/description/intro says to begin in Tavernary;
  - intro identifies the generated values as review-only;
  - intro contains its exact Tavernary correction route;
  - the domain manifest field is a required textarea;
  - readable fields are optional where GitHub permits;
  - no text says “fallback,” “edit this issue to correct it,” or reconstructs
    automation from readable fields; and
  - the private security route remains absent from public forms.

  Assert `config.yml` keeps `blank_issues_enabled: false` and contains contact
  links for:

  - `https://tavernary.org/submit/project/`
  - `https://tavernary.org/?mode=kits`
  - `https://tavernary.org/help/manage-project/`
  - `https://tavernary.org/help/`

  Add admission tests proving exact readable heading sets now return `"none"`
  and explicit labels still return their domain route.

- [ ] **Step 2: Run Issue Form and admission tests red**

  ```powershell
  npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/admit-issue.test.ts
  ```

  Expected: FAIL on fallback wording, optional manifests, missing contact links,
  and heading-based route recovery.

- [ ] **Step 3: Update each Issue Form honestly**

  Do not claim GitHub fields are technically locked. Use consistent language:

  > Tavernary prepared this review. Check the values, then create or cancel the
  > issue. To make changes, return to Tavernary and open a fresh GitHub review.
  > The generated manifest is the automation payload; the readable fields are
  > review-only.

  Set the manifest fields required:

  - `project-manifest`
  - `help-manifest`
  - `manifest`
  - `withdrawal-manifest`
  - `owner-request-manifest`

  Preserve readable fields and labels so maintainers can scan the issue. Do not
  compare them with the manifest.

- [ ] **Step 4: Add Tavernary issue-chooser links**

  Give every contact link a clear name and explanation. Keep blank issues
  disabled. Do not add a public security link that bypasses the existing
  private advisory page.

- [ ] **Step 5: Remove body-heading routing**

  Delete imports/constants/functions used only by `issueRouteFromBody`.
  `effectiveIssueRoute(issue)` returns the explicit label route only. Preserve
  conflict behavior when multiple owned route labels exist. Existing
  issue-admission limits and trusted-author behavior remain unchanged.

- [ ] **Step 6: Update active contributor copy**

  Run:

  ```powershell
  rg -n -i 'fallback form|direct github|edit (the|this) issue|structured fallback|github form' README.md docs src .github/ISSUE_TEMPLATE
  ```

  Update the four mapped active contributor/operations documents to
  Tavernary-first correction language. Exclude files under
  `docs/superpowers/specs/` and `docs/superpowers/plans/` because they are
  historical decision records. Any unexpected active match is a plan
  discovery: add its exact path to this task before editing it.

- [ ] **Step 7: Validate YAML and routing**

  ```powershell
  npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/admit-issue.test.ts tests/unit/parse-project-submission.test.ts tests/unit/parse-help-issue.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-kit-withdrawal.test.ts
  npm.cmd run format:check
  ```

  Expected: PASS. No public payload can be reconstructed from readable
  headings.

- [ ] **Step 8: Commit review-mirror forms and copy**

  ```powershell
  git add .github/ISSUE_TEMPLATE scripts/submissions/admit-issue.mjs tests/unit/issue-forms.test.ts tests/unit/admit-issue.test.ts docs/contributing/contribution-overview.md docs/contributing/submission-and-review.md docs/contributing/kits.md docs/maintenance/operations-runbook.md
  git commit -m "docs: make GitHub forms review mirrors"
  ```

  Before committing, inspect `git diff --cached --name-only` and unstage any
  unrelated or archived design/plan file.

## Task 11: Add Cross-Flow Interaction and Mobile Coverage

**Files:**

- Modify: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/e2e/help-project-report.spec.ts`
- Modify: `tests/e2e/help-website-and-other.spec.ts`
- Modify: `tests/e2e/help-project-owner.spec.ts`
- Modify: `tests/e2e/help-center.spec.ts`
- Modify: `tests/e2e/kits-builder-mobile.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/kits-e2e/kit-builder-opening.spec.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify visual tests/snapshots only if the approved states require them

- [ ] **Step 1: Add a reusable popup recorder**

  In the existing Playwright fixture/helper location, override `window.open`
  before page scripts execute:

  ```ts
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.defineProperty(window, "__openedGitHubReviews", { value: opened });
    window.open = ((url?: string | URL) => {
      opened.push(String(url ?? ""));
      return window;
    }) as typeof window.open;
  });
  ```

  Add a null-return variant for popup recovery. Use the recorded URL to decode
  the domain manifest and inspect exact current values.

- [ ] **Step 2: Cover the full project path**

  Test at least:

  - no default Project Type;
  - Extension selection retained after source URL typing;
  - automatic/manual summary and tag choices;
  - six tags;
  - review/back/edit/review;
  - opening and reopening with two different current manifests; and
  - readable `project-type` drift being irrelevant to parsed manifest tests.

- [ ] **Step 3: Cover Help and owner paths**

  Exercise all four Help routes once. For owner:

  - review one edit operation;
  - review a ten-card add batch;
  - verify every card remains after popup recovery;
  - verify source move and permanent delist review text; and
  - verify security still links to a private advisory.

- [ ] **Step 4: Cover Kit paths**

  Exercise Kit create/edit review, successful open, popup failure, back/edit,
  reopen, and explicit discard. Follow **Request withdrawal** into Tavernary,
  validate the confirmation, and decode its version-1 manifest.

- [ ] **Step 5: Add 320-pixel assertions**

  At viewport `320 x 800`, assert:

  - review headings and actions are visible;
  - no horizontal document overflow;
  - six-tag project review remains usable;
  - ten-card owner review can scroll to its final action;
  - Kit review retains usable controls; and
  - focus returns to the expected field after **Back and edit**.

- [ ] **Step 6: Run all browser suites**

  ```powershell
  npm.cmd run test:e2e
  npm.cmd run build:test-kits
  npm.cmd run test:kits-e2e
  npm.cmd run test:visual
  npm.cmd run test:kits-visual
  ```

  Expected: all PASS. Update snapshots only after inspecting each changed image
  and confirming it represents the approved review state rather than masking a
  regression.

- [ ] **Step 7: Commit cross-flow coverage**

  ```powershell
  git add tests/e2e tests/kits-e2e tests/visual
  git commit -m "test: cover public review handoffs"
  ```

## Task 12: Run the Full Contract Audit and Verification

**Files:**

- Modify only files needed to fix failures that demonstrably belong to this
  feature

- [ ] **Step 1: Audit all public entrypoints and payload parsers**

  Run:

  ```powershell
  rg -n -i 'issues/new|fallback|direct github|edit (the|this) issue|leave it empty|source: \"fallback\"|source: \"headings\"' src scripts .github docs/contributing README.md
  rg -n 'issueRouteFromBody|fallbackManifest|HELP_FALLBACK_HEADINGS|parseKitId' scripts tests
  ```

  Expected:

  - `issues/new` appears only inside domain transport constants/tests and
    prepared GitHub review links;
  - no active product/contributor copy advertises a direct authoring fallback;
  - no production parser contains readable payload reconstruction;
  - no Kit withdrawal production path parses `Kit ID`; and
  - historical specs/plans may still describe prior behavior.

- [ ] **Step 2: Run the full repository gate**

  ```powershell
  npm.cmd run check
  ```

  Expected: format, lint, palette audit, catalog validation/build, typecheck,
  all Vitest suites, Next static build, and export verification PASS. Record
  the project/Kit export counts and total passing test count in the handoff.

- [ ] **Step 3: Re-run every browser gate after the production build**

  ```powershell
  npm.cmd run test:e2e
  npm.cmd run build:test-kits
  npm.cmd run test:kits-e2e
  npm.cmd run test:visual
  npm.cmd run test:kits-visual
  ```

  Expected: all PASS at desktop and mobile sizes.

- [ ] **Step 4: Inspect the complete diff**

  ```powershell
  git status --short
  git diff --check
  git diff --stat 09e5c947..HEAD
  git log --oneline --decorate 09e5c947..HEAD
  ```

  Confirm:

  - no project-v4 or owner-v2 schema bump;
  - no schema-v6 catalog migration/data rewrite;
  - no runtime dependency or lockfile drift;
  - no OAuth/backend/account surface;
  - private security remains unchanged;
  - missing manifests remain open and labeled;
  - Kit and owner drafts survive handoff; and
  - only the approved Kit-withdrawal manifest is new.

- [ ] **Step 5: Inspect current GitHub authentication without mutation**

  Use network-enabled GitHub CLI:

  ```powershell
  gh auth status
  gh repo view --json nameWithOwner,url,defaultBranchRef
  ```

  Expected: authenticated against `MentallyQuill/Tavernary`. If the token is
  expired, stop and ask the user to reauthenticate.

- [ ] **Step 6: Request separate approval for live smoke**

  Do not create an issue. Ask for approval to open the live Issue Forms and
  verify:

  - Tavernary prefill;
  - the known delayed readable-field reset;
  - review-only return guidance;
  - manifest-required behavior; and
  - create/cancel availability.

  With approval, use the signed-in browser, make no submission, capture exact
  observed behavior, and close/cancel the form.

- [ ] **Step 7: Finish with verification evidence**

  Re-run `git status --short` after any smoke-only activity. Use
  `superpowers:verification-before-completion` before claiming the branch is
  ready. Report:

  - commit range;
  - exact focused/full/browser commands and results;
  - exported project/Kit counts;
  - live-smoke status or the fact it remains approval-gated;
  - unchanged project v4, owner v2, and schema-v6 contracts; and
  - any pre-existing audit findings separately from feature regressions.
