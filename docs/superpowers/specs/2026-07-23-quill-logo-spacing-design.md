# Header Lockup, Presets Navigation, and Card Spacing Design

## Goal

Replace the Tavernary header emblem with the approved quill-and-inkwell
artwork, anchor the text at the upper-left of the header, add Presets to the
project navigation, and give standard-card project identities slightly more
breathing room.

## Header Lockup

Use `C:\Users\Keptin\Downloads\Tavernary_logo.png` as the source artwork and
embed an exact copy in the self-contained catalog mockup.

Order `.brand-copy` before `.brand-logo` so Tavernary and its tagline begin at
the header's existing left content edge and the artwork sits to their right.
Vertically center the portrait artwork against the complete two-line text
block.

The artwork's layout box follows its portrait aspect ratio:

- desktop: approximately `45px × 60px`;
- mobile: approximately `41px × 55px`;
- `object-fit: contain`;
- `6px` gap between `.brand-copy` and the emblem.

Keep unchanged:

- the `28.85px` Tavernary wordmark;
- the wordmark and tagline copy, colors, and measured edge alignment;
- the desktop top-bar height;
- the mobile header structure and `Submit Project` action.

The artwork must remain visually legible without crowding the wordmark or
creating a collision with the mobile submission button.

## Presets Navigation

Use `C:\Users\Keptin\Downloads\preset.svg` as the source for a new
`#i-preset` symbol. Preserve its `0 0 24 24` view box, convert its black fills
to `currentColor`, and retain both source paths. The source file's SHA-256 is
`00342F3BEE72D0ED4C948A684673B4D79E9BC6E204516A5C3294D3604798EF1C`.

Add **Presets** immediately after **Frontends** in the desktop category strip
and the mobile category menu. Expand the desktop strip from eight to nine equal
columns. Use the established Preset mint, `#57C5A3`, for the Presets navigation
icon and label.

Selecting Presets filters by `card.dataset.kind === "preset"`. Do not change
the cards' functional `data-category` values: presets continue to appear under
Generation & Reasoning as well as in the dedicated Presets view. **All
Projects** remains the default.

## Card Identity Spacing

Increase the standard-card `.identity` icon-to-label gap from `4px` to `8px`.
The project-kind icon remains frameless, retains its existing size and kind
color, and stays aligned with the left edge of the card title.

Compact cards retain their existing `6px` gap and all other compact sizing.

## Verification

Static and browser verification must confirm:

- the corrected quill-and-inkwell artwork appears in desktop and mobile headers;
- the artwork is not distorted or clipped;
- the wordmark and tagline begin at the header's existing left content edge;
- the artwork appears to the right of the text with an approximately `6px` gap;
- Tavernary and tagline text-range edges remain aligned within `1px`;
- the artwork remains vertically centered against the complete text block;
- the mobile brand block does not collide with `Submit Project`;
- desktop and mobile expose a Presets navigation option immediately after
  Frontends;
- the Presets icon matches the supplied SVG geometry and uses `#57C5A3`;
- the desktop category strip has nine equal columns without clipping;
- Presets navigation shows both preset cards and no non-preset cards;
- Generation & Reasoning still includes its preset cards;
- All Projects remains the default view;
- standard card identity gaps measure approximately `8px`;
- compact card identity gaps remain approximately `6px`;
- desktop and mobile have no horizontal overflow;
- the inline JavaScript still parses;
- the browser console has no warnings or errors.
