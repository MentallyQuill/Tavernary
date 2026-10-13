# Workflow Notification Repairs Implementation Plan

> **For agentic workers:** Use the systematic debugging and test-driven-development skills for each bounded repair.

**Goal:** Remove evidenced recurring workflow failures while preserving real failure signals and existing recovery authority.

**Architecture:** Repair repository selection in checkout-free retry jobs. Isolate binary artifact downloads from writer/request entrypoints. Treat input-superseded only in reconcile mode as a successful deferral before fresh scheduled recovery; manual modes keep nonzero exits.

**Tech Stack:** Node 24, GitHub Actions, GitHub CLI, Vitest.

**Spec:** User request to investigate latest notifications and stop regular workflow failures; failure logs from Actions runs 38400934633, 38329837887, 38279845067, 38280877453, 38274344637.

## Constraints and review focus

- Preserve user edits by working in the attached isolated worktree.
- Keep artifact identity, archive integrity, size, and timeout checks intact.
- Preserve trusted main/actor checks; do not suppress genuine authentication or unknown errors.
- Exercise real entrypoint evaluation, including the native downloader branch that earlier tests bypassed.
- Preserve scheduled reconciliation so superseded work can be reconstructed from current authority.

## Tasks

1. Retry dispatches: own three retry workflow files and workflows.test.ts. Execute actual commands outside a checkout, observe missing repository regression, add explicit repository arguments, verify all workflow contracts.
2. Diagnostic inventory: own github-inventory.mjs, writer-runtime.mjs downloader extraction, new leaf downloader and focused tests. Reproduce exit 13 from production request entrypoints, extract the downloader without changing checks, verify native diagnostics complete.
3. Writer supersession: own writer-cli.mjs and writer CLI/backoff tests. Reproduce nonzero exits on recognized stale inputs during synchronization and handling; return sanitized superseded status and zero only for reconcile mode with this classification; preserve all other failures and manual requests.

## Verification

- Run each regression before and after its change.
- Run full npm test, lint, typecheck, formatting and diff checks after integration.
- Review combined diff independently and prepare a draft pull request with root-cause evidence.
- Verify remote CI for the repair branch. Production schedule recovery remains unverified until merge.
