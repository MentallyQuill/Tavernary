# Tavernary Kits

**Date:** 2026-07-24
**Status:** Approved

## Purpose

Add community-authored **Kits** to Tavernary. A Kit is a named, ordered
combination of catalog projects that a community member believes work well
together.

The project catalog answers, “What projects exist?” Kits answer, “What set of
projects should I consider using together?”

Tavernary remains a static GitHub Pages application. It does not add Tavernary
accounts, a runtime database, private drafts, or a private authentication
service. GitHub supplies public contributor identity, submission history,
manual-review discussion, reports, and community reactions.

## V1 Decisions

1. A Kit contains a title, a description of no more than 100 words, and an
   ordered list of canonical Tavernary project IDs.
2. A Kit contains between 3 and 50 unique projects. It must contain exactly
   one Frontend, pinned first, and at least two non-Frontend projects.
3. Component order is presentation order only. Components do not have
   Required, Recommended, or Optional roles.
4. Purpose and frontend support are derived from the selected projects rather
   than entered as separate author fields.
5. Every new Kit and every Kit edit requires automated validation and manual
   repository-maintainer approval.
6. The currently published Kit stays unchanged while an edit is pending.
7. GitHub’s durable numeric user ID establishes authorship and edit or
   withdrawal authority. The current GitHub login is the public author name.
8. There are no private or locally persisted Kits. Submitting to GitHub is the
   only durable save operation.
9. GitHub `+1` reactions provide community support. The default sort is a
   time-decayed Trending score rather than lifetime popularity.
10. A removed or quarantined project remains visible as a disabled row inside
    existing Kits; it does not automatically hide the entire Kit.
11. There is no separate trusted moderation role or account-age publication
    bypass in V1.
12. Tavernary maintainers use ordinary GitHub repository permissions and
    workflows. The public site does not implement moderator accounts or an
    administrative dashboard.

## Terminology

- **Kit:** an approved community-authored combination of catalog projects.
- **Project stack:** the Kit’s ordered project IDs.
- **Kit author:** the GitHub user who submitted the original Kit.
- **Pending revision:** an author-submitted edit that has not replaced the
  approved public version.
- **Community support:** the number of currently effective GitHub `+1`
  supporters.
- **Trending:** the default ranking produced by decaying each effective
  supporter’s weight over time.
- **Tavernary Pick:** a maintainer-controlled editorial badge and filter.
- **Flagged project:** a project that is quarantined, disabled, removed, or
  otherwise unsafe to link from the public catalog.
- **Withdrawal:** author-requested removal of a Kit from public discovery while
  retaining an immutable tombstone and history.

The feature is called **Kits**, not Sets.

## Scope

### Included

- an integrated Kits mode on the existing homepage;
- compact Kit cards;
- a persistent, collapsible right-side Kit Builder on desktop and tablet;
- locked Kit inspection and one-project-at-a-time expansion;
- an in-site builder for new, duplicated, and edited Kits;
- pointer reordering plus keyboard and touch alternatives;
- GitHub issue-form submission, revision, reporting, and withdrawal flows;
- manual approval for all new Kits and edits;
- Kit-specific search, filters, and sorts;
- GitHub-backed author identity and `+1` support;
- time-decayed Trending;
- Tavernary Picks;
- stable Kit share URLs and a Copy link action;
- cautions and disabled component links when projects become unavailable;
- ODbL and DbCL contribution acknowledgement.

### Excluded

- Tavernary accounts, sessions, OAuth, or private authentication;
- private Kits or browser-persisted drafts;
- draft export or import;
- automatic installation or downloadable bundles;
- copied or mirrored project files;
- required/recommended/optional component roles;
- setup instructions, per-component rationale, alternatives, or variants;
- separate author-entered purpose, scope, frontend, or tag fields;
- star ratings, downvotes, or Tavernary-hosted comments;
- automatic publication based on account age or repository access;
- ownership transfer;
- separate trusted moderation roles or a frontend moderation dashboard;
- a separate Kits landing page;
- social-sharing dialogs.

## Homepage Integration

Kits use the existing catalog page. The category bar gains a **Kits** control
immediately to the left of **All Projects**:

```text
[Kits] [All Projects] [Frontends] [System Presets] [Memory & Retrieval] ...
```

Kits is a catalog mode, not another project kind.

### Mode Changes

- The default homepage remains All Projects.
- Selecting Kits hides every project card and displays only Kit cards.
- Selecting All Projects or any project category exits Kits mode and hides
  every Kit card.
- Project filters are replaced by Kit filters in Kits mode.
- Search text and project-card density survive mode changes.
- Incompatible filters clear when changing modes.
- The Kit Builder and its in-memory draft survive mode changes until the page
  is refreshed or closed.
- Browser history and share links reproduce the active mode, Kit selection,
  search, and active mode-specific filters.

The mode seam should remain explicit instead of overloading project categories:

