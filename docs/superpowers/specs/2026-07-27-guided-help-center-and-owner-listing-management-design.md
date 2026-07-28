# Guided Help Center and Owner Listing Management

## Summary

Tavernary will replace the header's direct link to GitHub's generic issue
chooser with a static, first-party Help center at `/help/`. The Help center
will explain the available paths in Tavernary's own language, collect the
information each path needs, validate it in the browser, and prepare a
corresponding GitHub issue for the visitor to review and create.

The Help center will expose five ordinary paths:

1. Manage your project listing.
2. Report a project listing.
3. Report a website problem.
4. Report a Kit.
5. Get other help.

Private security reporting will appear as a visually separate sixth path. It
will never create a public issue.

Repository owners will be able to correct their published card details, point
the listing to the same repository at its current GitHub location, or request
delisting. Owner-authored card details will become manually enriched so a
later model-enrichment pass cannot overwrite them. GitHub remains the identity,
review, discussion, and audit layer; Tavernary will not add accounts, a
database, or a runtime backend.

## Goals

- Give visitors a small, understandable Help menu instead of GitHub's full
  issue-template inventory.
- Keep visitors on Tavernary while they choose a path and compose a request.
- Carry completed Help forms into readable, prefilled GitHub issues.
- Let eligible repository owners manage their catalog listing without giving
  the static website write access.
- Preserve maintainer review before any catalog mutation is merged.
- Preserve automatic repository observation while protecting owner-authored
  editorial fields from model enrichment.
- Route public reports, owner requests, general questions, and private security
  disclosures to deliberately different destinations.
- Keep direct GitHub Issue Forms as accessible fallbacks.

## Non-goals

- Tavernary accounts, sessions, OAuth, or a runtime API.
- Editing the catalog directly from the browser.
- Creating or submitting a GitHub issue without the visitor's final review.
- Automatically merging owner-request pull requests.
- Verifying collaborators, organization members, or repository permission
  levels on third-party repositories.
- Providing technical support for software listed by Tavernary.
- Replacing contextual project submission, Kit submission, Kit editing, or Kit
  withdrawal controls.
- Hiding every direct-only template from GitHub's own issue chooser. GitHub
  does not provide a supported hidden-but-addressable Issue Form state.
- Accepting secrets, private personal information, or unpublished exploit
  details in public Help forms.

## Design principles

### Tavernary explains; GitHub records

Tavernary owns the decision tree, field guidance, validation, and handoff.
GitHub owns authenticated identity, the final Create action, public discussion,
review pull requests, and history.

### The hub describes user intent

Top-level choices use visitor language rather than repository workflow names.
Labels such as `project-information` and `kit-report` remain implementation
details.

### Contextual actions stay contextual

`Submit Project` remains in the header. Kit creation, editing, and withdrawal
remain in the Kit Builder or published-Kit controls. The Help center may point
someone to those surfaces, but it does not duplicate their complete workflows.

### Security is never an ordinary report

The private-security path is visually and behaviorally separate. No security
choice may accidentally prefill a public GitHub issue.

### Forms ask only for actionable information

Each branch asks for the smallest set of facts maintainers need to understand
and route the request. Diagnostic fields appear only where they are useful.

## Information architecture

### Routes

The static export will contain:

- `/help/`
- `/help/manage-project/`
- `/help/report-project/`
- `/help/report-website/`
- `/help/report-kit/`
- `/help/other/`
- `/help/security/`

Every branch has a link back to the Help center and a link back to the catalog.
The header's **Help** action, the About page's **Help report form**, and the
About page's **Get help** action will point to `/help/`.

### Help hub

The page heading is **How can we help?**

The introduction states:

> Choose the closest match. Tavernary will help you prepare the right request
> and let you review it on GitHub before anything is sent.

The ordinary choices appear in this order:

1. **Manage your project listing**
   - Repository owners can correct card details, update the listed repository
     location, or request delisting.
2. **Report a project listing**
   - Report inaccurate, outdated, unsafe, abusive, duplicate, or rights-related
     catalog information.
3. **Report a website problem**
   - Report a problem with Tavernary's pages, search, filters, links, forms,
     accessibility, or behavior.
