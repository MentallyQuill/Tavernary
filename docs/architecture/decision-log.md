# Architecture and moderation decision log (V1)

This file records non-historical decisions shaping current behavior.

## 1) Static-first architecture

- Tavernary is a static, build-time catalog.
- No accounts, runtime DB, search API, recommendation service, or project hosting.
- All runtime behavior is from committed site artifacts and client-side filtering.
- GitHub is the source-of-truth for refresh evidence; repository pages remain the
  source of truth for project use.

## 2) Data source separation

- Human-authored canonical catalog records are in
  `data/registry/projects/*.json`.
- Stable source identity and lifecycle are in `data/registry/sources/*.json`.
- Machine-authored evidence is in provider-qualified snapshot directories.
- Browser runtime input is `src/generated/catalog.json`.
- This split prevents automated refresh from editing editorial text, tags, or
  compatibility decisions.

## 3) Intake migration and legacy data

- `data/catalog/projects.json` is historical intake kept for reproducible
  migration/audit only.
- Canonical records are one JSON file per project for conflict-safe edits and stable
  review boundaries.

## 4) Quality and publication gates

- Card `listing_status` and source `status` are separate maintainer-authored
  publication controls.
- An active card can still be provisional while enrichment finishes.
- Source health states (`unavailable`, `identity-change`, `deleted`, `private`) do not
  replace deterministic editorial review.
- Stale visibility handling favors preserving last-known data over silent removals when
  recoverable.

## 5) Review and publication model

- Submissions enter by structured issue forms only.
- Submission/automation is only validation and review preparation; publish action is PR
  and approval.
- Kit draft/edit/withdrawal workflows have extra safeguards for author identity and
  moderation states.

## 6) Non-goals

- No ranking-as-quality system. Popularity is optional sort, not a trust score.
- No comments, ratings, or runtime safety classifiers as new product surface.
- No automatic moderation actions beyond visibility/refresh policy changes.
