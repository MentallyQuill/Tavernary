# Kits Filter Unification Design

**Date:** 2026-07-25

**Status:** Approved for specification

**Scope:** Unify the Kits filter rail with All Projects and expand Kit discovery filters

## Goal

Make the Kits filter rail look and behave like the All Projects filter rail,
while adding the useful Kit and contained-project facets already supported by
Tavernary's build-time catalog data.

The result must:

- use the same typography, spacing, controls, counts, disclosure patterns,
  mobile sheet treatment, and legal footer as All Projects;
- retain the existing dual-thumb minimum/maximum Kit-size slider;
- add useful contained-project filters using predictable matching semantics;
- remain static-first and URL-restorable;
- avoid popularity thresholds and filters that duplicate existing sorts.

## Current Problems

The Kits filter panel uses the shared outer rail class but implements its
contents separately. This produces visible and behavioral drift:

- desktop Kits has no `Filters` title row or top-level `Clear all`;
- mobile Kits uses a text `Close` button instead of the shared close icon;
- headings, search fields, checkboxes, counts, chips, disclosures, and clear
  controls do not consistently follow the All Projects patterns;
- Kits omits the shared compact legal footer;
- options do not show result counts;
- larger option groups are not searchable or collapsible;
- the current filter set is limited to compatible frontend, purpose, one
  included project, Kit size, and Tavernary Pick.

This is a structural divergence, not merely a stylesheet problem.

## Approved Filter Set

The Kits rail will contain these groups in this order:

1. **Compatible frontend**
2. **Purpose**
3. **Includes project**
4. **Kit creator**
5. **Included project kind**
6. **Capabilities & characteristics**
7. **Development**
8. **License**
9. **Kit size**
10. **Kit status**

### Compatible Frontend

This remains a multi-select facet derived from each Kit's frontend labels. It
uses the All Projects list treatment, including option counts, search, and
collapsed overflow when needed.

### Purpose

This remains a multi-select facet derived from the primary functions
represented by a Kit's non-Frontend components. It uses the shared metadata
chip-cloud treatment because the vocabulary can be broad.

### Includes Project

This remains a single searchable canonical-project selector in V1. Its visual
treatment must use the same input typography, border, background, focus ring,
and spacing as All Projects search controls.

The visible option label is the project's display name. The stored and
serialized value remains its canonical project ID.

### Kit Creator

This is a searchable multi-select facet derived from Kit authors. Each option
shows the GitHub login and a count of matching Kits. Creator identity is keyed
by durable numeric GitHub user ID; the login remains display-only.

The URL representation must therefore use the numeric ID, not the mutable
login. Active-query tokens display the current login.

### Included Project Kind

This multi-select facet answers whether a Kit contains at least one component
of a selected kind.

Options are:

- Extension
- System Preset

Frontend is omitted because every valid Kit already contains a Frontend, so it
would not narrow results. The controls use the same kind-colored checkbox
treatment as All Projects.

### Capabilities & Characteristics

This multi-select facet is the union of capability labels from all resolved
components in a Kit. It uses the shared searchable/collapsible metadata
chip-cloud treatment with counts.

### Development

This multi-select facet reuses the All Projects options and definitions:

- Active this month
- Recently released
- Dormant

A Kit matches an option when at least one included component matches it.
Activity is evaluated against the catalog's build timestamp, exactly as in All
Projects.

### License

This multi-select facet reuses the All Projects license buckets:

- Open source
- Proprietary
- Pending verification
- Missing license

A Kit matches an option when at least one included component has that license
status. The group title and supporting control labels must make clear that this
describes included projects, not a license assigned to the Kit as a bundle.

### Kit Size

Kit size remains one inclusive dual-thumb range from 3 to 50 projects. It keeps
the existing minimum and maximum readouts and must not be replaced by number
fields, presets, or separate sliders.

The range is restyled only as needed to align its legend, spacing, typography,
focus treatment, and color restraint with the All Projects rail.

### Kit Status

This group contains two independent boolean options:

- Tavernary Pick
- All components available

`All components available` matches Kits whose `flaggedProjectCount` is zero.
The inverse is not added as a separate option; users can omit this filter when
they are willing to see Kits containing flagged components.

## Matching Semantics

Selections within one multi-select group use **OR**. Different groups use
**AND**.

Contained-project facets use existential matching: a Kit matches when at least
one included project qualifies.

For example:

```text
(Extension OR System Preset)
AND (Open source)
AND (Active this month)
AND (Kit size 5 through 12)
```

means the Kit must:

- contain an Extension or a System Preset;
- contain at least one open-source component;
- contain at least one component active within the last 30 days; and
- contain between 5 and 12 components, inclusive.

The matching component does not need to be the same component across different
groups. This follows the established OR-within and AND-across catalog contract.

Search text remains a separate AND condition over the existing Kit searchable
text.

## Result Counts

Every discrete filter option displays a count using the same visual treatment
as All Projects.

Counts are contextual:

- apply search text and every active filter outside the option's own group;
- ignore selections in the option's own group while calculating that group's
  counts;
- show the number of Kits that would remain if that option were included;
- keep selected zero-count options visible so users can remove them.

The Kit-size slider does not display per-value counts. Its current minimum and
maximum readouts provide its feedback.

## Shared Presentation Architecture

