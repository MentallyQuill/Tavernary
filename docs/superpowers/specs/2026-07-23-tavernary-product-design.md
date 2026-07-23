# Tavernary Product and Experience Design

**Date:** 2026-07-23

**Status:** Proposed design for user review

**Initial delivery:** Static Next.js site exported to GitHub Pages

## 1. Product Definition

Tavernary is a searchable index of the AI roleplay software ecosystem. Its
primary job is to help people discover:

- AI roleplay frontends;
- extensions, plugins, agents, and supporting tools;
- which frontends those projects support;
- how projects relate to one another;
- what has been announced, released, or actively developed recently.

Tavernary is not a storefront, review site, social network, or popularity
contest. It organizes projects by purpose, compatibility, lineage, lifecycle,
and transparent development signals. An optional Popularity sort is available
because users expect it, but it is never the default and is not presented as a
quality judgment.

The initial catalog is centered on SillyTavern while being explicitly designed
to accommodate Lumiverse, Marinara Engine, and future AI roleplay frontends.

## 2. Product Principles

1. **Search before spectacle.** The site may be visually expressive, but users
   should immediately understand that it is a discovery tool.
2. **Activity by default; popularity by request.** Development signals are
   evidence of ongoing work, not a declaration that one project is better than
   another. Popularity is an optional, plainly explained sort mode.
3. **Compatibility is evidence-based.** Tavernary must distinguish verified,
   reported, experimental, planned, broken, and unknown compatibility.
4. **Relationships matter.** Forks, ports, successors, rewrites, bundles, and
   dependencies must be visible rather than flattened into duplicate cards.
5. **Unknown is an honest value.** Missing metadata must never be silently
   inferred.
6. **Every signal links to its source.** Releases, repositories,
   announcements, compatibility claims, and licenses should be inspectable.
7. **Static first.** The initial product must work without an application
   backend, accounts, or a hosted database.

## 3. Homepage Information Architecture

The homepage is the directory. It opens directly into search, filters, sort
controls, and the project grid without a splash page or promotional hero.

### 3.1 Global Header

The header contains:

- the Tavernary identity;
- a prominent universal search field;
- a compact About link;
- a `Submit Project` action.

### 3.2 Function Navigation

An equal-width category strip sits below the header:

- All Projects;
- Frontends;
- Memory & Retrieval;
- Generation & Reasoning;
- Character & Worldbuilding;
- RPG Systems & Suites;
- Interface & Workflow;
- Developer Infrastructure.

These labels use title case and equal spacing. On desktop and tablet all eight
fit without a native horizontal scrollbar. The desktop strip is approximately
`50px` high with approximately `34px` buttons and `18px` icons. Mobile replaces
the strip with one compact category selector and retains its existing height.

### 3.3 Searchable Catalog

The catalog begins immediately with:

- a PCPartPicker-like filter rail;
- result count and catalog freshness;
- All, Active, New, and Released views;
- an optional sort control;
- standardized project tiles.

The default state shows every project until the user searches or adds filters.

## 4. Visual Direction

### 4.1 Reference Synthesis

The primary visual references are:

