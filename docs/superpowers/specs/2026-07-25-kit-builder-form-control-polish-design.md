# Kit Builder Form-Control Polish Design

## Goal

Keep the Kit Builder Title focus ring fully visible and render Description with the same UI typeface as Title.

## Design

The desktop `.kit-builder-panel-body` remains the vertical scroll owner, but receives enough inline padding to contain the global outward focus outline around full-width controls. The existing mobile padding remains authoritative at the mobile breakpoint. The fixed mobile panel uses percentage width rather than viewport-unit width so a reserved browser scrollbar cannot place its right edge outside the visible document.

All native text-entry controls inherit Tavernary's body typography. The existing global form-control normalization will therefore include `textarea` alongside `button`, `input`, and `select`.

## Verification

An end-to-end regression test will open a desktop Kit draft and assert that the focused Title input has at least four CSS pixels of inline clearance inside the scroll viewport. The same test will assert that Title and Description resolve to the same `font-family`. Existing mobile Kit Builder overflow and touch coverage will guard the percentage-width modal.
