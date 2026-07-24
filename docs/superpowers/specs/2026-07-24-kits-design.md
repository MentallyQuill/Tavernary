# Tavernary Kits

## Status

Design captured for user review. This document defines the initial Kits product,
interaction, data, moderation, and visual contracts. It does not authorize
implementation until the design is approved.

## Goal

Add community-authored **Kits** to Tavernary. A Kit is a named combination of
cataloged frontends, system presets, and extensions assembled for a particular
roleplay purpose.

Kits help a visitor answer a different question from the project catalog:

- the project catalog answers, "What tools exist?";
- Kits answer, "What tools work well together for this use case?"

Tavernary remains a static GitHub Pages application. It does not add Tavernary
accounts, a runtime database, or a private authentication service. GitHub
provides contributor identity, the submission and revision trail, moderation
discussion, and the initial community-support signal.

## Product Principles

1. **Kits compose catalog records.** A Kit references canonical Tavernary
   project IDs. It does not copy, mirror, bundle, redistribute, or install
   project files.
2. **Community authors do the tailoring.** Tavernary supplies the structure,
   validation, moderation, and discovery surface rather than centrally
   authoring every recommendation.
3. **Every publication is reviewed.** All new Kits and all edits require
   automatic validation followed by manual curator approval.
4. **Published state is stable.** A pending edit never changes the live Kit.
   The previously approved version stays visible until the replacement is
   approved.
5. **Editorial and community signals stay separate.** GitHub reactions provide
   a community-support count. A curator may independently mark a Kit as a
   Tavernary Pick.
6. **Large Kits remain scannable.** A Kit may contain more than 20 projects.
   Its components therefore begin as hyper-compact rows and expand one at a
   time into the existing full project-card treatment.
7. **Freshness is deterministic.** "New this week" means the first seven days
   after initial publication. Votes and other community activity do not affect
   newness.

## Terminology

- **Kit:** an approved combination of cataloged projects.
- **Component:** one project referenced by a Kit.
- **Kit author:** the GitHub user who submitted the original Kit.
- **Community support:** the number of approved GitHub `+1` reactions associated
  with the Kit. This is not presented as an objective quality score.
- **Tavernary Pick:** an editorial pin applied by a Tavernary curator.
- **Pending revision:** a proposed edit that has not replaced the live Kit.

The feature is called **Kits**, not Sets, Bundles, Stacks, Recipes, or Loadouts.

## Information Architecture

Kits use the existing homepage catalog instead of introducing a separate Kits
landing page.

The category bar gains a **Kits** button immediately to the left of **All
Projects**:

```text
[Kits] [All Projects] [Frontends] [System Presets] [Memory & Retrieval] ...
```

The button is visually adjacent to the project categories but represents a
catalog mode, not another project kind.

### Navigation Behavior

- The default homepage state remains **All Projects**.
- Selecting **Kits** hides all project tiles and displays only Kit tiles.
- Selecting **All Projects** hides all Kit tiles and restores every project.
- Selecting Frontends, System Presets, or any other project category exits Kits
  mode, hides Kit tiles, and applies the selected project category.
- Search text survives a mode change because the same words can be meaningful
  for projects and Kits.
- Mode-specific filters are cleared when leaving that mode.
- Browser history, bookmarks, and shared links reproduce the selected mode and
  filters.

The URL contract is:

```text
/?mode=kits
/?mode=kits&frontend=sillytavern&purpose=memory-retrieval
/?mode=projects&category=frontend
```

`mode=projects` may be omitted when it is the default, but parsing must accept
the explicit form.

An implementation-shaped query contract is:

```ts
export type CatalogMode = "projects" | "kits";
export type KitScope = "minimal" | "focused" | "comprehensive";
export type KitStatusFilter = "new-this-week" | "tavernary-pick";
export type KitSort = "newest" | "updated" | "support" | "alphabetical";

export interface KitQuery {
  frontends: string[];
  purposes: string[];
  scopes: KitScope[];
  includes: string;
  statuses: KitStatusFilter[];
  sort: KitSort;
}

export interface BrowseQuery extends CatalogQuery {
  mode: CatalogMode;
  kits: KitQuery;
}

export const DEFAULT_KIT_QUERY: KitQuery = {
  frontends: [],
  purposes: [],
  scopes: [],
  includes: "",
  statuses: [],
  sort: "newest",
};
```

