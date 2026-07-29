# Provenance-Aware Catalog Copy and Automated Project Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish new projects and authorized project changes automatically
through generated PR transactions while preserving verified-owner and
trusted-staff wording, synthesizing community summaries from README-first
evidence, and creating non-blocking catalog-policy maintenance notices.

**Architecture:** New submissions and project-owner requests retain separate
domain validation but emit one `ProjectPublicationTransaction` consumed by a
shared GitHub Actions publisher. The existing enrichment provider gains
explicit preservation and evidence-synthesis summary modes, while owner edits
reuse a summary-only provider over the same copy contract. A separate
post-publication workflow records advisory review state and creates neutral
maintenance issues without affecting publication.

**Tech Stack:** TypeScript 6, React 19, Next.js 16 static export, Node.js 24 ES
modules, Vitest, Playwright, JSON schemas and registries, GitHub Actions,
GitHub CLI.

## Global Constraints

- Base work on the completed classification/trusted-edit contract at
  `604ce38e`.
- Use immutable GitHub actor IDs for owner detection; login is diagnostic.
- Trusted staff authority must continue using the reviewed immutable-ID
  registry plus current host-repository association.
- Verified-owner and trusted-staff summaries return unchanged whenever no
  catalog requirement forces an edit.
- Necessary edits change the smallest possible span and preserve unaffected
  wording, order, voice, and structure.
- Community synthesis uses README, repository description, then submitted
  description in that order.
- Consensual adult content, kink, fetish content, and ordinary profanity are
  permitted.
- No deterministic offensive-word list may be added.
- Models may generate copy and advisory signals but never reject, quarantine,
  delist, or reverse a listing.
- Generated PRs remain the validation and audit boundary.
- GitHub Actions uses `GITHUB_TOKEN`; add no separate bot account, app, or
  service.
- Creation and owner/staff operations share the publication contract but keep
  domain-specific validation.
- A verified-owner delisting publishes before its staff notice is created.
- Owner-facing delisting is permanent through product workflows; exceptional
  restoration remains a manual staff maintenance action.
- Kit publication architecture remains unchanged.
- Every production behavior change follows one-test-at-a-time red-green-
  refactor.
- Preserve unrelated work and edit generated catalog output only through the
  catalog builder.

---

## File structure

### New shared units

- `src/features/catalog/emoji-free-text.mjs`
  - Removes emoji while preserving all non-emoji text.
- `src/features/catalog/emoji-free-text.d.mts`
  - Types the sanitizer result.
- `src/features/catalog/catalog-policy.mjs`
  - Exports policy version, route, public guidance, advisory categories, and
    copy-result enums.
- `src/features/catalog/catalog-policy.d.mts`
  - Types the public policy contract.
- `src/app/catalog-policy/page.tsx`
  - Renders the public Catalog Policy.
- `src/features/help/components/permanent-delist-dialog.tsx`
  - Owns typed-name confirmation and accessible destructive action.
- `scripts/catalog/catalog-copy-contract.mjs`
  - Builds shared copy instructions and validates structured copy results.
- `scripts/catalog/catalog-copy-contract.d.mts`
  - Types copy modes, inputs, outputs, and validators.
- `scripts/catalog/catalog-copy-provider.mjs`
  - Runs the summary-only preservation pass for owner/staff edits.
- `scripts/catalog/catalog-copy-provider.d.mts`
  - Types provider configuration and generation.
- `scripts/submissions/submission-summary-authority.mjs`
  - Classifies new submissions as community, repository owner, or staff.
- `scripts/submissions/submission-summary-authority.d.mts`
  - Types the authority classifier.
- `scripts/publication/project-publication-transaction.mjs`
  - Creates, parses, and validates the shared transaction marker.
- `scripts/publication/project-publication-transaction.d.mts`
  - Types transaction operations and marker state.
- `scripts/publication/project-publication-planner.mjs`
  - Plans publish, retry, regenerate, or ignore from a completed CI run.
- `scripts/publication/project-publication-planner.d.mts`
  - Types planner inputs and decisions.
- `scripts/publication/project-publication-notices.mjs`
  - Produces neutral copy-adjustment and owner-delist issue mutations.
- `scripts/publication/project-publication-notices.d.mts`
  - Types notification planners.
- `.github/workflows/publish-project-transaction.yml`
  - Revalidates and merges the exact generated SHA, then dispatches lifecycle,
    deployment, notifications, and advisory review.
- `scripts/moderation/catalog-policy-review-contract.mjs`
  - Validates advisory provider output and creates evidence fingerprints.
- `scripts/moderation/catalog-policy-review-contract.d.mts`
  - Types advisory inputs, outputs, and durable state.
- `scripts/moderation/catalog-policy-review-provider.mjs`
  - Calls the configured structured model for non-blocking source review.
- `scripts/moderation/catalog-policy-review-provider.d.mts`
  - Types advisory provider configuration.
- `scripts/moderation/catalog-policy-review-state.mjs`
  - Creates and updates per-project durable advisory snapshot state.
- `scripts/moderation/catalog-policy-review-state.d.mts`
  - Types state transitions and retry selection.
- `scripts/moderation/catalog-policy-review-notice.mjs`
  - Renders the neutral maintenance issue and inert submitted-summary block.
- `scripts/moderation/catalog-policy-review-notice.d.mts`
  - Types maintenance issue rendering.
- `scripts/moderation/review-catalog-policy.mjs`
  - Orchestrates source loading, provider review, state, and notice output.
- `scripts/moderation/review-catalog-policy.d.mts`
  - Types orchestrator inputs and results.
