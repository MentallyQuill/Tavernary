# Submission Routing Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the recommended inline execution. Use superpowers:subagent-driven-development only if the user selects delegation. Steps use checkbox syntax for tracking.

**Status:** Approved for the bounded inline implementation and protected rollout.

**Goal:** Restore direct submission processing independent of background maintenance while preserving automatic long-duration operation and pending work.

**Architecture:** Reuse the existing project generator/publisher/lifecycle paths, restore a guarded direct Kit publisher, and transfer only submission admissions out of the generic controller. Keep existing automatic background workflows, legacy producer compatibility, and one submission-only finalization adapter using existing proof/projection functions.

**Tech Stack:** Existing GitHub Actions, native GitHub CLI, Node from `.node-version`, ESM `.mjs` with `.d.mts`, Vitest, Prettier. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-17-submission-routing-rollback-design.md`.

## Global constraints

- Base on fresh native main; preserve the primary dirty worktree and all nine already-merged dirty files in `automation-backlog`.
- All GitHub operations use native `gh` with network-enabled permission. An expired token requires user reauthentication.
- Existing background/legacy ceilings remain 200 requests/day and 10,000,000 tokens/day. No reservation reset, refund by inference, or retry-deadline reset.
- New direct submissions have no custom reservation prerequisite; positive legacy envelopes retain their original checks and custody.
- Routine maintenance, retries, missed-handoff recovery, and completion remain automatic. Existing background triggers, cadence, budgets, and preparation/recovery behavior are preserved; no owner-trigger prerequisite is introduced.
- Required exact-head CI, current-base checks, owner/moderation rules, public proof, and non-forced writes remain mandatory.
- No broad `git revert #818`, blind old-YAML checkout, force-push/rebase of generated data, new scheduler, persistent admission-flag subsystem, or recurring monitor.
- One coherent rollout PR; up to three implementation commits matching Tasks 2–4. Keep docs/checkpoint capture with the task it supports.

## Review focus

1. A queued legacy producer overlaps a fresh direct request: exactly one eligible generation; preserve its tickets and artifacts (Task 2).
2. A new direct run has the old wrapper's apparent intent: it must not be redispatched by global reconciliation (Tasks 2–3).
3. Background main advances during a Kit write: reject the stale write and reconstruct without overwriting newer content (Task 4).
4. A Kit was published but its issue/manifest or public data changed: wait or supersede; never prematurely close (Task 4).
5. Backout occurs after real publication/model consumption: revert code while retaining native custody and data/accounting history (Task 5).

Automatic-operation acceptance is covered explicitly in Task 3: due maintenance must still dispatch, and a temporary provider outage must recover on ordinary scheduled passes without an owner retry. This is a compatibility requirement, not a new scheduler project.

## Source/file map

Reference baseline: #818 parent `b7762519ed7ca01cbe148ca630d025895021ce32`. Current planning main: `efa17e3ad3eb61e36031b579bfe797289f9a571a`. Restore behavior selectively; current files contain later fixes.

Read the compact custody handoff only: `C:/Users/Keptin/.codex/visualizations/2026/10/14/01a13c4d-8cc5-7cc3-a6ec-ebaaa20b6b51/tavernary-fresh-chat-handoff.md`. The subsequent local checkpoint is `C:/Users/Keptin/.codex/visualizations/2026/10/17/01a14a24-8218-7950-88b3-94ca2bf1be4a/recovery-continuation.md`. Both contain historical handles requiring native revalidation. They do not authorize resuming the paused old recovery goal or reading the full old conversation.

| Area                        | Files and responsibility                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct project generation   | `.github/workflows/generate-project-submission.yml`, `.github/workflows/generate-project-owner-request.yml`; current intake/force permissions, direct run titles, per-issue concurrency, legacy input compatibility                   |
| Generator budget boundary   | `scripts/submissions/generate-project-submission.mjs`, `scripts/help/generate-project-owner-request.mjs`; direct CLI versus verified legacy loader/checkpoint path                                                                    |
| Submission admission policy | New `scripts/automation/submission-routing.mjs` and `.d.mts`; one pure direct-submission ownership predicate                                                                                                                          |
| Generic/queued entry points | `scripts/automation/reconcile.mjs`, `worker.mjs`, `writer-runtime.mjs`, `prepared-wake.mjs`, `preparation-request.mjs`; stop duplicate submission admissions, preserve automatic background work and legacy settlement/results        |
| Project recovery            | `.github/workflows/reconcile-project-validations.yml`, `scripts/submissions/reconcile-project-validations.mjs`; keep current exact-head recovery and schedule, invoke narrow finalization                                             |
| Kit publication             | `.github/workflows/apply-kit-submission.yml`, `.github/workflows/apply-kit-withdrawal.yml`, `scripts/kits/apply-submission.mjs`, `scripts/kits/apply-withdrawal.mjs`; domain validation and direct guarded write                      |
| Finalization adapter        | New `scripts/submissions/reconcile-submission-finalization.mjs` and `.d.mts`; targeted proof/readiness, existing lifecycle projection, durable completion                                                                             |
| Reused proof/writes         | `scripts/automation/canonical-data.mjs`, `finalization.mjs`, `lifecycle-github.mjs`, `inventory.mjs`, `deployment-writer.mjs`, `site-writer-runtime.mjs`, `confirm-deployment.mjs`; reuse guards, extract narrow calls only as needed |
| Completion wiring           | `.github/workflows/automation-prepared.yml`, `deploy-pages.yml`; preserve exact Site artifacts/confirmation, route submission completion to existing reconciliation workflow                                                          |
| Keep structurally intact    | `publish-project-transaction.yml`, project lifecycle workflows, current schema/identity/protected merge code                                                                                                                          |

