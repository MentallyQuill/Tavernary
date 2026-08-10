# Resolve Outstanding GitHub Work Design

## Goal

Close Tavernary's actionable GitHub queue without bypassing validation, preserving the intentionally dirty primary checkout and treating deployment as a separate proof step.

## Current state

- PR #457 is merged after both required checks passed.
- Issue #465 is closed as an exact duplicate of published Kit #464.
- Issue #419 reproducibly fails because the model returns summary JSON containing Markdown/list syntax.
- Issue #460 represents an active deterministic TavernKeeper synthesis fallback.
- Tavernary's report reader supports scanner policy 4 but rejects contextual-review policy 4, so reconciliation cannot currently retry #460.
- Draft PR #459 provides utility-primary structured generation with one-shot Luna JSON repair. Its rollout hold is now releasable because TavernKeeper PR #135 is merged and all required repository secrets are configured.

## Design

### Contextual-review policy 4 compatibility

Extend the existing immutable-report reader rather than weakening validation. Policy 4 uses the same demonstrated-risk item shape and risk mapping as policy 3, but binds `prompt_version` to `contextual-review-v7`; both use `contextual-assessment-v2`. Policies 1 and 2 remain legacy and must still reject `risk_exposure`.

The reader will:

- accept contextual-review versions 1 through 4;
- require `risk_exposure` on every policy-3 and policy-4 assessment/observation;
- require high-confidence demonstrated exposure for credible malicious behavior;
- recompute and validate each recommended risk using the existing demonstrated-risk mapping;
- require prompt v6 for policy 3 and prompt v7 for policy 4;
- preserve all existing scanner-policy, digest, source-identity, coverage, and URL checks.

Tests will prove a valid policy-4 index/report pair imports and that stale prompt versions or invalid risk tuples are rejected.

### Release sequence

1. Publish the policy-4 reader fix through a focused PR and merge only after required checks pass.
2. Dispatch TavernKeeper reconciliation and confirm the unsupported-policy failure is gone.
3. Update PR #459 from current `main`; do not accept visual baselines merely to turn CI green. Its model-routing diff contains no UI change, so current main's stabilized snapshots should pass after synchronization.
4. Mark #459 ready and merge only after all required checks pass.
5. Retry issue #419 through the repaired structured-output path, inspect and merge the generated catalog PR, then verify issue closure and deployment.
6. Retry issue #460's exact immutable report digest. The existing incident reconciler will close it only if narrative synthesis succeeds; otherwise retain it with new diagnostic evidence.

## Error handling and safety

- Work only in isolated worktrees; do not modify or clean the primary checkout.
- Do not force-update shared automation branches except through their repository-owned workflow.
- Do not merge through a red required check.
- Treat repeated external/provider fallback as an active incident rather than manually closing it.
- If a workflow produces no catalog change, inspect its explicit diagnostic before deciding whether closure is valid.

## Verification

- Targeted policy-reader unit tests pass through an observed red-green cycle.
- `npm.cmd run check` passes before publishing the reader fix.
- Each PR reports green required checks before merge.
- Reconciliation completes successfully on an exact `main` SHA.
- Issue #419 is closed by the publication workflow and its project is present in the generated and deployed catalog.
- Issue #460 is closed by incident reconciliation or remains open with current retry evidence.
- Final GitHub inventory contains no unaccounted open issue or PR.