- `.github/workflows/review-catalog-policy.yml`
  - Runs after publication and retries unavailable reviews on schedule.
- `data/schemas/catalog-policy-review.schema.json`
  - Validates per-project advisory snapshots.
- `data/snapshots/policy-review/.gitkeep`
  - Establishes the durable state directory without public catalog output.

### Existing seams

- Submission UI and manifest:
  `src/features/submissions/components/project-submission-builder.tsx`,
  `src/features/submissions/project-submission-manifest.mjs`,
  `.github/ISSUE_TEMPLATE/01-project-submission.yml`.
- Owner UI and manifest:
  `src/features/help/components/project-owner-builder.tsx`,
  `src/features/help/project-owner-manifest.mjs`,
  `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`.
- Enrichment and intake:
  `scripts/catalog/enrichment-provider.mjs`,
  `scripts/catalog/enrichment-contract.mjs`,
  `scripts/catalog/enrich-readmes.mjs`,
  `scripts/catalog/readme-source.mjs`,
  `scripts/submissions/triage-issue.mjs`,
  `scripts/submissions/generate-project-submission.mjs`,
  `scripts/submissions/draft-project-record.mjs`.
- Owner generation:
  `scripts/help/triage-project-owner-request.mjs`,
  `scripts/help/generate-project-owner-request.mjs`,
  `scripts/help/apply-project-owner-request.mjs`.
- Generated PRs and lifecycles:
  `scripts/submissions/project-submission-pr.mjs`,
  `scripts/help/project-owner-pr.mjs`,
  `.github/workflows/generate-project-submission.yml`,
  `.github/workflows/generate-project-owner-request.yml`,
  `.github/workflows/project-submission-lifecycle.yml`,
  `.github/workflows/project-owner-request-lifecycle.yml`,
  `.github/workflows/ci.yml`.
- Validation and documentation:
  `scripts/catalog/validate.mjs`,
  `tests/unit/workflows.test.ts`,
  `docs/contributing/submission-and-review.md`,
  `docs/maintenance/operations-runbook.md`,
  `docs/maintenance/github-actions-user-guides.md`.

---

### Task 1: Add the public policy contract and emoji-safe description controls

**Files:**

- Create: `src/features/catalog/emoji-free-text.mjs`
- Create: `src/features/catalog/emoji-free-text.d.mts`
- Create: `src/features/catalog/catalog-policy.mjs`
- Create: `src/features/catalog/catalog-policy.d.mts`
- Create: `src/app/catalog-policy/page.tsx`
- Modify:
  `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Test: `tests/unit/emoji-free-text.test.ts`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/unit/project-owner-builder.test.tsx`
- Test: `tests/unit/issue-forms.test.ts`
- Test: `tests/unit/project-submission-docs.test.ts`
- Test: `tests/e2e/project-submission.spec.ts`
- Test: `tests/e2e/help-project-owner.spec.ts`

**Interfaces:**

- Produces:
  `stripEmoji(value: string): { value: string; removed: boolean }`.
- Produces:
  `CATALOG_POLICY_VERSION`, `CATALOG_POLICY_ROUTE`,
  `CATALOG_DESCRIPTION_GUIDANCE`, copy-result enums, and advisory-category
  enums.
- Submission and owner forms consume the sanitizer and policy constants.

- [ ] **Step 1: Write the failing emoji sanitizer test**

Add one table-driven assertion only for the first behavior:

```ts
import { stripEmoji } from "@/features/catalog/emoji-free-text.mjs";

test("removes an emoji without changing surrounding text", () => {
  expect(stripEmoji("A useful tool 🧭 for writers.")).toEqual({
    value: "A useful tool  for writers.",
    removed: true,
  });
});
```

- [ ] **Step 2: Run the sanitizer test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/emoji-free-text.test.ts
```

Expected: FAIL because `emoji-free-text.mjs` does not exist.

- [ ] **Step 3: Implement the minimal sanitizer**

Use Unicode property escapes for extended pictographs, regional-indicator
flags, keycaps, modifiers, variation selectors, and joined emoji sequences.
Return the original string and `removed: false` when no match exists. Do not
trim or normalize any non-emoji text.

- [ ] **Step 4: Run the sanitizer test and verify GREEN**

Run the focused test and confirm one passing test.

- [ ] **Step 5: Add one sanitizer edge case at a time**

Red-green each of:

- family/skin-tone ZWJ sequences;
- flags;
- keycaps;
- emoji-only input;
- ordinary profanity unchanged;
- accented and non-Latin prose unchanged;
- punctuation and trademark text unchanged unless it is rendered as emoji.

- [ ] **Step 6: Write the failing form test**

For each description control, type or paste:

```text
This is damn useful 🧭 for ST-QuickReply.
```

Assert:

- the value becomes `This is damn useful  for ST-QuickReply.`;
- the policy status is visible;
- profanity and project spelling remain;
- the Catalog Policy link targets `/catalog-policy/`.

- [ ] **Step 7: Implement form integration and policy page**

On every description/summary `onChange`, call `stripEmoji`, update the field
with the returned value, and set a polite status only when `removed` is true.
Render the exact approved guidance from the design. The policy page uses
`CATALOG_POLICY_VERSION` and explicitly permits consensual adult content,
kink, fetish content, and ordinary profanity.

- [ ] **Step 8: Update fallback Issue Forms**

Add the same policy guidance and link. Do not add GitHub-form regexes or word
filters. Direct Issue Forms remain able to submit arbitrary text because the
server-side model pass is authoritative.

- [ ] **Step 9: Run focused UI, Issue Form, and E2E tests**

Run:

```powershell
npm.cmd test -- tests/unit/emoji-free-text.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx tests/unit/issue-forms.test.ts tests/unit/project-submission-docs.test.ts
npm.cmd run catalog:build
npm.cmd run build
npm.cmd run test:e2e -- project-submission.spec.ts help-project-owner.spec.ts
```

- [ ] **Step 10: Commit the public policy and emoji controls**

Stage only Task 1 paths and commit:

```text
feat(policy): add catalog copy guidance
```

---

### Task 2: Replace delisting checkbox with typed permanent confirmation

**Files:**

- Create:
  `src/features/help/components/permanent-delist-dialog.tsx`
- Modify:
  `src/features/help/components/project-owner-builder.tsx:47-825`
- Modify: `src/features/help/project-owner-manifest.mjs`
- Modify: `src/features/help/project-owner-manifest.d.mts`
- Modify: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Modify: `scripts/help/triage-project-owner-request.mjs`
- Modify: `scripts/help/apply-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Test: `tests/unit/permanent-delist-dialog.test.tsx`
- Test: `tests/unit/project-owner-builder.test.tsx`
- Test: `tests/unit/project-owner-manifest.test.ts`
- Test: `tests/unit/triage-project-owner-request.test.ts`
- Test: `tests/unit/apply-project-owner-request.test.ts`
- Test: `tests/e2e/help-project-owner.spec.ts`

