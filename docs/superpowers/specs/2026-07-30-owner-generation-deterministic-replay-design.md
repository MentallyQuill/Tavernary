# Owner Generation Deterministic Replay

## Summary

Project-owner generation will call stochastic copy and metadata providers only
during its validated first pass. Before branch mutation, the workflow will
rerun all current-state checks and deterministically replay the first pass's
validated metadata resolution.

The existing comparison of the regenerated report and generated-file hashes
remains mandatory. The change removes stochastic provider output from that
comparison without weakening authority, stale-input, exact-path, or
current-main checks.

## Problem

Issue #175 passed staff-authority validation and completed initial generation
and content validation. The final pre-mutation generation called automatic
metadata enrichment again. The two valid model calls produced different
reports or project content, so the exact-output guard rejected the request as
stale.

Calling a stochastic provider twice and requiring byte-identical output makes
healthy requests nondeterministically retryable. Removing the comparison would
allow validated output to diverge before publication and is not acceptable.

## Goals

- Call external copy and metadata providers once per generation job.
- Preserve the second pass's authority, issue-refresh, registry-fingerprint,
  source-identity, policy-version, and current-main checks.
- Preserve exact report and generated-file hash comparison.
- Fail closed if the replay report does not match current trusted inputs.
- Support GitHub and non-GitHub trusted-staff requests.
- Keep generated branch paths, publication transactions, and review behavior
  unchanged.

## Non-goals

- Changing automatic versus manual metadata semantics.
- Skipping enrichment for name-only edits.
- Relaxing report or file-hash equality.
- Persisting model credentials, raw source evidence, or reasoning.
- Reusing replay data across jobs or workflow runs.

## Design

### Validated metadata resolution

Generation reports will include `resolved_metadata`, an object keyed by project
ID:

```json
{
  "resolved_metadata": {
    "reddit-1v9u18m": {
      "summary": "Validated published summary.",
      "tags": ["creative-writing"]
    }
  }
}
```

This duplicates only the final summary and controlled tag IDs already present
in generated project records. Existing `copy_results` and `metadata_results`
remain the audit records for how that resolution was produced.

### Replay input

`generateProjectOwnerRequest` accepts an optional `validatedReport`. The CLI
accepts `--validated-report-path` and loads that JSON from the current job's
runner-temporary directory.

Without a validated report, generation behaves as it does today and invokes
the configured providers. With a validated report, generation invokes no copy
or metadata provider.

### Replay validation

Before replay, generation requires the validated report to match the current:

- report schema version;
- issue number;
- operation;
- source ID;
- repository ID;
- authority type;
- actor ID and login;
- request fingerprint;
- operation-scoped input fingerprints;
- the complete source-record fingerprint, including non-GitHub sources;
- catalog policy version; and
- exact metadata-candidate project IDs.

The replay payload must contain exactly one valid resolution for every current
metadata candidate and no extras. The existing apply layer revalidates summary
length, controlled tags, tag applicability, manual-tag immutability, and
operation fingerprints.

Copy and metadata audit entries are accepted only for the exact candidate
project IDs and are cloned before use.

### Workflow

The first generation pass writes the report, generated files, and validated
hashes as today. The workflow copies the report to
`validated-project-owner-report.json`.

The final pre-mutation invocation passes:

```text
--validated-report-path "$RUNNER_TEMP/validated-project-owner-report.json"
```

It checks out the exact generated paths from current `origin/main`, reruns
generation with deterministic replay, and retains the existing exact report and
file-hash comparison.

The replay file is job-local trusted state. It is not uploaded publicly,
committed, accepted from the issue, or reused by another run.
The workflow records its SHA-256 immediately after content validation and
verifies that digest immediately before replay, so the replay input cannot
silently become a new comparison baseline between those steps.

## Error handling

- A missing or malformed replay report fails with
  `validated-owner-report-invalid`.
- A current-input mismatch fails with `validated-owner-report-stale`.
- Invalid resolved metadata continues to fail through the existing
  `owner-request-invalid` checks.
- Provider failures remain possible only in the first generation pass.
- No branch mutation occurs for any replay failure.

## Testing

- Reproduce issue #175's shape with automatic summary and tags.
- Make the first provider call return one valid result and configure a second
  provider call to return different output or throw.
- Verify replay does not call the provider and generates the exact same report
  and file hash.
- Verify changed request fingerprints, actors, policy versions, project sets,
  and malformed resolutions are rejected.
- Verify the workflow's second generator invocation passes the validated report
  path.
- Run focused owner-generation tests, workflow tests, full unit tests,
  typecheck, lint, formatting, build, and static-export verification.