```ts
export type CatalogMode = "projects" | "kits";
export type KitSort = "trending" | "newest" | "updated" | "alphabetical";

export interface KitQuery {
  frontends: string[];
  purposes: string[];
  includesProjectId: string;
  minProjects: number;
  maxProjects: number;
  tavernaryPickOnly: boolean;
  sort: KitSort;
}

export interface BrowseQuery {
  mode: CatalogMode;
  search: string;
  density: "standard" | "compact";
  selectedKitId: string;
  projects: CatalogQuery;
  kits: KitQuery;
}

export const DEFAULT_KIT_QUERY: KitQuery = {
  frontends: [],
  purposes: [],
  includesProjectId: "",
  minProjects: 3,
  maxProjects: 50,
  tavernaryPickOnly: false,
  sort: "trending",
};
```

The existing project query contract may be nested or adapted during
implementation. Because Tavernary is pre-alpha, the parser and all callers
should move to the new contract together; no compatibility layer for old
internal query shapes is required.

### URL Contract

```text
/?mode=kits
/?mode=kits&kit=long-form-storyteller-241
/?mode=kits&frontend=sillytavern&purpose=memory-retrieval
/?mode=kits&minProjects=5&maxProjects=20&sort=updated
/?category=frontend
```

Rules:

- `mode=projects` is optional because projects are the default.
- `kit=<id>` implies `mode=kits`.
- Unknown Kit IDs leave Kits mode active and show a not-found message in the
  Kit Builder.
- Invalid ranges reset to 3–50.
- `minProjects` and `maxProjects` are inclusive and cannot cross.
- Default values are omitted during serialization.
- Project-only query fields are ignored in Kits mode and Kit-only fields are
  ignored in project mode.

## Kit Search, Filters, and Sorts

### Search

The shared search field matches a Kit’s:

- title;
- description;
- author’s current GitHub login;
- contained project names;
- derived frontend labels;
- derived purpose labels.

The browser-ready build artifact should contain normalized searchable text so
the UI does not reconstruct it for every keystroke.

### Filter Semantics

Kit filters are:

1. **Compatible frontend:** multi-select, derived from included Frontend
   projects.
2. **Purpose:** multi-select, derived from every represented non-Frontend
   project primary function.
3. **Includes project:** one searchable canonical-project selector in V1.
4. **Kit size:** an inclusive two-handled range from 3 to 50.
5. **Tavernary Pick:** a boolean filter.

Selections within one multi-select group use OR. Different groups use AND.
For example, SillyTavern or Lumiverse combined with Memory & Retrieval means:

```text
(SillyTavern OR Lumiverse)
AND
(Memory & Retrieval)
```

Purpose derivation includes every unique primary function represented by a
non-Frontend component. The `frontend` primary function is omitted.
`uncategorized` remains represented until the underlying project is
classified, preventing the build from inventing a purpose.

The size control is one accessible dual-thumb track with persistent minimum
and maximum readouts:

```tsx
<fieldset className="kit-size-filter">
  <legend>Kit size</legend>
  <DualRange
    min={3}
    max={50}
    lower={query.minProjects}
    upper={query.maxProjects}
    onChange={({ lower, upper }) =>
      onChange({
        minProjects: Math.min(lower, upper),
        maxProjects: Math.max(lower, upper),
      })
    }
  />
  <output>
    {query.minProjects}–{query.maxProjects} projects
  </output>
</fieldset>
```

“Small,” “Medium,” and “Large” abstractions are not used.

### Sorts

- **Trending** — default, time-decayed community support;
- **Newest** — descending `publishedAt`;
- **Recently updated** — descending `updatedAt`;
- **Alphabetical** — locale-aware title order.

Tavernary Pick does not automatically outrank other Kits. It is a badge and
filter, not a hidden score multiplier.

Project density controls are hidden in Kits mode because Kit cards have one
compact V1 presentation. The selected project density remains intact when the
user returns to project mode.

## Kit Cards

Kit cards reuse the project card’s surface, border, radius, typography, focus,
and hover vocabulary. They do not display the entire project stack; the
right-side Kit Builder owns detailed inspection.

A card displays:

- title;
- description clamped to exactly five lines with an ellipsis;
- author GitHub login and profile link;
- unweighted current supporter count;
- project count;
- derived frontend and purpose labels;
- `Published <relative date>` in the upper-right corner;
- muted `Updated <relative date>` below it when a material revision exists;
- Tavernary Pick badge when applicable;
- caution badge and affected-project count when applicable;
- Copy link and Report actions.

The full description remains in the Kit Builder and source data. Truncation is
presentation-only:

```css
.kit-card-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}
```

The whole card must not become one button containing links and actions. Use a
dedicated title/select button and sibling actions:

```tsx
<article className="kit-card" aria-labelledby={`${kit.id}-title`}>
  <button
    className="kit-card-select"
    type="button"
    aria-controls="kit-builder-panel"
    aria-expanded={selected}
    onClick={() => onSelect(kit.id)}
  >
    <h2 id={`${kit.id}-title`}>{kit.title}</h2>
    <p className="kit-card-description">{kit.description}</p>
  </button>
  <KitCardMetadata kit={kit} />
  <KitCardActions kit={kit} />
</article>
```

