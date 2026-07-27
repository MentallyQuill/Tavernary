# Fork Relationship Discovery Design

**Date:** 2026-07-27
**Status:** Approved for implementation planning

## 1. Summary

Tavernary will identify the immediate GitHub parent of every cataloged fork,
publish the parent before a newly submitted child when possible, and expose a
focused two-card comparison between the parent and child.

Fork discovery is directional and local. A fork card may point one step
upstream. Parent cards do not list children, and Tavernary will not provide a
fork-family or repository-network view.

The relationship remains valid when an upstream is not publicly listed.
Delisting removes the upstream card and all public links to it, but the child
may retain the upstream's display name as provenance.

## 2. Goals

- Make it apparent when a cataloged project is a GitHub fork.
- Let a visitor compare a fork with its immediate upstream using existing
  project cards and maintenance signals.
- Add missing upstreams through the normal review process before publishing a
  newly submitted child.
- Support forks of forks by resolving and reviewing the chain from the oldest
  missing ancestor back down to the submitted child.
- Preserve child records when an upstream is delisted, rejected, deleted,
  private, or otherwise unavailable.
- Keep the feature static-first and compatible with Tavernary's generated
  catalog and GitHub Pages deployment.

## 3. Non-goals

- Listing a project's child forks.
- Providing a fork-family, tree, graph, or network view.
- Showing siblings in the relationship view.
- Adding a "view forks" action to an upstream card.
- Automatically publishing an upstream without maintainer review.
- Comparing source diffs or claiming which fork has more features.
- Deep commit-ancestry or branch-history analysis.
- Turning GitHub's numeric fork count into a catalog relationship count.

## 4. Existing State

Repository snapshots already persist an optional `repository.fork` fact.
Fork-aware contributor collection uses that fact to avoid attributing inherited
upstream contributors to the child. The generated browser catalog does not
currently retain the fork fact or GitHub's parent identity.

GitHub repository metadata provides:

- the immediate `parent` repository;
- the root `source` repository;
- stable numeric repository IDs.

This feature uses the immediate parent. The root source is not substituted for
the parent because doing so would skip meaningful fork-of-fork relationships.

## 5. Relationship Data

### 5.1 Snapshot observation

For a fork, the generated GitHub snapshot records an immediate-parent
observation:

```json
{
  "fork": true,
  "parent": {
    "repository_id": 123456,
    "name": "VectHare",
    "repository": "Coneja-Chibi/VectHare"
  }
}
```

The exact field names may be adjusted during implementation to match existing
schema conventions, but the contract is:

- `repository_id` is the stable identity;
- `name` is the last successfully observed display name;
- `repository` supports refresh and matching inside the private build-time data
  pipeline;
- the relationship represents exactly one immediate parent.

The parent URL is not required in browser-ready relationship data. Build-time
code may derive or use the repository coordinate while observing and matching
records.

### 5.2 Catalog resolution

During catalog generation, Tavernary matches the observed parent repository ID
against registry records.

The public child relationship has one of these states:

- `published`: the immediate parent resolves to a published catalog project;
- `not-listed`: the parent is known but is not publicly listed;
- `unavailable`: GitHub no longer exposes enough current information, so
  Tavernary retains only safe last-known provenance.

For a published relationship, browser-ready data includes the parent project ID
and display name. For a non-published relationship, browser-ready data includes
only the display name and non-interactive status required by the card.

Published relationships use the parent catalog record's project name.
Non-published relationships use the last public Tavernary project name when one
exists, otherwise the last successfully observed GitHub repository name. This
display fallback never restores a removed URL or interactive catalog identity.

The browser-ready catalog must not include a repository URL, source coordinate,
or navigable project ID for a delisted parent.

### 5.3 Referential independence

The child's validity never depends on a public parent card. The relationship is
an observed repository fact with an optional catalog resolution, not a required
foreign key to another published project.

Removing or disabling the parent therefore:

1. removes its public card;
2. removes the relationship action from the child;
3. retains the upstream display name on the child;
4. leaves the child published and otherwise unchanged.

If the same repository is later relisted, its stable repository ID reconnects
the relationship automatically.

## 6. Submission and Review

### 6.1 Ancestor-first submission

When a submitted GitHub repository is a fork, submission processing resolves
its immediate parent before generating the child's review PR.

For each parent:

1. If it is already published, continue with the child.
2. If it has an active submission or review, attach the waiting child to that
   state and wait.
3. If it is known as deliberately delisted, rejected, or ineligible, do not
   resubmit it; continue with the child using a non-listed relationship.
4. If it is unknown, create an upstream submission and place it into the normal
   maintainer review flow.
5. If it is itself a fork, resolve its parent using the same rules before
   generating its review PR.

This produces root-to-leaf publication without publishing any ancestor
automatically.

### 6.2 Waiting and resumption

Maintainer review is asynchronous, so the original child workflow must not wait
inside one GitHub Actions job. The submission lifecycle persists:

- the originally requested repository;
- the ordered immediate-parent chain;
- the current node under review;
- the outcome of each reviewed node;
- enough identity to resume idempotently.

When an ancestor review completes, the lifecycle resumes at the next descendant.
The process finishes when the submitted child receives its own review PR or is
rejected by the existing admission rules.

Repeated workflow delivery, issue edits, and manual reruns must not create
duplicate issues, branches, or PRs for the same repository identity.

### 6.3 Review outcomes

An approved and merged ancestor becomes the published parent resolution.

A rejected, ineligible, deliberately delisted, deleted, or private ancestor
does not permanently block the child. The child proceeds after the ancestor's
review state reaches a terminal outcome and exposes only the permitted
non-listed provenance.

An unresolved active review does block descendants so that Tavernary does not
create child PRs with unstable parent references.

### 6.4 Existing catalog backfill

A one-time backfill observes the immediate parent of every existing automatic
GitHub record whose snapshot says it is a fork.

For an existing published child:

- a published parent resolves immediately;
- an unknown parent enters the same ancestor-first submission and review flow;
- the existing child remains published while upstream review is pending;
- a terminal non-published parent outcome leaves the child published with
  non-interactive provenance;
- rerunning the backfill does not duplicate upstream submissions.

Backfill work is bounded to known catalog forks. It does not enumerate every
child in a GitHub fork network.

### 6.5 Safety bounds

Chain discovery uses GitHub's repository metadata, not commit ancestry.
Processing must:

- track visited numeric repository IDs and reject cycles;
- stop automatic traversal after 16 immediate-parent hops and request
  maintainer attention rather than flattening or guessing the remaining chain;
- stop cleanly when GitHub does not expose a parent;
- preserve the original child submission when an ancestor lookup fails
  transiently;
- avoid resubmitting a repository with a known terminal catalog decision.

## 7. Project Card

A fork card adds one compact relationship line.

When its immediate parent is published:

> Fork of **VectHare** · View relationship

When its immediate parent is not publicly listed:

> Fork of **VectHare** · Upstream not listed

The published parent name and `View relationship` action open Tavernary's
relationship scope. They do not open GitHub directly.

For a delisted or otherwise non-listed parent:

- the parent name is plain text;
- no link or relationship action is rendered;
- no GitHub URL is exposed;
- the wording does not imply that Tavernary currently catalogs the upstream.

Parent cards never gain a list or count of cataloged children. The existing
community fork count remains a GitHub repository metric only.

## 8. Relationship Scope

### 8.1 Result set

The relationship scope shows exactly two published cards:

1. immediate parent on the left;
2. selected child on the right.

On narrow screens, the parent appears first and the child second.

There are no extra headings, role labels, connecting lines, explanatory
banners, family controls, or special card decorations. The child's relationship
line supplies the semantic explanation.

The pair uses two equal columns with a bounded width so that it does not appear
as an incomplete three-column catalog row.

### 8.2 Active filter

The scope appears in the existing removable active-filter area:

> Fork: VectHare → VectFox ×

The relationship token is the only additional surrounding UI. The toolbar's
ordinary result count reports two projects.

The relationship query is addressable by URL using the child project identity.
The parent is derived from generated catalog data rather than duplicated in the
URL.

### 8.3 Existing query state

Activating `View relationship` preserves the current search, filters, sort, and
density in the URL or equivalent query state. While the relationship parameter
is active:

- the relationship pair determines the result set;
- ordinary filtering controls are suspended;
- the active-query area displays the relationship token instead of misleading
  suspended filter tokens;
- sort does not reverse the required parent-left, child-right order;
- density continues to control the normal card presentation.

Removing the relationship token restores the preserved catalog query exactly.
Browser Back has the same result.

