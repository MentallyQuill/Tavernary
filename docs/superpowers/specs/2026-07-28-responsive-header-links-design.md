# Responsive Header Links Design

## Goal

Use the available responsive header space to keep Tavernary's Help entry point
visible and to restore both utility links on tablet widths.

## Responsive Contract

The site action links retain their existing document order:

1. About
2. Help
3. Submit Project

Their visibility is:

- Desktop, above 1050px: show About, Help, and Submit Project.
- Tablet, 761px through 1050px: show About, Help, and Submit Project.
- Mobile, up to 760px: hide About; show Help immediately to the left of Submit
  Project.

The existing link destinations, text, styling, and accessibility semantics do
not change.

## Implementation

Give the About and Help links distinct semantic CSS classes while retaining
their shared `top-link` styling. Remove the tablet rule that hides all
`top-link` elements. Narrow the mobile visibility rule so it hides only About.
Because Help already precedes Submit Project in the markup, no duplicate markup
or explicit CSS reordering is needed.

## Testing

Add focused Playwright assertions at representative desktop, tablet, and mobile
viewport widths. The test must prove:

- all three links are visible on desktop and tablet;
- About is hidden on mobile;
- Help and Submit Project are visible on mobile; and
- Help appears to the left of Submit Project on mobile.

The responsive test must fail against the current CSS before production styles
are changed, then pass after the minimal implementation.

## Non-goals

- Redesigning the header or changing its breakpoints.
- Changing button dimensions, typography, colors, or destinations.
- Changing the search row, brand lockup, or category navigation.
