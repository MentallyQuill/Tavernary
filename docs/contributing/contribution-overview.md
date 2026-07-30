# Contribution overview

There are several ways to help Tavernary. Choose the path that matches what
you want to change; project submissions, website bugs, catalog maintenance,
and code contributions follow different review paths.

## Add a project

Use the site's **Submit Project** form. Tavernary prepares the authoritative
manifest and opens GitHub only as the public review-and-create surface.
Automation checks the submission shape, source eligibility, and
obvious duplicates. A generated PR isolates the proposed files for CI and
audit; valid transactions automatically publish by exact SHA without routine
staff involvement.

See [what is Tavernary?](../guides/what-is-tavernary.md) for the current source
rules. For issue routing and maintainer handoff details, see
[submission and review](submission-and-review.md) and maintainer
[operations runbook](../maintenance/operations-runbook.md).

## Create or change a Kit

Kits are ordered collections of catalog projects assembled by the community.
Drafts are built and reviewed in the in-browser Kit builder before Tavernary
opens the GitHub review mirror. Valid Kits and edits publish automatically after triage and final
revalidation; a pending or invalid edit does not replace the published Kit.

For full Kit workflow details (submit/edit/report/withdraw constraints and
author eligibility checks), see [Kit submission and moderation workflows](kits.md).

Begin Kit submissions, reports, and withdrawals in Tavernary.
Do not edit generated Kit output by hand.

- Kit create/edit: `/?mode=kits`
- Kit report: `/help/report-kit/`
- Kit withdrawal: `/help/withdraw-kit/`

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
  move, or delist, and for reviewed Tavernary staff managing any card.
- **Report a project listing** (`/help/report-project/`) for anyone reporting
  incorrect, unsafe, rights, organization, or other listing concerns.
- **Report a website problem** (`/help/report-website/`) for Tavernary runtime,
  layout, accessibility, navigation, or handoff problems.
- **Report a Kit** (`/help/report-kit/`) for a published Kit concern.
- **Withdraw a Kit** (`/help/withdraw-kit/`) for a recorded Kit author.
- **Get other help** (`/help/other/`) for a Tavernary question or request not
  covered above.

The GitHub chooser links back to Tavernary intake. GitHub Issue Forms are
review mirrors: create or cancel there, but return to the matching Tavernary
form to make corrections and open a fresh review.

| Need | Use |
| --- | --- |
| Add a project | `/submit/project/` |
| Correct factual catalog information | `/help/report-project/` |
| Report a Tavernary website problem | `/help/report-website/` |
| Report unsafe or problematic Kit content | `/help/report-kit/` |
| Withdraw a Kit | `/help/withdraw-kit/` |
| Ask for help or report another issue | `/help/other/` |
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

Verified owners and trusted Tavernary staff receive preservation-oriented
summary handling. Community submissions use README evidence first. The
[Catalog Policy](/catalog-policy/) permits consensual adult content and
ordinary profanity; its automated evidence review is advisory and happens
after publication.