### Dates and Freshness

`publishedAt` is the approval/publication timestamp and never resets.
`updatedAt` advances only after an approved material change to title,
description, membership, or presentation order.

The following do not advance `updatedAt`:

- GitHub login refresh;
- project metadata refresh;
- compatibility or purpose re-derivation;
- support refresh;
- Tavernary Pick changes;
- a project becoming quarantined or disabled.

Publication age uses the project card’s existing freshness color progression
over 30 days. Very recent Kits receive the strongest highlight, then fade to
the normal date color. There is no “New this week” badge or filter.

## Kit Builder

### Desktop Layout

Desktop and tablet add a right-side Kit Builder beside the existing filter
rail and card area:

```text
┌─────────────┬──────────────────────────┬─────────────────────┐
│ Kit filters │ Compact Kit card grid    │ Kit Builder         │
│             │ or project card grid     │ inspect or build    │
└─────────────┴──────────────────────────┴─────────────────────┘
```

- Entering Kits mode opens the Kit Builder by default on desktop and tablet.
- With no selected Kit, it explains Kits and offers **Create new Kit**.
- Selecting a Kit populates a locked detail view.
- The Kit Builder can collapse to a 72-pixel icon-and-label rail and expand
  without
  losing selection or draft state.
- Switching to project mode keeps the Kit Builder available so project cards can
  be added to an active draft.
- A collapsed Kit Builder never overlays or intercepts the card grid.
- The open Kit Builder remains in normal grid flow and displaces/reflows catalog
  cards. No project card may sit behind it or become unreachable.

Recommended sizing:

```css
.kit-builder-panel {
  width: clamp(22rem, 34vw, 34rem);
  min-width: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface-primary);
}

.kit-builder-panel[data-collapsed="true"] {
  width: 4.5rem;
}
```

### Inspect Mode

The locked detail view contains:

- title, full description, author, dates, support, Pick, and caution metadata;
- the complete ordered project stack;
- compact rows showing project name and kind;
- one expanded project at a time using the existing full `ProjectCard`;
- Copy link;
- Duplicate Kit;
- Edit Kit;
- Request withdrawal;
- Report.

Selecting a closed row opens it. Selecting another closes the first. Selecting
the open row closes it. The expanded project card is a sibling of the
disclosure button so external links remain valid interactive HTML.

If a share URL selects a Kit, the Kit Builder opens with every project row
collapsed.

### Builder Modes

The Kit Builder supports:

- **Create:** empty title, description, and stack;
- **Duplicate:** a copy of the selected stack and description with a new,
  unowned identity and zero support;
- **Edit:** a copy of the live Kit submitted as a pending revision.

Duplicate is a starting point, not an exception to duplicate validation. The
stack must differ from the source before submission.

The builder collects only:

- title;
- description;
- ordered project stack.

```ts
export interface KitDraft {
  operation: "create" | "edit";
  kitId: string | null;
  title: string;
  description: string;
  projectIds: string[];
}
```

The primary action says **Submit Kit** or **Submit changes**, never Save.

### Drag, Batch Add, and Reorder

On desktop, users can drag project cards from the catalog into the pinned
Frontend slot or non-Frontend stack and drag stack rows to reorder them. The
interaction adapts the established Saga Lower Deck behavior:

- pointer capture during drag;
- a clear drag ghost;
- visible valid and invalid drop targets;
- a card-sized physical gap with no insertion line;
- edge autoscroll;
- Escape cancellation;
- deterministic cleanup after drop, cancel, or lost pointer capture.

Drag remains the direct desktop path. Project cards never carry individual
**Add to Kit** buttons. A 450-millisecond long press on a card body, or Space
while its card is focused, starts batch selection. Movement beyond eight CSS
pixels or scrolling cancels a pending long press. Once selection is active,
ordinary taps or clicks toggle more cards.

The floating selection dock exposes a quiet Cancel action, a primary
**Add to Kit** action, a separate tally, and concise Frontend-replacement or
capacity guidance. Applying performs one atomic update, clears selection, and
does not open the Kit Builder, change the query, move scroll, or steal focus.
With no draft, it creates a collapsed draft; otherwise it preserves the Kit
Builder's expanded or collapsed state. The 50-project limit, deduplication, and
single-Frontend replacement use the same domain planner.

After applying, the desktop/tablet rail reports the cumulative draft count and
briefly reports the net number added. On phones, the same bottom surface
changes from the selection dock to an added status and then to the persistent
Kit draft pill. There is no undo action.

Inside the Kit Builder:

- every builder card exposes a corner × removal control with a 44-by-44 target;
- non-Frontend cards expose grab handles for pointer and touch reordering;
- Alt+Arrow Up and Alt+Arrow Down provide keyboard reordering.

