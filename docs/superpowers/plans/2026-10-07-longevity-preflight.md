# Tavernary longevity preflight observations

These are read-only baseline observations from 2026-10-07, collected while
written-plan review is pending. They are not evidence that the overhaul is
implemented or that its completion requirements pass.

## Repository and live deployment

- Isolated branch: `codex/tavernary-longevity`, planning commit `2b439c6ed`.
  The managed worktree is clean; only design/plan documents have been changed.
- Current production source remains
  `a7139759edfb253bfeb43e6196ff00a7c7f07eb3`.
- GitHub Pages uses workflow deployment and the `tavernary.org` custom domain.
- [Run 37702223477](https://github.com/MentallyQuill/Tavernary/actions/runs/37702223477)
  completed successfully at 23:30:18 UTC. Exact-source validation, dependency
  installation, checks/build, new static-export verification, and Pages deploy
  steps passed for that source revision. This does not replace local baseline
  checks or the overhaul's new public-revision confirmation.
- The same SHA also has successful push-triggered run `37693579209` and
  dispatch-triggered run `37693592446`. Phase 3 must remove redundant ordinary
  deployment paths while preserving recovery dispatches.
- An earlier failed deployment is not a currently reproduced outage. Diagnose
  failures from their actual evidence rather than assuming it remains broken.

## Public browser observations

The background in-app browser loaded `https://tavernary.org/` and showed
508 projects. Searching `Saga` changed the result count to one and retained
the creator repository link. Clearing search and opening Kits showed 23 Kits.
Menu navigation and its Submit a project link loaded the expected pages.
No issue was created, form submitted, project installed, or creator site opened.

A role-based checkbox selector did not match the Kits category control even
though its native accessibility representation called it a checkbox. Clicking
the observed control worked. The future Playwright smoke must use selectors
verified against the actual DOM; this observation is not evidence of broken
Kits functionality.

The text-fetch tool could not consume the home response because its content
exceeded that tool's limit. The browser could load it. Do not classify a
text-tool limit as a public hosting outage.

## Failure-diagnostic integration boundaries

`scripts/submissions/project-generation-failure.mjs` currently accepts only
`output-invalid` from its version-1 diagnostic artifact. The submission CLI
maps other preparation errors to `generation-failed`. Updating only a shared
classifier would therefore lose credential/provider distinctions before the
controller sees them. Phase 1 Task 3 must update the producer, safe artifact
allowlist, consumers, and declaration files together.

Both generation workflows currently run their failure reconciler only for
`failure() && !cancelled()`. Cancellation recovery must therefore also be
reconstructed by Phase 2; it cannot depend on the cancelled worker recording
a final diagnostic or dispatching a successor.

The current validation controller counts `run_attempt` for terminal
non-success conclusions, including cancelled/skipped runs. Phase 1 must
distinguish structured deterministic failure from these conclusions and
preserve exact-head filtering.

## Remaining prerequisite

The user approved the GitHub-only specification. Review of the linked written
implementation plans and execution-method selection is still pending.
Product dependency installation, baseline tests, and implementation have not
started. The active goal retains every requirement through CI, merge, and
production verification.
