# Project Submission Automation Design

**Status:** Approved

**Goal:** Turn a submitted project issue into one complete, reviewable pull
request without making maintainers separately approve the issue or manually
assemble the catalog record.

## Product Boundary

The GitHub issue is the public intake record. The generated pull request is the
only maintainer review surface.

Tavernary remains static and build-time:

- no Tavernary accounts;
- no runtime database or API;
- no hosted project files;
- no arbitrary submitted code execution;
- GitHub Issues, Actions, pull requests, and Pages remain the operating
  platform.

Merging the generated pull request publishes the project through the existing
catalog build and Pages deployment. Closing it without merging declines the
submission.

## Primary User Flow

1. A contributor chooses **Submit Project** on Tavernary.
2. Tavernary's static submission builder collects conditional project data and
   opens a structured GitHub issue.
3. Issue automation normalizes the source, updates the issue title, validates
   admission, checks duplicates, and inspects the source.
4. A duplicate is labeled and closed before a pull request is created.
5. A correctable failure remains open with `needs-information` and an exact
   explanation.
6. An admitted submission creates or updates one deterministic branch and one
   review pull request.
7. The maintainer reviews and may edit the proposed catalog changes directly in
   the pull request.
8. Merging the pull request closes the linked issue and publishes through the
   normal deployment path.
9. Closing the pull request unmerged declines and closes the issue and safely
   removes the generated branch.

There is no separate issue-approval action.

## Submission Builder

GitHub Issue Forms have static fields and static dropdown options. They cannot
conditionally reveal fields or populate frontend choices from Tavernary's
catalog. The primary experience is therefore a static Tavernary submission
builder, following the existing Kit-builder pattern.

The builder reads the generated frontend catalog and changes its fields by
project type.

### Shared Fields

- **Project Type:** required; Frontend, Extension, or System Preset.
- **Project URL:** required.
- **Project Name:** optional for GitHub sources and required for external
  System Presets.
- **Short Description:** optional for GitHub sources and required for external
  System Presets.
- **Additional Context:** optional.

### Frontend

A Frontend does not receive a compatibility question. Automation proposes its
frontend vocabulary entry in the generated pull request.

### Extension

An Extension requires one or more supported frontends. The builder uses a
searchable multi-select populated from Tavernary's current frontend catalog.

### System Preset

A System Preset uses the same searchable frontend selector and may instead be
marked explicitly frontend-independent.

### Unknown Frontends

Extensions and Presets may select **Other or not listed** and provide a frontend
name and URL.

Normalization attempts, in order:

1. exact frontend ID or label match, case-insensitively;
2. controlled alias match;
3. canonical frontend repository URL match;
4. a unique close-match suggestion for a likely misspelling.

Automation never silently chooses between ambiguous matches. A genuinely
unknown frontend leaves the issue open with `needs-information` and asks for
the frontend to be submitted first. Once that frontend is merged, editing or
rerunning the original issue resolves against the updated catalog.

Adding a Frontend project automatically proposes its vocabulary entry, so the
submission builder does not require a separately maintained hard-coded
dropdown.

### GitHub Fallback Form

The native GitHub Issue Form remains as an accessible fallback. It uses
free-text supported-frontend input rather than a static dropdown. The Tavernary
builder embeds a stable submission manifest; the fallback form's readable
headings are converted into that same internal contract before normalization
and validation.

The issue body retains readable headings in addition to the machine-readable
manifest.

## Submitted, Observed, and Inferred Data

Submitters provide facts they are especially qualified to know:

- intended project kind;
- source URL;
- supported frontends;
- preferred project name;
- proposed short description;
- useful context.

Submitters do not choose Tavernary's controlled `primary_function`, capability
IDs, metadata status, license status, repository identity, visibility, refresh
policy, or enrichment policy.

For a GitHub-backed source, automation observes:

- permanent repository ID;
- canonical owner and repository name;
- redirects and repository transfers;
- repository description and prepared README content;
- repository topics and basic source structure;
- license, release, activity, size, and contributor facts.

Automation may infer:

- normalized display name;
- source-grounded summary;
- one controlled primary function;
- controlled capabilities;
- normalized frontend IDs.

The pull request distinguishes four categories:

- **Submitted:** contributor claims.
- **Observed:** facts fetched directly from the source.
- **Inferred:** proposed editorial fields and controlled classifications.
- **Warnings:** archived state, missing license, weak source material,
  ambiguous naming, redirects, and other maintainer considerations.

Submitted copy is evidence, not automatic truth. A maintainer may correct every
proposed field in the pull request.

External URL System Presets remain manually curated. Automation verifies the
source identity, frontend compatibility, duplicates, basic public metadata, and
schema shape, but does not crawl arbitrary pages or perform automatic model
enrichment. Their submitted name and description seed the proposed record.

## Source Eligibility

- Frontends and Extensions require a public GitHub repository.
- System Presets may use a public GitHub repository or another stable public
  HTTPS URL.
