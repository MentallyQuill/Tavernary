# Tavernary Menu Page Design

## Purpose

Tavernary's header currently labels a broad collection of actions as **Help**.
That framing hides routine project-owner work because someone who wants to
rename a project or update its details is not looking for help. Tavernary will
replace that destination with a whole-site **Menu** whose canonical URL is
`/menu/`.

The Menu is a dedicated page, not a header dropdown. It must preserve every
existing project, Kit, report, question, and private-security flow while making
ordinary management and navigation actions easier to find.

## Public information architecture

The catalog header replaces the visible **Help** link with **Menu** and sends it
to `/menu/`. The existing About and Submit Project shortcuts stay in the header;
the Menu repeats those destinations as part of its complete site navigation.

The `/menu/` page uses three ordered groups:

1. **Manage and publish**
   - **Update or rename your project listing** links to
     `/menu/manage-project/`. Its description explicitly names display-name,
     card-detail, repository-location, and listing-status changes.
   - **Submit a project** links to `/submit/project/`.
   - **Build or manage Kits** links to `/?mode=kits`.
   - **Withdraw a published Kit** links to `/menu/withdraw-kit/`.
2. **Browse and learn**
   - **Browse projects** links to `/`.
   - **Browse Kits** links to `/?mode=kits`.
   - **About Tavernary** links to `/about/`.
   - **Catalog Policy** links to `/catalog-policy/`.
3. **Reports and help**
   - **Report a project listing** links to `/menu/report-project/`.
   - **Report a Kit** links to `/menu/report-kit/`.
   - **Report a website problem** links to `/menu/report-website/`.
   - **Ask a Tavernary question** links to `/menu/other/`.
   - **Report a security issue privately** links to `/menu/security/`.

The removed `/support/` page and Ko-fi control are not restored or referenced.

The page heading is **Menu**. Its lead is concise and action-oriented:
"Browse Tavernary, manage your projects and Kits, or report a problem." The
groups use compact navigation cards in a responsive grid rather than the
current tall, support-oriented stack. Each destination has a short description;
the management group comes first, and reports remain available without defining
the page.

## Canonical routes and compatibility

The complete canonical route family is:

- `/menu/`
- `/menu/manage-project/`
- `/menu/report-project/`
- `/menu/report-website/`
- `/menu/report-kit/`
- `/menu/withdraw-kit/`
- `/menu/other/`
- `/menu/security/`

All Tavernary links, form origins, issue-template return instructions, public
guides, maintainer runbooks, and static-export assertions move to these routes.
New GitHub review manifests record `/menu/...` origins.

Tavernary is a Next.js static export hosted on GitHub Pages, so server redirects
are unavailable. Each former `/help/...` route remains as a small compatibility
page that replaces the browser location with its matching `/menu/...` route
while preserving the query string and hash. The page also renders an ordinary
link to the new destination so navigation still works when JavaScript is
disabled. Compatibility pages are excluded from indexing and never contain a
copy of the form or Menu content.

Existing GitHub issues and manifests remain valid. Technical identifiers that
describe the report subsystem—including `help-manifest`, `other-help`, the
`features/help` and `scripts/help` modules, workflow names, and issue labels—do
not change. They are data and automation contracts, not the site's navigation
label.

## Page shell and contextual language

Canonical Menu pages share a Menu-aware page shell. The Menu landing page links
back to the catalog. Child pages link back to the Menu so people can choose a
different action without returning to the catalog first. The shell's accessible
navigation name is **Menu navigation**.

Child-page kickers describe their actual category:

- **Projects** for project-owner management;
- **Reports** for project, Kit, and website reports;
- **Kits** for Kit withdrawal;
- **Help** for the genuine question form; and
- **Security** for private vulnerability reporting.

The destination heading for owner changes becomes **Update or rename your
project listing** so the action reported as difficult to find is named directly.
Form behavior, validation, review, GitHub handoff, and authority checks stay
unchanged.

## Static-export behavior

The static-export verifier requires all eight canonical `/menu/...` pages and
all eight `/help/...` compatibility pages. It checks the canonical private
security page for public issue links and checks every compatibility page for
the expected destination marker. Both root deployments and GitHub project-page
base paths must work.

The compatibility redirect derives the new path by replacing only the `/help`
route segment in the current browser pathname. This preserves any deployment
base path as well as the original query and hash.

## Documentation and screenshots

Current visitor and maintainer documentation calls the destination **Menu** and
uses `/menu/...` URLs. Wording may still use "help" when it means actual
assistance, such as asking a question or contacting a project's own support
channel. Historical design and implementation documents under
`docs/superpowers/` are not rewritten.

The public documentation screenshot `help-hub.png` is replaced by
`menu-page.png`, and the browser visual baselines are renamed from `help-hub-*`
to `menu-page-*`. Screenshots must show the new hierarchy at desktop and mobile
widths.

## Testing and acceptance

Automated tests must prove:

- the header exposes **Menu**, not **Help**, at desktop and mobile widths;
- `/menu/` contains the three groups in order and every listed destination;
- **Update or rename your project listing** is the first task link;
- all canonical forms preserve their existing validation, review, and GitHub
  handoff behavior under `/menu/...`;
- new manifests and public instructions use `/menu/...`;
- every `/help/...` compatibility page points to the corresponding Menu route
  and preserves query/hash state in a browser;
- the private security route never exposes a public issue form;
- canonical and compatibility routes are present in the static export;
- the Menu and form pages do not overflow at 320-pixel width; and
- desktop and mobile Menu screenshots match the approved grouped layout.

The complete repository check, focused end-to-end coverage, visual suite, and
static-export verification must pass before the pull request is merged. After
merge, the exact merge-commit Pages deployment must succeed, and live checks
must confirm `/menu/`, one management route, one report route, and a legacy
`/help/...` compatibility path.
