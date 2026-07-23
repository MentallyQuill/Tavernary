# Card Identity and Wordmark Alignment Design

## Goal

Quiet the project-type treatment on catalog cards and make the Tavernary
wordmark align visually with the tagline beneath it.

## Card Identity

Standard cards retain the existing `.function-symbol` wrapper and SVG markup,
but the wrapper becomes visually frameless:

- remove its border;
- remove its colored background;
- remove its corner radius;
- reduce the wrapper from `38px × 38px` to `23px × 23px`;
- keep the SVG at `23px × 23px`;
- retain `var(--kind-color)` on the icon;
- reduce the `.identity` gap from `8px` to `4px`.

The identity group's left edge remains unchanged. The unframed icon's left edge
therefore continues to align exactly with the card title's left edge. The type
heading moves closer to the icon because the wrapper no longer contributes
empty horizontal space and the explicit gap is reduced.

Compact cards already use an unframed icon and remain unchanged. Their existing
`15px` icon size and compact spacing continue to override the standard-card
rules.

## Header Wordmark

Increase `.brand-name` from the inherited `20px` size to `28.85px`.

Current live measurements are:

- Tavernary glyph width: approximately `90.9px`;
- tagline glyph width: approximately `133.9px`;
- required proportional scale: approximately `1.473`.

The initial proportional estimate of `29.5px` rendered about `3.19px` too
wide because inherited letter spacing does not scale with the child font size.
At the browser-measured `28.85px`, the Tavernary wordmark's glyph edges align
with the tagline's measured left and right edges. Both remain left-aligned
inside `.brand-copy`.

Keep unchanged:

- the `60px` desktop and `55px` mobile emblem sizes;
- the `7px` emblem-to-copy gap;
- tagline size, spacing, copy, and color;
- desktop top-bar height;
- mobile header structure and submission action.

The wider wordmark does not widen the brand block because the tagline already
sets its current maximum width.

## Responsive Behavior

Apply the `28.85px` wordmark on desktop and mobile. The full copy block remains
shorter than the emblem at both sizes, so vertical centering continues to use
the emblem as the dominant height.

Reject any collision between the brand block and `Submit Project` at the
390px mobile preview. Preserve zero horizontal overflow.

## Verification

Static and browser verification must confirm:

- standard `.function-symbol` has no visible border or background;
- standard icon bounds are `23px × 23px`;
- icon color still equals the card's project-kind color;
- identity and title left edges match;
- the type-heading gap is approximately `4px`;
- compact icon dimensions and frameless treatment remain unchanged;
- Tavernary and tagline text-range left and right edges align within `1px`;
- the desktop top bar remains `66px`;
- the mobile logo block does not collide with `Submit Project`;
- desktop and mobile have no horizontal overflow;
- the inline JavaScript still parses;
- the browser console has no warnings or errors.