- Missing, pending, proprietary, or non-OSI licensing is evidence, not an
  automatic rejection.
- Low popularity or weak activity is evidence, not an admission gate.
- Archived public repositories may reach review with a prominent warning.
- Editorial suitability, taste, safety, and presentation remain human
  decisions in the pull request.

## Shared Source Identity

One source-identity component owns title generation, validation, duplicate
detection, canonical registry identity, branch naming inputs, and source
inspection routing.

### GitHub

GitHub URLs normalize to canonical `owner/repository` identity after safe API
resolution. Duplicate checks use both normalized repository name and permanent
GitHub repository ID. Repository casing, `.git`, trailing slashes, expected
redirects, and renames do not create duplicate cards.

Generated issue title:

```text
[Project submission] owner/repository
```

### Generic External URLs

Generic external identities normalize HTTPS scheme, host casing, default
ports, path syntax, fragments, and trailing-slash policy without discarding
identity-bearing query data indiscriminately.

Generated issue title:

```text
[Project submission] hostname/path-slug
```

### Reddit

The following hosts normalize into one Reddit identity family:

- `reddit.com`;
- `www.reddit.com`;
- `old.reddit.com`;
- `new.reddit.com`;
- `m.reddit.com`;
- `redd.it`.

Duplicate identity uses the stable Reddit post ID. The subreddit and readable
URL slug are presentation data only.

Generated issue title:

```text
[Project submission] r/Subreddit: Humanized Post Slug
```

Reddit `/r/Subreddit/s/...` share links use best-effort redirect resolution:

- only recognized Reddit hosts may participate;
- redirects and total duration are tightly bounded;
- leaving the trusted host set is rejected;
- a successfully resolved canonical post supplies the stable post ID;
- a failed resolution produces `needs-information`;
- an unresolved share link never creates a review pull request.

## Issue Title Ownership

Title generation runs during issue triage and remains idempotent.

Automation may update:

- the untouched generic `[Project submission]` title; or
- a title marked as previously generated by Tavernary.

Automation preserves a title manually customized by a maintainer. Editing the
URL updates an automation-owned title but never overwrites a maintainer-owned
one. The stable triage comment records the last generated title, so ownership
does not depend on guessing from title syntax.

## Admission Outcomes

### Duplicate

Automation closes the issue before pull-request generation when source identity
matches an existing project by:

- canonical source URL;
- canonical GitHub `owner/repository`;
- permanent GitHub repository ID; or
- stable Reddit post ID.

It applies `duplicate-candidate`, comments with the existing project, and closes
the issue with the appropriate GitHub reason.

### Correctable Failure

Automation applies `needs-information` and leaves the issue open for:

- malformed or non-HTTPS input;
- a definitively nonexistent source;
- private, deleted, or nonexistent repository;
- unsupported project-kind/source combination;
- missing or ambiguous frontend selection;
- unresolved Reddit share link;
- missing required external-preset name or description;
- another objective defect the submitter can correct.

Editing the issue reruns triage.

Temporary network or API failures apply `submission-retryable`, leave the issue
open, and do not reject the submission.

### Admitted

An admitted issue receives `needs-maintainer-review` and creates or updates its
one generated review pull request.

## Generated Pull Request

Each issue owns a deterministic branch such as:

```text
automation/project-submission-123
```

The pull request targets `main` and contains:

- `Closes #123`;
- the canonical project record under `data/registry/projects/`;
- the initial tracked GitHub snapshot when applicable;
- a proposed frontend vocabulary update for a new Frontend;
- the admission report and maintainer checklist in the pull-request body.

The pull request does not commit `src/generated/catalog.json`. That file remains
generated and ignored. CI rebuilds it from the proposed canonical data and
thereby proves the visible card.

The admission report is retained in the pull-request body, workflow summary,
and downloadable workflow artifact, not as permanent public catalog data.

## Idempotence and Maintainer Corrections

An issue owns at most one open generated pull request. Reruns reuse its branch
and pull request.

Before a pull request exists, issue edits may regenerate the proposal
automatically. After the pull request exists, it is authoritative; later issue
edits do not silently overwrite maintainer corrections.

A manual recovery workflow accepts the issue number and an optional
`force_regeneration` input that defaults to false.

On regeneration:

- an untouched generated branch updates normally;
- a branch containing maintainer changes is not overwritten;
- the workflow reports the conflicting proposal and requests maintainer action;
- force regeneration is explicit and limited to generated submission files.

Automation never force-pushes over maintainer work.

## Merge and Decline Behavior

Merging the pull request:

- closes the source issue through `Closes #<number>`;
- publishes the registry change through the normal `main` Pages workflow;
- leaves ordinary Git history as the publication audit trail.

Closing the pull request without merging:

- applies `submission-declined`;
- removes active-review labels;
- comments on the issue with the declined pull request;
- closes the issue as not planned;
- deletes the generated branch when safe.

Editorial rejection is not encoded as an automated content judgment. It is the
meaning of a maintainer intentionally closing the review pull request.

