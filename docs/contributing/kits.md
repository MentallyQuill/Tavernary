# Kit submission and moderation

A Kit is a community-made, ordered list of 3–50 published project cards. It
is a collection of links and descriptions, not a package of copied files.

![Build a Kit from catalog projects](../assets/screenshots/kits-wide.png)

## Create a Kit

Use the in-browser Kit Builder, check the draft, and continue to the GitHub
review mirror through `[Kit submission]` (`05-kit-submission.yml`). Do not edit
generated Kit output by hand.

The builder and automation check:

- a unique Kit ID;
- 3–50 project IDs that all exist in the catalog;
- title, description, and project order;
- author identity and blocked-user rules;
- the narrow severe-language policy; and
- source-issue metadata.

The builder checks the title and description for severe language before the
review mirror opens, and triage checks the manifest again.
Common profanity is not the target of the severe-language rule. The builder
does not repeat a matched severe term in its error message.

The public GitHub issue limit is a repository-wide open-issue limit that applies
to Kits and every other public issue type.
Editing an admitted request does not use another slot. A correctable failure
stays open with `needs-information`; return to the retained Tavernary draft,
correct it, and open a fresh review.

## How publication works

1. Tavernary serializes the draft into a stable JSON manifest.
2. Kit triage validates the newest manifest.
3. A valid issue dispatches the publisher automatically.
4. The publisher validates again, updates the registry, runs repository gates,
   pushes `main`, requests exact-SHA Pages deployment, and closes the issue.

The currently published Kit does not change until every gate passes. A near
duplicate is a warning; an exact duplicate project set is invalid.

## Edit a Kit

Use **Edit** on the published Kit in Tavernary. The edit uses the same
`05-kit-submission.yml` mirror and keeps the stable Kit ID.

The recorded Kit author's GitHub numeric identity may publish an edit. Reviewed
Tavernary staff may edit any Kit when their immutable ID is listed in
`data/maintenance/trusted-tavernary-editors.json` and the issue has a current
trusted association. Association alone does not grant authority.

A staff edit preserves the original author, Kit ID, source issue, publication
date, and support snapshot identity. It changes only the approved content and
`updated_at`. An unchanged retry does nothing.

## Report or withdraw a Kit

Use **Report a Kit** at `/help/report-kit/` for a published Kit concern. Reports
are public GitHub reviews, so never include secrets or private personal
information. A report may lead to a status change, tombstone, or deletion after
maintainer review.

Use **Withdraw a Kit** at `/help/withdraw-kit/`, normally from the Kit panel.
The `[Kit withdrawal]` (`07-kit-withdrawal.yml`) path requires the issue
author's GitHub numeric identity to match the recorded Kit author. Withdrawal
keeps the record history and sets `status: withdrawn` with a timestamp.

## Moderation boundaries

- Automated publication is not a Tavernary endorsement.
- Community `+1` support is evidence of interest, not a rating.
- Do not use a Kit as proof that every included project is safe or high quality.
- Do not expose private issue details.

For exact workflow recovery and maintainer actions, use [Kit maintenance](../maintenance/kits.md)
and the [operations runbook](../maintenance/operations-runbook.md).
