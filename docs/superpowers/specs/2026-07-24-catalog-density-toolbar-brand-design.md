# Catalog Density, Toolbar, and Brand Refinement

## Goal

Bring the production catalog closer to the approved responsive mockup by fixing
the search focus treatment, simplifying catalog controls, making compact cards
meaningfully denser, tightening tile tooltips, constraining capability filters,
promoting project submission, and replacing the quill mark with the supplied
three-gem artwork.

## Search

The main search field keeps its existing outer focus treatment. The browser's
native input outline and input-level focus shadow are removed so focusing the
field produces one clear focus boundary instead of a box within a box. Keyboard
focus remains visibly indicated by the containing search control.

## Capability Filters

The secondary search input under “Capabilities & characteristics” is removed.
Capability chips remain in their existing wrapped layout.

In the collapsed state, the chip container displays at most four rows. A “Show
more” button appears only when the chip content exceeds those four rows. The
expanded state shows every capability and changes the control to “Show fewer.”
Selected capabilities that would otherwise fall outside the first four rows
remain visible while collapsed so an active filter is never hidden.

The overflow decision must adapt to the available filter-rail or mobile-sheet
width rather than assuming a fixed number of chips per row.

## Catalog Toolbar

The All, Active, New, and Released tab group is removed from the rendered
toolbar. Existing URL parsing may continue accepting old `view` values, but the
removed tabs are no longer offered as controls.

The primary desktop control row is:

1. Project count
2. Compact-card toggle
3. Sort dropdown

The catalog refresh timestamp remains subordinate to the project count. On
mobile, the filter-sheet button remains available and the count, density, sort,
and filter controls reflow without horizontal clipping.

## Compact Cards

Compact mode reuses the standard project-card markup and the existing density
query state. It applies the compact contract from the approved mockup:

- cards use content-driven height with reduced padding;
- the top row, category icon, kind label, and title spacing are tightened;
- project summaries are hidden;
- aggregate community scores are hidden;
- GitHub repository sizes and preset artifact sizes are hidden;
- activity, commit age, preset version, chips, and license remain visible;
- the lower metadata row uses reduced spacing and a single compact chip row.

Standard cards remain unchanged except where the shared tooltip wording is
improved.

## Tile Tooltips

Tooltips remain portal-rendered so card overflow cannot clip them. Their copy is
short and factual:

- type icon: primary category followed by project kind, such as
  “Interface & Workflow Extension”;
- activity graph: “Active in 4 of the last 12 weeks”;
- commit age: date and relative age without explaining implementation details;
- community score: total, stars, forks, and subscribers without introductory
  prose;
- repository or artifact size: the value and unit only;
- chips and licenses: their existing short catalog definitions.

The accessible, visually hidden card description retains enough context to
describe the complete card even when compact mode hides visible facts.

## Submission Button

The Submit Project button uses the Tavernary heritage orange
`#E18A24` as its fill and the page background `#07181D` as its text color. Its
hover and focus treatments stay within the approved palette and preserve clear
keyboard focus.

## Brand Artwork

The supplied `Tavernary-gems.png` is copied into the site's public assets
without raster modification. It replaces the quill/inkwell image in the header
and sits to the right of the Tavernary title and tagline. Its rendered height is
slightly greater than the combined brand-copy block, with proportional width
and responsive sizing that does not crowd the mobile actions.

Raster pixels remain exempt from the CSS color-token audit.

## Verification

Automated checks cover:

- one search focus boundary;
- removal of the capability search;
- four-row capability collapse, overflow expansion, and selected-chip
  visibility;
- toolbar control removal and order;
- compact mode's hidden and retained card facts;
- concise tooltip copy;
- inverted Submit Project colors;
- the new public brand asset and header reference;
- desktop and mobile layout behavior;
- the existing CSS palette audit.

Desktop and mobile screenshots are compared against the approved mockup after
the functional checks. The full repository verification gate must pass before
the work is considered ready to integrate or deploy.