4. **Report a Kit**
   - Report a compatibility, safety, accuracy, broken-project, or duplicate-Kit
     concern.
5. **Get other help**
   - Ask a Tavernary question, report a stuck request, suggest an improvement,
     or contact maintainers about something not covered above.

The security block appears after the ordinary choices:

> **Security vulnerability? Report it privately.**
> Do not disclose credentials, exploit details, or a Tavernary vulnerability
> in a public issue.

Its action reads **Open private security reporting** and goes first to
`/help/security/`, not to a public Issue Form.

The page also includes quiet contextual links:

- **Submit a new project** → `/submit/project/`
- **Learn how the catalog works** → the existing user guide
- **Get support for a listed project** → explanatory text directing the
  visitor to that project's own repository or support channel

These links do not compete visually with the Help paths.

## Shared guided-form contract

Every ordinary branch uses:

`Help hub → guided form → review → Continue on GitHub → Create issue`

### Form behavior

- Forms are rendered and validated entirely in the static browser application.
- No draft or sensitive report content is written to `localStorage`.
- Selecting another branch does not submit or transmit the current form.
- Required-field errors appear beside the field and in a focusable error
  summary after an invalid submit attempt.
- Conditional fields are added to the tab order only while visible.
- Character counts are live text and are announced without becoming noisy.
- Browser back navigation follows ordinary page behavior.

### Review step

Before leaving Tavernary, the visitor sees:

- the selected destination;
- the values that will be public on GitHub;
- any automatic context Tavernary will attach;
- a warning not to include secrets or private personal information; and
- **Back and edit**, **Cancel**, and **Continue on GitHub** actions.

No request is sent when the review step is opened.

### GitHub handoff

Each controlled form creates:

1. readable prefilled fields for the human reviewer; and
2. a versioned JSON manifest for workflow parsing.

The manifest is authoritative when it is present and valid. Direct GitHub
fallback submissions may omit it and use the readable fields. A malformed
manifest fails validation instead of silently falling back to potentially
different visible values.

GitHub URL prefilling works reliably only for text inputs and textareas.
Builder-supplied dropdown or checkbox values will therefore be represented by
prefillable text controls in the fallback Issue Forms. Workflow validation
will enforce the controlled values.

The existing safe URL-length strategy will be extracted or reused:

1. preserve short identity and routing fields;
2. preserve the complete manifest when it fits;
3. if it does not fit, copy or expose the manifest for manual paste;
4. open GitHub with readable fields and a clear manifest-paste instruction.

GitHub always provides the final **Create** action.

## Manage your project listing

### Purpose and eligibility

This branch fulfills Tavernary's About-page promise that project owners may
request an update, source correction, or removal.

Automated owner management is available only when:

- the record has a GitHub repository source;
- the record has a non-null immutable GitHub `repository_id`;
- the current GitHub owner is a personal user account, not an organization;
  and
- the GitHub issue author's login exactly matches that current owner login,
  case-insensitively.

The website cannot know who the visitor is before GitHub. It therefore explains
the requirement but does not claim that browser-side eligibility is proof.
The workflow performs the authoritative check after issue creation.

Organization-owned repositories, external URL records, GitHub organization
suite records, records without an immutable repository ID, maintainers,
collaborators, and rights holders are directed to **Report a project listing**.
That path remains available for human review but does not claim automatic owner
verification.

### Project selection

The first step provides catalog search by project name, creator, and project
ID. Only currently cataloged records can be selected.

The selection stores:

- stable project ID;
- current display name;
- source type;
- immutable repository ID or an explicit missing-ID state;
- current canonical source;
- current editable card fields; and
- a stable fingerprint of the source registry record used to build the form.

An ineligible record remains viewable, but the page explains why self-service
owner management is unavailable and offers **Report this listing instead**.

### Request types

The owner chooses one request:

1. **Edit card details**
2. **Update the repository location**
3. **Delist this project**

The request types share identity data but have separate fields and validation.

### Edit card details

The form displays the current value beside or directly within each editable
control. V1 permits:

- display name;
- summary;
- supported frontends;
- primary function;
- capabilities; and
- for Presets only, model families and completion formats.

Project kind, immutable repository ID, catalog cohort, activity, license,
contributors, popularity, repository status, and other observed fields are not
owner-editable.

