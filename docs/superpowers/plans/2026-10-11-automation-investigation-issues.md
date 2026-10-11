# Automation investigation issues implementation plan

> **For agentic workers:** Use test-first implementation and independent review for each bounded change.

**Goal:** Stop false unknown-failure incidents, classify expected source failures, and reconcile positively diagnosed investigation issues.

**Architecture:** Preserve durable failure authority across successful dispatch wrappers, classify repository availability at the metadata request boundary, and close unknown incidents only from positive classified or successful operation evidence. Preserve real unknown failures and human issue edits.

**Tech Stack:** Node.js ESM, Vitest, GitHub Actions.

**Spec:** User request plus production issue/run evidence recorded below.

## Evidence

- Issues #860/#862 concern metadata operations 0532b61b/0659d08d. Saved retries are transient provider-rate-limited; successful wrappers and rate-limited waiting writers incorrectly become unknown after 15 minutes.
- Issue #861 concerns advisory 3dd138d6 for XaYS-101/Smart-Chat-Manager-Silly-Tavern, reconstructed from legacy review-unavailable state with three failures.
- Writer 38171737285 gets HTTP 404 inspecting Archkr/ST-BasicSpotify. Metadata repository lookup treats missing source as unclassified; README absence already supports fallback.

## Global Constraints

- Preserve the original checkout and user edits. Work only in the managed current-main worktree.
- Keep genuine unknown failures visible, retain bounded retry schedules, and require positive recovery evidence.
- Preserve bot identity checks and human incident edits/dismissals.
- Do not classify arbitrary GitHub API 404s as missing source.
- Read relevant installed Next.js documentation before code; automation scripts do not use Next APIs.

## Review Focus

- Successful wrappers prove dispatch only, including writer outcomes waiting/superseded.
- Known durable retry classifications survive newer dispatch success.
- Missing repository and missing README have different handling.
- Classified failures close investigation incidents without hiding provider repair incidents.
- Absent/superseded operations alone cannot close unknown incidents.

## Task 1: Recover dispatch wrappers

Files: scripts/automation/inventory-worker.mjs; tests/unit/inventory-worker-recovery.test.ts and related retry tests.

- [x] Add one regression for saved known retry plus newer successful wrapper and observe failure.
- [x] Preserve the retry instead of manufacturing unknown from successful handoff.
- [x] Cover fresh successful wrapper without terminal result using bounded transient recovery, and preserve real failed wrapper behavior.
- [x] Run targeted tests and provide independent review.

## Task 2: Classify metadata source failures

Files: scripts/automation/metadata-preparation.mjs; scripts/automation/failure.mjs; tests/unit/metadata-source.test.ts; related failure/retry tests.

- [x] Add regression for missing mandatory repository and observe failure.
- [x] Treat repository 404 as authorization loss for the exact observed source; continue README fallback and transient network/provider behavior.
- [x] Register workflow-result-unavailable as transient for Task 1's successful but unconfirmed handoff.
- [x] Cover scoped source rate limit if it lacks a known diagnostic, retaining sanitized output.
- [x] Run targeted tests and provide independent review.

## Task 3: Reconcile diagnosed investigation issues

Files: scripts/automation/health.mjs; tests/unit/automation-health.test.ts.

- [x] Add regression for existing unknown incident whose operation is positively classified and observe failure.
- [x] Emit recovered unknown finding with failure-classified reason for known retry classifications, including permanent outcomes; preserve actual unknown incidents.
- [x] Verify provider circuit remains actionable, missing operation remains insufficient evidence, and incident ownership safeguards stay unchanged.
- [x] Run targeted tests and provide independent review.

## Final verification

- [x] Run complete unit suite, typecheck, lint, formatting, and catalog validation/build required for typecheck.
- [x] Review all changes independently; fix actionable findings.
- [ ] Create a focused pull request with evidence and validation through GitHub CLI.
- [x] Recheck live runs and incidents; report any production step still pending.

## Task 4: Recover legacy advisory retry state