**Interfaces:**

- Produces:
  `PermanentDelistDialog({ projectName, repositoryLabel, open, onCancel,
  onConfirm })`.
- Extends schema-version-1 owner manifest delists with required
  `delist_confirmation: string`.
- `normalizeProjectOwnerManifest` validates a non-empty confirmation.
- Triage and apply compare confirmation with the current record name using
  `trim().toLocaleLowerCase()`.

- [ ] **Step 1: Write the failing dialog test**

Assert the dialog renders the exact approved copy, keeps
**Permanently delist project** disabled for an empty or partial value, and
enables it for a differently cased complete project name.

- [ ] **Step 2: Run the dialog test and verify RED**

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal accessible dialog**

Use the existing modal-surface focus trap. Keep Cancel as the safe initial
focus. Render the destructive button continuously with `disabled` until
`input.trim().toLocaleLowerCase() === projectName.toLocaleLowerCase()`.
Announce the approved success message with `aria-live="polite"`.

- [ ] **Step 4: Run the dialog test and verify GREEN**

Confirm the button becomes disabled again when a matching value is edited to a
non-match.

- [ ] **Step 5: Write the failing builder-flow test**

Assert submitting a delist form opens the dialog before the ordinary Help
review, Cancel returns focus, and Confirm advances with
`delist_confirmation` in the manifest.

- [ ] **Step 6: Integrate the dialog and remove the checkbox**

Delete `confirmedDelist` and `delistConfirmation`. Keep the optional public
note on the underlying form. The review page shows the permanent owner-facing
effect without exposing refresh, enrichment, tombstone, or exceptional-
restoration implementation details.

- [ ] **Step 7: Add manifest and server validation one test at a time**

Red-green:

- delist confirmation missing;
- confirmation partial;
- confirmation case-insensitive exact match;
- leading/trailing whitespace accepted;
- changed canonical project name makes a stale confirmation fail;
- edit and move-source manifests reject unexpected confirmation fields.

- [ ] **Step 8: Update direct Issue Form fallback**

Change the fallback field guidance to require the current complete project
display name. Parse the visible fallback value only when a valid authoritative
manifest is absent, following the existing fallback rules.

- [ ] **Step 9: Run focused owner tests and E2E**

Run:

```powershell
npm.cmd test -- tests/unit/permanent-delist-dialog.test.tsx tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/issue-forms.test.ts
npm.cmd run catalog:build
npm.cmd run test:e2e -- help-project-owner.spec.ts
```

- [ ] **Step 10: Commit typed delisting confirmation**

Commit:

```text
feat(help): require typed delist confirmation
```

---

### Task 3: Define and enforce the shared catalog-copy contract

**Files:**

- Create: `scripts/catalog/catalog-copy-contract.mjs`
- Create: `scripts/catalog/catalog-copy-contract.d.mts`
- Create: `scripts/catalog/catalog-copy-provider.mjs`
- Create: `scripts/catalog/catalog-copy-provider.d.mts`
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-contract.mjs`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Test: `tests/unit/catalog-copy-contract.test.ts`
- Test: `tests/unit/catalog-copy-provider.test.ts`
- Test: `tests/unit/enrichment-provider.test.ts`
- Test: `tests/unit/enrichment-contract.test.ts`
- Test: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**

- Produces:
  `catalogCopyInstructions(): string`.
- Produces:
  `validateCatalogCopyResult(result, context)` returning
  `{ valid, errors, repairHint }`.
- Produces:
  `createCatalogCopyProvider(configuration).generate(input)`.
- `CatalogCopyInput` contains:
  `mode`, `submittedSummary`, `evidence`, `protectedTerms`, `policyVersion`.
- `CatalogCopyResult` contains:
  `summary`, `result`, `change_reasons`, `policy_signal`.
- Enrichment input gains `summaryMode`, labeled evidence sources,
  `submittedDescription`, `protectedTerms`, and `policyVersion`.
- Enrichment output gains the copy-result metadata while preserving current
  capabilities and classification-review output.

- [ ] **Step 1: Write the first failing preservation-contract test**

```ts
test("accepts byte-identical unchanged owner copy", () => {
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply keeps the author's exact workflow.",
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      },
      preserveContext("ST-QuickReply keeps the author's exact workflow."),
    ).valid,
  ).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

Expected: missing module.

- [ ] **Step 3: Implement minimal enums and unchanged validation**