#### Display name

- Required.
- Trimmed plain text.
- Maximum 100 characters.
- No line breaks or control characters.

#### Summary

- Required.
- Plain text.
- Whitespace is trimmed and internal line breaks are collapsed to spaces.
- Maximum 220 characters.
- A live `current / 220` counter is shown.
- Owner summaries do not have to satisfy the automatic enrichment contract of
  exactly two sentences and 24–36 words.
- Markdown and HTML are treated as text, not rendered authoring syntax.

#### Controlled metadata

- Supported frontends come from the current frontend vocabulary.
- Primary function is exactly one controlled primary-function ID.
- Capabilities come from the controlled capability vocabulary and are unique.
- Preset model families and completion formats come from their controlled
  vocabularies and retain their existing minimum-item requirements.
- The form cannot create new vocabulary entries. An owner who needs a missing
  option uses **Get other help** or explains it in the request context.

#### Explanation

An optional field, maximum 1,000 characters, lets the owner explain the change
or link to supporting public documentation.

#### Enrichment effect

An approved card-details edit writes:

- `metadata_status: "curated"`;
- `enrichment_policy: "manual"`; and
- `enrichment_note: "Owner-authored catalog details approved through issue
  #<number>."`

The whole model-enrichment policy becomes manual because the current schema and
enrichment worker treat summary, primary function, and capabilities as one
editorial unit. Repository observation remains governed separately by
`refresh_policy`; an ordinary card-details edit does not pause GitHub metrics,
activity, license, contributor, or source-health refreshes.

### Update the repository location

This action is for a renamed or transferred instance of the same GitHub
repository, not for replacing the project with unrelated code.

The owner supplies the current public GitHub repository URL. The workflow:

1. loads the catalog record by project ID;
2. fetches the repository by its stored immutable `repository_id`;
3. confirms that the API result's repository ID is unchanged;
4. confirms that the API result's current `full_name` matches the proposed
   location;
5. confirms that the issue author matches the API result's current personal
   owner; and
6. generates the source and snapshot corrections required by existing identity
   contracts.

A different repository ID, organization owner, missing repository, private
repository, or unresolved identity becomes a human-reviewed project report
instead of an automated owner mutation.

A source-location-only change preserves the existing `enrichment_policy` and
`refresh_policy`. If the same request also needs card edits, the owner submits a
separate card-details request so the policy transition remains explicit.

### Delist this project

The owner is not required to justify delisting. The form contains:

- the selected project;
- a required confirmation reading **I am requesting that Tavernary delist this
  project**; and
- an optional public note, maximum 500 characters.

The review page makes clear that delisting:

- removes the project from the public catalog after maintainer approval;
- does not delete repository history, prior issues, or the registry record;
- may affect Kits that contain the project; and
- can require a separate reviewed request to reverse.

An approved delisting changes the canonical record to:

- `visibility: "disabled"`;
- `visibility_reason: "removed"`;
- `refresh_policy: "paused"`;
- `enrichment_policy: "manual"`; and
- an owner-request enrichment note referencing the issue.

The record is retained as a tombstone. Existing Kit validation and publication
rules decide how a disabled project is represented or removed from public Kits;
the owner request does not silently rewrite unrelated Kit authors' records.

### Owner request manifest

The manifest contains:

- schema version;
- request type;
- project ID;
- immutable repository ID;
- source-record fingerprint;
- original relevant values;
- proposed relevant values;
- optional explanation; and
- originating Tavernary page URL.

The original values make the review diff understandable but are not trusted as
current state.

### Owner verification and stale-state safety

The workflow re-reads the current registry record and GitHub repository at
triage time and again immediately before generating writes.

It rejects or pauses when:

- the issue author does not match the current personal repository owner;
- the repository ID changed or is missing;
- the selected project no longer exists;
- the request targets an organization-owned or non-GitHub record;
- the record fingerprint changed in a way that overlaps the request;
- the proposed values no longer validate; or
- the issue body changed after triage.

Case-insensitive login comparison handles GitHub casing without treating
display names, commit authors, email addresses, or profile text as identity.

### Review pull request

An admitted owner request creates a dedicated automation branch and draft or
review-ready pull request, following the existing project-submission PR
patterns. The PR changes only:

- the selected registry record;
- a repository snapshot or identity reference when required by a same-ID source
  move;
- generated catalog output; and
- narrowly required report or workflow state.

The PR description includes the source issue, verified owner login, request
type, before/after values, policy effects, and maintainer checklist. It does not
auto-merge. The source issue links to the PR and closes only through the
approved lifecycle.

## Report a project listing

### Purpose

This path is for anyone reporting inaccurate, outdated, unsafe, abusive,
duplicate, or rights-related information about a listed project. It cannot
claim or exercise repository-owner authority.

The introduction links owners to **Manage your project listing**.

### Project selection

The visitor searches the published catalog. A project-card report link may
deep-link with `?project=<project-id>`.

The form accepts only a catalog project ID. A concern about an unlisted project
belongs in **Get other help**. The manifest adds the canonical source
automatically so the visitor does not have to copy it.

### Categories

The visitor selects one:

- Incorrect or outdated card information
- Repository moved, renamed, archived, or disappeared
- Duplicate or wrong listing
- Unsafe or malicious project
- Abusive or inappropriate content
- Copyright, trademark, or other rights concern
- Something else about this listing

The category is a text-prefillable field in GitHub's fallback form and a
controlled value in Tavernary and workflow validation.

### Conditional guidance

- **Incorrect information** asks what is wrong and what the correct information
  should be.
- **Moved or unavailable** asks for the last known and proposed current source.
- **Duplicate** asks which listing should remain.
- **Unsafe or malicious** asks for the specific behavior and public evidence.
- **Abusive or inappropriate** asks what content or behavior violates the
  catalog's published safety boundaries.
- **Rights concern** asks the reporter's relationship to the affected work and
  the requested review, while warning against publishing private legal or
  personal information.

### Common fields

- Selected project: required.
- Category: required.
- What should Tavernary review?: required, maximum 3,000 characters.
- What outcome are you requesting?: optional, maximum 1,000 characters.
- Public supporting evidence: optional, maximum 2,000 characters.

Evidence guidance mentions repository files, releases, commits, issues, public
documentation, or the other catalog entry in a duplicate report.

### Review and handoff

The review page shows the selected project, category, description, requested
outcome, and evidence exactly as they will be public.

The project-report manifest contains:

- schema version;
- project ID;
- canonical source;
- category;
- report;
- requested outcome; and
- evidence.

Reports receive `project-information`. Duplicate reports also receive
`duplicate-candidate`; unsafe or abusive reports receive `safety-review`; and
rights reports receive `rights-review`. These labels are part of this feature's
required label inventory. Safety categorization raises visibility but does not
automatically hide or remove the project. Maintainers may quarantine a listing
under existing catalog policy after reviewing the evidence.

Selecting a Tavernary vulnerability redirects to the private-security branch.
A third-party project's unsafe behavior remains a project-listing report.

## Report a website problem

### Purpose

This branch covers defects in Tavernary itself. It does not provide support for
software listed in the catalog and does not accept security vulnerabilities.

### Categories

- Search, filter, or sorting problem
- Incorrect page, link, or navigation
- Display, layout, responsive, or theme problem
- Form, submission, or GitHub handoff problem
- Kit Builder or catalog interaction problem
- Accessibility problem
- Performance or loading problem
- Other Tavernary behavior

Feature ideas route to **Get other help**. Security symptoms route to private
security reporting.

### Fields

- Problem category: required.
- Page URL: required and prefilled from a safe `from` query parameter when the
  visitor arrives contextually.
- What happened?: required, maximum 2,000 characters.
- What did you expect?: required, maximum 1,000 characters.
- Steps to reproduce: required, maximum 2,000 characters.
- Browser and version: optional, maximum 120 characters.
- Device and operating system: optional, maximum 120 characters.
- Additional context: optional, maximum 1,000 characters.

The site embeds its deployed source revision and active Tavernary route in the
manifest. V1 does not collect viewport details, browsing history, search text,
local drafts, credentials, or arbitrary browser fingerprinting data.

The form explains that GitHub URL prefilling cannot attach images. After the
handoff, the reporter may drag screenshots or recordings into the GitHub issue
before selecting **Create**.

### Review and handoff

The manifest contains:

- schema version;
- category;
- page URL;
- actual behavior;
- expected behavior;
- reproduction steps;
- browser;
- device;
- additional context; and
- deployed Tavernary revision.

The issue receives `website-bug` and `bug`. Accessibility reports also receive
the required `accessibility` label. The report does not automatically become a
feature request merely because the requested behavior differs from current
behavior; maintainers classify it after review.

## Report a Kit

### Purpose

This branch is for concerns about a published Kit. It is not the Kit author edit
or withdrawal path.

The introduction links Kit authors to:

- edit the Kit in the Kit Builder; or
- use the existing author withdrawal action.

### Kit selection

The visitor can:

- search published Kits by title, author, or Kit ID; or
- arrive from a Kit card or inspector with `?kit=<kit-id>`.

The site supplies the canonical share URL and Kit ID. It does not ask the
visitor to copy both values manually.

### Categories

- Compatibility problem
- Unsafe or malicious included project
- Abusive or inappropriate content
- Broken, removed, or unavailable project
- Misleading title or description
- Duplicate Kit
- Author or attribution concern
- Other Kit concern

### Conditional fields

- Compatibility and broken-project reports can select the affected projects
  from that Kit.
- Unsafe-project reports link to the project-report path when the concern is
  fundamentally about the underlying project rather than the Kit's inclusion
  or presentation.
- Duplicate reports ask for the other Kit.
- Attribution reports ask what author or source information is wrong.

### Common fields

- Selected Kit: required.
- Category: required.
- Affected Kit projects: optional and category-dependent.
- Details: required, maximum 3,000 characters.
- Public supporting evidence: optional, maximum 2,000 characters.

### Review and handoff

The manifest contains:

- schema version;
- Kit ID;
- canonical share URL;
- Kit registry revision or published timestamp;
- category;
- affected project IDs;
- details; and
- evidence.

The issue receives `kit-report`. Duplicate reports also receive
`duplicate-candidate`; unsafe or abusive reports receive `safety-review`.
These category labels match project-report routing. A report does not
automatically withdraw the Kit, alter reactions, change Trending, or penalize
the author. Existing maintainer moderation policy controls any unpublishing or
correction.

## Get other help

### Purpose

This is a deliberate escape hatch, not a blank issue. It handles legitimate
Tavernary questions and requests that do not fit the other branches.

Before showing the form, the page presents routing reminders:

- Submit a project → **Submit Project**
- Create or edit a Kit → **Kit Builder**
- Withdraw your Kit → the published Kit's author controls
- Get help with a listed project → that project's repository or support channel
- Report a vulnerability → **Private security reporting**

### Categories

- Help using Tavernary
- Problem with an existing submission or request
- Suggest a Tavernary improvement
- Documentation or policy question
- Something else

### Fields

- Category: required.
- Subject: required, maximum 120 characters.
- What do you need help with?: required, maximum 3,000 characters.
- Relevant Tavernary issue, pull request, project, Kit, or page URL: optional,
  maximum 500 characters.

For an existing submission or request, the page asks for its GitHub issue or PR
URL. It does not create a parallel project or Kit submission.

The page links to concise user documentation before the form without requiring
the visitor to read documentation before asking for help.

### Review and handoff

The manifest contains:

- schema version;
- category;
- subject;
- description; and
- relevant URL.

The GitHub issue receives `other` and, for questions, `question`. Maintainers
may relabel a feature suggestion as `enhancement`. This path is not admitted to
project or Kit publication automation based on words in its body.

## Report a security vulnerability privately

### Purpose

This branch protects visitors from accidentally publishing a Tavernary
vulnerability. Tavernary's GitHub private vulnerability reporting is enabled.

### Security page content

The page states:

- Use this path for a vulnerability in Tavernary's website, source, workflows,
  automation, or handling of contributor data.
- Do not use a public issue.
- Include the affected URL or workflow, impact, reproduction conditions, and a
  safe proof of concept when possible.
- Do not include active credentials or unrelated personal information.
- A malicious or unsafe third-party project is normally a project-listing
  report, unless disclosing the report publicly would itself create a direct
  Tavernary security risk.

Actions:

- **Open GitHub's private report form** →
  `https://github.com/MentallyQuill/Tavernary/security/advisories/new`