The existing `CatalogQuery` remains the project-mode contract. Kit-only fields
must not be overloaded into project `kind`, `capabilities`, `development`, or
`licenses`.

The category-navigation seam should remain explicit:

```tsx
<CategoryNavigation
  mode={query.mode}
  selected={query.category}
  onSelectKits={() =>
    setQuery((current) => ({
      ...current,
      mode: "kits",
      category: "",
      frontends: [],
      kinds: [],
      capabilities: [],
      development: [],
      licenses: [],
    }))
  }
  onSelectProjectCategory={(category) =>
    setQuery((current) => ({
      ...current,
      mode: "projects",
      category,
      kits: DEFAULT_KIT_QUERY,
    }))
  }
/>
```

## Kits Mode

When Kits is active, the existing page shell remains in place:

- Tavernary header and global search;
- category bar;
- desktop filter rail or mobile filter sheet;
- result count, density, and sort controls;
- card grid;
- legal footer.

The catalog context changes:

- heading and count describe Kits rather than projects;
- project filters are replaced by Kit filters;
- Kit sort options replace project sort options;
- empty-state copy says that no Kits match;
- cards use the Kit tile visual contract.

The filter swap is structural rather than a set of hidden checkboxes:

```tsx
const filters =
  query.mode === "kits" ? (
    <KitFilterPanel
      query={query.kits}
      kits={catalog.kits}
      projects={catalog.projects}
      onChange={updateKitQuery}
      onClear={clearKitFilters}
    />
  ) : (
    <FilterPanel
      query={query}
      projects={catalog.projects}
      now={catalog.generatedAt}
      onToggle={toggleProjectFilter}
      onClear={clearProjectFilters}
    />
  );
```

## Kit Filters

The initial Kit filter set is intentionally smaller than the project filter
set. It focuses on what the user wants to accomplish and what host they use.

### Compatible Frontend

Reuse `data/vocabularies/frontends.json`:

- SillyTavern;
- Lumiverse;
- Marinara Engine;
- Sonder Engine;
- Multiple frontends when the Kit genuinely supports more than one.

A Kit matches a frontend when its approved component manifest and Kit metadata
support that frontend. A single incompatible optional component does not make
the entire Kit compatible; validation must require the author to describe or
remove the incompatibility.

### Primary Purpose

Reuse the applicable values from
`data/vocabularies/primary-functions.json`:

- Memory and retrieval;
- Generation and reasoning;
- Character and worldbuilding;
- RPG systems and suites;
- Interface and workflow;
- Developer infrastructure.

The project-only `frontend` and transitional `uncategorized` primary functions
are not valid Kit purposes.

### Kit Scope

Scope describes the intended breadth, not an automatic quality judgment:

- **Minimal:** the smallest practical setup for the stated purpose;
- **Focused:** a bounded setup with several complementary components;
- **Comprehensive:** a broad setup that may contain many optional components.

The author selects scope and the curator verifies that the label is credible.
Component count may be displayed but does not silently rewrite scope.

### Includes

Includes is a searchable project selector backed by canonical project IDs. It
supports questions such as:

- "Show Kits containing SillyTavern";
- "Show Kits containing Recursion";
- "Show Kits containing this preset."

The initial UI uses one search field with suggestions rather than rendering
hundreds of project checkboxes.

### Status

The initial status filters are:

- New this week;
- Tavernary Pick.

Pending, rejected, hidden, and superseded revisions are moderation states and
are not public discovery filters.

### Sorting

Kit sort options are:

- Newest;
- Recently updated;
- Community support;
- Alphabetical.

Newest is the default. Community support is an optional sort, not the default
ranking and not a publication requirement.

## Kit Tile Visual Contract

Kit tiles borrow the established project-card language but are deliberately
larger. They must read as containers of projects rather than as another project
kind.

### Outer Tile

The Kit tile header contains:

- Kit name;
- short purpose statement;
- author GitHub login and link;
- Community support count;
- component totals;
- compatible frontend labels;
- scope;
- first-published and last-updated dates;
- New this week badge when applicable;
- Tavernary Pick badge when applicable;
- Edit Kit action whose GitHub workflow verifies the original author.