The map is a maximum responsibility map, not a requirement to modify every file. Update declarations only for changed public interfaces. Any additional production file must have a demonstrated caller dependency and an owning regression test.

### Task 1: Capture a bounded execution checkpoint

**Produces:** One private `submission-rollback-transition.json` containing `capturedAt`, `preChangeMainSha`, `codeCommits`, `controls`, and `entries`. Each entry records `kind`, `issueNumber`, `operationKey`, `ownerPath`, native run/attempt/status, producer/artifact identifiers and digests, expected SHA, saved retry state, ticket IDs, `disposition`, and `continuation`. No secrets or model content.

- [ ] Refresh main, all open issues/PRs, and complete native active statuses `queued`, `pending`, `requested`, `waiting`, `in_progress`; verify pagination. Reuse the compact recovery handoff for older exact bindings rather than importing historical chat/audit.
- [ ] Recheck the ten issue subjects and existing report/deployment publishers. Identify already-published Kits before planning generation. Reconcile the five previously restored replacement handles from the handoff.
- [ ] Establish a clean main-based implementation branch via existing managed-worktree facilities. Preserve dirty existing files; do not stage or republish merged repairs.
- [ ] Record each live/ambiguous producer's owning path and rollback restoration obligation. Do not cancel or pause native workflows in this task.

**Check:** Every pending/started submission handoff has an explicit continuation or positive satisfied proof. Missing authority blocks that individual transition, not unrelated implementation. If the census cannot prove ownership, keep that operation on its old path.

### Task 2: Restore direct project and owner generation

**Interfaces:** Keep both existing CLI argument parsers and generator APIs. At the CLI boundary, an empty legacy envelope selects direct execution; a complete positive legacy envelope selects the existing verified budget/checkpoint path. Default workflow titles use the baseline direct convention, distinct from `Request review PR force=...`.

**Tests:** `tests/unit/workflows.test.ts`, `tests/unit/automatic-generation-request.test.ts`, `tests/unit/generation-budget.test.ts`, `tests/unit/project-validation-reconciliation.test.ts`, `tests/unit/project-submission-lifecycle.test.ts`, `tests/unit/project-owner-lifecycle.test.ts`, and `tests/unit/generate-project-owner-request.test.ts`.

- [ ] Add failing assertions: default dispatch reaches generation with no `automation-writer` admission dispatch or `loadBudgetGuard`; the generator rejects malformed partial legacy input; a complete legacy envelope uses its original loader exactly once. Owner generation can use a valid existing checkpoint without an unconditional new reservation.
- [ ] Add an overlap test: an active compatible legacy producer or existing current review PR causes the duplicate direct request to wait/reuse, with zero extra model/provider calls. Add a default-title assertion that `parseGenerationOwnerRequest(...)` returns `null`.
- [ ] Run only these focused regressions and observe the expected failures. Restore direct job routing, per-issue `cancel-in-progress: false`, and conditional CLI entry behavior. Preserve current retry/custody/manual-field logic and publication transaction generation.
- [ ] Run the focused tests to green; verify legacy producer usage evidence remains valid. Commit only this coherent unit.

**Deliverable:** Direct project/owner requests reach current generated-PR validation independently of optional maintenance, while already-reserved producers can complete.

### Task 3: Transfer submission ownership and preserve automatic maintenance

**Interfaces:** Add pure `isDirectSubmissionKind(kind): boolean` for `project`, `owner-request`, `kit`, `withdrawal` in `submission-routing.mjs` with matching declarations. Use it at existing admission and eventual submission execution boundaries. Leave background selection and preparation policy intact; do not add a background-kind filter, queue, or configuration layer.

