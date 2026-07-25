# Kit Submission Prefill Design

**Date:** 2026-07-25

## Goal

Make the GitHub Kit submission form a readable review step instead of asking
contributors to repeat machine data that Tavernary already knows.

## Submission flow

Kit creation continues to begin in the Tavernary Kit Builder. Kit editing begins
from the **Edit Kit** action on a published Kit. In both cases, Tavernary opens
the repository's Kit submission issue form with:

- the GitHub issue title set to `[Kit submission]: <Kit title>`;
- the visible Kit title field prefilled;
- the visible Kit description field prefilled; and
- the generated Kit manifest prefilled.

The submission transport receives the complete Kit draft so it can derive all
four values from one source.

## Issue form

The form keeps only the contributor-readable Kit title and description fields,
the generated manifest, and concise submission guidance.

The form removes:

- **Operation**, because the manifest already declares `create` or `edit`;
- **Kit ID**, because Tavernary already places the selected published Kit's ID
  in an edit manifest; and
- the contribution-terms checkbox.

The title and description fields use unambiguous issue-form IDs such as
`kit-title` and `kit-description`. This avoids colliding with GitHub's reserved
`title` query parameter, which controls the issue's own title.

The manifest remains the canonical automation payload. Visible fields improve
review readability but do not replace or override manifest validation.

## Oversized submissions

The existing URL-length safeguard remains. If the fully prefilled URL would be
too long, Tavernary:

1. copies the generated manifest to the clipboard, with the existing selectable
   text fallback when clipboard access fails;
2. preserves the issue title, Kit title, and Kit description query parameters;
3. replaces only the manifest query value with paste instructions; and
4. opens the issue form.

## Documentation

Contributor documentation will tell users to edit a Kit through its Tavernary
**Edit Kit** action. It will no longer ask users to supply a Kit ID or describe
that value as a "published Kit issue ID."

## Verification

Unit tests will prove:

- create and edit drafts prefill the issue title, Kit title, Kit description,
  and manifest;
- edit identity remains present in the manifest without a separate form field;
- the oversized-manifest path preserves readable prefills and copies only the
  manifest;
- the issue form omits Operation, Kit ID, and contribution terms; and
- the issue form retains its required readable fields and manifest.

Focused unit tests will be followed by the repository's standard formatting,
linting, type-checking, and relevant build checks.