The All Projects and Kits panels should share reusable filter presentation
primitives rather than copying JSX and relying on coincidental CSS classes.
The shared layer should cover:

- desktop title row with `Filters` and `Clear all`;
- mobile heading with `Refine catalog`, `Filters`, and the icon close button;
- list groups with optional search, counts, collapse, and selected-option
  pinning;
- metadata chip groups with search, counts, and disclosure;
- consistent search inputs;
- the compact legal footer;
- common desktop aside and mobile modal-sheet framing.

Project and Kit modules remain responsible for:

- defining their option sets;
- deriving labels and contextual counts;
- updating their query types;
- applying domain-specific matching;
- rendering specialized controls such as Includes project and Kit size.

This boundary keeps visual behavior unified without forcing project and Kit
filter semantics into one oversized component.

## Query and URL Contract

`KitQuery` gains fields for:

- creator GitHub user IDs;
- included project kinds;
- component capabilities;
- component development states;
- component license states;
- all-components-available status.

Existing fields remain:

- frontends;
- purposes;
- included project ID;
- minimum and maximum project count;
- Tavernary Pick;
- sort.

Every new field must round-trip through the existing URL parser and serializer.
Array values are deduplicated and serialized deterministically. Invalid values
fall back safely without breaking the page.

Changing catalog modes continues to preserve only fields belonging to the
active mode. `Clear all` resets all Kit filters and search while preserving the
selected Kit sort, matching the current catalog behavior.

Each active filter appears in the shared active-query row and can be removed
independently. The size range remains one combined token.

## Data Derivation

No registry schema or runtime service is required.

Filter data derives at build time or from the generated browser catalog:

- creator comes from `CatalogKit.author`;
- project kinds come from `CatalogKit.components[].kind`;
- capabilities, activity, and license come from each resolved
  `CatalogKit.components[].project`;
- availability comes from `CatalogKit.flaggedProjectCount`;
- size comes from `CatalogKit.components.length`.

Flagged or unresolved component rows do not contribute capability, activity, or
license labels when their resolved project data is unavailable. Their preserved
kind still contributes to Included project kind. They continue to contribute to
Kit size.

## Accessibility

The unified filter presentation must preserve:

- semantic `fieldset` and `legend` grouping;
- explicit accessible names for every checkbox, chip, search field, slider, and
  close control;
- keyboard access to all controls and disclosures;
- visible focus states matching the All Projects panel;
- modal focus trapping, background inerting, Escape dismissal, and focus return
  on mobile;
- selected state conveyed through native control state, not color alone;
- minimum and maximum slider values announced with distinct labels.

Counts are supporting text and must not replace the option's accessible name.

## Responsive Behavior

Desktop and tablet retain the left filter rail. Mobile retains the modal filter
sheet.

The same groups, ordering, active state, and counts appear in both surfaces.
Mobile does not receive a reduced filter set. Long groups use the same
search/disclosure behavior so the sheet remains navigable without horizontal
overflow.

## Empty, Sparse, and Error States

- A group with no available options is omitted.
- Search within a facet may show a compact `No matching options` message.
- Selected options remain visible even if their contextual count becomes zero.
- Missing resolved project data never throws or excludes a Kit unless an active
  filter requires unavailable derived data.
- If all Kits are filtered out, the existing filtered-result empty state
  remains responsible for recovery guidance.

## Explicit Non-Goals

This change does not add:

- supporter-count thresholds;
- popularity, rating, or review filters;
- recently published or recently updated filters that duplicate sort choices;
- a Kit-level license;
- a replacement for the dual-thumb Kit-size range;
- runtime GitHub requests, accounts, OAuth, or a backend;
- registry schema changes;
- changes to Kit cards, moderation, selection, or the builder workflow.

## Verification

### Unit Tests

Cover:

- OR-within and AND-across matching;
- existential matching for every contained-project facet;
- independence of matches across different component facets;
- creator matching by numeric GitHub user ID;
- all-components-available behavior;
- inclusive Kit-size boundaries;
- contextual option counts;
- query parsing, invalid-value fallback, deduplication, and deterministic
  serialization;
- individual active-query token removal and full clearing;
- omission of Frontend from Included project kind;
- unresolved and flagged component behavior.

### Component Tests

Verify:

- Kits and All Projects share title, clear, search, count, disclosure, mobile
  close, and legal-footer treatments;
- every approved Kit filter group renders in the agreed order;
- the Kit-size control remains one dual-thumb range with no number fields;
- searchable creator, project, frontend, and metadata groups work;
- selected zero-count options stay removable;
- mobile uses the complete filter set and accessible modal behavior.

### Browser and Visual Tests

Verify desktop and mobile:

- visual alignment between All Projects and Kits filter surfaces;
- long creator, capability, and purpose lists;
- combined filters and active-query removal;
- minimum, maximum, and narrowed size ranges;
- filtered-empty recovery;
- focus, keyboard, and mobile dismissal behavior;
- no horizontal overflow;
- no regressions to the adjacent Kit Builder layout.

## Success Criteria

The design is complete when:

- Kits visibly uses the All Projects filter language;
- all ten approved groups are available on desktop and mobile;
- the dual-thumb Kit-size range is retained;
- contained-project facets match when at least one component qualifies;
- option counts and active-query tokens remain accurate under combinations;
- all filter state is URL-restorable and clearable;
- the implementation stays within Tavernary's static-first architecture.
