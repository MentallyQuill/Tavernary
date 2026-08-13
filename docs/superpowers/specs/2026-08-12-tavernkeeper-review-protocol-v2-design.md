# TavernKeeper Review Protocol 2 Compatibility Design

## Problem

TavernKeeper policy-5 reports can now continue contextual review across several
bounded waves. Those reports mark aggregate accounting with
`review_triage.model_budget.review_protocol_version: 2`. Tavernary's strict v5
schema does not recognize the marker, and its semantic validator applies the
old single-wave caps to aggregate totals. Reconciliation therefore rejects
valid published reports before importing any summaries.

## Considered approaches

1. **Accept any extra model-budget fields.** This would restore imports but
   weakens the strict producer/consumer contract and could hide unrelated drift.
2. **Raise or remove the configured caps.** This misrepresents the limits,
   which remain per-wave controls under protocol 2.
3. **Recognize protocol 2 explicitly.** Add the exact marker to the schema and
   type declaration, preserve all accounting invariants, and waive only the
   aggregate-versus-per-wave cap comparisons when the marker is `2`.

Approach 3 is selected because it matches TavernKeeper's authoritative v5
contract without weakening validation for legacy reports or unknown protocols.

## Contract and validation

- `review_protocol_version` is optional so immutable policy-5 reports produced
  before protocol 2 remain readable.
- When present, the only accepted value is the numeric literal `2`.
- Protocol-2 reports may have aggregate fresh-case, provider-call, estimated
  input, actual input, or actual output totals above the configured per-wave
  caps.
- Candidate, case, reason, batch, token-usage, identity, evidence, coverage,
  and reviewer consistency checks remain unchanged.
- Reports without the protocol-2 marker retain the existing cap enforcement.

## Testing

A unit regression constructs a fully consistent policy-5 report containing 13
contextual cases and seven batches whose aggregate totals exceed every
configured cap. It must fail against the current reader and pass only after the
schema and semantic validator understand protocol 2. Existing mismatch tests
continue protecting strict validation.

## Scope

Modify only the TavernKeeper report JSON schema, runtime validator, matching
TypeScript declaration, regression tests, and these design/plan documents. No
retry scheduling or TavernKeeper producer behavior changes are included.