Require exact keys, enum values, summary ceiling, and byte equality for
`accepted-unchanged`.

- [ ] **Step 4: Run and verify GREEN**

Confirm the single test passes.

- [ ] **Step 5: Red-green contract cases one at a time**

Cover:

- unchanged result with modified output rejected;
- light edit requires one or more light reason codes;
- policy rewrite requires a policy reason;
- unknown reason rejected;
- emoji rejected;
- Markdown/line breaks rejected;
- missing protected term rejected;
- ordinary profanity accepted;
- adult-content wording accepted;
- duplicated/unknown response properties rejected;
- sanitized repair hint contains no raw source text.

- [ ] **Step 6: Write the failing provider-body test**

Assert the provider request contains:

- strict JSON schema;
- policy version;
- preservation versus synthesis mode;
- separately labeled README, repository description, and submission
  description;
- protected terms;
- explicit minimal-transformation language;
- explicit adult-content and profanity allowance; and
- prompt-injection boundary.

- [ ] **Step 7: Implement summary-only provider**

Follow the existing enrichment provider's HTTPS, authentication, timeout,
model-identity, JSON parsing, and safe-error conventions. Reuse exported safe
parsers rather than copying transport behavior when possible.

- [ ] **Step 8: Extend enrichment provider and output validation**

The existing provider uses the shared copy instructions and response schema
properties. `providerInputForRecord` passes labeled evidence and copy mode.
Scheduled enrichment always uses synthesis. Intake may supply preservation.
Store bounded copy metadata in generation reports but not canonical records.

- [ ] **Step 9: Run focused copy and enrichment tests**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-copy-contract.test.ts tests/unit/catalog-copy-provider.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts
```

- [ ] **Step 10: Commit the shared copy contract**

Commit:

```text
feat(catalog): enforce summary copy policy
```

---

### Task 4: Classify new-submission summary authority and integrate README-first evidence

**Files:**

- Create:
  `scripts/submissions/submission-summary-authority.mjs`
- Create:
  `scripts/submissions/submission-summary-authority.d.mts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/triage-issue.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/submissions/generate-project-submission.d.mts`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Modify: `scripts/catalog/readme-source.mjs`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Test: `tests/unit/submission-summary-authority.test.ts`
- Test: `tests/unit/triage-issue.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`
- Test: `tests/unit/readme-source.test.ts`
- Test: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**

- Produces:
  `classifySubmissionSummaryAuthority({ issueActor, authorAssociation,
  sourceIdentity, repositoryOwner, trustedEditorRegistry })`.
- Returns:
  `{ authorityType, actorId, actorLogin }` where authority type is
  `community-submitter`, `repository-owner`, or `tavernary-staff`.
- `inspectProjectSubmissionSource` retains refreshed GitHub owner
  `{ id, login, type }` for authority without writing it to public snapshots.
- Draft generation report gains `summary_authority` and `copy_result`.

- [ ] **Step 1: Write the failing personal-owner authority test**

Use matching immutable actor/owner IDs with different login casing and assert
`repository-owner`.

- [ ] **Step 2: Run and verify RED**

Expected: missing classifier.

- [ ] **Step 3: Implement the minimum GitHub owner classifier**

Require provider `github`, repository owner type `User`, positive IDs, and
exact ID equality.

- [ ] **Step 4: Add one authority case at a time**

Red-green:

- mismatched actor ID -> community;
- collaborator -> community;
- organization owner -> community;
- Codeberg -> community;
- missing owner ID -> community;
- allowlisted staff with trusted association -> staff;
- allowlisted staff without association -> community;
- staff route wins before repository-owner route and records staff authority.

- [ ] **Step 5: Extend source inspection**

Retain only the bounded owner identity required for authority. Continue
excluding it from canonical repository snapshots when the existing snapshot
schema does not require it.

- [ ] **Step 6: Write the failing evidence-priority intake test**

Provide conflicting README, repository description, and submitted description.
Assert the provider input labels all three and tells synthesis to treat README
as canonical.

- [ ] **Step 7: Integrate authority and copy mode**

In `prepareProjectSubmissionDraft`:

- load trusted editor registry;
- classify authority from refreshed issue/source facts;
- select preservation only for owner/staff plus non-empty description;
- build protected terms;
- pass the labeled evidence and mode to enrichment;
- retain sanitized copy metadata in the report.

- [ ] **Step 8: Apply owner/staff enrichment policy**

When preservation mode produced the summary, write curated/manual enrichment
with an issue-referenced note. When owner/staff supplied no summary, retain
automatic synthesis policy. Community records retain automatic policy.

- [ ] **Step 9: Run focused intake tests**

Run:

```powershell
npm.cmd test -- tests/unit/submission-summary-authority.test.ts tests/unit/triage-issue.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-policy.test.ts
```

- [ ] **Step 10: Commit provenance-aware intake**

Commit:

```text
feat(submissions): preserve owner summaries
```

---

### Task 5: Apply preservation copy to owner and trusted-staff edits

**Files:**

- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.d.mts`
- Modify: `scripts/help/apply-project-owner-request.mjs`
- Modify: `scripts/help/apply-project-owner-request.d.mts`
- Modify: `scripts/help/project-owner-pr.mjs`
- Modify: `scripts/help/project-owner-pr.d.mts`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Test: `tests/unit/generate-project-owner-request.test.ts`
- Test: `tests/unit/apply-project-owner-request.test.ts`
- Test: `tests/unit/project-owner-pr.test.ts`
- Test: `tests/unit/catalog-copy-provider.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**

- Owner generation consumes
  `copySummary({ submittedSummary, protectedTerms, policyVersion })`.
- Generation report adds:
  `submitted_summary`, `published_summary`, and `copy_result` only when summary
  changed.
- `applyProjectOwnerRequest` receives the validated published summary rather
  than calling a provider.
- Owner PR reports retain bounded copy metadata and never raw provider output.

- [ ] **Step 1: Write the failing unchanged-summary test**

Assert an edit that changes only primary function never calls `copySummary` and
retains summary byte-for-byte.

- [ ] **Step 2: Run and verify RED**

Expected: current generator has no injected copy provider contract.

- [ ] **Step 3: Implement no-op detection before provider creation**

Compare normalized original/proposed summary exactly. Avoid requiring model
configuration when summary did not change.

- [ ] **Step 4: Write the failing changed-summary preservation test**

Inject a recording provider. Assert owner/staff authority, protected names, and
exact proposed wording reach preservation mode; assert validated output becomes
the record summary and manual enrichment remains.

- [ ] **Step 5: Implement final-generation copy pass**

Run the model only after refreshed authority and stale-record checks, and
before `applyProjectOwnerRequest`. A provider failure is retryable and writes
no generated branch content.

- [ ] **Step 6: Add invalid-output and policy-rewrite tests**

Red-green:

- protected name removed -> reject/repair;
- repeated invalid output -> retryable;
- accepted unchanged -> exact equality;
- light spelling edit -> stored with reason;
- policy rewrite -> bounded reasons retained;
- raw response never enters report.

- [ ] **Step 7: Update PR rendering**

Render neutral copy status and sanitized change-reason labels. Do not post the
detailed reasons to the source issue at generation time; post-merge
notification owns that behavior.

- [ ] **Step 8: Update workflow configuration**

Pass existing enrichment API URL, key, and model to the final owner generation
step. Ensure no-op/source-move/delist runs do not fail when provider settings
are absent because they do not need copy processing.

- [ ] **Step 9: Run complete owner-generation tests**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-copy-provider.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/workflows.test.ts
```

