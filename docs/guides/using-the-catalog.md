# Using the catalog

The Tavernary homepage opens directly into the searchable catalog. Use the
search field, category navigation, and filter controls together to narrow the
projects shown on the page.

## Search and filters

- Search matches project names and indexed text exposed by the catalog.
- Project-kind filters separate Frontends, Extensions, and System Presets.
- Frontend compatibility filters use OR logic within the frontend group.
- Metadata filters use OR logic within their group.
- Different filter groups combine with AND logic.
- With no filters selected, every published project is eligible to appear.

The URL records the active catalog query, so a filtered view can be copied or
shared without creating an account.

## Reading a project card

Cards prioritize the information needed to choose what to inspect next:

- project identity and kind;
- supported frontend or compatibility information;
- current activity and recency;
- the canonical source link; and
- a compact one-line summary where the layout allows it.

Compact cards intentionally hide secondary detail to keep the catalog scannable.
Full summary content is shown in the card body.

Every card leads to the project's own repository or source page. Tavernary does
not provide an internal project download or installation flow.

## Getting help about a listing

Use the [Help hub](/help/) when a catalog card, Kit, or Tavernary page needs
attention. It links to **Manage your project listing**, **Report a project
listing**, **Report a website problem**, **Report a Kit**, and **Get other
help**. Contextual links preserve the selected project, Kit, or Tavernary path
where it is safe to do so.

A verified personal GitHub repository owner can manage that repository's
listing. Reviewed Tavernary owners, admins, and maintainers may use the same
reviewed request for any card. Organization maintainers without either
authority and all other concerns receive a human-reviewed public report.
Reports are visible on GitHub, so do not include secrets. Tavernary does not
support third-party projects: use the project's own support channel. A
Tavernary security vulnerability instead belongs on the private
`/help/security/` route, which opens GitHub's `security/advisories/new` form.

## Activity labels

**Recent Activity** sorts by the latest qualifying source change or release.

**Sustained Activity** reflects how many of the current twelve fixed,
Monday-based UTC weeks contained qualifying source activity. A value such as
`N/12` describes active weeks; it is not a commit count and does not reward a
week with more commits than another active week.

Documentation-only, lockfile-only, generated/vendor-only, merge-only, and
whitespace-only changes do not count as source activity. A project can remain
visible when it has no recent qualifying activity, but older projects may be
marked **Dormant**.

## Incomplete and changing information

Some catalog records are intentionally provisional while editorial review or
repository enrichment continues. **Pending enrichment** means Tavernary does
not yet have a verified fact; it does not mean the fact is zero or confirmed
missing.

Temporary refresh problems preserve the last known good facts and may mark a
record stale. Confirmed deletion, private access, or an unsafe repository
identity change can remove a project from the public build until a maintainer
reviews it.

## Before using a project

Open the canonical source page and review the project's own documentation,
license, release history, and support expectations. Tavernary's catalog facts
are useful discovery context, not a substitute for the creator's source of
truth. Refer to the exact status and manifest definitions in
[catalog statuses and manifests](../reference/catalog-statuses-and-manifests.md).
