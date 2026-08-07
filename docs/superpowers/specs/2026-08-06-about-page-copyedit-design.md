# About Page Copyedit Design

## Goal

Correct grammatical errors and unclear prose across Tavernary's About page while preserving its established meaning, structure, and community-focused voice.

## Scope

- Copyedit all reader-facing text in `src/app/about/page.tsx`.
- Fix grammar, duplicated words, awkward phrasing, agreement, and ambiguous references.
- Preserve the existing headings, section order, navigation, actions, and links.
- Preserve all substantive statements about project eligibility, independence, TavernKeeper scans, reporting, removal, safety, and legal responsibility.
- Keep capitalization of catalog project types consistent with the product UI.

## Editorial Approach

Use a conservative sentence-level edit. Prefer direct, natural phrasing without turning the page into marketing copy or introducing new claims. The opening paragraph should read:

> Tavernary is a search and discovery catalog for AI roleplay tools in and around the SillyTavern community. It indexes public project information and directs visitors to each project's creator-owned repository or source page.

## Verification

- Add or update a focused unit assertion for the corrected opening copy.
- Run the About-page unit test.
- Run formatting and the repository's full `npm.cmd run check` gate.
- Review the final diff to confirm that changes are editorial and preserve the protected policy meaning.

## Out of Scope

- Layout, styling, navigation, or responsive changes.
- New About-page sections or claims.
- Changes to catalog behavior, submission rules, security classifications, or reporting workflows.
