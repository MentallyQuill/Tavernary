# Tavernary Review-Mirror Implementation Handoff

## Mandatory admitted-request audit

Audit performed 2026-07-29 with the network-enabled GitHub CLI against
`MentallyQuill/Tavernary`.

- Open admitted issues: 2 (`#151`, `#158`).
- Open generated review/publication pull requests: 1 (`#159` for `#151`).
- Missing domain manifests: 0.
- Manifests accepted by current normalizers: 2.
- Pending requests assigned to this implementation for continuity action: 0.

### Issue #151

- Route: project submission.
- Stored manifest: project schema version 3.
- Current recovery parse: valid through the existing explicit
  `allowLegacyV3` caller and normalized to version 4.
- Automation state: open generated publication PR `#159` on
  `automation/project-submission-151`.
- Gate action: none. Preserve the existing historical recovery caller.

### Issue #158

- Route: project owner request, edit-card operation.
- Stored manifest: valid owner schema version 2.
- Stored metadata intent: summary `automatic`, tags `manual`.
- Submitter-confirmed intent: the changed summary and tags were intended to be
  owner-authored.
- Readable GitHub metadata-mode fields: blank.
- Triage run `30513783527`: succeeded.
- Generation run `30513795963`: failed during automatic summary enrichment
  before any branch or PR was created. The provider result violated the summary
  length and word-count contract.
- Root cause boundary: the GitHub dropdown reset explains only readable mirror
  loss. Tavernary independently retained the card's prior automatic summary
  policy while accepting edited summary text, then serialized that mismatch
  into the authoritative manifest.
- Gate action: none in this worktree. The user assigned repair of `#158` to a
  separate chat and explicitly directed this implementation to ignore it. Do
  not change its issue state or reconstruct a replacement manifest here.
- Repository follow-up retained here: content checks currently freeze the
  pre-owner-edit tag migration snapshot, forbid all manual tag policies, and
  require every known manual-summary card to keep tags automatic. Task 7 must
  replace those historical snapshots with semantic current-data invariants
  while retaining the owner's exact one-card generated transaction.

## Implementation checkpoints

- `5dd4836c` centralizes GitHub review opening and recovery.
- `c5e31d85` adds persistent Tavernary opening/opened/recovery review state.
- `da24f29d` moves Help forms and owner review onto the shared component.
- `8fef3a49` removes readable-field reconstruction from Help automation.
- `f29616a6` requires deliberate Project Type selection.
- `d854322a` makes the current project manifest authoritative.
- `385a2a3f` preserves owner review manifests and allows independent manual
  summary/tag policy without coupling tests to historical migration output.
- `577e6618` retains Kit drafts through review and popup recovery.
- `9e6bb789` moves Kit withdrawal authoring into Tavernary with a version-1
  manifest.
- `a2c0f793` makes all public Issue Forms review mirrors and removes
  body-heading admission routing.
- `43e4bd51` adds project, Help, owner, Kit, popup-recovery, and 320-pixel
  browser coverage.
- `858a8519` closes final audit gaps in dependency routing, documentation
  contracts, and Kit review-state lifecycle.

## Final verification

Completed 2026-07-30 in the isolated
`codex/tavernary-github-review-mirror` worktree.

- `npm.cmd run check`: PASS.
  - 309 projects and 8 Kits validated.
  - 307 projects and 8 Kits exported.
  - 186 Vitest files and 1,883 tests passed.
  - 14 static routes built and export verification passed.
- `npm.cmd run test:e2e`: 80 passed, 1 existing data-dependent test skipped.
- `npm.cmd run build:test-kits`: PASS.
- `npm.cmd run test:kits-e2e`: 32 passed.
- `npm.cmd run test:kits-visual`: 17 passed.
- Fresh production `npm.cmd run build`: PASS.
- `npm.cmd run test:visual`: 40 passed after visually inspecting and updating
  the owner-summary policy snapshot.
- GitHub CLI authentication: active `MentallyQuill` account against
  `MentallyQuill/Tavernary`, default branch `main`.
- Contract audit: no project-v4 or owner-v2 schema bump, no schema-v6 catalog
  migration/data rewrite, no dependency or lockfile drift, no OAuth/backend
  surface, and no public security-flow change.
- The signed-in live Issue Form smoke is intentionally not run yet. It remains
  separately approval-gated and must not create an issue.