- [ ] **Step 10: Commit preservation-aware owner edits**

Commit:

```text
feat(help): copyedit owner summaries safely
```

---

### Task 6: Introduce the common project publication transaction

**Files:**

- Create:
  `scripts/publication/project-publication-transaction.mjs`
- Create:
  `scripts/publication/project-publication-transaction.d.mts`
- Modify: `scripts/submissions/project-submission-pr.mjs`
- Modify: `scripts/submissions/project-submission-pr.d.mts`
- Modify: `scripts/help/project-owner-pr.mjs`
- Modify: `scripts/help/project-owner-pr.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Test: `tests/unit/project-publication-transaction.test.ts`
- Test: `tests/unit/project-submission-pr.test.ts`
- Test: `tests/unit/project-owner-pr.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`
- Test: `tests/unit/generate-project-owner-request.test.ts`

**Interfaces:**

- Produces:
  `createProjectPublicationTransaction(input)`.
- Produces:
  `parseProjectPublicationTransaction(body)`.
- Produces:
  `expectedTransactionPaths(transaction)`.
- Transaction schema version 1 contains:
  `operation`, `producer`, `issue_number`, `project_id`, `source_identity`,
  `actor`, `authority_type`, `input_digest`, `record_fingerprint`, `base_sha`,
  `generated_head_sha`, `generated_paths`, `policy_version`, `copy_result`.
- Existing producer-specific marker parsers delegate to the shared parser
  during migration.

- [ ] **Step 1: Write the failing create-transaction test**

Create a valid submission transaction and assert exact normalized keys and
path ordering.

- [ ] **Step 2: Run and verify RED**

Expected: missing transaction module.

- [ ] **Step 3: Implement create/parse for submission transactions**

Validate exact keys, SHA formats, positive issue/actor IDs, branch-compatible
operation, sorted unique paths, safe authority enums, and bounded copy reasons.

- [ ] **Step 4: Add owner operation tests one at a time**

Cover:

- `edit-card`;
- `move-source` with registry and snapshot paths;
- `delist`;
- nullable source identity only where existing owner operation permits it;
- record fingerprint required for edit/move/delist;
- community authority permitted only for create.

- [ ] **Step 5: Add tampering and path tests**

Reject:

- unknown keys;
- actor/login type mismatch;
- wrong SHA;
- wrong producer/operation pair;
- generated path outside allowlist;
- missing registry path;
- duplicate paths;
- raw submitted summary in copy metadata.

- [ ] **Step 6: Migrate PR renderers**

Both PR bodies use the same marker start and transaction JSON while retaining
their human-readable domain sections. Legacy marker parsers continue reading
already-open PRs but new generation writes only the shared marker.

- [ ] **Step 7: Compute input digests and base SHA**

Use SHA-256 of the canonical normalized manifest serialization. Capture
`origin/main` immediately before generation. Include current record
fingerprint for owner operations and canonical source identity for creation.

- [ ] **Step 8: Update generation workflows**

Build the shared marker only after the generated commit SHA exists. Preserve
current branch-divergence and collision protections.

- [ ] **Step 9: Run focused transaction and generation tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-publication-transaction.test.ts tests/unit/project-submission-pr.test.ts tests/unit/project-owner-pr.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/workflows.test.ts
```

- [ ] **Step 10: Commit the transaction protocol**

Commit:

```text
feat(publication): unify project transactions
```

---

### Task 7: Add exact-SHA automatic PR publication

**Files:**

- Create:
  `scripts/publication/project-publication-planner.mjs`
- Create:
  `scripts/publication/project-publication-planner.d.mts`
