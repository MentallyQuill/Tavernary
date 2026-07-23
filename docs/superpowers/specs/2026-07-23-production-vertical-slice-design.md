# Tavernary Production Vertical Slice Design

## Purpose

Build and publish a production-quality Tavernary vertical slice with five real
project cards. The slice must prove the final data boundaries, GitHub
automation, catalog behavior, contribution workflow, responsive interface, and
GitHub Pages deployment. It is not a disposable prototype.

After the slice is live and verified, the same pipeline will expand to the full
214-project launch catalog without redesigning the application.

## V1 Product Boundary

The approved responsive `v7` mockup controls V1 appearance, information
hierarchy, responsive behavior, and interaction behavior. V1 implements only
the information and controls needed to make that mockup functional.

V1 does not include:

- accounts;
- browser-based catalog editing;
- reviews, ratings, comments, or voting;
- internal project-detail pages;
- project-family or port relationships;
- hosted project files;
- automatic installation;
- detailed technical requirement profiles;
- continuous README or repository-description summarization.

Each card represents one independently indexed project or implementation.
Projects with similar names surface naturally through search. Tavernary does
not need to label them as ports, forks, successors, or related versions.

## Catalog and Source Rules

The production launch catalog contains 214 projects:

- the 213 current intake records; and
- SillyTavern as an additional Frontend record.

The four Frontend projects are SillyTavern, Sonder Engine, Lumiverse, and
Marinara Engine.

Every Frontend and Extension must have its own public GitHub repository. System
Presets are the only exception and may link to another stable public source
page.

GitHub projects receive automated metadata and activity refreshes. Non-GitHub
System Presets receive a manually verified snapshot at intake and no ongoing
source monitoring. Once accepted, their curated record is locked against
ordinary submission-based edits. Tavernary curators may quarantine, disable,
or remove a preset when its source becomes unsafe, unavailable, impersonating,
or materially misleading.

The complete 214-project catalog will go live before the owner finishes
record-by-record content review. Tavernary must not claim that all launch
records have been individually reviewed.

## Five-Card Production Slice

The first live deployment contains:

1. SillyTavern — GitHub Frontend
2. Recursion — GitHub Extension
3. SillyTavern Image Gen — GitHub Extension with multiple frontend
   compatibilities
4. Stab's Directives — GitHub System Preset
5. Purrfect Logic 4 Max Mini — non-GitHub System Preset

This set proves every project kind, both source rules, multiple frontend
compatibility, automated activity, and manual preset intake.

All approved catalog controls must work with these five records:

- search;
- desktop and mobile category navigation;
- frontend, project-kind, capability, development, and license filters;
- All, Active, New, and Released views;
- Recent Activity, Activity Strength, Popularity, and Alphabetical sorts;
- standard and compact card density;
- removable active-query chips;
- shareable URL query state;
- mobile filter sheet;
- whole-card external links;
- intentional empty states.

About, Help, and Submit Project must also be production-functional before the
slice is considered complete.

## Data Architecture

Production data has three layers with separate authority.

### Curated Project Records

One human-maintained record per project contains only editorial decisions and
stable source identity:

```json
{
  "schema_version": 1,
  "id": "mentallyquill-recursion",
  "name": "Recursion",
  "kind": "extension",
  "summary": "A concise factual description.",
  "source": {
    "type": "github",
    "repository": "MentallyQuill/Recursion",
    "repository_id": 123456789
  },
  "frontends": ["sillytavern"],
  "primary_function": "generation-reasoning",
  "capabilities": [
    "planning-reasoning",
    "model-routing",
    "review-validation",
    "automation"
  ],
  "cataloged_at": "2026-07-23T00:00:00Z",
  "catalog_cohort": "seed",
  "visibility": "published",
  "refresh_policy": "automatic"
}
```

The GitHub repository ID pins source identity independently of `owner/name`.
Expected repository renames can be followed safely. Transfers or identity
changes trigger curator review.

For a non-GitHub preset, `source` instead contains its public URL and manually
verified publication date, version, artifact size, and license state when
known.

Curated controls are:

- `visibility`: `published`, `quarantined`, or `disabled`;
- `refresh_policy`: `automatic` or `paused`.

Quarantined and disabled projects are excluded from the public build. Pausing
refresh preserves the last successful snapshot and makes no upstream requests.