The outer tile uses the existing card background, border, radius, typography,
hover, and focus vocabulary. It does not use the Frontend red, Extension
orange, or Preset mint as a single Kit-kind color because a Kit contains all
three. The Kit identity icon uses the neutral primary text color. Component
rows retain their individual project-kind colors.

The Kit grid uses two columns on wide desktop layouts and one column on tablet
and mobile. Cards are content-height and top-aligned; they are not stretched to
equal the height of the largest Kit in a row.

### Component Manifest

Below the Kit header, every component appears as a hyper-compact row. The
collapsed row shows only:

- disclosure chevron;
- project name;
- project kind: Frontend, System Preset, or Extension;
- Required, Recommended, or Optional role when supplied.

The compact manifest is the complete approved Kit, including Kits with more
than 20 extensions. It does not replace the last components with a popularity
summary or hide them behind community engagement.

Clicking a row expands that component into the existing full project-card
treatment. Only one component in a Kit may be expanded at a time:

- selecting a closed row opens it;
- selecting a different row closes the old row and opens the new row;
- selecting the open row collapses it;
- expanding one Kit does not change another Kit;
- keyboard and screen-reader users receive the same behavior.

The expanded `ProjectCard` is rendered as a sibling of the disclosure button,
not nested inside it, so the existing external project link remains valid HTML.

```tsx
import { useState } from "react";

import type { CatalogProject } from "../catalog-types";
import type { CatalogKit } from "../kit-types";
import { ProjectCard } from "./project-card";

export function KitCard({
  kit,
  projectsById,
  now,
}: {
  kit: CatalogKit;
  projectsById: ReadonlyMap<string, CatalogProject>;
  now: string;
}) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );

  return (
    <article className="kit-card" aria-labelledby={`${kit.id}-title`}>
      <header className="kit-card-header">
        <h2 id={`${kit.id}-title`}>{kit.name}</h2>
        <p>{kit.summary}</p>
      </header>

      <div className="kit-components">
        {kit.components.map((component) => {
          const project = projectsById.get(component.projectId);
          if (!project) return null;
          const expanded = expandedProjectId === project.id;
          const panelId = `${kit.id}-${project.id}-details`;

          return (
            <div className="kit-component" key={project.id}>
              <button
                className="kit-component-trigger"
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() =>
                  setExpandedProjectId(expanded ? null : project.id)
                }
              >
                <span>{project.name}</span>
                <small>{project.kind}</small>
                <em>{component.role}</em>
              </button>

              {expanded ? (
                <div className="kit-component-details" id={panelId}>
                  <ProjectCard project={project} now={now} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}
```

The initial CSS contract is:

```css
.kit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 18px;
}

.kit-card {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-card);
}

.kit-components {
  display: grid;
  gap: 4px;
  margin-top: 16px;
}

.kit-component-trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  width: 100%;
  min-height: 34px;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-primary);
  background: var(--color-surface-primary);
  text-align: left;
}

.kit-component-trigger small,
.kit-component-trigger em {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-style: normal;
}

.kit-component-details {
  padding: 8px 0 6px;
}

@media (max-width: 980px) {
  .kit-grid {
    grid-template-columns: 1fr;
  }

  .kit-component-trigger {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .kit-component-trigger em {
    grid-column: 1 / -1;
  }
}
```

Final spacing and breakpoints must be tuned against the production catalog at
desktop, tablet, and mobile widths. The nested rows must remain visibly flatter
and quieter than the outer Kit card; they do not receive the full raised-card
shadow or large padding until expanded.

## Kit Icon

Kits require one new interface icon, not a new logo.

The icon represents a container holding several components. It must remain
distinct from the existing All Projects four-square mark and from the
Frontend, Preset, and primary-function icons.

The icon:

- uses the existing 24 by 24 icon canvas;
- uses `currentColor`;
- uses the standard 1.8 rounded stroke;
- contains an outer tray/card and several internal component marks;
- uses the neutral primary text color in the category bar;
- does not introduce a new palette token.

The implementation target in `CategoryIcon` is:

