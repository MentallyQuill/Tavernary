# Catalog Visual Alignment Design

## Purpose

Bring the production catalog back into visual alignment with the preserved
`docs/reference/mockups/catalog-wall-responsive-v7.html` acceptance fixture
without changing the production data model, catalog behavior, or contribution
workflows.

The five-project production slice remains real and functional. The mockup
controls visual identity, typography, card anatomy, spacing, and responsive
hierarchy; later approved product decisions control data, copy, links, and
sorting behavior.

## Approach

Use a surgical reference port. Keep the current React component boundaries and
transcribe the relevant mockup markup and CSS into those components. Do not
replace the catalog application wholesale and do not import runtime code or
styles from `docs/reference`.

This approach minimizes behavioral risk while restoring the approved visual
contract.

## Preserved Production Behavior

The alignment pass must not change:

- the five production project records or their ordering rules;
- search, filters, views, URL state, card density, or mobile filter-sheet
  behavior;
- Recent Activity, Activity Strength, Popularity, or Alphabetical sorting;
- whole-card external project links;
- About, Help, and Submit Project destinations;
- GitHub snapshot refresh, generated catalog, or moderation behavior;
- GitHub Pages export and base-path handling.

Differences caused by real production data are not visual defects. Project
count, project names, summaries, activity values, repository facts, filter
counts, and timestamps remain production-derived.

## Branding and Typography

Production must use the supplied Tavernary quill-and-inkwell artwork preserved
at `docs/reference/assets/tavernary-logo.png`. A deployable copy belongs under
`public/`; production must not load the reference fixture directly.

The header follows the mockup's brand order and treatment:

1. orange Tavernary wordmark;
2. quill-and-inkwell artwork;
3. approved site actions.

The catalog uses the mockup's sans-serif typography throughout. Remove the
Georgia overrides from the brand name, project count, and project titles.
Retain the existing body font stack and match the mockup's weights, sizes, and
line heights at desktop and mobile widths.

The approved Help link remains present. At mobile width, About and Help must
not crowd the primary brand row or force Submit Project to wrap. They remain
accessible through a compact secondary action treatment beneath the primary
header content.

## Card Anatomy

Project cards retain their current semantic `<a>` and accessibility behavior
but adopt the mockup's visual anatomy:

- uniform border on all four sides with no colored left stripe;
- flat approved card surface without the production-only diagonal gradient;
- sans-serif project title at the mockup's size and weight;
- mockup summary spacing and line capacity;
- divider above the metadata footer;
- subdued, unboxed license text at the bottom right;
- mockup chip size, weight, border, and color treatment;
- repository community and size facts remain visible on mobile;
- mockup card height and internal spacing at desktop and mobile widths.

Project-kind color remains on the function icon and label. It must not become a
full-card accent stripe.

Existing hover and focus behavior remains accessible, but decorative lift and
shadow must be restrained to the mockup's flatter presentation.

## Mobile Header and Controls

At the 390-by-844 acceptance viewport:

- the first row contains the orange wordmark, supplied logo, and an unwrapped
  Submit Project button;
- the tagline remains under the wordmark;
- search occupies its own full-width row and uses the production-functional
  input;
- About and Help appear in a compact secondary action row;
- the category chooser matches the mockup's Browse hierarchy and ends with a
  chevron rather than replacing that affordance with the project count;
- the filter button uses the mockup's compact descending-line symbol;
- the density button uses the preserved collapse icon rather than three
  horizontal bars;
- All, Active, New, and Released remain usable without horizontal overflow;
- the production sort labels remain authoritative.

The longer mockup search placeholder is restored:
`Search projects, capabilities, frontends, or maintainers…`.

## Desktop Filters and Navigation

The first alignment pass restores visible reference vocabulary and controls:

- `All Projects` capitalization;
- `System Presets` in category navigation;
- `Character & Worldbuilding` instead of `Authoring`;
- `Filters` and `Clear all`;
- `Compatible frontend`;
- `Project kind`;
- `Capabilities & characteristics`;
- frontend and metadata filter-search inputs.

Controls operate on the five production records. Counts and available choices
remain data-derived. Search inputs filter the visible options within their own
facet and do not alter the catalog query until a checkbox is selected.

## Visual Effects

Remove the page-level radial gradient, card diagonal gradient, strong
full-card kind stripes, and pronounced hover lift introduced in production.
Retain the approved deep-teal palette, thin borders, accessible focus
indicators, and reduced-motion support.

## Testing

Testing follows a red-green-refactor sequence.

Add source-level contract tests that fail against the current production
implementation and assert:

- the deployable supplied logo is used in the approved order;
- catalog headings and card titles use the sans-serif family;
- project cards have no left accent stripe and include the footer divider;
- licenses use subdued unboxed styling;
- mobile community and repository-size facts remain visible;
- mobile About and Help do not occupy the primary brand row;
- the mobile chooser exposes a chevron;
- the approved filter and density symbols are rendered;
- restored copy and filter controls are present.

Browser tests verify behavior at 1440 by 1000, 1024 by 900, and 390 by 844.
Visual acceptance must compare the production composition with the preserved
mockup, not merely compare production against a production-generated
snapshot. Production data differences are masked or normalized only where
needed to make the comparison meaningful.

The final gate is:

1. focused unit and component tests;
2. full `npm run check`;
3. desktop, tablet, and mobile end-to-end tests;
4. reference-backed visual tests;
5. manual side-by-side inspection of the local export and preserved mockup;
6. deployed-site smoke verification after publication.

## Acceptance Criteria

The pass is complete when:

- the first-screen desktop and mobile compositions are recognizably the same
  design as the v7 mockup;
- branding uses the supplied artwork and approved orange wordmark;
- all catalog headings and card titles use the reference sans-serif system;
- card anatomy, metadata footer, license presentation, and mobile repository
  facts match the reference;
- the mobile header is uncluttered and Submit Project does not wrap;
- approved production-only behavior remains functional;
- visual tests can fail when production drifts from the preserved reference;
- all automated and live smoke checks pass.