### Generated GitHub Snapshots

The daily updater owns:

- repository creation date;
- permanent repository identity and current owner/name;
- latest meaningful commit;
- meaningful commit counts across twelve weeks;
- latest release date;
- stars, forks, and subscribers;
- repository size;
- root-license classification;
- refresh time and stale state.

The updater never changes curated names, summaries, kinds, categories,
capabilities, compatibility, canonical-source decisions, visibility, or
moderation state.

### Browser-Ready Catalog

The build joins curated records and generated snapshots into an ignored,
generated browser catalog. It calculates:

- display labels and tooltips;
- normalized search text;
- filter values and counts;
- activity graph bars;
- sort keys;
- relative-time timestamp sources;
- canonical external URLs;
- stale and unavailable presentation states.

Visitors never call GitHub directly.

## Intake Provenance and Editing

The existing `data/catalog/projects.json` remains the historical intake source.
Its submitter, submission date, source-post, candidate status, and original
field shape do not become public project facts.

Production records use `cataloged_at`, meaning the date Tavernary accepted and
published the project. Submitter identity remains in GitHub issue history.

V1 has no browser editor. Curated records are maintained through the repository
workflow, while snapshots remain machine-managed. These boundaries must permit
a controlled editing interface later without granting it direct authority over
automated facts.

## Date Semantics

Dates retain distinct meanings:

- `repository_created_at`: when GitHub says the repository was created;
- `cataloged_at`: when Tavernary accepted and published the project;
- `latest_release_at`: the latest GitHub release;
- `published_at`: the manually verified publication date of a non-GitHub
  preset.

The New view contains projects cataloged during the last 30 days, excluding the
initial `seed` cohort. This prevents the launch import from flooding New and
avoids pretending that repository creation is equivalent to public release.

The Released view contains projects whose latest GitHub release or manually
verified preset publication occurred during the last 30 days.

## Summary Authority and Abuse Prevention

Public summaries are curated Tavernary content. They are not continuously
copied from mutable README files or GitHub repository descriptions.

At submission:

1. the submitter provides a proposed summary;
2. automation may draft or improve a candidate summary from public repository
   material;
3. a curator accepts or edits the candidate;
4. the accepted summary is frozen as curated content.

Later repository-text changes never overwrite the accepted Tavernary summary.
A summary correction requires another reviewed issue.

For the seed catalog, a one-time process may draft missing summaries. Those
drafts are frozen after generation and do not track later README changes. The
launch catalog remains subject to post-launch owner review and correction.

## Daily GitHub Refresh

The production catalog contains 205 GitHub projects and nine non-GitHub System
Presets.

The initial GitHub history scan runs in controlled batches. Later daily runs:

1. make a cheap identity and head check for every published GitHub project with
   automatic refreshing;
2. stop early for unchanged repositories;
3. inspect detailed commits and releases only for changed repositories;
4. validate the resulting snapshots;
5. retain the last successful values when GitHub fails;
6. build, test, and deploy the updated static catalog.

Dormant repositories continue receiving the cheap daily head check. If a new
commit appears, detailed refreshing resumes automatically. Owners do not need
to request reactivation.

A deleted, private, unexpectedly transferred, or identity-mismatched
repository raises an automated source-quarantine condition. The public build
excludes it and preserves its last snapshot without modifying the curated
visibility field. A curator then resolves the source condition, changes the
record's visibility, or disables the project. The updater never silently
rebinds or deletes a record.

## Meaningful Activity

Activity uses twelve rolling seven-day UTC buckets.

Meaningful source activity excludes:

- documentation-only commits;
- lockfile-only commits;
- generated or vendored files;
- formatting-only mechanical rewrites;
- merge-only changes that double-count underlying work.

The six visible graph bars combine adjacent weeks into six two-week periods.
The approved active-week ratio, such as `7/12`, remains the primary visible
summary.

Activity behaviors are:

- **Recent Activity:** newest meaningful commit first;
- **Activity Strength:** sustained meaningful work across twelve weeks;
- **Active:** latest meaningful commit within 30 days;
- **Dormant:** latest meaningful commit more than twelve weeks old.

Activity Strength is an internal, non-normalized sort value. Number the current
week `0` and the oldest week `11`. Each active week contributes
`(12 - week_number) * 100`, and each week contributes an additional
`min(meaningful_commit_count, 5)`. The commit contribution is therefore only a
tie-breaker: even the maximum commit contribution across all twelve weeks
cannot outweigh one additional active week. Large one-time bursts cannot
overpower steady activity. The internal value is never displayed.

