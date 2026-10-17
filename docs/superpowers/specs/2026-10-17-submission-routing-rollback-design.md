# Targeted submission routing rollback

Date: October 17, 2026. **Status: approved for the bounded targeted rollback.**

## Outcome and recommendation

Restore the earlier direct submission workflows and retain current publication and public-deployment checks. Keep existing automatic maintenance on its existing background path, independent of direct submission processing. Reuse the surviving project publisher and reconciliation code. Adapt the earlier Kit publisher rather than rebuilding submission processing around another controller.

**Required operating model:** Tavernary must run for long durations with minimal to no owner intervention. Routine submissions, maintenance, retries, missed-handoff recovery, deployment, finalization, and incident cleanup remain automatic. Existing owner Actions are optional overrides, never prerequisites for routine progress. This correction preserves existing background automation; it does not authorize a new maintenance architecture.

Success means an eligible submission can generate, validate, publish, deploy, and close without waiting for optional metadata/advisory preparation. Existing unresolved operations must retain an accountable disposition. A shorter queue or a successful dispatch is not completion.

Ship one coherent rollback PR with three implementation units: direct project generation, submission admission ownership, and direct Kit publication/finalization. Keep unused helpers and historical records initially. Removing dead code is optional follow-up work.

**Scope decision:** The user rejected owner-triggered routine maintenance and explicitly required that this correction not expand the rollback. Retain existing automatic maintenance rather than replacing it. Task count, rollout PR count, and the submission-only ownership boundary stay unchanged.

## Evidence and limits