- **Read the security policy** → the repository `SECURITY.md`
- **Report an unsafe listed project instead** → `/help/report-project/`

The Help center does not prefill, proxy, log, or store private vulnerability
content. If GitHub changes or disables the direct private-report URL, the
fallback is the repository Security page, never a public Issue Form.

## Issue Forms and GitHub chooser

The repository keeps structured direct-entry fallbacks for:

- project submission;
- project listing report;
- website bug;
- other help;
- Kit submission/edit;
- Kit report;
- Kit withdrawal; and
- owner listing management.

The public Help hub intentionally shows only its approved paths. GitHub's own
`/issues/new/choose` may still show direct-only templates because they must
remain addressable for contextual links and accessibility fallback.

Issue Form visible fields use the same labels and limits as the Tavernary
builders where GitHub supports them. GitHub schema limitations do not weaken
workflow validation.

All labels named by an Issue Form must exist in the repository. The current
template-specific label inventory will be audited and provisioned rather than
assuming GitHub creates missing labels.

## Automation architecture

### Ordinary Help reports

Project, website, Kit, and other reports require:

- manifest parsing and fallback parsing;
- safe normalization;
- route-specific validation;
- issue label synchronization;
- duplicate/open-issue admission policy where applicable; and
- clear validation feedback.

They do not mutate catalog records or automatically create implementation PRs.

### Owner request routing

A new owner-request label and dispatch route distinguish owner management from
ordinary project reports. Their required names are:

- issue label: `project-owner-request`;
- triage workflow: `triage-project-owner-request.yml`; and
- generation workflow: `generate-project-owner-request.yml`.

The existing label-driven issue admission mechanism will dispatch the new
route without making owner requests look like new project submissions.

### Owner request lifecycle

1. Issue is created from the prefilled owner form.
2. Admission validates route, open-issue policy, and issue shape.
3. Triage parses the manifest, re-reads the record, resolves the immutable
   repository identity, and verifies the issue author.
4. Invalid ownership receives specific feedback and no mutation branch.
5. Valid requests receive `needs-maintainer-review`.
6. Generation creates the narrow review PR and links it to the issue.
7. CI validates schema, policy, generated output, and path classification.
8. A maintainer reviews and merges or declines the PR.
9. Lifecycle automation updates and closes the source issue only after the
   corresponding final state.

Triage and generation recheck authority and current state. A successful earlier
check is not a permanent authorization token.

### Trust boundaries

The following are untrusted:

- every URL parameter;
- every readable Issue Form field;
- every manifest field;
- project names and repository content;
- issue author claims in prose; and
- original values supplied by the browser.

Only current registry data, GitHub's authenticated issue author, GitHub API
repository identity, controlled vocabularies, and schema validation establish
authority.

## Data contracts

### Help manifest envelope

Every Help manifest uses a shared envelope:

- `schema_version`
- `request_kind`
- `origin`
- `payload`

`request_kind` is one of:

- `project-owner`
- `project-report`
- `website-bug`
- `kit-report`
- `other-help`

Each payload is separately normalized and validated. Unknown request kinds,
unknown fields, unsupported enum values, and oversized strings fail closed.

### Registry policy

The existing distinction remains:

- `refresh_policy` controls GitHub repository observation.
- `enrichment_policy` controls model-authored editorial enrichment.

Owner card edits change enrichment policy, not refresh policy. Delisting pauses
both public visibility and refresh. Source-location changes preserve policy
unless another explicit request changes it.

Generated `src/generated/catalog.json` is never edited directly. Owner request
PRs update the canonical registry and rebuild generated output.

## Content, privacy, and safety

- Every public form states that its contents will be public on GitHub.
- Forms warn against secrets, API keys, passwords, private personal
  information, and unpublished exploit details.
- Tavernary does not collect email addresses in Help forms.
- GitHub identity supplies the reply channel.
- No analytics event includes freeform report text.
- No report text is saved in browser persistence.
- User prose is rendered as escaped text in Tavernary review screens.
- Manifests are size-limited before serialization.
- External links use safe URL parsing and supported protocols.
- Reports do not trigger automatic punitive action against projects, Kits, or
  authors.

## Accessibility and responsive behavior