**Tests:** New `tests/unit/submission-routing.test.ts`; existing `tests/unit/writer-runtime.test.ts`, `tests/unit/controller-wake.test.ts`, `tests/unit/prepared-wake.test.ts`, `tests/unit/preparation-request.test.ts`, and `tests/unit/automation-worker.test.ts`.

- [ ] Add RED table-driven coverage: direct submission kinds are not selected or leased by broad reconciliation; due automatic metadata/advisory/enrichment and deterministic refresh/report work still follow their existing dispatch/reservation paths without an owner Action. Existing explicit owner overrides remain optional.
- [ ] Add RED compatibility cases: an already-bound producer/result still settles or publishes; an old queued generic submission request does not duplicate a new direct producer; automatic background requests continue normally. Preserve genuine failure counters/deadlines and failed-producer accounting/diagnostic custody.
- [ ] Add a clock-controlled regression fixture: an existing provider failure defers eligible work according to its saved retry; after the deadline and provider recovery, an ordinary scheduled pass resumes maintenance and submission recovery automatically. Assert no owner dispatch, busy polling, duplicate producer, or budget reset.
- [ ] Apply submission ownership checks before duplicate submission reservations/dispatches and generic observation writes that could overwrite direct-owned state. Keep operations visible to health. Preserve background admissions, generic completion-wake coalescing, and positive exact bindings from #931.
- [ ] Run focused regressions to GREEN. Verify new direct generation completions do not become legacy owner-request admissions. Commit this unit.

**Deliverable:** Broad reconciliation cannot duplicate direct submissions. Existing automatic background work continues on its existing path, independently of direct submission processing. No routine operation is transferred to an owner-triggered queue.

### Task 4: Restore guarded Kit publication and targeted completion

**Interfaces:** Reuse `commitCanonicalData({gh, repository, expectedMainSha, files, removeFiles?, message})`, `finalizeAutomationOperation({operationKey, load, project, persist})`, and `projectAutomationLifecycle(input)`. The new CLI `runSubmissionFinalizationCli({env?, gh?, load?, write?} = {}): Promise<number>` lives in `reconcile-submission-finalization.mjs`; its loader returns existing automation state scoped to the requested direct submission, rather than creating another operation schema. Read optional `submission_issue_number`, `submission_operation_key`, and `site_run_id` from the native workflow event; validate positive integers/64-character lowercase hex, matching issue/key, actor, repository, main ref, and exact workflow identity. Empty/zero inputs use the scheduled candidate pass (maximum 20, oldest first).

**Tests:** `tests/unit/apply-kit-submission.test.ts`, `tests/unit/kit-preparation-workflows.test.ts`, `tests/unit/kit-submission-reconciliation.test.ts`, `tests/unit/lifecycle-github.test.ts`, `tests/unit/site-writer-runtime.test.ts`, `tests/unit/canonical-data.test.ts`, `tests/unit/reconcile-project-validations.test.ts`, plus new `tests/unit/submission-finalization.test.ts`.

- [ ] Add RED workflow tests for direct Kit create/edit/withdraw using the existing domain validators, `kit-registry` concurrency, and the non-forced commit helper. Assert only validated Kit/catalog paths can mutate, foreign labels are preserved, and an already-applied matching Kit performs no second publication.
- [ ] Add RED concurrent-write tests: background and Kit start from the same main; one commit succeeds and the other reports `input-superseded`. Reconstruction sees the newer data. Assert no force update, stale rebase, or blind retry occurs.
- [ ] Add RED finalization cases: dispatch-only Site evidence, missing artifact/receipt, incompatible catalog/targets, stale rollback/withdrawal proof, changed manifest/owner, or future genuine retry yields waiting/superseded with no closure or fabricated terminal receipt. An unready scoped target must not fall back to broad inventory.
- [ ] Add positive tests for compatible accepted Site proof, fresh projection/revalidation, label cleanup, and exact terminal receipt. Cover #932 as already published and Kit716 as missing-receipt history requiring positive reconstruction. Preserve existing tests for project/owner lifecycle checks.
- [ ] Add RED missed-handoff tests in the existing submission reconciliation tests: admitted eligible project/owner issue with no PR/active producer dispatches its direct generator once; validated unpublished Kit dispatches its direct publisher once. Existing PR/producer, owner/manual-review wait, genuine future retry, changed manifest, or already-applied publication prevents dispatch. Use Kit classification as a planner only, without the raw legacy `--apply` closure behavior.
- [ ] Adapt the earlier Kit workflow structure to current validation and compare-and-set persistence. Implement the single targeted completion adapter. Keep the current Site verifier and accept deployment proofs only through existing provenance/ancestry/digest logic under the adapter's explicit trusted native workflow context.
- [ ] Invoke the adapter from the existing reconciliation workflow's 15-minute pass and Site completion path. Expand permissions only for the exact existing guarded operations it needs. Do not spoof `automation-writer.yml` context or make the raw legacy Kit reconciler a closure authority.
- [ ] Keep missing-handoff discovery in `scripts/submissions/reconcile-project-validations.mjs`, reusing native submission issue/PR/run queries and existing classifiers. Process at most 20 due targets per pass, oldest first; no background-history inventory or self-wake loop. A Site courier dispatches this workflow with `site_run_id`; only the trusted main-branch reconciliation job with a fresh scoped App token may accept proof or mutate closure/receipts.
- [ ] Run focused regressions to GREEN; run formatting, lint, and typecheck for changed sources. Commit this unit.