- Unification: `77c2ce7886019900d63f7e66e034cb744a9cbc0d` (#818). Pre-unification reference: `b7762519ed7ca01cbe148ca630d025895021ce32`.
- Planning snapshot: main `efa17e3ad3eb61e36031b579bfe797289f9a571a`; 10 open issues, zero open PRs. Native CLI reads verified this snapshot; execution must refresh it.
- All 64 relevant workflow/reconciliation/generation files checked in the existing isolated worktree match this main snapshot, including its already-merged dirty files.
- The project publisher and project lifecycle YAML changed almost solely for runtime configuration in #818. Their current authority, CI, and merge checks should be retained.
- Project generation gained request/reservation/redispatch steps; both generator CLIs load budget machinery. Removing YAML steps alone is insufficient.
- Kit publication was replaced by immutable preparation and shared publication. The surviving legacy Kit reconciler can close an issue upon registry publication, before public confirmation. Restoring that behavior verbatim is unsuitable.
- Existing `commitCanonicalData` uses a non-forced update from an exact parent; a competing main advance yields `input-superseded`. Existing lifecycle functions guard fresh issue identity and deployment readiness.
- Before the pause, a nine-minute generic reconciliation admitted 18 more operations. This demonstrates continuing admission pressure; it does not prove all failures are scheduler defects or establish a measured pre-unification throughput baseline.

## Chosen behavior

### 1. Project submissions and owner requests run directly

Ordinary intake/owner Actions invoke their existing generator immediately. Keep current validation, owner/manual-field rules, branch custody, generated PR transactions, retry classification, required CI, protected publication, and lifecycle checks. Use per-issue generation concurrency with `cancel-in-progress: false`; project and owner-request namespaces remain distinct.

Default generation uses the old direct run-title convention. It must not match `parseGenerationOwnerRequest`'s `Request review PR force=...` envelope. This prevents the remaining generic reconciler from redispatching a new direct run as an unfinished wrapper.

New direct runs have no custom model-budget reservation dependency. The existing positive `operation_key`/`budget_ticket`/`request_run_id` envelope remains accepted only as a legacy continuation, with its existing producer authority and accounting checks. Malformed or partially populated legacy envelopes fail closed. Never silently interpret a broken legacy envelope as an unbudgeted direct request.

Both `scripts/submissions/generate-project-submission.mjs` and `scripts/help/generate-project-owner-request.mjs` must select the appropriate entry path. In particular, the owner CLI's unconditional `loader.load()` and checkpoint plumbing must preserve existing checkpoints without requiring a new ticket for a direct request. A direct run must recognize an existing compatible PR, branch, or active legacy producer before making model calls.

### 2. Define ownership by work type

Direct workflows own `project`, `owner-request`, `kit`, and `withdrawal` admissions after cutover. The generic reconciler retains their state for health and compatibility but stops scheduling new work or overwriting retry state for those types. Existing exact legacy handoffs may settle through their current authenticated paths.

Preserve missed-handoff recovery in the existing 15-minute submission reconciliation workflow: inspect eligible admitted project/owner issues with no compatible PR/active generator, and validated Kit/withdrawal issues with no applied result/active publisher. Reuse existing issue/domain classifiers and revalidate just before dispatch. A missed intake wake must not strand an admitted issue merely because generic discovery has been removed. Keep manual-review and future retry states ineligible.

Existing automatic `metadata`, `advisory`, `enrichment`, refresh, report, and other background maintenance admissions continue through their current workflows and reconciliation. Their existing schedules, event wakes, retries, provider recovery, accounting, and completion paths remain active. Routine operation must not acquire an owner-trigger requirement. Background preparation may continue while submissions run; its queue must not become an admission prerequisite for direct submission generation, Kit publication, or submission finalization.

Enforce submission ownership at selection and eventual submission execution boundaries so stale generic requests cannot duplicate a new direct producer. Preserve existing bound producers, prepared results, genuine retries, and all background work. Waiting for a due retry or dependency remains an automatic continuation, not a transfer to a manual queue. A successful wrapper is never reported as repaired work.

Use one small static submission-kind predicate, not a configurable scheduler, queue, new service, or persistent admission-flag subsystem. Existing inventory remains available to background paths; it is removed from direct generation's admission path. No background admission classifier or replacement background coordinator is required.

### 3. Kits regain a direct publication path

Use the earlier `apply-kit-submission.yml` and `apply-kit-withdrawal.yml` as structural references. Retain current schema, author/editor, moderation, effective-listing, withdrawal, and path checks. Preserve foreign labels and human decisions.

Use the existing `kit-registry` publication group with `cancel-in-progress: false`. Prepare against fresh main and publish only the validated Kit changes and corresponding generated catalog assets through `commitCanonicalData`. Do not restore stale-file rebasing or force-push behavior. A 409/422 conflict requires fresh reconstruction and ordinary bounded retry; it never permits writing an older snapshot over newer data.

This deliberately replaces the former requirement that all data publication share `canonical-publication`. Project publication already has a separate group. Independent restored publishers rely on existing non-forced parent checks and fresh domain checks. This tradeoff must be approved with the spec; merely adding a competing publisher without these checks is not this design.

For already-published #932 or a historical published Kit, recover confirmation/finalization instead of republishing or regenerating. Withdrawal must not deploy or restore a bundle that re-exposes removed content.

### 4. Keep public confirmation and guarded finalization

Keep the current exact-source Site build, stale-deployment prevention, artifact provenance, catalog/target digests, and browser/public checks. Reuse `confirm-deployment.mjs`, `finalizeAutomationOperation`, and `projectAutomationLifecycle`.

Add one narrow submission finalization entry point, invoked from the existing Site completion mechanism and the existing 15-minute project reconciliation workflow. It operates only on the four direct submission kinds. It must obtain current-data-compatible accepted deployment coverage and fresh issue/catalog authority before projection. If the current accepted pointer is missing, the entry point may accept the exact successful native Site proof using the existing deployment-confirmation logic and non-forced commit helper, with an explicit trusted workflow context. Do not fabricate writer environment variables or loosen the existing writer's authentication checks.

Use optional dispatch inputs `submission_issue_number` (positive number), `submission_operation_key` (64 lowercase hex characters), and `site_run_id` (positive number) on `reconcile-project-validations.yml`; empty/zero inputs select the existing scheduled reconciliation pass. Supplied issue/key pairs must identify the same current operation. A Site completion courier supplies the exact run ID; a claimed run ID alone grants no publication/closure authority. The trusted mutation context is the main-branch `reconcile-project-validations.yml` job with a fresh scoped Publisher App token. The courier only dispatches it.

The scheduled pass processes at most 20 due submission targets per invocation, oldest first, using native submission issues, matching PRs/runs, and existing canonical records. It does not enumerate optional background operation histories. Subsequent ordinary scheduled passes handle the remainder; no self-dispatch polling loop is added.

This adapter must avoid fallback into a repository-wide background inventory when the target is not ready: return `waiting`, leave genuine retry times unchanged, and retry on the existing scheduled pass. A missing legacy receipt requires reconstruction from the exact issue, canonical publication history, and native proof; absence is never terminal evidence. Persist a finalized receipt only after the existing fresh revalidation/projection succeeds.

The raw `submissions:reconcile-kits:apply` path must not become the closure authority because it lacks this deployment gate.

## Keep, retire, and defer

| Keep active                                     | Retire from the direct submission path                                 | Defer cleanup                           |
| ----------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| Intake admission and owner/moderation rules     | Generic discovery before generation                                    | Unused automation helpers               |
| Current required CI and protected project merge | New submission budget reservation/binding                              | Old receipt/ledger files                |
| Automatic maintenance and recovery              | Submission dependence on the maintenance queue                         | Broader maintenance redesign            |
| Non-forced writes and fresh-base checks         | Shared-lane dependency for Kit publication and submission finalization | Runtime/dependency-policy changes       |
| Confirmed public deployment before closure      | Generic owner-request wrapper for new direct runs                      | Renaming/reorganizing unrelated modules |

Existing background/legacy budget ceilings remain 200 requests/day and 10,000,000 tokens/day while those paths remain active. New direct submission calls no longer depend on or enter that custom ledger. Provider billing remains real; old reservations are neither reset nor guessed refundable. This scoped removal does not claim to eliminate every background budget helper.

## Transition and backlog obligations

Before rollout, make one fresh native census and private transition manifest. Capture issue/operation keys, active/queued handles, producer and artifact bindings, expected revisions, genuine retry deadlines/counters, reservations, and which path owns continuation. Classify each as already satisfied, existing live continuation, missing ordinary transition, or automatic retry awaiting its deadline/dependency. Preserve the previously restored native replacement handles until their effects or legitimate successors are verified. Existing intentional human content/policy decisions remain respected; the rollback creates no routine owner task.

Apply the code transition before targeted recovery dispatches. Existing pending queues are not blindly cleared; started/ambiguous producers retain custody. A replacement must exist and be verified before any individually justified cancellation. No new blanket deferral pass is assumed. No new generation is needed merely to test the new wiring.

At the planning snapshot, required follow-through is:

| Issues/work                       | Required evidence                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| #932                              | Actual publication already occurred; compatible public confirmation, guarded cleanup/closure, terminal receipt                                 |
| #902, #904, #919, #924            | Exact original subject/publication history, current compatible deployment, native lifecycle cleanup and positive disposition                   |
| #900, #923, #925, #935            | Diagnose the actual operation/provider failure or a proven successor; superseded wrappers alone do not justify closure                         |
| #930 and original report recovery | Follow existing publishers; verify original tuple coverage, rebuild missing factual results serially without model calls, no duplicate imports |
| Any new issue/PR                  | Include it in the refreshed census; process through its rightful path                                                                          |

Prior evidence had 12/14 original report tuples exactly once; missing keys were `20b290b1...` and `b4053e58...`. These are historical observations, not dispatch authority. Revalidate existing publishers `39032029603`, `39033021005`, and `39033013015` before any report action. #922 was already closed with exact positive publication proof and must not be reopened merely for this rollback.

## Verification and acceptance

- Direct project and owner generation proceeds when optional maintenance is busy, without a new custom ticket.
- Default direct runs are not re-admitted by the generic owner-request parser; duplicate/legacy deliveries make no extra model call or publication.
- Partially populated legacy inputs, foreign actors, changed owner intent, stale CI/base, untrusted artifacts, and path escape are refused.
- Concurrent background and Kit writes cannot overwrite one another; a stale base requires recomputation.
- A published record or successful Site dispatch does not close an issue. Compatible public proof and fresh lifecycle guards do.
- Existing background reconciliation still admits due metadata/advisory/enrichment and deterministic maintenance automatically. Background work progresses while submissions run, and submissions progress while background preparation is busy; neither requires an owner Action.
- A clock-controlled outage/recovery fixture demonstrates that normal scheduled reconciliation automatically resumes due maintenance and submission work after a temporary provider failure, without an owner retry or new polling mechanism.
- Genuine deadlines, unknown consumption, reserved producer custody, human labels/decisions, and dirty worktrees are preserved.
- Read-only native evidence and focused tests establish these behaviors; required exact-head CI passes on the rollout PR. Use the first ordinary eligible submission as the live validation, not a model-consuming synthetic submission.
- Record queue relief separately from completion of all ten incidents/report obligations.

## Scope and cost boundaries

Use the existing isolated worktree as the analysis reference; implementation starts from a fresh main-based branch while preserving its nine dirty already-merged files and the primary worktree. No full repository rewind, new dependency, new scheduler, new recurring monitor, frontend redesign, or routine all-tests repetition. Read relevant installed Next.js guides only if execution actually changes Next.js code.

**Scope fence for automatic operation:** Preserve existing background workflow triggers, cadence, preparation, budgets, and retry behavior. Shared admission/courier changes may transfer submission ownership only. Do not redesign background scheduling, add fairness/priority machinery, add a second operation schema, or build a new monitoring system to satisfy this requirement. Failure of an existing background regression test calls for a local compatibility fix, not a new maintenance project.

One primary implementer, focused tests, and one final independent review is the preferred execution approach. Planning has used local history and one pinned native source check. Reopen exploration only for a concrete failing dependency. If the Kit/finalization adapter requires a second operation framework, broad schema migration, or weakening write/confirmation guards, stop and revise the scope rather than building it.

## Backout of this rollback

Tag the implementation's verified pre-change commit in the transition manifest. On regression, revert only the rollback code commits through a checked PR on current main. Preserve current catalog data, published submissions, receipts, reservations, and all post-cutover native handles. Revalidate producers before transferring admission back; restoring code does not restore queue custody automatically. Do not blindly re-enable generic admissions while direct producers are running.

Triggers: duplicate generation/publication, unauthorized mutation, stale overwrite or public deployment, premature issue closure, lost continuation, or inability of ordinary submission processing to finish. A real provider outage alone is not proof that routing must be reverted. Remain on the last safe publication while the specific failed transition is repaired.