- Create:
  `.github/workflows/publish-project-transaction.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Modify: `.github/workflows/project-owner-request-lifecycle.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `scripts/submissions/project-submission-lifecycle.mjs`
- Modify: `scripts/help/project-owner-lifecycle.mjs`
- Test: `tests/unit/project-publication-planner.test.ts`
- Test: `tests/unit/project-automatic-publication-workflow.test.ts`
- Test: `tests/unit/project-submission-lifecycle.test.ts`
- Test: `tests/unit/project-owner-lifecycle.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:
  `planProjectPublication(input)` returning:
  `ignore`, `paused`, `regenerate`, `retry`, or `merge`.
- Publisher triggers from completed
  `Site: Validate changes` `workflow_run`.
- Repository variable `PROJECT_AUTO_PUBLICATION_ENABLED` must equal `true`.
- Publisher merges with the validated `workflow_run.head_sha`.
- Lifecycle workflows gain explicit `workflow_dispatch` input `pull_number`
  because `GITHUB_TOKEN` merge events may suppress secondary events.

- [ ] **Step 1: Write the failing successful-plan test**

Provide:

- enabled switch;
- successful workflow-dispatch CI run;
- generated branch;
- matching open PR and transaction;
- exact head SHA;
- current base SHA;
- admitted issue;
- exact changed paths.

Assert `action: "merge"`.

- [ ] **Step 2: Run and verify RED**

Expected: missing planner.

- [ ] **Step 3: Implement the minimum merge planner**

Require exact workflow name/event/conclusion, generated branch, open PR, base
`main`, same-repository head, matching transaction issue/project/head/path
state, and enabled switch.

- [ ] **Step 4: Red-green every refusal state**

Cover:

- switch absent/false -> paused;
- ordinary branch -> ignore;
- failed/cancelled CI -> retry or systemic failure;
- workflow head mismatch -> ignore;
- PR head changed -> regenerate;
- issue closed or labels changed -> ignore/reject;
- input digest changed -> regenerate;
- authority lost -> reject;
- record fingerprint stale -> regenerate;
- base behind current main -> regenerate;
- path mismatch -> reject;
- mergeable conflict -> regenerate;
- policy signal present -> still merge.

- [ ] **Step 5: Implement publisher workflow read-only planning**

The default-branch workflow:

1. loads workflow-run metadata;
2. finds exactly one PR by head branch;
3. fetches PR files and source issue;
4. parses the common transaction;
5. refreshes current main/source/authority through the producer-specific
   verify-only command;
6. calls the planner; and
7. writes a sanitized job summary.

No merge occurs until all planner tests are green.

- [ ] **Step 6: Add exact-SHA merge**

For `merge`, call the GitHub merge API with the PR number and exact expected
head SHA. Use the repository's existing merge method. Treat SHA mismatch,
409, 422 merge race, and temporary API failure as retry/regenerate, never as
success.

- [ ] **Step 7: Make lifecycle and deployment explicit**

After a successful merge:

- dispatch the correct project lifecycle workflow with PR number;
- dispatch dependent fork/frontend recovery when the lifecycle requires it;
- dispatch `deploy-pages.yml` for the returned merge SHA;
- dispatch post-publication notifications;
- dispatch advisory review.

Keep existing human-close event support for legacy/manual recovery.

- [ ] **Step 8: Add stale regeneration dispatch**

`regenerate` dispatches the originating generation workflow with issue number
and no force-overwrite of a human-diverged branch. The producer reconstructs
from current `main` and current issue input.

- [ ] **Step 9: Run workflow contract and lifecycle tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-publication-planner.test.ts tests/unit/project-automatic-publication-workflow.test.ts tests/unit/project-submission-lifecycle.test.ts tests/unit/project-owner-lifecycle.test.ts tests/unit/workflows.test.ts tests/unit/kit-automatic-publication-workflow.test.ts
```

- [ ] **Step 10: Commit automatic transaction publication**

Commit:

```text
feat(actions): auto-publish project PRs
```

---

### Task 8: Add post-merge copy and owner-delisting notifications

**Files:**

- Create:
  `scripts/publication/project-publication-notices.mjs`
- Create:
  `scripts/publication/project-publication-notices.d.mts`
- Modify:
  `.github/workflows/publish-project-transaction.yml`
- Modify: `scripts/help/help-labels.mjs`
- Modify: `scripts/help/help-labels.d.mts`
- Test: `tests/unit/project-publication-notices.test.ts`
- Test:
  `tests/unit/project-automatic-publication-workflow.test.ts`
- Test: `tests/unit/help-labels.test.ts`

**Interfaces:**

- Produces:
  `planCopyAdjustmentNotice(transaction, existingComments)`.
- Produces:
  `planOwnerDelistNotice({ transaction, project, kits, pull, issue,
  existingIssues })`.
- Copy notice is a bot-owned idempotent source-issue comment.
- Owner delist notice creates one open issue with
  `owner-delist-notice`.

- [ ] **Step 1: Write the failing neutral copy-notice test**

For owner/staff `accepted-with-light-edits`, assert the exact approved neutral
text and stable marker. Assert community synthesis and unchanged copy produce
no notice.

- [ ] **Step 2: Run and verify RED**

Expected: missing notice module.

- [ ] **Step 3: Implement idempotent copy notice**

Never include detailed reasons, submitted text, or provider output in the
source issue comment.

- [ ] **Step 4: Write the failing owner-delist notice test**

Assert a repository-owner delist renders:

- project/source;
- actor ID/login;
- issue and merged PR;
- timestamp;
- optional inert note;
- canonical resulting state;
- affected published Kits;
- approved non-approval wording;
- stable idempotency marker.

