# Contribution overview

There are several ways to help Tavernary. Choose the path that matches what
you want to change; project submissions, website bugs, catalog maintenance,
and code contributions follow different review paths.

## Add a project

Use the site's **Submit Project** form or the repository's project-submission
issue form. Automation checks the submission shape, source eligibility, and
obvious duplicates. A maintainer still reviews and creates or edits the
canonical catalog record before publication.

See [what is Tavernary?](../guides/what-is-tavernary.md) for the current source
rules. For issue routing and maintainer handoff details, see
[submission and review](submission-and-review.md) and maintainer
[operations runbook](../maintenance/operations-runbook.md).

## Create or change a Kit

Kits are ordered collections of catalog projects assembled by the community.
Drafts are built in the in-browser Kit builder and submitted through GitHub issue
forms. New Kits and edits require manual approval; a pending edit does not
replace the published Kit.

For full Kit workflow details (submit/edit/report/withdraw constraints and
author eligibility checks), see [Kit submission and moderation workflows](kits.md).

Use the Kit submission, report, or withdrawal forms for Kit-specific changes.
Do not edit generated Kit output by hand.

- Kit submission: `.github/ISSUE_TEMPLATE/05-kit-submission.yml`
- Kit report: `.github/ISSUE_TEMPLATE/06-kit-report.yml`
- Kit withdrawal: `.github/ISSUE_TEMPLATE/07-kit-withdrawal.yml`

## Improve the site or tooling

Code, tests, documentation, catalog scripts, workflows, and styling changes
belong in a pull request. Before starting, check the relevant architecture or
operations document and preserve the boundary between:

- human-authored registry data;
- machine-authored GitHub snapshots;
- generated browser catalog data; and
- the static site source and export.

For setup and verification commands, see [development setup](development-setup.md).

## Report a problem

Start from Tavernary's [Help hub](/help/) for a contextual, review-before-send
path. The ordinary Help routes are public GitHub reports:

- **Manage your project listing** (`/help/manage-project/`) for a verified
  personal GitHub repository owner requesting an edit, same-repository source
  move, or delist.
- **Report a project listing** (`/help/report-project/`) for anyone reporting
  incorrect, unsafe, rights, organization, or other listing concerns.
- **Report a website problem** (`/help/report-website/`) for Tavernary runtime,
  layout, accessibility, navigation, or handoff problems.
- **Report a Kit** (`/help/report-kit/`) for a published Kit concern.
- **Get other help** (`/help/other/`) for a Tavernary question or request not
  covered above.

The GitHub chooser remains broader than Tavernary Help and is still available
as a direct fallback form. Use the narrowest applicable route:

| Need | Use |
| --- | --- |
| Add a project | Project submission |
| Correct factual catalog information | Project information |
| Report a Tavernary website problem | Website bug |
| Report unsafe or problematic Kit content | Kit report |
| Withdraw a Kit | Kit withdrawal |
| Ask for help or report another issue | Help / Other |
| Report a security vulnerability | Private security path in `SECURITY.md` |

Do not report a vulnerability publicly. Do not use Tavernary's issue forms to
request support for an externally hosted project; use that project's own
support channel instead.

For a Tavernary vulnerability, use `/help/security/` or GitHub's private
`security/advisories/new` flow. The security path intentionally has no public
issue form.

## Contribution expectations

Contributions should be narrow, reviewable, and supported by the appropriate
tests or validation commands. Avoid hand-editing generated files, adding
unverified metadata, or changing public terminology without updating its
source vocabulary and documentation.

Tavernary's [licensing policy](../../LICENSING.md), [security policy](../../SECURITY.md),
and [trademark policy](../../TRADEMARKS.md) apply to contributions.