The drag handle is a handle, not the entire row, so disclosure and project
links remain usable. On desktop, dragging a builder card outside the editor
arms a red **Release to remove** state; returning inside cancels it. On touch,
dragging only reorders and × is the removal path. Removal is immediate and has
no Undo, confirmation, or remove bar.

The single Frontend is rendered as a hyper-compact pinned foundation above the
ordered stack. It cannot be reordered. Desktop exposes its handle only for
drag-off removal; touch omits that handle. Selecting another Frontend in a
batch atomically replaces the current Frontend.

Motion follows
`docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md`: modern,
clean, tactile, and practical without ornamental animation.

### Draft Lifetime

Draft state lives in React memory only:

```ts
type KitBuilderState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | { mode: "build"; collapsed: boolean; draft: KitDraft; dirty: boolean };
```

- Collapsing the Kit Builder and switching catalog modes preserve the draft.
- Refreshing, closing, or navigating away loses it.
- A dirty draft triggers a browser navigation warning.
- V1 does not use `localStorage`, IndexedDB, private Gists, export files, or
  account synchronization.
- The successful GitHub issue submission is the durable copy.

### Mobile

On mobile, the Kit Builder becomes a full-height sheet rather than squeezing
the card grid. It must provide:

- an explicit close control;
- focus containment while open;
- Escape dismissal when a hardware keyboard is present;
- focus return to the invoking card or action;
- long press and Space batch selection, touch grab handles, and corner ×
  controls;
- whole-sheet bottom movement with no opacity fade.

## Composition and Validation

### Title and Description

- Title is required, plain text, and 3–60 characters after trimming.
- Duplicate titles are allowed because author and immutable Kit ID distinguish
  them.
- Description is required, plain text, and 1–100 words.
- Markdown, HTML, and links are prohibited in Kit-authored text.
- React renders the strings as text; no `dangerouslySetInnerHTML` path exists.

```ts
export function countWords(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function validateKitDraft(draft: KitDraft, projects: CatalogProject[]) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const resolved = draft.projectIds.map((id) => byId.get(id));
  const frontendCount = resolved.filter(
    (project) => project?.kind === "frontend",
  ).length;
  const nonFrontendCount = resolved.filter(
    (project) => project && project.kind !== "frontend",
  ).length;

  return {
    titleValid:
      draft.title.trim().length >= 3 && draft.title.trim().length <= 60,
    descriptionValid:
      countWords(draft.description) >= 1 &&
      countWords(draft.description) <= 100,
    sizeValid:
      draft.projectIds.length >= 3 && draft.projectIds.length <= 50,
    unique: new Set(draft.projectIds).size === draft.projectIds.length,
    allResolve: resolved.every(Boolean),
    compositionValid:
      frontendCount === 1 &&
      resolved[0]?.kind === "frontend" &&
      nonFrontendCount >= 2,
  };
}
```

Browser validation is convenience, not authority. The GitHub workflow repeats
every objective check against the current canonical catalog.

### Compatibility

The single included Frontend establishes the Kit’s frontend label. It is
always project index zero.

Automation may warn when a selected project’s catalog metadata does not claim
support for every represented Frontend, but it does not reject the Kit solely
for that warning. Catalog metadata and third-party READMEs may be incomplete.
The author is responsible for the recommendation, and the reviewing maintainer
judges whether the composition and description credibly explain any caveats.

Objective failures still block approval:

- fewer than 3 or more than 50 projects;
- anything other than exactly one leading Frontend;
- fewer than two non-Frontend projects;
- duplicate or missing project IDs;
- a flagged project in a new or revised Kit;
- invalid title or description;
- links or markup in author text.

### Duplicate Detection

Exact project-set duplicates are blocked regardless of order:

```ts
export function kitSetKey(projectIds: readonly string[]): string {
  return [...new Set(projectIds)].sort().join("\n");
}
```

Reordering alone does not create a new Kit. Near-duplicate composition produces
a warning and remains eligible for maintainer judgment when its differences
are meaningful.

## Data Model

### Source and Generated Files

```text
data/schemas/kit.schema.json
data/registry/kits/<kit-id>.json
data/snapshots/github/kits/<kit-id>.json
data/moderation/blocked-github-users.json
data/catalog/catalog.json
```

- Registry records contain the current approved Kit or its withdrawn
  tombstone.
- GitHub snapshots contain reaction refresh state and the private-to-the-build
  support ledger. They are still public repository data.
- The blocked-user file is a narrow abuse control, not a contributor role.
- The browser-ready catalog contains only the fields needed by the UI.
- Project refresh never rewrites canonical Kit records.

Adding Kits changes the generated catalog shape. Increment its schema version
and update all readers in place:

```ts
export interface CatalogKit {
  id: string;
  title: string;
  description: string;
  author: {
    githubUserId: number;
    login: string;
  };
  sourceIssueNumber: number;
  components: CatalogKitComponent[];
  frontends: CatalogLabel[];
  purposes: CatalogLabel[];
  publishedAt: string;
  updatedAt: string;
  tavernaryPick: boolean;
  supporterCount: number | null;
  trendingScore: number | null;
  supportRefreshedAt: string | null;
  supportStale: boolean;
  hasFlaggedProjects: boolean;
  flaggedProjectCount: number;
  searchableText: string;
}

export interface CatalogKitComponent {
  projectId: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  availability: "available" | "flagged";
  unavailableReason: string | null;
}

export interface Catalog {
  schemaVersion: 2;
  generatedAt: string;
  projects: CatalogProject[];
  kits: CatalogKit[];
}
```

The browser artifact may expose `trendingScore` for deterministic client-side
sorting but never labels or displays the fractional value.

The reaction snapshot retains the earliest observed support timestamp even
when a reaction is later removed:

```ts
export interface KitSupportSnapshot {
  kitId: string;
  sourceIssueNumber: number;
  refreshedAt: string;
  supporters: Array<{
    githubUserId: number;
    login: string;
    firstReactedAt: string;
    active: boolean;
  }>;
}
```

Only active supporters enter the count and Trending calculation. Inactive
ledger rows remain so removing and re-adding a reaction cannot manufacture a
new timestamp.

### Canonical Record

```json
{
  "schema_version": 1,
  "id": "long-form-storyteller-241",
  "status": "published",
  "title": "Long-Form Storyteller",
  "description": "A narrative-focused stack combining durable memory, planning, and presentation tools for long-running SillyTavern stories.",
  "author": {
    "github_user_id": 12345678,
    "login": "example-author"
  },
  "source_issue_number": 241,
  "project_ids": [
    "sillytavern-sillytavern",
    "mentallyquill-recursion",
    "example-memory-extension"
  ],
  "published_at": "2026-07-24T18:00:00.000Z",
  "updated_at": "2026-07-24T18:00:00.000Z",
  "tavernary_pick": false
}
```

The workflow generates the immutable ID from the approved title slug plus the
original issue number. Later title edits never change it.

`frontends`, `purposes`, support, caution state, and searchable text are
derived and do not belong in the canonical record.

### Authorship

- GitHub issue actor login is captured for display.
- GitHub’s numeric user ID is captured for authority.
- Login changes refresh the display value without changing ownership.
- The static site cannot know whether its visitor is the author, so Edit and
  Request withdrawal may be visible to anyone; the GitHub workflow performs
  the authoritative ID check.
- There is no ownership transfer in V1.
- If an author disappears, another user may duplicate and submit a distinct
  Kit.
- Maintainers may make narrowly scoped safety repairs without changing the
  displayed original author. Revision history records the maintainer action.

## GitHub Submission and Revision Flow

### Browser Handoff

1. The user builds or edits a Kit in the right-side Kit Builder.
2. Tavernary validates the draft locally.
3. Tavernary serializes a compact manifest containing operation, Kit ID when
   editing, title, description, and ordered project IDs.
4. Tavernary opens the GitHub Kit issue form in a new tab with fields
   prefilled.
5. The original Tavernary tab retains its in-memory draft.
6. The user reviews the issue and clicks GitHub’s Submit button.
7. Automation parses and validates the issue and labels it
   `needs-maintainer-review` or `needs-information`.
8. A repository maintainer reviews the composition and compatibility.
9. Approval triggers a workflow that revalidates against the current catalog
   and updates the canonical Kit record.
10. The next catalog build publishes the approved state.

GitHub URL prefilling has practical URL-length limits. Use a conservative
threshold and a clipboard fallback for large 50-project Kits:

```ts
const MAX_PREFILL_URL_LENGTH = 7_000;

export async function openKitSubmission(
  formUrl: URL,
  manifest: string,
): Promise<"prefilled" | "clipboard"> {
  formUrl.searchParams.set("manifest", manifest);
  if (formUrl.toString().length <= MAX_PREFILL_URL_LENGTH) {
    window.open(formUrl, "_blank", "noopener,noreferrer");
    return "prefilled";
  }

  await navigator.clipboard.writeText(manifest);
  formUrl.searchParams.delete("manifest");
  formUrl.searchParams.set(
    "manifest",
    "Paste the Kit manifest copied by Tavernary here.",
  );
  window.open(formUrl, "_blank", "noopener,noreferrer");
  return "clipboard";
}
```

Clipboard fallback is part of submission transport. It is not a draft-export
feature.

### Manual Approval Policy

- All new Kits require manual approval.
- All author edits require manual approval.
- The live Kit remains unchanged during review.
- Rejected, invalid, or abandoned revisions do not modify the live record.
- Account age does not alter review.
- Repository access does not alter review.
- There is no automatic trusted-user publication.
- Existing role-specific review wording and labels in the project-submission
  surface must be migrated to `maintainer` wording during implementation so
  V1 has one consistent responsibility model.

### Edit Authorization

An edit is valid only when the submission actor’s numeric GitHub ID equals the
canonical Kit author ID. Login comparison alone is insufficient.

