# Project Submission Metadata Repair

## Problem

Project submission issue #151 reached `needs-maintainer-review` after its fork
parent was published, but the review-PR workflow failed while generating catalog
metadata. The original run and a fresh run from current `main` both exhausted
the existing single validation-repair attempt.

The current failure contains invalid synthesized metadata:

- the summary exceeds 220 characters;
- summary evidence references exceed 160 characters; and
- evidence references for selected tags exceed 160 characters.

The provider response schema and prompt already state these limits. Runtime
validation correctly rejects nonconforming output, but one repair attempt is
not sufficient to recover every otherwise usable provider response.

## Decision

Give source-backed enrichment a maximum of two validation-repair attempts after
the initial provider call, for three provider calls in total.

Each repair request must be based on the latest rejected output:

- use the latest deduplicated validation errors as the repair message;
- include the latest rejected summary when one is present;
- keep repair sampling deterministic; and
- validate the complete response again before accepting it.

The loop ends immediately when validation succeeds. If all three calls remain
invalid, preserve the existing terminal `output-invalid` failure. The existing
tag-only fallback may still apply when removing invalid generated tags leaves a
fully valid summary and copy result.

## Boundaries

The repair must not:

- truncate summaries or evidence references;
- invent or zero-fill missing summary data;
- weaken summary, evidence, tag, or copy-policy validation;
- turn an invalid summary into the confirmed no-README fallback;
- retry transport, authentication, rate-limit, timeout, or source failures; or
- change manual owner/staff copy-preservation behavior.

Only validation failures returned by the enrichment provider are eligible for
the bounded repair loop.

## Implementation Shape

Refactor the duplicated generate-and-validate sequence in
`scripts/catalog/enrich-readmes.mjs` into a small bounded loop. Keep the repair
limit local to this module and make the number of calls evident from the code.
No workflow YAML or catalog schema change is required.

The provider interface remains unchanged. Existing repair requests continue to
use the `repair` object understood by `enrichment-provider.mjs`.

## Verification

Add focused unit coverage proving:

1. an invalid initial response followed by an invalid first repair and a valid
   second repair succeeds after exactly three provider calls;
2. the second repair receives the first repair's validation errors and rejected
   summary, rather than stale diagnostics from the initial response;
3. three invalid responses still throw `output-invalid`; and
4. the existing invalid-tag fallback and successful one-repair path remain
   unchanged.

Run the focused enrichment tests, then the repository's complete
`npm.cmd run check` gate.

## Release

Commit and push the narrow repair, wait for the exact SHA's Pages and support
workflows, then redispatch issue #151 through
`generate-project-submission.yml`. Audit the generated PR, required checks,
publication transaction, issue closure, and live deployment. If the provider
still returns invalid metadata after the expanded repair budget, stop with the
new workflow evidence instead of manually bypassing the catalog contracts.
