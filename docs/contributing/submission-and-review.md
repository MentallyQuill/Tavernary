# Submission and review

This page explains what happens after you submit a project, request a listing
change, or send a Kit for review. The short version is: Tavernary prepares the
request, GitHub shows a public review mirror, and a validated transaction is
what can publish.

## Start in Tavernary

Use the narrowest route:

- `/submit/project/` for a new project;
- `/help/report-project/` for a project-card correction;
- `/help/manage-project/` for a verified repository owner;
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
2. Review the complete request before opening the public GitHub issue.
3. GitHub shows the request status and explains any correction that is needed.
4. A request appears in the catalog only after all required checks pass.

Frontends and Extensions require a public GitHub or Codeberg repository. External
System Presets use a stable public HTTPS page and paused automatic refresh.

The builder's frontend choices come from the current catalog. The Extension
primary function selected in the form remains the submitted category.

## Owner listing requests

The current personal GitHub owner of a verified repository can request changes
for that repository. The form can edit a card, move the same source after a
rename or transfer, retire or restore a card, or permanently delist a source.

The owner editor supports **Add cards from this source** in an atomic batch of
**one to ten cards**. There is **one unresolved add-card request per source**.
The catalog does not change unless the complete batch is accepted.

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

## Descriptions, tags, and safety

Manual summary and tag choices are used only after GitHub verifies repository
ownership. Otherwise, the automatic description and tag choices are used.

TavernKeeper scans and Catalog Policy signals are advisory. They help people
notice questions after publication; they are not an approval stamp or an
automatic decision that a project is good or bad.

The Catalog Policy permits consensual adult content, kink, fetish content, and
ordinary profanity. Its automated evidence review is advisory and
post-publication. Verified-owner delisting is permanent for that source.

Make corrections in Tavernary and open a fresh GitHub review instead of
editing the generated values in an existing issue.
