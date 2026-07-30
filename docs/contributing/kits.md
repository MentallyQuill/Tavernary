# Kit submission and moderation workflows

Kits are community-authored project collections. They are submitted and
published through issue automation, not direct registry edits.

## What is a Kit

- A Kit is a named ordered list of 3-50 published project IDs.
- Community support feeds Trending; Tavernary does not assign editorial
  endorsements.
- Kits are stable JSON records in `data/registry/kits/*.json` after automated
  publication.

## Submit a new Kit

Use the in-browser builder, review the draft in Tavernary, and continue to the
GitHub review mirror:

- `[Kit submission]` (`05-kit-submission.yml`)

Kit submissions share Tavernary's repository-wide open-issue limit with every
other public issue type. Editing an admitted Kit submission does not consume
another slot.

Required safety gates in the submission path:

- `id` uniqueness and duplicate-detection checks;
- 3-50 project IDs and all IDs must exist in the catalog;
- title/description/project ordering validation;
- author identity and blocked-user checks;
- severe-language checks for the title and description; and
- source issue metadata capture.

The builder prevents submission when its title or description contains a term
from Tavernary's narrow severe-language policy. Common profanity is not the
target of this rule, and the matched term is not repeated in the error message.

After GitHub admits the issue, Kit triage revalidates the latest manifest. A
valid issue publishes automatically: the publisher validates again, updates
the registry, runs repository gates, pushes `main`, requests deployment for the
exact commit SHA, and closes the issue. A correctable failure remains open with
`needs-information`; return to the retained Tavernary draft, correct it, and
open a fresh GitHub review without consuming another issue slot.

## Edit an existing Kit

Use **Edit** on the published Kit in Tavernary. Tavernary prepares the same
`05-kit-submission.yml` review mirror with operation `edit` and the stable Kit
ID.

- The published Kit remains unchanged until server validation and publication
  gates pass.
- The Kit author's GitHub numeric identity may publish an edit. Reviewed
  Tavernary staff listed by immutable ID in
  `data/maintenance/trusted-tavernary-editors.json` may also edit any Kit when
  the refreshed issue has a current trusted association.
- Timestamps update only when canonical Kit content or the displayed author
  login changes.
- An unchanged retry is a no-op.

A `tavernary-staff` edit preserves the original author, Kit ID, source issue,
publication date, and support snapshot identity. It does not transfer
authorship to the staff actor.

## Report unsafe or low-quality Kits

Use the Help hub's **Report a Kit** route (`/help/report-kit/`) when the Kit is
already published. It prepares the same public GitHub report for review; do not
include secrets or private personal information. Make corrections in Tavernary
and open a fresh review.

Use `/help/withdraw-kit/`, normally from the Kit panel's **Request
withdrawal** action. Tavernary then opens:

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
- Automated publication does not make a Kit an endorsement; community support
  remains separate from safety.

For maintainer-side actions, see:

- [Kit maintenance](../maintenance/kits.md)
- [Maintainer runbook](../maintenance/operations-runbook.md)