Approved edits:

- preserve `id`, author numeric GitHub ID, `sourceIssueNumber`, and
  `publishedAt`;
- refresh the display login from the matching GitHub issue actor;
- replace title, description, and ordered project IDs;
- advance `updatedAt`;
- preserve the support ledger and Trending history;
- retain Tavernary Pick unless a maintainer explicitly changes it.

An edit that changes the recommendation so fundamentally that it no longer
represents the same Kit should be submitted as a new Kit. Maintainers make
that identity judgment during review.

## Community Support and Trending

### Vote Source

The canonical original Kit issue is the support surface. Only GitHub `+1`
reactions count.

- One effective reaction per durable GitHub user ID.
- The author’s own `+1` counts.
- Bots and blocked GitHub user IDs are excluded.
- Removing a reaction removes its current weight and decrements the visible
  supporter count.
- Re-adding a reaction restores that user’s original first-reaction timestamp
  from the ledger; it does not bump the Kit.
- Reactions received before publication become effective at `publishedAt`.
- Ordinary approved revisions preserve support.
- A duplicate Kit starts with zero support.
- Reports do not automatically remove support or penalize Trending.

The effective vote timestamp is the later of first reaction and publication:

```ts
export function effectiveVoteAt(
  firstReactedAt: string,
  publishedAt: string,
): string {
  return Date.parse(firstReactedAt) < Date.parse(publishedAt)
    ? publishedAt
    : firstReactedAt;
}
```

### Decay Formula

Each effective supporter has a 30-day half-life:

```ts
const DAY_MS = 86_400_000;
const TRENDING_HALF_LIFE_DAYS = 30;

export function voteWeight(votedAt: string, now: string): number {
  const ageDays = Math.max(
    0,
    (Date.parse(now) - Date.parse(votedAt)) / DAY_MS,
  );
  return 2 ** (-ageDays / TRENDING_HALF_LIFE_DAYS);
}

export function trendingScore(votes: string[], now: string): number {
  return votes.reduce((sum, votedAt) => sum + voteWeight(votedAt, now), 0);
}
```

A new vote contributes 1.0, a 30-day-old vote 0.5, a 60-day-old vote 0.25,
and a 90-day-old vote 0.125.

The scheduled catalog refresh recomputes the score. Cards display only the
current unweighted supporter count. The count itself does not decay, but
removing a reaction removes that supporter. Help text explains that Trending
favors recent support and halves each effective vote’s ranking influence every
30 days.

Trending ties resolve by:

1. newer `publishedAt`;
2. alphabetical title;
3. immutable Kit ID.

The previous support snapshot remains usable when GitHub refresh fails and is
marked stale in build metadata. If no snapshot has ever succeeded, the UI
shows support as unavailable rather than inventing zero.

## Sharing

Each Kit has one stable URL:

```text
/?mode=kits&kit=<immutable-kit-id>
```

**Copy link** writes that URL to the clipboard. It does not invoke the Web
Share API or open a social-media dialog. If clipboard access fails, Tavernary
reveals a selected text field containing the URL.

Opening the URL:

- activates Kits mode;
- scrolls to and highlights the Kit card when present;
- opens the Kit Builder to the locked Kit;
- keeps all project rows collapsed.

## Reports

A visually quiet Report action appears at the bottom edge of the Kit card and
Kit Builder. Its visible icon may be small, but its interactive target must meet
the site’s normal accessible hit-area standard.

The action opens a prefilled GitHub issue with Kit ID and share URL. Categories
are:

- compatibility problem;
- unsafe or malicious project;
- abusive or vulgar content;
- broken or removed project;
- misleading description;
- duplicate Kit;
- other.

Reports are manually triaged by repository maintainers. A report does not
automatically hide a Kit, alter support, or reduce Trending; this prevents
report brigading from becoming a ranking mechanism.

## Withdrawal

The author may submit a withdrawal request through GitHub.

1. A workflow compares the request actor’s numeric GitHub ID with the canonical
   author ID.
2. A mismatch fails without changing the Kit.
3. A match requires no additional manual approval.
4. The next workflow changes the canonical record to a withdrawn tombstone.
5. The public build excludes the Kit and closes any pending revision.

A Kit is not hard-deleted:

- its ID is never reused;
- publication and revision history remain recoverable;
- support history remains retained but inactive;
- restoration, if ever needed, requires a new manual review.

## Blocked GitHub Identities

V1 retains a narrow blocked-identity registry for abuse response. It is not an
approval list or a repository role.

```json
{
  "schema_version": 1,
  "blocked": [
    {
      "github_user_id": 987654,
      "login": "example-login",
      "reason": "Repeated malicious submissions"
    }
  ]
}
```

The numeric ID is authoritative and the login is informational. Blocked users
cannot submit or revise Kits through the normal workflow, and their reactions
do not contribute support. Repository maintainers edit this file through the
ordinary reviewed Git history.

