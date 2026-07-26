# About page visitor-features update

## Goal

Refresh the About page so it explains Tavernary's current visitor-facing
features without expanding into internal catalog operations or enrichment
implementation.

## Content direction

Keep the existing page structure, tone, and calls to action. Add one focused
section titled `Explore and build Kits` after `What Tavernary records` and
before `Independent projects`.

The section should explain, in concise prose, that visitors can:

- browse community-authored Kits;
- filter Kits by the discovery facets exposed by the catalog;
- search projects and creators;
- assemble a personal Kit from catalog projects;
- reorder projects, save drafts locally, and share Kits; and
- submit a Kit for review.

Use the product term `Kits` consistently. Describe local draft persistence as
browser-local behavior, and avoid implying accounts, a Tavernary backend, or
server-side personal collections.

## Scope boundaries

Do not add GitHub refresh, enrichment, repository snapshots, moderation
implementation, or other maintainer-facing operational details. Preserve the
existing explanation of catalog boundaries and independent project ownership.

## Verification

Run the focused About-page/content tests if available, then the normal format,
lint, typecheck, and production build/export checks appropriate for a content-
only page change. Confirm that the new wording does not claim unsupported
visitor functionality.