- [ ] **Step 5: Implement owner notice and sanitization**

Escape mentions, Markdown, HTML, links in owner-provided notes while retaining
readable plain text. Trusted-staff delists return no owner notice.

- [ ] **Step 6: Add label definition**

Define `owner-delist-notice` with neutral maintenance description. Ensure label
creation is idempotent.

- [ ] **Step 7: Integrate after merge**

The publisher performs notifications only after GitHub confirms merge.
Notification failures enter retry output and never alter merge success or
canonical state.

- [ ] **Step 8: Add duplicate and retry tests**

Existing marker -> update/no-op rather than duplicate. Temporary issue API
failure -> retry notification without another merge call.

- [ ] **Step 9: Run focused notification tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-publication-notices.test.ts tests/unit/project-automatic-publication-workflow.test.ts tests/unit/help-labels.test.ts
```

- [ ] **Step 10: Commit post-merge project notices**

Commit:

```text
feat(publication): notify project changes
```

---

### Task 9: Add non-blocking post-publication catalog-policy review

**Files:**

- Create:
  `scripts/moderation/catalog-policy-review-contract.mjs`
- Create:
  `scripts/moderation/catalog-policy-review-contract.d.mts`
- Create:
  `scripts/moderation/catalog-policy-review-provider.mjs`
- Create:
  `scripts/moderation/catalog-policy-review-provider.d.mts`
- Create:
  `scripts/moderation/catalog-policy-review-state.mjs`
- Create:
  `scripts/moderation/catalog-policy-review-state.d.mts`
- Create:
  `scripts/moderation/catalog-policy-review-notice.mjs`
- Create:
  `scripts/moderation/catalog-policy-review-notice.d.mts`
- Create:
  `scripts/moderation/review-catalog-policy.mjs`
- Create:
  `scripts/moderation/review-catalog-policy.d.mts`
- Create:
  `.github/workflows/review-catalog-policy.yml`
- Create: `data/schemas/catalog-policy-review.schema.json`
- Create: `data/snapshots/policy-review/.gitkeep`
- Modify: `scripts/catalog/validate.mjs`
- Modify:
  `.github/workflows/publish-project-transaction.yml`
- Modify: `.github/workflows/refresh-catalog.yml`
- Test: `tests/unit/catalog-policy-review-contract.test.ts`
- Test: `tests/unit/catalog-policy-review-provider.test.ts`
- Test: `tests/unit/catalog-policy-review-state.test.ts`
- Test: `tests/unit/catalog-policy-review-notice.test.ts`
- Test: `tests/unit/review-catalog-policy.test.ts`
- Test: `tests/unit/catalog-policy-review-workflow.test.ts`

**Interfaces:**

- Produces:
  `createPolicyEvidenceFingerprint({ projectId, sourceIdentity, headSha,
  policyVersion })`.
- Produces:
  `validateCatalogPolicyReviewOutput(output)`.
- Produces:
  `createCatalogPolicyReviewProvider(configuration).review(input)`.
- Produces:
  `applyCatalogPolicyReviewState(previous, result)`.
- Produces:
  `renderCatalogPolicyReviewIssue(input)`.
- Workflow inputs:
  `project_id`, `transaction_issue_number`, `transaction_pull_number`,
  `merge_sha`.

- [ ] **Step 1: Write the failing advisory-contract test**

Assert `clear`, `review-suggested`, and `review-unavailable` exact shapes.
`review-suggested` requires one controlled category and a sanitized explanation
of 320 characters or fewer.

- [ ] **Step 2: Run and verify RED**

Expected: missing moderation modules.

- [ ] **Step 3: Implement contract and fingerprint**

Require exact keys. Categories are:

- `potential-hate-or-discrimination`;
- `potential-sexual-content-involving-minors`;
- `potential-other-catalog-policy-conflict`.

The fingerprint includes project ID, source identity, evidence head, and policy
version.

- [ ] **Step 4: Write the failing provider-prompt test**

Assert explicit non-violations for consensual adult content, kink, fetish
content, profanity, quotations, historical discussion, fictional antagonists,
security documentation, and incidental terms. Assert the prompt forbids
enforcement decisions and raw source quotation.

- [ ] **Step 5: Implement provider and orchestrator**

Reuse `loadEnrichmentSource`/README preparation at the published snapshot head.
Send bounded README and repository description, project identity/kind, summary,
and policy version. Provider failure produces `review-unavailable`; it never
throws into publication.

- [ ] **Step 6: Implement durable state one transition at a time**

Red-green:

- new clear snapshot;
- same fingerprint deduplicated;
- new head schedules review;
- policy version change schedules review;
- unavailable increments retry state;
- successful retry resets failure state;
- review-suggested stores issue number after notice creation;
- state contains no source excerpt, submitted summary, or model reasoning.

Persist one JSON file per project under `data/snapshots/policy-review/`.
Validate files against the new schema and exclude them from public catalog
generation.

- [ ] **Step 7: Write the failing maintenance issue test**

Assert:

- neutral advisory disclaimer;
- project/source and category;
- exact submitted summary rendered inert;
- final published summary;
- bounded copy reasons;
- sanitized explanation;
- immutable README link;
- transaction/PR/evidence/policy metadata;
- stable per-project marker;
- no raw provider payload or long README excerpt.

- [ ] **Step 8: Implement workflow and state publication**

The workflow:

1. checks out the exact merged state;
2. loads the project and snapshot;
3. skips matching fingerprints;
4. runs review;
5. creates/updates a maintenance issue for suggested review;
6. writes per-project state through a serialized machine-state update;
7. uploads a sanitized report;
8. retries unavailable entries on schedule.

State-update commits do not dispatch deployment or project publication.

- [ ] **Step 9: Integrate post-merge and refresh dispatch**

Publisher dispatches review after every merged project transaction; the
orchestrator deduplicates unchanged evidence. Refresh dispatches targeted review
when a repository head changes. Neither caller waits for review completion.

- [ ] **Step 10: Run moderation and workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-policy-review-contract.test.ts tests/unit/catalog-policy-review-provider.test.ts tests/unit/catalog-policy-review-state.test.ts tests/unit/catalog-policy-review-notice.test.ts tests/unit/review-catalog-policy.test.ts tests/unit/catalog-policy-review-workflow.test.ts tests/unit/workflows.test.ts tests/unit/validate-catalog.test.ts
```