## Flagged, Quarantined, and Removed Projects

Canonical project records already carry `published`, `quarantined`, or
`disabled` visibility. The Kit build resolves components against all registry
records before public-project filtering.

To explain a disabled Kit row, the project registry gains a nullable controlled
reason:

```ts
type ProjectVisibilityReason =
  | "identity-change"
  | "source-unavailable"
  | "removed"
  | "safety-review"
  | null;
```

`visibility_reason` must be non-null when visibility is `quarantined` or
`disabled`, and null when visibility is `published`. Existing non-published
records are migrated in place because the project is pre-alpha.

When a project is no longer safely available:

- it disappears from the ordinary project card grid;
- its existing position remains in published Kits;
- its Kit row becomes gray and non-interactive;
- external and installation links are disabled;
- the row explains the known reason;
- the Kit receives **Contains flagged projects** and an affected count;
- Kit size continues to include the row;
- the Kit remains public;
- Trending history and support remain intact;
- the last approved project name, kind, and ID remain available for context.

Derived frontend and purpose labels may use the component’s last approved
identity so the Kit remains understandable. This derived-state change does not
advance the Kit’s `updatedAt`.

New Kits, duplicates, and revisions cannot submit flagged projects. An author
must remove or replace the row before submitting an edit. The warning clears
after every flagged row is resolved by an approved edit or project recovery.

If the Kit itself becomes dangerous rather than merely stale, a maintainer may
withdraw it.

## Tavernary Pick

Repository maintainers may set or remove `tavernary_pick` on an approved Kit.

- It appears as a restrained badge.
- It can be filtered.
- It does not modify Trending.
- Changing it does not change `updatedAt`.
- An approved author edit does not silently remove it.
- The badge text is **Tavernary Pick**.

No new public role accompanies this editorial field.

## Licensing and Contribution Terms

The existing licensing design assigns the catalog database to ODbL 1.0.
Kit-authored titles and descriptions are individual database contents, so V1
also adopts the Open Data Commons Database Contents License 1.0 for submitted
Kit text.

Implementation must:

- retain ODbL 1.0 for the Kit database and manifest arrangement;
- add `LICENSES/DbCL-1.0.txt`;
- update `LICENSING.md` to identify Kit titles and descriptions as DbCL
  contents;
- preserve visible GitHub author attribution;
- add a required issue-form acknowledgement.

```yaml
- type: checkboxes
  id: contribution-terms
  attributes:
    label: Contribution terms
    options:
      - label: >-
          I created or am authorized to submit this Kit title and description,
          and I agree they may be published under DbCL 1.0 as part of
          Tavernary's ODbL 1.0 catalog.
        required: true
```

Tavernary does not claim ownership of third-party project names, trademarks,
repository content, or project files.

## Icons and Visual Assets

Kits need interface icons, not a new logo.

### Required New Icons

- **Kit:** a container or tray holding multiple compact project marks;
- **Add to Kit:** plus combined with a compact stack;
- **Drag handle:** six-dot or short-grip treatment;
- **Duplicate:** overlapping cards;
- **Copy link:** chain or clipboard treatment;
- **Report:** restrained flag;
- **Caution:** warning triangle for flagged components.

Reuse the existing chevron, collapse, close, and search icons.

All new icons:

- use the existing `CategoryIcon` or a focused sibling action-icon component;
- use a 24×24 view box;
- use `currentColor`;
- use the existing rounded 1.8 stroke where a stroke icon is appropriate;
- introduce no new palette tokens;
- include accessible button labels while the SVG remains `aria-hidden`.

An implementation-shaped Kit icon:

```tsx
if (name === "kit") {
  return (
    <svg {...strokeProps} viewBox="0 0 24 24" {...props}>
      <path d="M4 7.5h16a2 2 0 0 1 2 2V20H2V9.5a2 2 0 0 1 2-2Z" />
      <path d="M7 4h10v3.5M6.5 11h4v4h-4zM13.5 11h4M13.5 15h4" />
    </svg>
  );
}
```

The Kit icon must remain distinguishable from the current All Projects
four-square icon at category-navigation size.

## Architecture Boundaries

Recommended units:

```text
src/features/kits/
  kit-types.ts
  kit-query.ts
  kit-selectors.ts
  kit-validation.ts
  kit-trending.ts
  use-kit-builder.ts
  components/
    kit-card.tsx
    kit-grid.tsx
    kit-filter-panel.tsx
    kit-builder-panel.tsx
    kit-project-stack.tsx
    kit-builder.tsx

scripts/kits/
  validate.mjs
  build.mjs
  refresh-reactions.mjs
  apply-approved-submission.mjs
  apply-withdrawal.mjs
```

Responsibilities:

- catalog loading joins approved Kits after project records are available;
- query parsing owns URL semantics only;
- selectors own search, filtering, and sorting;
- validation owns objective draft and registry rules;
- Trending owns reaction age and score calculation;
- Kit Builder state owns inspection and transient drafts;
- GitHub workflows own identity and publication authority;
- React components never decide whether an edit or withdrawal is authorized.