**Scope stop:** If adapting these existing functions requires another generic controller, queue, persistent admission schema, or broad writer-authentication relaxation, stop and revise this task. Do not implement a new framework to complete the rollback.

### Task 5: Verify, roll out, and finish the actual backlog

- [ ] Self-review the combined diff against every spec acceptance condition and the five Review Focus cases. Obtain one independent final review after local checks. Use inline implementation as recommended; do not fan out independent agents per file/task.
- [ ] Run required native CI on the exact PR head and check current base before protected integration. Preserve the existing reviewed missing-review-only exception procedure if genuinely necessary; never use an unguarded admin merge. Attach the PR to the implementation chat.
- [ ] Refresh the transition manifest immediately before cutover. Record the verified pre-change commit and exact rollback commit list. Preserve pending/started native requests; individually transfer only those whose current authority and continuation are proven.
- [ ] Rehearse backout read-only: enumerate the recorded commits' changed paths and confirm that a code-only revert excludes all live catalog data, budget ledgers, and canonical receipts. Check a post-cutover published/consumed entry against the manifest: its verified run/artifact/publication remains the continuation after code restoration, with no regeneration/refund instruction.
- [ ] Verify the first ordinary eligible direct request reaches generation/PR CI without waiting on optional maintenance. A fixture or read-only planning test proves routing when no new real submission exists; do not spend model calls to manufacture an acceptance event.
- [ ] Recover #932 and lifecycle incidents using current accepted compatible public proof and the scoped completion path. Verify native closure/labels and terminal receipts. Preserve manual/human decisions.
- [ ] Follow existing report publishers first; audit all 14 original tuples and #930. Rebuild only individually missing/rejected factual results serially, without model calls or duplicate producers.
- [ ] Diagnose #900/#923/#925/#935 individually using real current failure/proof. The rollback does not itself resolve a source/provider failure. Close only with positive recovered or justified terminal evidence and ownership guards.
- [ ] Reconcile all restored handoffs and any new issues/PRs, verify controls/protections, and publish a final disposition ledger. Verify one existing automatic maintenance continuation alongside submission processing. Report queue relief separately from unfinished maintenance/provider work; routine continuation must not depend on an owner Action.

**Focused local verification:** Run `npx vitest run` with the exact existing test files listed in each changed unit, followed by `npm run lint`, `npm run typecheck`, and `npx prettier --check` on changed files. Broaden testing only for a newly demonstrated interaction; required native CI still runs its normal checks. Planning/document-only work does not warrant product test runs.

## Operational backout

1. On duplicate generation/publication, unauthorized mutation, stale overwrite/deployment, premature closure, or lost custody, stop new affected admissions and retain live handles/proofs.
2. Create a checked revert PR containing only this rollback's recorded code commits, applied to current main. Preserve all current data, artifacts, tickets, receipts, and unrelated work. Pass current-head CI/current-base protection.
3. Before restoring generic admission ownership, account for direct producers/PRs/publications created after cutover. Reuse current native outcomes; never regenerate/refund simply because code was reverted.
4. Restore only controls explicitly owned by this transition; verify native readback. Leave a concrete next action for every unresolved operation. Use no indefinite monitor.

## Cost and completion boundary

Read only the current entry points and a demonstrated dependency; reuse this plan and transition manifest across handoffs. Keep one implementation branch/PR, one primary implementer, focused RED/GREEN tests, and one final review. Delete unused files later only when it is mechanical and useful.

Preserving automatic maintenance does not add a workstream. Keep the existing background workflows and their triggers/cadence/budgets/retries. Task 3 only transfers submission ownership and tests compatibility. A proposal for new background scheduling, fairness/priority logic, operation schemas, or monitoring exceeds this plan and must be removed or separately scoped.

This plan is ready for review as a bounded rollback proposal, not a claim that its runtime behavior has already passed tests or that all ten issues are scheduling defects. Product implementation and native rollout have not started.
