# Kit submission and moderation workflows

Kits are curated, community-authored project collections. They are submitted and
moderated through issue forms, not direct registry edits.

## What is a Kit

- A Kit is a named ordered list of 3-50 published project IDs.
- It is a published suggestion surface with optional `tavernary_pick` status for
  promotion.
- Kits are stable JSON records in `data/registry/kits/*.json` after maintainer
  publication.

## Submit a new Kit

Use the in-browser builder and send it through issue form:

- `[Kit submission]` (`05-kit-submission.yml`)

Required safety gates in the submission path:

- `id` uniqueness and duplicate-detection checks;
- 3-50 project IDs and all IDs must exist in the catalog;
- title/description/project ordering validation;
- source issue metadata capture for review.

The pending draft is not published. A maintainer must review and approve before
record publication.

## Edit an existing Kit

Use the same `05-kit-submission.yml` form with operation `edit` and the published
Kit issue ID.

- Edits produce a new pending draft version, not an immediate overwrite.
- The published Kit file changes only after maintainer review and workflow apply.
- Timestamps update on approved publication only.

## Report unsafe or low-quality Kits

Use:

- `[Kit report]` (`06-kit-report.yml`)

Common reasons:

- unsafe content,
- duplicates with existing collections,
- broken links or misleading descriptions,
- spam behavior or unresolved moderation concerns.

Reports go to maintainer triage and may result in unpublishing (`status` change),
tombstone, or deletion depending on the risk level.

## Withdraw a published Kit

Use:

- `[Kit withdrawal]` (`07-kit-withdrawal.yml`)

Withdrawal requires the issue author GitHub numeric identity to match the Kit
`author.github_user_id`.

- Withdrawals do not delete the record history.
- Withdrawn kits move to `status: withdrawn` with a recorded withdrawal timestamp.

## Moderation expectations

- Do not edit `data/registry/kits/*.json` directly.
- Do not share private issue details publicly.
- Do not use Kit links as proof-of-trust or endorsement.
- Kit publication is moderation-bound; community support is separate from safety.

For maintainer-side actions, see:

- [Kit maintenance](../maintenance/kits.md)
- [Maintainer runbook](../maintenance/operations-runbook.md)