- [ ] **Step 11: Commit advisory policy review**

Commit:

```text
feat(moderation): flag catalog policy review
```

---

### Task 10: Align lifecycle copy, operational documentation, and full proof

**Files:**

- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/contributing/contribution-overview.md`
- Modify: `docs/guides/using-the-catalog.md`
- Modify: `docs/guides/what-is-tavernary.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/maintenance/github-actions-user-guides.md`
- Modify: `docs/reference/catalog-statuses-and-manifests.md`
- Modify: `docs/README.md`
- Modify: `tests/unit/project-submission-docs.test.ts`
- Modify: `tests/unit/help-docs.test.ts`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/e2e/help-project-owner.spec.ts`
- Modify: `tests/visual/theme.visual.spec.ts`

**Interfaces:**

- Documents the single V1 automatic publication switch.
- Documents ruleset prerequisites and exact required validation.
- Documents pause, regeneration, retry, advisory review, owner notification,
  and exceptional manual restoration.
- Removes claims that generated project PRs require maintainer approval.

- [ ] **Step 1: Write failing documentation assertions**

Assert docs state:

- valid create/edit/move/delist PRs auto-publish;
- PRs remain CI/audit transactions;
- policy review is advisory and post-publication;
- adult consensual content and profanity are permitted;
- owner delisting is owner-facing permanent;
- exceptional restoration is manual staff maintenance;
- `PROJECT_AUTO_PUBLICATION_ENABLED` is the emergency switch.

- [ ] **Step 2: Run and verify RED**

Run focused docs tests and confirm current human-review wording fails.

- [ ] **Step 3: Update contributor and user documentation**

Explain authority-sensitive summary behavior, public Catalog Policy, neutral
copy notice, reporting, and permanent delisting UX without exposing backend
details in user-facing copy.

- [ ] **Step 4: Update operations documentation**

Include:

- GitHub ruleset requirements;
- required stable check;
- workflow permissions;
- enabling/disabling the repository variable;
- queue behavior while paused;
- exact-SHA validation;
- lifecycle/deployment explicit dispatch;
- retry and systemic alerts;
- owner-delisting notices;
- advisory maintenance issue handling;
- exceptional restoration checklist.

- [ ] **Step 5: Update E2E and visual coverage**

Prove:

- emoji removal and policy link;
- typed-name delist dialog desktop/mobile;
- disabled/enabled destructive action;
- no checkbox remains;
- existing Help review handoff remains;
- public policy page exports.

- [ ] **Step 6: Run focused documentation and browser tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-docs.test.ts tests/unit/help-docs.test.ts tests/unit/workflows.test.ts tests/unit/issue-forms.test.ts
npm.cmd run catalog:build
npm.cmd run build
npm.cmd run test:e2e -- project-submission.spec.ts help-project-owner.spec.ts static-export.spec.ts
```

- [ ] **Step 7: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
git diff --check
```

Expected: every static, unit, build, export, browser, visual, workflow, and
catalog check passes.

- [ ] **Step 8: Audit the complete implementation against the spec**

Confirm each spec success criterion has a test or explicit live-only rollout
prerequisite. Confirm no raw provider output, source excerpts, actor metadata,
or advisory state entered `src/generated/catalog.json`.

- [ ] **Step 9: Commit documentation and full proof**

Commit:

```text
docs: explain automated project publication
```

---

## Live rollout checklist

Repository code completion does not mutate GitHub settings automatically.
Before production enablement:

- [ ] Confirm the feature branch is merged into current `main`.
- [ ] Use network-enabled GitHub CLI to inspect current open project
  submission and owner-request PRs.
- [ ] Create or update a GitHub ruleset requiring the stable validation check,
  blocking force-push/deletion, and permitting the intended Actions publisher.
- [ ] Confirm Actions may create and merge pull requests.
- [ ] Add `PROJECT_AUTO_PUBLICATION_ENABLED=false`.
- [ ] Run one create, owner edit, staff edit, stale-head, policy-signal, and
  owner-delist canary with the switch disabled where applicable.
- [ ] Set `PROJECT_AUTO_PUBLICATION_ENABLED=true`.
- [ ] Verify exact PR merge, lifecycle synchronization, deployment, copy
  notice, owner-delist notice, and advisory review from live GitHub evidence.
- [ ] Exercise the emergency pause and safe regeneration path.

## Plan self-review

- Every design section maps to at least one implementation task.
- Every new production unit has a focused test file and explicit red-green
  steps.
- Creation and editing share only transaction/publication units; domain
  validation remains separate.
- Owner/staff preservation and community synthesis use one copy-policy
  contract.
- Model policy output cannot influence the publication decision enum.
- Delisting confirmation is typed-name only and contains no backend details.
- Durable advisory state is separate from public catalog data.
- GitHub-token event suppression is handled by explicit lifecycle, deployment,
  notification, and review dispatches.
- No placeholders or deferred implementation requirements remain.