Additional production evidence: #863 maps to rustyorb/SillyTavern-QRBuilder. 176 matching legacy policy-review snapshots are review-unavailable with at least three historical attempts; 162 have no operation receipt. These legacy counts currently manufacture exhausted current unknown failures.

Files: scripts/automation/catalog-operations.mjs; scripts/automation/failure.mjs; relevant catalog inventory tests.

- [x] Add regression: a matching legacy review-unavailable snapshot with 3+ attempts and no current receipt remains eligible for bounded recovery and creates no unknown investigation finding.
- [x] Classify that positively observed legacy state as transient policy-review-unavailable; preserve bounded historical retry delay but start the current immediate unknown-failure count at zero.
- [x] Preserve authoritative current receipts and current genuinely exhausted unknown failures.
- [x] Verify mismatched fingerprint supplies no legacy failure authority, and previously clear/review-suggested behavior remains unchanged.
- [x] Independently review this conversion and run relevant inventory/health regressions.

## Task 5: Recover missing dispatch results and repair proven imports

Final audit found another invented unknown-failure count: an expired dispatch intent with no result and no saved failure sets three immediate attempts. Retry delays must also advance across repeated lost dispatches. Separately, Git history proves that three current advisory receipts are unchanged initial imports of legacy counters; ten other matching unknown receipts have advanced and retain failure authority.

Files: scripts/automation/inventory-worker.mjs; related recovery/reconciliation tests; the three individually audited operation receipts.

- [x] Add failing regression for an expired initial dispatch lease without any observed failure; classify as transient workflow-result-unavailable and schedule a future bounded retry.
- [x] Verify repeated lost dispatch intents advance retry delay exactly once, ordinary backoff observations do not advance, and saved genuine unknown failures retain authority.
- [x] Repair only unchanged exact imported receipts with positive Git provenance, matching current legacy identity, and verified latest preimages; preserve advanced receipts.
- [x] Independently review code and data repair, then rerun complete verification.

### Historical repair provenance

The latest production preimages were verified before repair. These three receipts have exactly one creation commit and still match their original imported legacy counts. The other ten matching unknown receipts have subsequent changes and retain their authority. Only failure classification, immediate count, and the historical bounded retry deadline changed; journal timestamps and identity fields remain intact.

| Receipt prefix | Original blob | Sole import commit |
| --- | --- | --- |
| 0f5189fb (Agnaistic) | 39c690d5e8a6076eca8b0fd000d3898b45ac17b1 | edaada656e27d737a539ebff4c6327a30d5ba721 |
| 0e98e75d (EugenesDad) | 1db595a1d38626362739aa9f3b88dd674c5336cc | 72e98ee07f17f1c48f1dff971c62a5a6fc67c813 |
| 0b97feef (UnixSystem) | a30260c6852b35d9862dcc8740c8fc5c817c861c | 3fb8663568c173f1e506df691365ef77763482af |

Independent review exercised five recover/reconcile/persist/dispatch cycles, confirming retry counts 0 through 4 and delays approximately 5 minutes, 15 minutes, 1 hour, 6 hours, and 24 hours. Intervening observations did not recount failures; true unknown receipts retained their classification and immediate count. Each repaired receipt passed schema validation and exactly matched discovery from current source, registry, snapshot, and policy evidence.

## Verification results

- Complete final unit suite: 331 files and 3,684 tests passed.
- Formatting, TypeScript, ESLint, palette audit, catalog validation (518 projects and 23 Kits), and security report validation (1,126 summaries) passed.
- Static build and export verification passed; the final changes affect automation code and operation receipts, with browser CI required on the pull request.
- Independent review completed for code, repeated retry cadence, incident ownership, and the exact three historical receipt repairs with no remaining actionable findings.
- At last live check, investigation issues #860 through #863 remain open and recovery runs 38181165118 and 38181592481 are pending in the serialized writer queue. Production needs this branch merged before scheduled reconciliation can use the corrected classification.