- Help choices are semantic links or buttons with a visible title and
  description.
- The security block is distinguishable by text and structure, not color alone.
- All controls have persistent labels and programmatic descriptions.
- Error summaries receive focus after failed validation.
- Conditional help text is associated with its control.
- Keyboard users can complete, review, revise, cancel, and hand off every form.
- Touch targets meet the existing 44-pixel mobile contract.
- At 320-pixel width, fields do not create horizontal scrolling.
- Review prose and long URLs wrap safely.
- Reduced-motion users receive equivalent state feedback.
- Focus returns predictably when moving back from review to edit.
- The GitHub fallback remains available when JavaScript fails or a visitor
  prefers GitHub's native form.

## Visual direction

The Help center uses Tavernary's production visual language:

- the same narrow reading width and page shell as Submit Project;
- warm page copy and restrained graphite/teal surfaces;
- simple choice cards with one clear action each;
- heritage orange reserved for the principal continuation action;
- no dashboard chrome, support-ticket metaphor, or novelty wizard;
- no dense GitHub terminology on the first screen; and
- a visibly separate, serious private-security notice.

Branch forms use progressive disclosure within one page. They do not use a
multi-modal carousel. A short step indicator is allowed only where there are
real stages: identify, describe, review.

## Contextual entry points

- Header **Help** → `/help/`
- About **Help report form** and **Get help** → `/help/`
- Project report action → `/help/report-project/?project=<id>`
- Kit report action → `/help/report-kit/?kit=<id>`
- Website error or feedback affordance, if later added →
  `/help/report-website/?from=<safe-route>`
- Submit Project remains `/submit/project/`
- Kit author edit and withdrawal remain in Kit surfaces

V1 does not add inline editing controls to every project card. Owner management
starts from the Help center. A later contextual **Manage listing** link may
deep-link to the same builder without creating a second workflow.

## Error handling

### Browser

- Missing catalog selection blocks review.
- Removed or stale deep-linked IDs show a clear selection fallback.
- Invalid query parameters are ignored rather than rendered.
- Over-limit fields retain the user's text and show exact limits.
- Popup blocking or clipboard failure exposes a selectable fallback manifest
  and direct Issue Form link.
- GitHub handoff failure does not claim the request was submitted.

### GitHub workflow

- Malformed manifest: request corrected information.
- Unsupported direct fallback value: identify the exact field.
- Stale owner request: stop before writing and ask the owner to reopen the
  current record in Tavernary.
- Failed owner verification: explain the literal personal-owner requirement.
- Organization-owned project: route to human-reviewed project reporting.
- Repository identity mismatch: quarantine the mutation and preserve the
  existing record.
- Temporary GitHub API failure: mark retryable rather than rejecting authority.
- Deterministic schema or policy failure: do not retry network operations.
- Concurrent issue edit: stop and retriage the latest body.
- Existing automation PR: update only through the established regeneration
  contract; do not create competing branches.

## Migration

1. Add the static Help routes and shared guided-form primitives.
2. Point header and About Help links to `/help/`.
3. Convert existing project-report, website-bug, Kit-report, and Other forms to
   prefillable readable controls plus manifests while preserving direct entry.
4. Route existing contextual Kit report actions through the guided page with a
   selected Kit.
5. Add the owner-management Issue Form, parser, validation, labels, workflows,
   and review-PR lifecycle.
6. Add owner policy transitions and delisting/source-change mutations.
7. Update contributing, operations, About, and security documentation to match
   the new routes and exact eligibility rules.
8. Keep `/issues/new/choose` operational for direct GitHub visitors, but stop
   treating it as Tavernary's Help experience.

Deployment must not leave About promising a Help report form that still opens
the old chooser. Header, About, contextual reports, fallback forms, and
automation ship together or behind links that remain truthful.

## Testing

Implementation will follow test-driven development.

### Help hub tests

- Header and About links point to `/help/`.
- The five ordinary paths appear in approved order.
- Security is separate and never links to a public Issue Form.
- Submit Project and Kit author actions are not duplicated as Help cards.
- Mobile and keyboard navigation reach every choice.

### Shared form and transport tests