Non-GitHub presets remain visible under both activity sorts after GitHub
projects. They order by `cataloged_at`, newest first, with alphabetical order
for ties.

`Dormant` and `stale` are distinct:

- dormant means Tavernary refreshed successfully but found no meaningful
  commit for more than twelve weeks;
- stale means Tavernary could not refresh the data and the stored snapshot may
  be outdated.

## Submission Workflow

Submit Project opens a structured GitHub issue form requiring:

- project name;
- project kind;
- canonical source URL;
- compatible frontends;
- short factual summary;
- suggested primary function and capabilities;
- optional supporting context.

The form enforces a public GitHub repository for Frontends and Extensions and
permits a stable non-GitHub URL only for System Presets.

Automation validates basic eligibility, detects obvious duplicates, and applies
triage labels. It never publishes automatically. A curator accepts the
submission and creates the production record.

Rejected submissions remain closed GitHub issues and never become production
records.

## Help Workflow

Help opens a GitHub issue chooser containing:

1. Report project information
2. Report a website bug
3. Request help
4. Report a security vulnerability
5. Other

Other opens a general form requiring a subject and description. Security
reports route to private reporting instructions instead of creating a public
issue. Public issue flows require a GitHub account, and the site states this
plainly.

## About Page

The About page leads with the distribution boundary:

> Tavernary is a search and discovery catalog for AI roleplay tools. It
> indexes public project information and sends visitors to each creator's own
> GitHub repository or source page. Tavernary does not host, mirror,
> redistribute, or install project files.

The page clarifies that Tavernary stores its own catalog records and generated
public metadata, not project packages. It also covers:

- inclusion rules;
- the GitHub requirement and System Preset exception;
- activity and license methodology;
- the absence of project hosting or endorsement;
- submission, correction, and support links.

## Hosting

The vertical slice first deploys to the repository's standard GitHub Pages
project URL. The static application must support a later move to
`tavernary.org` without component or data restructuring.

The planned canonical domain is `tavernary.org`. `tavernary.net` will redirect
to it through registrar forwarding or a separate minimal redirect host.
GitHub Pages will use only the `.org` custom domain.

## Failure and Moderation Behavior

- Invalid curated records fail the build.
- Invalid project-kind/source combinations fail submission validation.
- Invalid generated snapshots never replace the last successful snapshot.
- Critical generated source-health failures exclude a record without rewriting
  its curator-owned visibility.
- Missing optional facts display as unavailable rather than false.
- Quarantined and disabled records remain in version control but are not
  published.
- Paused records retain their last snapshot without upstream access.
- Categories and filters with no matches show intentional empty states.
- A failed upstream refresh does not block deployment of otherwise valid
  last-known data.

## Verification

The vertical slice requires:

- schema and cross-record validation;
- source-rule tests;
- repository-identity and transfer fixtures;
- activity calculation and exclusion fixtures;
- dormant, stale, recovery, and quarantine tests;
- search, filter, view, sort, and URL-state tests;
- stable ordering for ties and projects without activity;
- keyboard and reduced-motion checks;
- desktop, tablet, and mobile browser tests;
- visual comparison against the approved `v7` mockup;
- static-export and GitHub Pages base-path checks;
- validation of About, Help, and Submit Project links;
- manual daily-refresh dispatch;
- deployed-site smoke tests;
- verification that all five cards open their canonical external sources.

## Delivery Sequence

1. Preserve the approved mockup and assets as tracked references.
2. Scaffold the static Next.js application and GitHub Pages configuration.
3. Define the lean schemas and five real curated records.
4. Implement GitHub enrichment, activity, dormant, stale, and moderation
   behavior.
5. Generate the browser-ready catalog.
6. Reproduce every approved mockup interaction with real data.
7. Add About, Help, submission forms, and intentional empty states.
8. Add CI, daily refresh, deployment, and live smoke checks.
9. Publish and verify the GitHub Pages slice on desktop and mobile.
10. Expand the proven pipeline to all 214 records.

The vertical slice is complete only when every automated check passes, the
daily refresh is proven, all contribution and support flows work, and the
five-card application is publicly reachable.
