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