- Required fields and character limits are enforced.
- Conditional fields appear for the correct categories.
- Review screens show exactly the public payload.
- Every handoff includes readable fields and the correct manifest.
- Oversized handoffs preserve the complete manifest through fallback.
- No freeform text is persisted locally.
- Malformed manifests do not fall back silently.

### Owner-management tests

- Personal owner login match is case-insensitive.
- Display name is capped at 100 characters.
- Summary accepts owner prose up to 220 characters without automatic
  sentence/word-count rules.
- Summary line breaks normalize to spaces.
- Controlled metadata rejects unknown values.
- Preset-only fields appear and validate only for Presets.
- Owner card edits set curated/manual enrichment fields.
- Owner card edits preserve automatic refresh.
- Same-repository location changes require matching immutable repository ID.
- Different-repository replacements are rejected.
- Delisting retains the record and sets disabled/removed/paused/manual state.
- Organization, collaborator, maintainer, rights-holder, URL-source, missing-ID,
  wrong-owner, and stale-record requests do not generate writes.
- Authority is rechecked immediately before write.
- Generated PRs touch only allowed paths and include before/after review data.

### Project-report tests

- Only listed projects can be selected.
- Owner guidance links to owner management.
- Every category shows its approved guidance.
- Safety categorization does not automatically hide a record.
- Tavernary vulnerabilities redirect to private security reporting.

### Website-report tests

- Feature ideas route to Other Help.
- Security symptoms route privately.
- Safe context prefills page route and deployed revision.
- Search terms, drafts, and credentials are never collected automatically.
- Screenshot guidance correctly defers attachment to GitHub.

### Kit-report tests

- Published Kit selection supplies ID and share URL.
- Contextual Kit links preselect the correct Kit.
- Author editing and withdrawal route to existing Kit controls.
- Affected-project selection is limited to the selected Kit.
- Reports do not alter reactions, Trending, status, or author identity.

### Other-help tests

- Routing reminders lead to existing submission and Kit surfaces.
- Listed-project support directs visitors to the external project.
- Existing-request help accepts issue and PR URLs.
- Other Help cannot trigger project or Kit publication automation.

### Security tests

- The private action uses GitHub's private advisory URL.
- The fallback is the repository Security page, never `/issues/new`.
- No security prose is accepted or serialized by Tavernary.
- The SECURITY policy and Help page agree on the reporting path.

### End-to-end and live verification

- Complete each guided branch through the Tavernary review screen.
- Open each generated GitHub URL without creating an issue and verify every
  visible prefilled value.
- Exercise the clipboard/selectable fallback with an oversized payload.
- Use a real personal-owner fixture to prove successful owner verification.
- Use a non-owner and an organization-owned fixture to prove fail-closed
  behavior.
- Generate an owner card-edit PR in a controlled test issue and confirm the
  registry diff, manual enrichment exclusion, generated catalog, and CI route.
- Confirm an enrichment run cannot overwrite an approved owner summary.
- Confirm an ordinary refresh still updates repository observation for that
  manually enriched record.
- Run the full repository check and static-export verification.

## Rollout and observability

- Ship the Help hub and ordinary guided reports before enabling owner mutations
  if the owner workflow needs a separate review cycle.
- Keep direct fallback forms usable throughout rollout.
- Workflow summaries report request kind, validation result, owner-verification
  result, project or Kit ID, and generated PR URL without echoing sensitive or
  unnecessarily long prose.
- Stable reason codes distinguish malformed input, ineligible source,
  owner mismatch, stale record, repository identity mismatch, retryable API
  failure, and maintainer review.
- No Help workflow logs complete freeform report bodies.

## Success criteria

- The Tavernary Help button opens a useful first-party Help center.
- A visitor can identify the correct path without understanding GitHub labels
  or templates.
- Every ordinary path produces a complete, readable GitHub issue without
  duplicate data entry.
- Security disclosures cannot accidentally become public through the Help UI.
- An eligible personal repository owner can request card corrections, a
  same-repository source update, or delisting.
- Owner-authored summaries remain unchanged across later enrichment runs.
- Repository observation continues for owner-curated cards unless the owner
  requests delisting.
- Maintainers retain a reviewable issue and PR audit trail for every catalog
  mutation.
- Direct GitHub and no-JavaScript fallback paths remain functional.
