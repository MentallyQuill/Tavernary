# Prefillable Project Submission Handoff

## Summary

Tavernary's project submission builder will hand a complete submission to
GitHub. The contributor will review the populated issue and submit it without
re-entering project type, frontend independence, model families, or completion
formats.

GitHub Issue Form URL parameters reliably populate text inputs and textareas,
but they do not populate dropdowns or checkboxes. The GitHub project submission
form will therefore represent every builder-supplied value with a prefillable
text control. The embedded project manifest remains the authoritative
machine-readable payload.

## Goals

- Carry every value collected by Tavernary into the visible GitHub form.
- Eliminate duplicate data entry during the Tavernary-to-GitHub handoff.
- Keep the GitHub issue readable for contributors and maintainers.
- Preserve direct GitHub fallback submissions.
- Preserve strict workflow validation and manifest-first parsing.

## Non-goals

- Submitting the GitHub issue automatically.
- Bypassing the contributor's final GitHub review and Submit action.
- Changing the Tavernary submission builder's controls or vocabulary.
- Changing the project submission manifest schema.
- Changing admission, enrichment, review-PR, or publication behavior.
- Replacing GitHub Issues as the submission intake surface.

## Root cause

The builder currently sends URL parameters for readable GitHub form fields.
Text inputs and textareas receive those values. GitHub ignores URL-prefilled
values for dropdowns and checkboxes.

As a result:

- `Project Type` remains at GitHub's dropdown default.
- `Frontend-independent` remains at GitHub's dropdown default.
- `Supported model families` remains unchecked.
- `Completion formats` remains unchecked.

The embedded JSON manifest contains the correct values, so automation can still
recover the intended submission. The required non-text controls nevertheless
force contributors to repeat choices before GitHub permits submission, and the
visible headings can disagree with the manifest.

## GitHub form contract

The GitHub Issue Form keeps its current field IDs and visible headings while
changing non-prefillable controls to text controls:

| Field | Current control | New control | Text representation |
| --- | --- | --- | --- |
| Project Type | Dropdown | Required input | `Frontend`, `Extension`, or `System Preset` |
| Frontend-independent | Dropdown | Required input | `Yes` or `No` |
| Supported model families | Checkboxes | Textarea | One canonical family ID per line |
| Completion formats | Checkboxes | Textarea | One canonical format ID per line |

`Other model family` remains an input. Existing project URL, name, description,
supported frontends, additional context, and project manifest fields remain
text inputs or textareas.

Descriptions and placeholders list the accepted values for direct GitHub
submitters. Project type and frontend independence stay required. Preset-only
compatibility fields remain optional at the GitHub schema layer because they
are not applicable to Frontends or Extensions; workflow validation continues
to require them for System Presets.

## Tavernary transport

The handoff continues to open GitHub's project submission template with URL
query parameters. It adds readable prefills for the fields currently omitted:

- known model-family IDs;
- the unlisted model-family value, when present; and
- completion-format IDs.

Known model families and completion formats serialize as newline-delimited
canonical IDs. The existing `Other model family` field carries the unlisted
family separately. Preset-only fields are omitted from the handoff when the
selected project type is not a Preset.

The stable JSON manifest remains present in `Project manifest`. It remains the
source of truth whenever it is non-empty and valid.

The existing URL-length fallback remains unchanged in principle:

1. copy or expose the complete manifest for manual paste;
2. open GitHub with the manifest paste instruction; and
3. retain as many readable prefills as fit within the safe URL limit.

The fallback must include short identity fields before optional long prose so
project type and compatibility are not the first values discarded when the URL
is oversized.

## Parsing and validation

Manifest-first behavior does not change:

1. If `Project manifest` is non-empty, parse and validate it.
2. Do not silently replace a malformed manifest with readable headings.
3. If the manifest is empty, build the shared manifest from the visible
   fallback fields.

Fallback parsing accepts newline- or comma-delimited model-family and
completion-format text. It trims entries, removes empty values, and maps
case-insensitively to the curated vocabularies. The existing manifest
normalizer then enforces:

- exact supported project types;
- `Yes` or `No` frontend-independent semantics;
- known model-family and completion-format IDs;
- required Preset compatibility values; and
- all existing project-type-specific constraints.

Unknown or malformed direct-entry values fail validation. The parser does not
guess, coerce an unknown project type, or infer missing Preset compatibility.

## User experience

The intended Tavernary path becomes:

1. Complete the project submission in Tavernary.
2. Select **Continue to GitHub**.
3. Review a fully populated GitHub issue.
4. Select GitHub's **Create** action.

No GitHub field requires a repeated choice for a normal-size handoff.

Direct GitHub users retain a structured fallback, but type accepted values as
documented text rather than choosing dropdown or checkbox controls. Invalid
direct submissions receive the existing automation feedback.

## Error handling

- A missing or invalid project type produces the existing project-type
  validation error.
- A frontend-independent value other than `Yes` or `No` is rejected instead of
  being interpreted as `No`.
- Unknown model-family or completion-format entries are rejected.
- Missing required Preset compatibility is rejected.
- A malformed embedded manifest remains a manifest error even when readable
  fields look valid.
- An oversized handoff preserves the complete manifest through clipboard or
  selectable-text fallback.

## Testing

Test-driven implementation will add regression coverage before production
changes.

Focused unit tests will prove:

- the Issue Form uses only URL-prefillable controls for builder-supplied data;
- every builder field is present in the generated GitHub URL;
- Project Type and Frontend-independent serialize to their public labels;
- model families and completion formats serialize to newline-delimited IDs;
- an unlisted model family uses its dedicated field;
- non-Preset submissions omit Preset-only values;
- oversized URLs preserve the manifest and prioritize short identity fields;
- fallback parsing accepts the new text representation;
- invalid direct-entry values fail validation; and
- embedded manifests remain authoritative.

The existing project-submission unit and end-to-end suites will run alongside
the focused tests.

Live verification will open the generated URL against Tavernary's actual
GitHub Issue Form and read the rendered control values without submitting an
issue. It must confirm that Project Type, Frontend-independent, model families,
completion formats, and the embedded manifest are all populated.

The final verification pass will run the repository's full check command after
the focused submission tests pass.