```tsx
type IconName =
  | "kit"
  | "all"
  | "frontend"
  // existing names continue unchanged
  | "close";

if (name === "kit") {
  return (
    <svg {...strokeProps} viewBox="0 0 24 24" {...props}>
      <path d="M5 7h14a2 2 0 0 1 2 2v10H3V9a2 2 0 0 1 2-2Z" />
      <path d="M8 4h8v3M7 11h4v4H7zM14 11h3M14 15h3" />
    </svg>
  );
}
```

The disclosure chevron can reuse the existing chevron icon. Required,
Recommended, Optional, New this week, and Tavernary Pick are text badges and do
not need separate icons in the first release.

## Kit Data Contract

Canonical approved Kit records live under:

```text
data/registry/kits/<kit-id>.json
```

GitHub-derived community snapshots live separately under:

```text
data/snapshots/github/kits/<kit-id>.json
```

The browser-ready build joins Kits, project records, controlled vocabularies,
and community snapshots into the generated catalog artifact. Source refreshes
must never rewrite canonical Kit records.

The initial TypeScript contract is:

```ts
export type KitComponentRole = "required" | "recommended" | "optional";

export interface KitComponent {
  projectId: string;
  role: KitComponentRole;
}

export interface KitAuthor {
  githubUserId: number;
  login: string;
}

export interface CatalogKit {
  id: string;
  name: string;
  summary: string;
  author: KitAuthor;
  sourceIssueNumber: number;
  purposes: string[];
  scope: "minimal" | "focused" | "comprehensive";
  frontends: string[];
  components: KitComponent[];
  publishedAt: string;
  updatedAt: string;
  tavernaryPick: boolean;
  communitySupport: number;
}
```

An approved registry record looks like:

```json
{
  "schema_version": 1,
  "id": "long-form-storyteller",
  "name": "Long-Form Storyteller",
  "summary": "A focused SillyTavern setup for long-running narrative play.",
  "author": {
    "github_user_id": 12345678,
    "login": "example-author"
  },
  "source_issue_number": 241,
  "purposes": ["generation-reasoning", "memory-retrieval"],
  "scope": "focused",
  "frontends": ["sillytavern"],
  "components": [
    {
      "project_id": "sillytavern-sillytavern",
      "role": "required"
    },
    {
      "project_id": "mentallyquill-recursion",
      "role": "recommended"
    }
  ],
  "published_at": "2026-07-24T18:00:00.000Z",
  "updated_at": "2026-07-24T18:00:00.000Z",
  "tavernary_pick": false
}
```

`community_support` is derived from the GitHub snapshot and is not written into
the canonical record.

Validation requires:

- unique Kit ID and case-insensitive name;
- a durable GitHub numeric user ID and current login;
- a public source issue;
- at least two unique component project IDs;
- every component project ID resolves to a published catalog record;
- exactly one role per component;
- at least one frontend or a clearly resolvable host relationship;
- purposes drawn from the controlled Kit-purpose subset;
- frontends drawn from the controlled frontend vocabulary;
- no duplicated components;
- valid ISO timestamps;
- `updated_at` not earlier than `published_at`;
- no arbitrary download, script, or installation URLs in the Kit record.

## New This Week

Newness is derived, not stored:

```ts
export function isKitNewThisWeek(
  kit: Pick<CatalogKit, "publishedAt">,
  now: string,
) {
  return isWithinDays(kit.publishedAt, now, 7);
}
```

The badge text is exactly **New this week**.

- The seven-day clock starts when the Kit is first approved and published.
- Time spent awaiting approval does not count.
- An approved edit updates `updated_at` but does not reset `published_at`.
- Community reactions do not affect the badge.

## GitHub Identity and Community Support

Tavernary does not implement "Log in with GitHub" on GitHub Pages. A static
browser application cannot securely keep an OAuth client secret or own a
trusted vote-writing service.

Instead:

- submission and edit actions send the visitor to GitHub;
- the GitHub issue or pull-request author supplies the contributor identity;
- the registry stores GitHub's durable numeric user ID because a login can
  change;
- the current login is retained for display and refreshed when moderation
  resolves an identity change;
- each published Kit links to its canonical GitHub discussion or issue;
- GitHub `+1` reactions provide the initial community-support signal;
- a scheduled or manually dispatched GitHub Action reads public reactions and
  writes a generated snapshot;
