# Provisional Frontend Contract

## Problem

Generated frontend submissions fall back to provisional metadata when automated
enrichment rejects a summary. The submission generator preserves the known
structural classification with `primary_function: "frontend"`, while the
full-catalog invariant currently requires every provisional record to use
`primary_function: "uncategorized"`. This contradiction causes valid generated
frontend proposals such as PRs 83 and 94 to fail focused content CI.

## Design

Keep the generator behavior: a provisional record whose `kind` is `frontend`
uses `primary_function: "frontend"`. Other provisional records continue to use
`primary_function: "uncategorized"`. Every provisional record must continue to
have an empty `capabilities` array.

Narrow the full-catalog invariant to express that conditional rule. Do not
change catalog schemas, generated records, enrichment behavior, or unrelated
submission handling.

## Verification

Add a focused unit regression that exercises a provisional frontend alongside
a provisional non-frontend record. Prove the regression fails under the current
unconditional invariant, then make the smallest test-contract change needed to
pass it. Run the focused unit test, the content gate, and the repository's full
verification gate before publishing the fix.

## Rollout

Publish the fix on an isolated branch and make it available to both affected
submission PRs. Re-run their GitHub Actions checks and verify both final states.
