# Quill Logo and Card Identity Spacing Design

## Goal

Replace the Tavernary header emblem with the approved quill-and-inkwell artwork
while preserving the established wordmark alignment and responsive header
layout. Give standard-card project identities slightly more breathing room.

## Header Logo

Use `C:\Users\Keptin\Downloads\Tavernary_logo.png` as the source artwork and
embed a copy in the self-contained catalog mockup.

The image is portrait-oriented, so its layout box must follow the artwork's
aspect ratio instead of forcing it into the previous square dimensions:

- desktop: approximately `45px × 60px`;
- mobile: approximately `41px × 55px`;
- `object-fit: contain`;
- `6px` gap between the emblem and `.brand-copy`.

Keep unchanged:

- the `28.85px` Tavernary wordmark;
- the wordmark and tagline copy, colors, and measured edge alignment;
- vertical centering against the complete wordmark-and-tagline block;
- the desktop top-bar height;
- the mobile header structure and `Submit Project` action.

The logo must remain visually legible without crowding the wordmark or creating
a collision with the mobile submission button.

## Card Identity Spacing

Increase the standard-card `.identity` icon-to-label gap from `4px` to `8px`.
The project-kind icon remains frameless, retains its existing size and kind
color, and stays aligned with the left edge of the card title.

Compact cards retain their existing `6px` gap and all other compact sizing.

## Verification

Static and browser verification must confirm:

- the corrected quill-and-inkwell artwork appears in desktop and mobile headers;
- the logo is not distorted or clipped;
- the logo-to-copy gap is approximately `6px`;
- Tavernary and tagline text-range edges remain aligned within `1px`;
- the brand block remains vertically centered;
- the mobile brand block does not collide with `Submit Project`;
- standard card identity gaps measure approximately `8px`;
- compact card identity gaps remain approximately `6px`;
- desktop and mobile have no horizontal overflow;
- the inline JavaScript still parses;
- the browser console has no warnings or errors.
