# Create, edit, report, or withdraw a Kit

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

The currently published Kit does not change until the updated request passes
all checks. A near duplicate is a warning; an exact duplicate project set is
invalid.

## Edit a Kit

Use **Edit** on the published Kit in Tavernary. The edit uses the same
`05-kit-submission.yml` mirror and keeps the stable Kit ID.

Only the recorded Kit author can use this public edit path. An edit keeps the
same Kit ID and original publication history.

## Report or withdraw a Kit

Use **Report a Kit** at `/menu/report-kit/` for a published Kit concern. Reports
are public GitHub reviews, so never include secrets or private personal
information. A report may lead to a status change, tombstone, or deletion after
the reported concern is resolved.

Use **Withdraw a Kit** at `/menu/withdraw-kit/`, normally from the Kit panel.
The `[Kit withdrawal]` (`07-kit-withdrawal.yml`) path requires the issue
author's GitHub numeric identity to match the recorded Kit author. Withdrawal
keeps the record history and sets `status: withdrawn` with a timestamp.

## Safety notes

- Automated publication is not a Tavernary endorsement.
- Community `+1` support is evidence of interest, not a rating.
- Do not use a Kit as proof that every included project is safe or high quality.
- Do not expose private issue details.