- [Valorant 2025 Flashback](https://www.awwwards.com/sites/valorant-2025-flashback)
  for graphic confidence, oversized typography, framed reveals, and strong
  sequencing;
- [Git Together](https://www.awwwards.com/sites/git-together) for atmospheric
  depth, character, and selective colorful illustration;
- PCPartPicker for category-first browsing, standardized comparison fields,
  and powerful filtering;
- SillyTavern for its near-black interface, warm white text, muted controls,
  and amber-orange emphasis.

Tavernary does not use the earlier “living constellation” as its primary
navigation metaphor. That direction made the ecosystem feel less organized.
Instead, the grid is the structural language of the entire interface.

### 4.2 Palette

Tavernary uses a deep-teal foundation rather than a collection of unrelated
project colors.

| Foundation role | Color |
| --- | --- |
| Page background | `#07181D` |
| Primary surface | `#0B2229` |
| Card surface | `#102B33` |
| Raised or active surface | `#173740` |
| Border | `#284A52` |
| Strong border | `#3B6068` |
| Primary text | `#F3F1E8` |
| Secondary text | `#CBD6D3` |
| Missing, unavailable, or muted text | `#6F7E82` |

The accent palette is deliberately small:

| Accent role | Color |
| --- | --- |
| Extension and Tavernary heritage orange | `#E18A24` |
| Frontend | `#D62839` |
| Preset and fresh activity | `#57C5A3` |
| Missing or proprietary license | `#6F7E82` |

Project-kind colors appear only as compact, positional accents such as type
symbols and Project Kind checkbox outlines. They do not tint whole cards or
large navigation surfaces. Functional categories remain neutral and use the
deep-teal raised surface and border system for hover and selection.

Color never carries meaning by itself. Labels, symbols, position, and tooltips
distinguish project kind, activity, and license state. In particular,
`#D62839` identifies Frontends rather than errors, while Missing and
Proprietary licenses share a muted color but retain explicit labels.

### 4.3 Graphic Character

The interface should feel like an editorial technical atlas:

- strong rectangular alignment;
- visible grid coordinates and fine rule lines;
- large condensed display typography used sparingly;
- character or project artwork in selected editorial cards;
- small data labels, activity traces, and update timestamps;
- generous negative space around dense information.

Characters and colorful artwork add identity in the foreground but do not
become navigation or obscure the catalog.

### 4.4 Motion

Motion communicates state and discovery:

- search results reorganize smoothly;
- filter chips snap into the active query rail;
- activity traces animate once when revealed;
- sort changes reorder cards without losing the current filters;
- announcements enter through restrained framed transitions;
- background grid movement is subtle and never continuous enough to distract.

The site honors reduced-motion preferences and remains fully usable without
animation.

## 5. Catalog Taxonomy

The ecosystem cannot be represented by one flat category. Tavernary uses three
independent layers.

### 5.1 Project Kind

- Frontend
- Extension
- Preset

These kinds describe delivery form rather than project size:

- a **Frontend** is a host application where roleplay happens;
- an **Extension** is installable code that adds to or supports a frontend;
- a **Preset** is configuration or prompt content loaded into a frontend,
  whether its canonical source is GitHub, Discord, or another website.

Agent frameworks, suites, shared libraries, dependencies, developer tools, and
companion services are filterable metadata characteristics rather than
mutually exclusive project kinds. Prompt packages are Presets.

### 5.2 Primary Function

Each project receives one primary function for organization:

- Memory and retrieval
- Generation and reasoning
- Character and worldbuilding
- RPG and simulation systems
- Interface and workflow
- Developer infrastructure
- Media and multimodal

These functions are catalog filters, not homepage sections.

### 5.3 Feature Tags

Projects may have multiple feature tags. Initial tags include:

- summarization;
- structured memory extraction;
- timeline or chapter memory;
- lorebook or world-book storage;
- vector search and RAG;
- active or tool-driven retrieval;
- character consistency;
- manual generation guidance;
- prompt chaining;
- multi-model orchestration;
- pre-generation analysis;
- prompt interception;
- post-processing or rewriting;
- auxiliary or sidecar generation;
- character creation;
- worldbuilding;
- campaign management;
- state, stats, quest, and NPC tracking;
- image, video, audio, or music generation;
- UI enhancement;
- scripting and macros.

A suite can span several functions without being forced into a misleading
single-purpose description.

## 6. Seed Ecosystem Review

The first catalog should include SillyTavern, Lumiverse, Marinara Engine, and
the 21 extensions installed for the local SillyTavern `default-user`.

### 6.1 Memory and Retrieval

- Summaryception
- CharMemory
- Memory Books
- Smart Memory
- Timeline Memory
- TunnelVision
- VectFox

This group demonstrates why “memory” requires subcategories. These projects use
different strategies: recursive summaries, structured extraction, lorebook
entries, timelines, vector retrieval, and model-directed retrieval.

### 6.2 Generation and Reasoning

- Guided Generations
- Polyceph
- Recast
- Recursion
- Sidecar AI
- Stepped Thinking

This group requires an **operation stage** field. A project may guide the user,
run before the main generation, intercept prompt construction, orchestrate
several models, run auxiliary calls, or rewrite a completed response.

### 6.3 Character and Worldbuilding

- CarrotKernel
- SillyTavern Character Creator
- SillyTavern World Info Recommender

### 6.4 RPG Systems and Suites

- Directive
- Megumin Suite
- RPG Companion

These demonstrate the need for campaign, simulation, tracking, media, and suite
tags. RPG Companion also demonstrates that lifecycle and successor
relationships are separate from recent repository activity.

### 6.5 Interface and Workflow

- Chat Top Bar

### 6.6 Developer Infrastructure

- LALib

### 6.7 Lumiverse

Lumiverse is a frontend with a dedicated extension framework called Spindle.
Spindle supports frontend-only, backend-only, and full-stack extensions.
Its manifest exposes entrypoints, a minimum Lumiverse version, requested
permissions, and installation metadata. Its permissions include generation,
prompt interception, tools, chat mutation, memory access, UI panels, media,
and web search.

References:

- [Spindle overview](https://docs.lumiverse.chat/)
- [Spindle manifest](https://docs.lumiverse.chat/getting-started/manifest/)
- [Spindle permissions](https://docs.lumiverse.chat/getting-started/permissions/)

Tavernary must therefore track runtime location, host version requirements,
permissions, and installation format in addition to a compatibility badge.

### 6.8 Marinara Engine

Marinara Engine is a frontend with downloadable agents and capability packages.
Its official catalog separates packages into Writer, Tracker, and Misc groups,
tracks supported modes, and uses Engine-major compatibility lanes.

Reference:

- [Marinara Agents](https://github.com/Pasta-Devs/Marinara-Agents)

Agent packages use the Extension project kind and an `Agent framework` or other
specific capability tag. Tavernary also tracks mode compatibility, package
integrity, permissions, and host-major version fields.

## 7. Entity and Relationship Model

### 7.1 Core Entities

**Project family**

The recognizable product or concept shown in search.

**Implementation**

A native version, port, fork, rewrite, or host-specific variant.

**Repository**

The source repository whose development activity, releases, and license are
measured.

**Frontend**

The host application, such as SillyTavern, Lumiverse, or Marinara Engine.

**Compatibility record**

The relationship between an implementation and a frontend, including evidence,
version range, and verification state.

**Release**

A tagged software release linked to an implementation and repository.

**Announcement**

A dated community or maintainer statement linked to a project, implementation,
or release.

**Activity snapshot**

Time-bounded development measurements generated from repository history.

### 7.2 Relationship Types

- Fork of
- Port of
- Based on
- Successor to
- Superseded by
- Rewrite of
- Bundles
- Requires
- Optional integration with

Examples from the seed set include VectFox being based on VectHare,
CarrotKernel succeeding BunnyMoTags, and RPG Companion leading into Marinara
Engine.

### 7.3 Search Presentation

Search initially shows one project-family result. The result expands to reveal
implementations and repositories. Every implementation retains independent:

- compatibility;
- lifecycle;
- activity;
- releases;
- technical requirements;
- distribution and license information.

If related repositories are functionally distinct products rather than
variants, they remain separate results connected by a relationship link.

## 8. Compatibility Model

Every compatibility record contains:

- frontend;
- native, ported, forked, or cross-platform implementation;
- minimum and maximum known frontend version;
- status: verified, maintainer-reported, community-reported, experimental,
  planned, broken, or unknown;
- evidence URL;
- date last checked;
- supported chat or application modes;
- runtime: browser, server, full-stack, or external;
- required permissions or host capabilities.

The user-facing badge summarizes evidence rather than making an unsupported
claim:

```text
SillyTavern · Native · Verified on 1.12.x
Lumiverse · Planned
Marinara · Community-reported
```

## 9. Technical Requirement Metadata

Projects may additionally declare:

- extra model calls per interaction;
- whether calls are automatic or user-triggered;
- external model or media providers;
- local companion server;
- vector database or other storage service;
- Docker, Bun, Node.js, Python, or platform requirements;
- UI footprint: background, toolbar, drawer, panel, or full-screen;
- supported group and individual chat modes;
- installation and update method;
- data written to chats, lorebooks, databanks, or local files;
- supported languages.

These fields allow users to distinguish two projects with similar goals but
very different cost, complexity, privacy, and runtime implications.

## 10. Activity and Ranking

### 10.1 Visible Signals

Tavernary displays:

- last meaningful source change;
- meaningful commits in the last 30 and 90 days;
- active weeks in the last 90 days;
- normalized source additions and deletions;
- most recent release;
- release frequency;
- active contributor count;
- repository and branch measured;
- date the metrics were refreshed.

### 10.2 Meaningful Source Changes

Activity processing excludes or discounts:

- documentation-only commits;
- generated files;
- vendored dependencies;
- lockfile-only changes;
- formatting-only mechanical rewrites;
- merge commits that would double-count underlying changes.

Code volume is logarithmically normalized and capped so a large frontend
monorepo does not automatically outrank a focused extension.

### 10.3 Activity Index

The default “Active development” ordering uses a transparent index:

- 30% active weeks in the last 90 days;
- 30% meaningful source recency;
- 25% normalized source change volume;
- 15% release recency.

The component values remain auditable through the activity-methodology view
and generated catalog data. Stars, forks, downloads, ratings, and reviews do
not affect the index.

Activity is normalized within three cohorts:

- frontends;
- extensions, plugins, agents, and suites;
- libraries, services, and development tools.

The Active view draws from all three cohorts and limits frontends to one-third
of visible slots. Unused cohort slots flow to the next highest-scoring eligible
project. This prevents large frontend monorepos from dominating the view
without hiding their activity.

### 10.4 Lifecycle Is Independent

Activity does not override lifecycle. A project can be:

- experimental;
- active;
- maintenance-only;
- deprecated;
- superseded;
- archived.

A deprecated project with a recent maintenance commit remains labeled
deprecated.

### 10.5 Community Aggregate

GitHub-hosted projects expose a compact community aggregate:

```text
stargazers_count + forks_count + subscribers_count
```

`subscribers_count` is used for watchers because GitHub's `watchers_count`
duplicates the star count. The aggregate is accompanied by a tooltip that
shows the three source values independently.

The aggregate supports the optional Popularity sort. It does not affect the
default activity ordering. Projects without GitHub community data are treated
as unscored and appear after scored projects when Popularity is selected,
rather than being assigned a misleading zero.

## 11. Announcements

Announcements are dated records rather than permanent project fields.

Sources may include:

- GitHub releases and repository notices;
- official Discord announcements;
- maintainer posts;
- community forum posts;
- project websites.

Every announcement stores its source, publication date, discovery date, and
relationship to a project or release. The initial version uses curated entries
submitted through repository changes. It does not automatically scrape private
communities.

## 12. Search and Filters

### 12.1 Searchable Content

Search covers:

- names and aliases;
- descriptions;
- project kinds;
- functions and feature tags;
- frontends and compatibility;
- maintainers and organizations;
- repository names;
- announcements;
- relationships and predecessor names.

### 12.2 Filter Groups

1. Project kind
2. Compatible frontend
3. Primary function and feature tags
4. Operation stage
5. Runtime and technical requirements
6. Lifecycle
7. Development activity
8. Distribution and trust

Filters appear in a compact PCPartPicker-like rail. Active filters are visible
as removable query chips. The URL encodes the query so a filtered catalog can
be bookmarked or shared.

Metadata chips use a maintained vocabulary and appear as selectable options in
the filter rail. Multiple selections within one filter group use OR logic.
Selections from different groups combine with AND logic. With no selected
filters, the complete catalog remains visible.

Metadata options appear as one wrapping, non-scrolling chip cloud beneath a
metadata search field. Each chip includes its label and result count. Selected
chips use a raised surface, strong border, primary text, and checkmark.
Metadata search hides nonmatching unselected chips but keeps selected chips
visible and ordered first. Search changes the option cloud only; it does not
filter catalog results until a chip is selected.

Examples such as `Suite`, `Agent framework`, `Shared library`, `Dependency`,
and `Multi-feature` preserve useful distinctions without expanding Project
Kind. Freeform repository topics do not automatically become filters.

### 12.3 Sort Modes

- Relevance
- Active development
- Recently announced
- Recently released
- Recently updated
- Popularity
- Alphabetical

Popularity orders descending by the GitHub community aggregate. Ties preserve
the prior stable ordering. Recently active remains the default.

## 13. Pages and Components

### 13.1 Home

- global search and navigation;
- equal-width function categories;
- filter rail and active query chips;
- sort and lifecycle-view controls;
- complete responsive project grid.

### 13.2 Project Tile

Every tile contains:

- function symbol and project kind;
- last update and development activity;
- GitHub community aggregate and repository size when available;
- title and up to four lines of summary;
- up to two visible rows of metadata chips, with every compatible frontend
  listed first;
- OSI-approved license identifier, Proprietary, or Missing.

The whole tile opens its canonical external source. Tavernary does not require
an internal details page in the initial release.

### 13.3 Responsive Behavior

Desktop and tablet keep all function categories visible in eight equal,
shrinkable columns. Native horizontal scrollbars are not used for primary
navigation.

At the mobile breakpoint:

- the search field occupies a full row;
- the category strip becomes a compact `Browse: All Projects` selector;
- the filter rail becomes a full-width slide-over opened by a Filters button
  with an active-filter count;
- project tiles use one column and retain the same information hierarchy;
- sort and lifecycle controls remain horizontally compact and keyboard
  accessible.

### 13.4 Mockup Preview Control

The design mockup includes a clearly separated `Desktop | Mobile` preview
toggle. Mobile preview constrains the mockup to a 390-pixel viewport. This
control exists only for design testing and is not part of the production site.

## 14. Static Technical Architecture

### 14.1 Application

- Next.js with static export
- GitHub Pages hosting
- no runtime server;
- no user accounts;
- no production database;
- client-side search and filtering;
- responsive desktop and mobile layouts.

### 14.2 Data

Human-curated project, compatibility, relationship, and announcement records
live as versioned JSON or YAML in the repository. Generated activity snapshots
and normalized search data are build artifacts.

The build validates all records against schemas before generating pages.

### 14.3 Refresh Pipeline

GitHub Actions runs on a schedule and manually to:

1. read the curated registry;
2. fetch public repository metadata, commit history, and releases;
3. calculate normalized activity snapshots;
4. preserve the last known value when an upstream source fails;
5. mark stale records;
6. validate references and relationships;
7. build and deploy the static site.

The browser does not call GitHub for every visitor, avoiding client rate limits
and inconsistent results.

### 14.4 Initial Contribution Model

Project additions and corrections arrive through pull requests to the registry.
Schema checks and source requirements make the catalog auditable without
requiring an administrative backend.

## 15. Data Freshness and Error Handling

- Every generated signal has a `refreshed_at` timestamp.
- Compatibility has a separate `checked_at` timestamp.
- Failed source refreshes retain the last successful snapshot and display a
  stale state.
- Deleted, renamed, private, or archived repositories are never silently
  removed.
- Conflicting metadata is surfaced for curator review.
- Missing values display as “Unknown,” not “No.”
- Compatibility is never inferred solely from similar code or naming.
- Announcement excerpts remain short and link to the original source.

License is one distribution-and-trust field. Tavernary checks for a root
`LICENSE*` file. A recognized OSI-approved license displays its SPDX identifier
in secondary text. No root license displays Missing in muted gray. A present
but custom, unrecognized, source-available, or restrictive license displays
Proprietary in the same muted gray. The explicit label and tooltip distinguish
Missing from Proprietary. Package metadata never overrides contradictory root
license text.

## 16. Accessibility and Performance

- Keyboard-accessible search, filters, tabs, cards, and external source links
- Visible focus states
- Semantic headings and landmarks
- Text and icons accompany color-coded state
- WCAG-conscious contrast
- Reduced-motion support
- Lazy-loaded editorial imagery
- Minimal animation work before first interaction
- Usable catalog when JavaScript animation is disabled
- Mobile filter drawer with persistent active-filter summary
- Compact mobile category selector with no native horizontal scrollbar

## 17. Verification Strategy

### Data Tests

- schema validation for every entity;
- unique identifiers and aliases;
- valid relationship targets;
- compatibility evidence requirements;
- implementation-to-repository consistency;
- activity calculation fixtures;
- stale-source behavior;
- conflicting metadata detection.

### Application Tests

- static export and GitHub Pages base-path behavior;
- search relevance;
- every filter and sort mode;
- Popularity ordering, stable ties, and unscored projects placed last;
- shareable query restoration;
- responsive directory layouts;
- keyboard navigation;
- reduced-motion behavior;
- project and frontend route generation;
- broken-link and missing-image fallbacks.

### Visual Review

- desktop, tablet, and mobile;
- dense and sparse result sets;
- long project names and descriptions;
- projects with multiple implementations;
- projects with many compatibility states;
- dark-theme contrast and orange overuse;
- motion that never obscures search or filtering.

## 18. Initial Scope

The first release includes:

- the search-first homepage and complete directory;
- responsive desktop, tablet, and mobile layouts;
- optional Popularity sort;
- the 21 reviewed SillyTavern extensions;
- SillyTavern, Lumiverse, and Marinara Engine;
- compatibility, relationships, lifecycle, requirements, releases,
  announcements, and activity snapshots;
- static GitHub Pages deployment;
- pull-request-based catalog contributions.

The first release does not include:

- reviews, ratings, comments, or voting;
- accounts or saved personal lists;
- popularity as the default ordering or as a quality claim;
- internal project dossier or details pages;
- automated scraping of private communities;
- direct installation from Tavernary;
- a hosted application database;
- maintainer ownership claims;
- automatic compatibility claims without evidence.

## 19. Success Criteria

The design succeeds when a visitor can:

1. discover an unfamiliar AI roleplay project quickly;
2. understand what it does without decoding community jargon;
3. determine which frontend implementations are available;
4. distinguish native support, ports, forks, and successors;
5. see whether development is recent and why Tavernary says so;
6. understand important runtime and installation requirements;
7. follow every important claim back to a source;
8. search and share a filtered catalog without an account.

Tavernary should feel distinctive and alive while remaining more organized,
transparent, and useful than a conventional showcase gallery.
