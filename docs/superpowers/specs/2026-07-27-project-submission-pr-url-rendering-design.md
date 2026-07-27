# Project Submission PR URL Rendering Design

## Problem

Generated project-submission pull request descriptions pass every report value
through the prose-oriented `safeText()` Markdown escaper. That function escapes
underscores, so a submitted URL such as
`https://github.com/envy-ai/ai_rpg` becomes
`https://github.com/envy-ai/ai\_rpg`. GitHub includes the backslash in the
autolink destination as `%5C`, producing a broken link.

The submitted manifest, generated registry record, and GitHub snapshot retain
the correct URL. The defect is limited to presentation in the generated pull
request body.

## Scope

This change will:

- Preserve the existing prose escaping behavior.
- Render recognized URL report fields as explicit Markdown links.
- Add regression coverage for URL characters that are meaningful to Markdown.
- Refresh pull request 85's description after the corrected renderer is
  available.

This change will not:

- Alter source identity parsing, admission, enrichment, or generated catalog
  data.
- Change the generated pull request workflow's commit or regeneration
  semantics.
- Make arbitrary URLs embedded inside prose into links.

## Design

`safeText()` remains responsible only for normalized, bounded, literal prose.
A separate URL-value renderer will:

1. Accept a string from a report field with URL semantics.
2. Parse it with `URL`.
3. Require an `https:` URL, matching project-submission source policy.
4. Serialize the parsed URL for the link destination.
5. Pass the visible label through `safeText()`.
6. Emit an explicit GitHub-flavored Markdown link in this form:

   ```md
   [https://github.com/envy-ai/ai\_rpg](<https://github.com/envy-ai/ai_rpg>)
   ```

The angle-bracketed destination keeps underscores, parentheses, and query
parameters out of Markdown delimiter parsing. Escaping remains confined to the
visible label and never changes the destination.

`renderGroup()` will select this renderer for the known report URL keys:
`source_url` and `canonical_url`. All other values continue through
`safeText()`.

If a URL-keyed value is not a valid HTTPS URL, rendering will fall back to
`safeText()` rather than throwing. Validation remains the responsibility of the
submission and enrichment layers; the review-surface renderer must still be
able to display malformed diagnostic input safely.

## Tests

Focused unit coverage in `tests/unit/project-submission-pr.test.ts` will verify:

- `source_url` containing an underscore has an exact, unescaped destination.
- `canonical_url` containing parentheses and query parameters remains intact.
- The visible URL label remains Markdown-safe.
- Existing prose escaping behavior remains unchanged.
- Invalid URL-keyed text is displayed safely and does not crash rendering.

The focused test file will run first, followed by the repository's broader unit
test gate appropriate to the touched module.

## Existing Pull Request Repair

After the renderer change is merged, pull request 85's automation-owned
description will be regenerated locally with the corrected renderer and updated
with `gh pr edit --body-file`. A normal generation-workflow rerun is
insufficient because the current PR mutation step is conditional on generated
catalog content changing.

The repaired description will be verified through GitHub's rendered Markdown
output to confirm that the link destination is exactly
`https://github.com/envy-ai/ai_rpg`.
