# Submission and review

This page explains what happens after you submit a project, request a listing
change, or send a Kit for review. The short version is: Tavernary prepares the
request, GitHub shows a public review mirror, and a validated transaction is
what can publish.

## Start in Tavernary

Use the narrowest route:

- `/submit/project/` for a new project;
- `/help/report-project/` for a project-card correction;
- `/help/manage-project/` for a verified owner or reviewed maintainer;
- `/?mode=kits` for a new Kit or Kit edit;
- `/help/report-kit/` for a published Kit concern;
- `/help/withdraw-kit/` for the recorded Kit author; and
- `/help/other/` for another Tavernary question.

Security problems always use the private path in `SECURITY.md`, never a public
issue form.

## Public review mirrors

Tavernary creates an authoritative manifest before opening GitHub. The GitHub
Issue Form is a review mirror, not a second editor. Read the preview before you
create it. To make a correction, return to Tavernary and open a fresh review.

Ordinary issue text is public. Do not include credentials, private personal
information, or private vulnerability details.

External GitHub accounts may keep up to 10 open issues in Tavernary. The limit
covers all public issue types; edits and comments do not use another slot.
Closing an issue restores one slot immediately.

## Project submissions

1. The form collects the source and the project kind. Only Extensions choose a
   primary function; Frontends and System Presets receive their structural
   values automatically.
2. Tavernary checks the source URL, public-source rules, frontend vocabulary,
   and obvious duplicate repository identity.
3. A correctable problem stays open with `needs-information` and an explanation.
   A clear duplicate is closed before a review pull request is created.
4. A valid request creates one deterministic branch and one transaction PR.
5. CI checks the proposed registry record, source facts, catalog build, and
   browser export.
6. The publisher checks the current issue, authority, source identity, base
   commit, changed paths, and exact head SHA before merging.
7. A merge publishes through the normal catalog and Pages path. Closing the PR
   without merging declines the request.

The publication system automatically publishes valid create, card-edit, source-move,
retire, restore, and source-delist changes after their checks pass. The PR
remains the CI and audit transaction.
PR remains the CI and audit transaction.

The submitted Extension category remains authoritative. An intake model may
add a sanitized `classification-review` note, but it never changes
`primary_function`.

Frontends and Extensions require a public GitHub or Codeberg repository. External
System Presets use a stable public HTTPS page and paused automatic refresh.

The builder's frontend choices come from the current catalog. The submitted
Extension primary function is authoritative; the intake model never changes
the canonical `primary_function`.

The submitted Extension primary function is authoritative.

## Owner listing requests

The current personal GitHub owner of a verified repository can request changes
for that repository. Reviewed Tavernary owners, admins, and maintainers listed
by immutable GitHub ID in `data/maintenance/trusted-tavernary-editors.json` can
request changes for any card. A trusted repository association alone does not
grant authority.

The generated branch is named
`automation/project-owner-request-<issue-number>`. The transaction can edit a
card, move a source after a verified rename or transfer, retire or restore a
card, or permanently delist a source.

The owner editor supports **Add cards from this source** in an atomic batch of
**one to ten cards**. There is **one unresolved add-card request per source**.
Add-card batches still need maintainer approval.

Retire or restore changes one card and can be reversed. To **permanently delist
a source** is repository-wide: every associated card is removed from the public
catalog, refresh pauses, and the immutable source identity cannot return by
normal self-service.

## Kits

Kits contain 3–50 existing project cards. The builder serializes a stable JSON
manifest and validates count, duplicates, ordering, authorship, and content
rules. A valid create or edit can publish automatically after triage and final
revalidation. The published Kit stays unchanged until those gates pass.

Community support is derived from eligible `+1` reactions on the source issue.
It is evidence of interest, not a rating or endorsement. A report uses
`/help/report-kit/`; a recorded author uses `/help/withdraw-kit/`.

## Metadata and safety boundaries

Creator and owner authority affects which summary or tag fields may be manual.
Community-submitted manual values are not trusted fallback text. Automatic
enrichment can write only automatic summary and tag fields; it never changes
the project's primary function.

TavernKeeper scans and Catalog Policy signals are advisory. They help people
notice questions after publication; they are not an approval stamp or an
automatic decision that a project is good or bad.

The Catalog Policy permits consensual adult content, kink, fetish content, and
ordinary profanity. Its automated evidence review is advisory and
post-publication. Verified-owner delisting is owner-facing permanent; any
exceptional restoration is manual Tavernary staff maintenance.

Catalog Policy is advisory and post-publication.
Verified-owner delisting is owner-facing permanent.
Exceptional restoration is manual Tavernary staff maintenance.

The versioned Tavernary manifest in the source issue is the automation
authority. Readable GitHub fields are a review mirror and do not replace the
manifest.

## Exact maintainer contracts

Maintainers should use the [operations runbook](../maintenance/operations-runbook.md)
for exact workflow names, recovery steps, and labels. In particular, the
runbook remains authoritative for:

- `unsupported-source` and `owner-request-invalid` failure reasons;
- source-backed card maintenance and immutable provider IDs;
- transaction **schema version 2**;
- `migrate-source-registry-v1.mjs --write` and its dry-run/rollback contract;
- exact-SHA publication; and
- the rule that permanent source delisting affects every associated card.