`Clear all` and the filter panel's `Clear filters` remove the relationship
parameter and every preserved filter, returning to Tavernary's default catalog
query.

A directly opened or shared relationship URL has no separate local history
contract. Removing only its relationship token reveals any ordinary query
parameters present in that URL; clearing all returns to the default catalog.

### 8.4 Climbing a chain

If the displayed parent is also a fork with a published immediate parent, its
normal card relationship line offers `View relationship`.

Activating it replaces the current pair:

```text
grandparent | parent
```

The former child is no longer shown. Visitors climb the chain one immediate
relationship at a time. Browser history permits returning to the prior pair.

## 9. Delisting and Stale URLs

Delisting is a public-site contract, not merely a card-layout change.
Tavernary must not preserve a public route, relationship action, or GitHub link
that functions as an alternate listing for the removed project.

If a previously shareable relationship URL loses its published parent:

- it must not render the delisted parent card;
- it must not expose the parent's GitHub URL;
- the invalid relationship scope is removed during query normalization;
- the visitor falls back to the ordinary catalog query represented by the
  remaining URL parameters.

The child card may continue to say `Fork of <name> · Upstream not listed`.

## 10. Accessibility

- `View relationship` is a native button or link with an accessible name that
  identifies both projects.
- The relationship token's removal control announces the complete token label.
- DOM order is parent then child, matching desktop and mobile reading order.
- Focus moves to the relationship results or their heading-equivalent region
  after activation without creating a modal focus trap.
- Removing or clearing the scope returns focus to a sensible catalog control.
- The arrow in the visible token is supplemented by accessible text such as
  `<child> is a fork of <parent>`.

## 11. Failure Handling

- A non-fork continues through the existing submission and refresh paths.
- A missing parent observation produces no interactive relationship.
- A transient GitHub failure retains the last successful relationship
  observation and marks it stale internally rather than inventing a new parent.
- A repository transfer or rename reconnects by numeric repository ID.
- A parent identity collision or mismatch fails validation rather than linking
  the wrong cards.
- A relationship whose parent and child kinds are unexpectedly different is
  allowed as factual provenance but receives explicit fixture coverage.
- A fork cannot resolve to itself.

## 12. Validation and Testing

### Data and build tests

- Snapshot schema accepts an immediate parent only for fork observations.
- Parent repository IDs and identities validate.
- Generated catalog resolves published parents by repository ID.
- Delisted parents emit a name and status but no URL or public project ID.
- Missing, stale, renamed, transferred, and unavailable parents behave
  deterministically.
- Cycles, self-links, and unsafe chain depths fail safely.

### Submission tests

- A submitted fork with a published parent proceeds directly to child review.
- A missing parent is submitted and reviewed before the child.
- A fork-of-a-fork chain resumes in root-to-leaf order.
- An already pending parent is reused rather than duplicated.
- Approved, rejected, delisted, unavailable, and transient-failure outcomes
  resume correctly.
- Reruns and duplicate events remain idempotent.

### UI tests

- Published fork cards render `View relationship`.
- Non-listed upstreams render a name without any link or action.
- Relationship scope shows exactly two cards in parent-child order.
- Mobile DOM and visual order remain parent-child.
- No parent card exposes child discovery.
- Removing the relationship token restores the prior query.
- `Clear all` and `Clear filters` remove both the relationship and preserved
  filters.
- A parent that is itself a fork permits one-hop upward navigation.
- A stale relationship URL cannot expose a delisted parent.
- Keyboard focus and accessible labels describe the direction correctly.

## 13. Acceptance Criteria

The feature is complete when:

1. Tavernary observes and validates each fork's immediate GitHub parent.
2. Missing ancestors enter normal review before a submitted descendant.
3. The lifecycle waits and resumes without duplicate submissions.
4. A published fork card identifies its immediate upstream.
5. `View relationship` shows exactly the parent on the left and child on the
   right using normal cards.
6. The relationship is represented by one removable active-filter token.
7. Removing that token restores prior query state, while clearing all removes
   every scope and filter.
8. A forked parent supports another one-hop upward relationship view.
9. Parent cards never expose children or a fork-family control.
10. Delisting removes the parent card and every public link while preserving
    the child's non-interactive upstream name.
11. Repository transfers, missing parents, stale URLs, and terminal review
    outcomes do not break the child project.
