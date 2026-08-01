# Copy-Review Diagnostics Design

## Problem

Verified repository-owner and Tavernary-staff manual summaries may continue as
manual publication transactions when contextual catalog-copy review is
unavailable. The current fallback correctly preserves the safe publication
boundary, but it collapses every provider and validation failure into
`copy-review-unavailable`. The admission artifact therefore cannot distinguish
an initial provider failure, a failed repair request, or two locally invalid
outputs.

The preservation unit also lacks direct tests for a valid first response and an
invalid first response followed by a valid repair. Those paths have indirect
coverage through larger generators, but the retry boundary itself is not
certified.

## Goals

- Retain a bounded, non-sensitive failure diagnostic in generation reports.
- Show the same safe diagnostic in the publicly visible Actions job summary.
- Keep issue comments and pull-request wording generic.
- Preserve the existing owner/staff-only manual fallback and fail-closed
  automatic/community behavior.
- Add direct first-pass and repaired-success tests to the copy-preservation
  unit.
- Keep existing reports and publication transactions compatible.

## Non-goals

- Recording raw provider messages, output, prompts, credentials, repository
  evidence, or submitted summary text in diagnostics.
- Adding diagnostics to catalog records or publication transaction markers.
- Changing retry counts, authority rules, copy validation, or publication
  policy.
- Making an unavailable review look validated.
- Building a general telemetry or metrics system.

## Approaches Considered

### Add an optional diagnostic to existing reports

This is the selected approach. Admission and owner-generation reports already
form the audit artifact, already follow the generation lifecycle, and are
available to workflow summary steps. An optional field is sufficient and does
not require a second artifact or synchronization protocol.

### Create a separate diagnostics artifact

This provides stronger structural isolation, but duplicates report creation,
upload, retention, and retrieval. It also risks the mutation report and
diagnostic report becoming inconsistent.

### Emit structured log lines only

This minimizes schema work, but logs are harder to retrieve and test, and text
parsing would become an implicit API. It would also make leakage controls less
reliable than a validated object and fixed renderer.

## Diagnostic Contract

An unavailable preservation result carries one diagnostic object:

```ts
interface CopyReviewDiagnostic {
  failure_phase:
    | "initial-provider"
    | "repair-provider"
    | "repaired-output-validation";
  failure_code:
    | "provider-timeout"
    | "provider-rate-limited"
    | "provider-server-error"
    | "provider-authentication-failed"
    | "provider-request-failed"
    | "provider-network-error"
    | "provider-response-invalid"
    | "provider-model-mismatch"
    | "provider-error"
    | "copy-output-invalid";
  diagnostic_code:
    | "tool-calls-present"
    | "content-parts-invalid"
    | "content-missing"
    | "json-invalid"
    | "json-not-object"
    | "unsupported_value:temperature"
    | null;
  attempt_count: 1 | 2;
  latency_ms: number | null;
}
```

`failure_code` accepts only the existing controlled provider categories plus
two local categories. An unknown thrown value maps to `provider-error`.
`diagnostic_code` accepts only the explicit shared allowlist; all other values
map to `null`. `latency_ms` accepts only a finite, non-negative integer from the
controlled provider error. Local validation failures and errors without safe
latency metadata use `null`.

The diagnostic describes the terminal reason for fallback:

- An initial call failure uses `initial-provider` and one attempt.
- An invalid initial result followed by a failed repair call uses
  `repair-provider` and two attempts.
- Two locally invalid results use `repaired-output-validation`,
  `copy-output-invalid`, and two attempts.

A validated result carries no failure diagnostic. A repaired success remains a
validated result and does not expose the rejected first output or its validation
details.

## Data Flow

`preserveCatalogSummary` creates the diagnostic at the point where the existing
fallback is selected. It returns `diagnostic: CopyReviewDiagnostic` for an
unavailable result and `diagnostic: null` for a validated result.

The project-submission generator copies the value to the optional
`copy_review_diagnostic` report field. The owner-request generator copies it to
the optional `diagnostic` field of the affected `copy_results[]` entry. Report
schema versions remain unchanged because these are additive audit fields and
all existing consumers continue to accept reports where the field is absent.

The diagnostic is not copied into the project record, source record, snapshot,
pull-request transaction marker, or publication transaction. Publication
authorization therefore remains independent of diagnostic content.

## Actions Summary

Both project-submission and owner-request generation workflows append a compact
copy-review diagnostic section only when an unavailable result has a valid
diagnostic. The summary displays fixed labels for failure phase and code,
attempt count, optional allowlisted diagnostic code, and optional latency.

The renderer treats Actions summaries as public output. It revalidates the
object before rendering and never interpolates an unknown string. A malformed
diagnostic produces a generic `copy-review-unavailable` summary instead of
failing generation or printing the malformed value.

Issue comments and pull-request descriptions retain their current generic
wording. The downloadable generation artifact contains the same sanitized
object shown in the summary and nothing more sensitive.

## Compatibility and Security

- Existing reports without the optional field remain valid.
- Existing publication markers do not change.
- Unknown exception types and codes degrade to fixed generic values.
- Provider messages and local validation text are never stored in the
  diagnostic.
- Diagnostic rendering uses allowlisted labels and validated numbers only.
- The fallback remains limited to verified repository owners and trusted staff.
- Community submissions and required automatic metadata continue to fail
  closed.
- A diagnostic cannot change automatic/manual publication mode or authorize a
  merge.

## Test Strategy

Implementation follows one red-green-refactor cycle per behavior:

1. A valid first response returns validated copy, calls the provider once, and
   has no failure diagnostic.
2. An invalid first response followed by a valid repair returns validated copy,
   calls the provider twice with the sanitized repair request, and has no
   failure diagnostic.
3. A controlled initial provider error produces the allowlisted initial-phase
   diagnostic.
4. A controlled repair provider error produces the repair-phase diagnostic.
5. Two invalid outputs produce the repaired-output-validation diagnostic.
6. Unknown codes, arbitrary messages, invalid diagnostic strings, and invalid
   latency values cannot appear in the report or rendered summary.
7. Project-submission and owner-request reports propagate the diagnostic while
   legacy reports without it remain accepted.
8. Workflow contract tests prove both workflows render safe summaries and keep
   PR/issue wording generic.
9. Focused copy, generator, workflow, PR, and publication tests pass, followed
   by the repository's complete test and validation gates.

## Acceptance Criteria

- An unavailable copy review has a safe diagnostic sufficient to distinguish
  provider-call failure from repeated local output-validation failure.
- Maintainers can see that diagnostic in both the artifact and Actions summary.
- No raw provider, prompt, evidence, credential, or submitted-copy content is
  exposed.
- First-pass and repaired-success preservation behavior has direct unit tests.
- Existing authority and publication safety tests remain green.
- Existing reports and publication transactions remain compatible.