- the static site displays the last generated support count.

The UI labels this value **Community support**, not Rating, Stars, Score, Best,
or Quality. It may be used as an optional sort. It does not auto-publish,
auto-pin, or determine recommendation quality.

GitHub identity proves attribution to a GitHub account. It does not prove that
an account is a unique person or that its opinion is trustworthy.

## Submission and Moderation

The final policy supersedes the earlier account-age auto-publication idea:

- every new Kit requires manual approval;
- every edit requires manual approval;
- account age never bypasses review;
- a whitelist never bypasses review;
- automatic checks validate structure but never create or edit a production
  Kit record.

### New Kit

1. A visitor selects **Submit Kit**.
2. Tavernary opens a structured GitHub issue form.
3. The issue captures name, summary, purposes, scope, frontend compatibility,
   and canonical project IDs.
4. Automation validates the proposal and comments with actionable failures.
5. A valid proposal receives a pending-review label.
6. A curator verifies the recommendation, compatibility, author identity, and
   source issue.
7. Approval creates the canonical Kit record and sets `published_at` and
   `updated_at` to the approval time.
8. The normal validated catalog build publishes the Kit.

Invalid or rejected submissions never appear in the public Kit catalog.

### Edit Kit

The visible **Edit Kit** action opens a structured GitHub issue form prefilled
with the Kit ID and current source information.

- The static site cannot know whether the current visitor is the author, so the
  control is visible without a Tavernary session.
- Automation compares the issue author's durable GitHub ID with the Kit author.
- A matching author creates an author revision.
- Another user must use a correction/report path rather than impersonating an
  author edit.
- The proposed revision is validated against the complete replacement record.
- The current approved Kit remains unchanged and visible.
- Approval replaces the canonical record, preserves `published_at`, and updates
  `updated_at`.
- Rejection leaves the live record unchanged.
- Git history and the source issue retain the audit trail.

There is no partially merged Kit state and no public preview of a pending
revision in the initial release.

## Whitelist and Blacklist

Tavernary retains an internal GitHub-user policy file because moderation may
need durable allow and deny decisions:

```json
{
  "schema_version": 1,
  "whitelist": [
    {
      "github_user_id": 12345678,
      "login": "trusted-contributor",
      "reason": "Established Kit contributor"
    }
  ],
  "blacklist": [
    {
      "github_user_id": 87654321,
      "login": "blocked-account",
      "reason": "Repeated abusive submissions"
    }
  ]
}
```

The initial behavior is:

1. Blacklisted users cannot submit or revise Kits through the normal workflow.
2. Whitelisted users may be labeled or prioritized for curator attention.
3. Whitelisted submissions still require manual approval.
4. Users absent from both lists use the normal manual-review queue.
5. GitHub account creation time may be shown to moderators as context but does
   not change publication eligibility.
6. Numeric GitHub user ID is authoritative; login is display and audit
   metadata.

If a user somehow appears in both lists, blacklist wins and validation fails.

## Tavernary Picks

A curator may mark an approved Kit as a **Tavernary Pick**.

- Pinning is independent of Community support.
- Pinning does not change authorship.
- Pinning does not suppress other Community Kits.
- A pinned Kit may remain pinned after the New this week period ends.
- A pending author edit does not remove the pin from the currently published
  revision.
- The curator reevaluates the pin when approving a material revision.

The public card displays Tavernary Pick as a badge. The Kits filter rail
provides a Tavernary Pick toggle.

## Static Build and Data Flow

The static architecture remains:

```text
GitHub issue / revision
        |
        v
automatic proposal validation
        |
        v
manual curator approval
        |
        v
data/registry/kits/<id>.json
        |
        +---- GitHub reaction refresh
        |          |
        |          v
        |   data/snapshots/github/kits/<id>.json
        |          |
        +----------+
        |
        v
catalog build and schema validation
        |
        v
src/generated/catalog.json
        |
        v
Next.js static export and GitHub Pages
```

The browser does not call GitHub for every visitor. Reaction counts and user
facts are generated ahead of deployment to avoid browser rate limits and to
keep the public catalog deterministic.

## Accessibility and Interaction

- Kits navigation is a real button with `aria-pressed`.
- The category navigation label changes from "Project categories" to a broader
  "Catalog views and project categories."