## Workflow and Token Model

The issue-driven workflow uses focused Node modules for behavior and GitHub
Actions only for orchestration.

Required workflow permissions are narrowly declared:

- `contents: write`;
- `issues: write`;
- `pull-requests: write`;
- `actions: write` only where CI dispatch requires it.

The repository must allow GitHub Actions to create pull requests.

Because pull requests created with the standard `GITHUB_TOKEN` can leave
pull-request-triggered workflows awaiting manual approval, the generation
workflow explicitly dispatches CI against the generated branch. No personal
access token, GitHub App, or maintainer bot credential is required.

Merge-to-`main` continues to trigger the existing Pages deployment.

## Components

The implementation keeps these responsibilities isolated:

1. **Submission builder** — conditional fields and manifest creation.
2. **Manifest parser** — one contract for Tavernary and GitHub fallback forms.
3. **Source identity** — normalization, safe redirects, titles, and duplicate
   keys.
4. **Admission validator** — eligibility and correctable error classification.
5. **Source inspector** — bounded GitHub and external-source observations.
6. **Record drafter** — canonical record, initial snapshot, and frontend
   vocabulary proposal.
7. **PR manager** — deterministic branches, pull requests, issue linkage,
   regeneration safety, and cleanup.
8. **Workflow orchestration** — issue events, recovery dispatch, CI dispatch,
   merge publication, and declined-submission handling.

Each component exposes a small data contract and remains independently unit
testable.

## Security

- Issue text, submitted URLs, external pages, repository descriptions, topics,
  and README content are untrusted data.
- Submitted repositories are never cloned or executed.
- GitHub facts and README content are fetched through bounded APIs.
- External URL checks accept HTTPS only and reject credentials, unusual ports,
  IP literals, private or reserved destinations, excessive redirects,
  oversized responses, and timeouts.
- DNS and redirect destinations are revalidated at each network boundary.
- Reddit redirect resolution remains within the trusted Reddit host set.
- Untrusted source text is never interpolated into shell commands.
- Model enrichment has no tools or write authority and treats source content as
  reference data, not instructions.
- Model output must pass the controlled JSON schema and vocabularies before it
  can become a proposal.
- Provider unavailability produces a deterministic provisional fallback and a
  pull-request warning; it does not silently invent metadata or prevent human
  review.
- Secrets are never exposed to submitted code, pull-request code, or arbitrary
  URLs.

## Concurrency and Recovery

- Workflow concurrency is keyed by submission issue number.
- Repeated issue edits cancel or supersede stale pre-PR work safely.
- Partial branches without pull requests are reused.
- Duplicate pull requests are prevented by deterministic issue identity.
- Network failures preserve the issue for retry.
- Deterministic admission failures produce stable labels and comments.
- Conflicts with newer `main` are surfaced in the pull request.
- Generated comments use stable markers and are updated instead of duplicated.

## Verification

### Unit Coverage

- GitHub URL normalization, redirects, casing, `.git`, and repository IDs.
- Generic HTTPS canonicalization.
- Every approved Reddit hostname, `redd.it`, post-ID identity, and `/s/`
  redirect outcome.
- Duplicate detection across URL, repository name, repository ID, and Reddit
  post ID.
- Generated-title idempotence and maintainer-title preservation.
- Every project-type and frontend-field combination.
- Alias, misspelling, ambiguity, and unknown-frontend handling.
- External URL safety restrictions.
- Record and snapshot drafting.
- Branch and pull-request reuse.
- Regeneration conflict detection.
- Merge, decline, issue-label, issue-close, and branch-cleanup decisions.

### Integration Coverage

- Mocked GitHub API admission and source inspection.
- Duplicate and correctable-failure issue synchronization.
- End-to-end issue manifest to proposed repository files.
- Workflow syntax, permissions, pinned actions, concurrency, and CI dispatch.
- Catalog validation and generated-card build from a proposed record.

### Browser Coverage

- Conditional submission-builder fields.
- Searchable multi-frontend selection.
- Other/not-listed and frontend-independent paths.
- Accessible keyboard, screen-reader, mobile, and responsive behavior.
- Correct GitHub issue handoff with a stable manifest.

### Completion Gate

Before completion is claimed:

1. focused unit and integration tests pass;
2. `npm run check` passes;
3. browser and visual tests pass;
4. one controlled live GitHub issue reaches a generated review pull request;
5. the pull request is corrected if necessary and merged;
6. the source issue closes automatically;
7. the published Tavernary card is verified on Pages;
8. one controlled declined pull request proves issue and branch cleanup.

## Out of Scope

- Tavernary accounts or a runtime administration backend.
- Automatically publishing without maintainer pull-request review.
- Executing or installing submitted projects.
- Crawling arbitrary external preset pages for editorial enrichment.
- Automatically approving content suitability, taste, or safety.
- Publishing an Extension or Preset against an unknown frontend identity.
- Replacing GitHub Issues as the public submission record.
