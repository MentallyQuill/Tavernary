# Controlled Tag Taxonomy and Collapsible Cloud Design

## Goal

Replace the mock catalog's project-specific capability labels with one small,
literal vocabulary shared by cards and filters. Reduce the initial height of
the `Capabilities & Characteristics` filter without hiding selected or searched
tags.

## Vocabulary Contract

The catalog uses these controlled tags:

1. `Memory & Retrieval`
2. `Planning & Reasoning`
3. `Model Routing`
4. `Review & Validation`
5. `State & Simulation`
6. `Campaigns & RPG`
7. `Character & Worldbuilding`
8. `Prompt Engineering`
9. `Text Processing`
10. `Interface & Navigation`
11. `Developer Tools`
12. `Extension Development`
13. `Automation`
14. `Agents`
15. `Multi-user`
16. `External Service`
17. `Deprecated`
18. `Adult Content`

This is a one-to-one vocabulary:

- Every capability or characteristic chip displayed on a card uses one of
  these exact labels.
- Every option in the capability filter is generated from those same card
  labels.
- There are no aliases, hidden mappings, or project-specific variants.
- Compatible frontends remain separate leading card chips and a separate
  filter.
- Project kind remains a separate field and filter.

## Mock Catalog Assignments

| Project | Controlled tags |
| --- | --- |
| Lumiverse | `Developer Tools`, `Extension Development`, `Automation` |
| Marinara Engine | `Agents`, `State & Simulation`, `Extension Development` |
| Memory Books | `Memory & Retrieval`, `Review & Validation`, `Automation` |
| Recursion | `Planning & Reasoning`, `Model Routing`, `Review & Validation`, `Automation` |
| Directive | `Campaigns & RPG`, `State & Simulation`, `Character & Worldbuilding`, `Automation` |
| CarrotKernel | `Character & Worldbuilding`, `Developer Tools` |
| VectFox | `Memory & Retrieval`, `External Service` |
| Chat Top Bar | `Interface & Navigation` |
| LALib | `Developer Tools`, `Extension Development` |
| Polyceph | `Planning & Reasoning`, `Model Routing` |
| Smart Memory | `Memory & Retrieval`, `Review & Validation`, `Multi-user` |
| RPG Companion | `Campaigns & RPG`, `State & Simulation`, `Deprecated` |
| Celia V5.4 | `Prompt Engineering`, `Text Processing`, `Character & Worldbuilding` |
| Marinara's Essentials | `Prompt Engineering`, `Text Processing`, `Character & Worldbuilding`, `Adult Content` |

The assignments describe the current mock summaries. Production catalog
assignments will be curated from verified project information.

## Collapsed Filter Cloud

The capability cloud initially occupies approximately four wrapped chip rows.
The implementation measures the rendered cloud rather than assuming a fixed
number of chips per row. If selected tags alone require more than four rows,
keeping every selected tag visible takes priority over the height target.

Collapsed ordering is:

1. selected tags;
2. remaining tags by descending project count;
3. alphabetical order for equal counts.

Tags beyond the fourth rendered row are hidden. A full-width control beneath
the visible cloud reads `+ N more tags`, where `N` is the number currently
hidden. Activating it expands the complete cloud and changes the control to
`Show fewer tags`.

Collapsing restores the four-row presentation. Selected tags remain visible and
sort first, even when they would otherwise fall below the cutoff.

## Search and Filtering

Entering text in the metadata search:

- filters only the available tag chips, not catalog cards;
- temporarily shows every matching tag without the four-row cutoff;
- keeps selected tags visible even if they do not match the query;
- suppresses the expand/collapse control while a query is active.

Clearing the search restores the prior expanded or collapsed state.

Selecting multiple capability tags continues to use OR logic. Capability
selection remains ANDed with other facets, global search, status controls, and
the active top-level category. Existing removable query chips and `Clear all`
remain synchronized with the controlled tags.

## Responsive Behavior

Desktop and mobile use the same vocabulary, ordering, counts, and expansion
state rules. On mobile, the outer filter drawer owns vertical scrolling; the
capability cloud never introduces an inner scrollbar.

The four-row limit is based on the actual wrapped cloud in the current
viewport. Resizing or switching preview modes recalculates which unselected
tags fit while preserving selection and expanded state.

## Accessibility

- The toggle is a real button with `aria-expanded` and an
  `aria-controls` reference to the cloud.
- Hidden tags are removed from keyboard navigation.
- Selected tags remain operable in collapsed and searched states.
- Search, expand, collapse, selection, query-chip removal, and `Clear all` are
  keyboard accessible.
- Existing focus styling and reduced-motion behavior remain intact.

## Verification

Static and browser verification must confirm:

- all non-frontend card chips belong to the 18-tag vocabulary;
- every filter tag exactly matches a card tag;
- old project-specific labels are absent;
- collapsed desktop and mobile clouds occupy no more than four wrapped rows
  unless selected tags alone require additional rows;
- the toggle reports the exact number of hidden tags;
- expanding and collapsing preserve selections;
- selected tags remain visible when collapsed;
- searching reveals all matches and does not change catalog results;
- capability selections retain OR logic;
- query-chip removal and `Clear all` remain synchronized;
- resizing recalculates the cutoff without horizontal or nested overflow;
- inline JavaScript parses and the browser console has no errors.
