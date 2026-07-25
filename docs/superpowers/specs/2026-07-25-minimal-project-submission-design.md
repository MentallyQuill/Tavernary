# Minimal Project Submission Design

**Date:** 2026-07-25
**Status:** Approved

## Goal

Make submitting a project nearly frictionless. Submitters provide only facts
that Tavernary cannot safely obtain without their input. Automation and
maintainers derive catalog metadata from the submitted source.

## Issue form

The project-submission issue form contains one short explanation and exactly
three fields:

1. **Project Type** — required dropdown with `Frontend`, `Extension`, and
   `System Preset`.
2. **Project URL** — required URL input.
3. **Anything we should know?** — optional free-text input for unusual source
   details or context.

The explanation states:

> GitHub repository URL required for Extensions and Frontends, not for Presets.

The form does not ask for a project name, compatible frontends, summary,
primary function, capabilities, supporting links, or acknowledgements.

## Issue title

The issue form supplies the complete generic title `[Project submission]`.
Submitters do not need to enter or repeat a project name. Repository names can
be derived from GitHub URLs; maintainers can identify non-GitHub presets from
their submitted pages.

Automated retitling is not required for this change. Existing triage continues
to route issues by the `[Project submission]` title prefix.

## Validation and data flow

Automated triage reads `Project Type` and `Project URL`. It:

- requires a valid HTTPS URL;
- requires an exact public GitHub repository URL for Frontends and Extensions;
- permits a stable non-GitHub HTTPS page for System Presets; and
- detects sources that may already exist in Tavernary.

The optional note is retained for maintainer review but does not affect
automated validation. Automation and maintainers remain responsible for
deriving the canonical project name, summary, capabilities, compatibility, and
other catalog metadata.

Validation failures continue to label the issue `needs-information` and explain
the correction in the existing automation comment. Valid submissions continue
to enter `needs-maintainer-review`; no issue publishes a catalog record
directly.

## Documentation and tests

Update issue-form tests to assert the exact three-field contract and the source
rule explanation. Preserve triage and URL-validation coverage, updating parsed
heading names from `Project kind` and `Canonical source URL` to `Project Type`
and `Project URL`.

Update contributor and maintainer documentation where it implies that
submitters provide catalog metadata beyond the three-field intake contract.

## Acceptance criteria

- The form displays only `Project Type`, `Project URL`, and optional
  `Anything we should know?`.
- The issue title is already complete without submitter input.
- Frontend and Extension submissions still require GitHub repositories.
- System Presets still permit stable non-GitHub HTTPS pages.
- Duplicate detection and maintainer-review routing still work.
- Automated tests cover the exact field list, title, parsing, and source rules.