- Every component disclosure is a button with `aria-expanded` and
  `aria-controls`.
- Focus remains on the clicked disclosure after opening or closing.
- Opening another component does not move focus unexpectedly.
- The expanded project card retains its current accessible description and
  external-link behavior.
- New this week, Tavernary Pick, component role, project kind, and Community
  support are conveyed in text, not color alone.
- Mobile filter sheets identify whether they refine Projects or Kits.
- Motion follows the existing reduced-motion contract; expansion does not
  require animation.

## Responsive Behavior

### Desktop

- Kits button appears immediately left of All Projects.
- Kit filter rail replaces the project filter rail.
- Kit cards render in two columns.
- Hyper-compact component rows keep name, kind, and role on one line when space
  permits.

### Tablet

- Kit cards render in one column.
- The desktop filter rail follows the existing responsive transition to the
  filter sheet.
- Expanded project cards use the available Kit-card width.

### Mobile

- Kits appears as the first option in the mobile category menu.
- The mobile trigger reads Kits while Kits mode is active.
- Kit cards render in one column with reduced outer padding.
- Component role may wrap beneath name and kind.
- Buttons maintain the existing minimum touch-target contract.
- Expanding a component must not introduce horizontal overflow.

## Failure and Recovery Behavior

- A Kit referencing a missing or unpublished project fails the build rather
  than silently omitting the component.
- If GitHub reaction refresh fails transiently, the last known support snapshot
  remains visible and is marked stale in generated metadata.
- If no support snapshot exists, the UI shows no count rather than zero.
- If an author changes login, the durable user ID preserves ownership and the
  displayed login is refreshed during moderation.
- If a component becomes quarantined or hidden after Kit publication, the Kit
  is flagged for curator review and is hidden from the public build until its
  approved composition is safe again.
- If an edit is rejected or its checks fail, the live approved Kit is
  unaffected.

## Verification

Automated checks must cover:

- Kit schema validation and component referential integrity;
- duplicate Kit and component rejection;
- controlled purpose, frontend, scope, and role values;
- manual-approval enforcement for submissions and edits;
- blacklist precedence and whitelist non-bypass behavior;
- stable published version while a revision is pending;
- `published_at` preservation and `updated_at` advancement after approval;
- seven-day New this week boundary;
- GitHub durable-ID ownership across login changes;
- reaction snapshot fallback and staleness;
- project versus Kit URL parsing and serialization;
- Kits button placement before All Projects;
- selecting Kits hides every project card;
- selecting any project category hides every Kit card;
- mode-specific filter-panel replacement;
- shared search behavior;
- Kit filter and sort semantics;
- one-expanded-component-per-Kit behavior;
- keyboard and screen-reader disclosure semantics;
- no nested interactive-content violations;
- two-column desktop and one-column tablet/mobile Kit layouts;
- long Kit manifests with more than 20 components;
- no horizontal overflow at supported viewports;
- static export and GitHub Pages base-path behavior.

Visual review must compare project mode and Kits mode at desktop, tablet, and
mobile widths. It must include:

- an ordinary focused Kit;
- a comprehensive Kit containing more than 20 components;
- New this week and Tavernary Pick badges;
- a collapsed manifest;
- one expanded Frontend, Preset, and Extension row;
- long project and author names;
- empty, filtered, and stale-community-snapshot states.

## Initial Scope

The first release includes:

- one integrated homepage Kits mode;
- community-authored, curator-approved Kits;
- author revisions through GitHub;
- GitHub-backed identity and source history;
- Community support from GitHub `+1` reactions;
- Tavernary Picks;
- New this week for seven days;
- Kit-specific filters and sorts;
- large Kit tiles with complete hyper-compact component manifests;
- one expanded full project tile per Kit;
- whitelist and blacklist moderation records;
- static generation and GitHub Pages deployment.

The first release excludes:

- Tavernary accounts or sessions;
- client-side GitHub OAuth;
- automatic publication based on account age;
- automatic publication for whitelisted users;
- comments hosted by Tavernary;
- star ratings or downvotes;
- automatic installation;
- downloadable Kit bundles;
- copied project files;
- personalized recommendations;
- private Kits;
- live collaborative editing;
- a separate Kits landing page.