The central catalog page chooses the mode-specific surfaces:

```tsx
const isKits = query.mode === "kits";

return (
  <div className="catalog-shell" data-mode={query.mode}>
    <SiteHeader search={query.search} onSearch={setSearch} />
    <CategoryNavigation
      mode={query.mode}
      selected={query.projects.category}
      onSelectKits={enterKits}
      onSelectProjects={enterProjects}
    />
    <div className="catalog-layout">
      {isKits ? <KitFilterPanel {...kitFilterProps} /> : <FilterPanel {...projectFilterProps} />}
      <main className="catalog-main">
        {isKits ? <KitGrid kits={selectedKits} /> : <ProjectGrid projects={selectedProjects} />}
      </main>
      <KitBuilderPanel state={builder} />
    </div>
  </div>
);
```

This should be decomposed into focused components rather than allowing the
existing `CatalogPage` to accumulate every Kit interaction.

## Failure Handling

- Invalid URL state falls back to mode defaults without throwing.
- An unknown shared Kit ID produces a Kit Builder not-found state.
- Missing project IDs fail new or revised Kit validation.
- Published Kits resolve quarantined or disabled projects as tombstones.
- Failed GitHub prefill uses clipboard transport and preserves the browser
  draft.
- Failed clipboard access exposes selectable text.
- Rejected edits leave the live Kit untouched.
- Failed reaction refresh retains the last valid snapshot and marks it stale.
- Unauthorized edits or withdrawals fail by durable ID.
- A username change does not break ownership.
- A dirty in-memory draft warns before navigation loss.
- Duplicate Kit sets fail before publication.

## Verification

### Schema and Build

- Kit schema accepts only the canonical fields and statuses.
- Every published project ID resolves against the registry.
- 3–50, unique IDs, one Frontend, and two non-Frontends are enforced.
- title, description, plain-text, and 100-word limits are enforced.
- derived frontend and all-represented-purpose values are deterministic.
- generated catalog schema version 2 contains projects and Kits.
- quarantined and disabled projects become Kit tombstones but remain absent
  from the project grid.
- static export and GitHub Pages base-path behavior pass.

### Query and Selection

- Kits sits immediately before All Projects.
- Kits mode hides all project cards.
- every project category exits Kits mode.
- search fields and derived labels match as specified.
- OR-within and AND-across filter semantics pass.
- size boundaries are inclusive and serialize correctly.
- Trending is the default.
- share URLs select and open the correct Kit.

### Builder and Accessibility

- create, duplicate, and edit modes initialize correctly.
- drafts survive mode changes and Kit Builder collapse.
- refresh does not pretend to persist a draft.
- add, drag, reorder, remove, and duplicate rejection pass.
- keyboard and touch alternatives can perform every critical stack operation;
  touch removal uses × and touch drag never arms removal.
- dirty-navigation warning fires only when needed.
- one project detail is expanded at a time.
- focus returns after mobile Kit Builder dismissal.
- cards contain no nested interactive-content violations.

### Identity and Workflows

- new and edited Kits require manual maintainer approval.
- pending edits never alter the live record.
- numeric author ID, not login, controls edits and withdrawals.
- login refresh preserves ownership.
- no ownership transfer path exists.
- author withdrawal creates a tombstone without manual approval.
- unauthorized withdrawal changes nothing.
- blocked identities cannot submit, revise, or contribute support.
- contribution acknowledgement is required.
- legacy role-specific wording is absent from the V1 contribution workflow.

### Support and Moderation

- only `+1` reactions count.
- bots and blocked IDs do not count.
- author reactions count.
- pre-publication reactions age from publication.
- reaction removal removes weight.
- re-addition restores the original timestamp.
- 30-day half-life values and tie-breaks pass.
- ordinary revisions preserve support.
- duplicates begin at zero.
- reports never automatically alter visibility or Trending.
- Tavernary Pick never modifies Trending or `updatedAt`.

### Visual Review

Review project and Kits modes at desktop, tablet, and mobile widths with:

- a three-project Kit;
- a 20-plus-project Kit;
- a 50-project Kit;
- a five-line truncated description;
- a long title and GitHub login;
- selected, hover, and keyboard-focus states;
- an open and collapsed desktop Kit Builder;
- create, duplicate, and edit builder modes;
- one expanded Frontend, Preset, and Extension;
- a flagged-project caution state;
- Tavernary Pick;
- stale and unavailable support;
- empty and filtered result states;
- no horizontal overflow.

## Deferred Ideas

The following require a future design decision and are not latent V1 behavior:

- trusted users or automatic approval;
- separate trusted moderation roles;
- GitHub organization teams or repository-role-based publication;
- account-age qualifications;
- private or synchronized drafts;
- ownership transfer;
- richer setup instructions;
- per-component notes or roles;
- installation automation;
- personalized recommendations;
- downvotes or Tavernary-hosted discussion.
