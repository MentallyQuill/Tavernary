# Trihex Brand Lockup Design

## Goal

Replace the Tavernary header emblem with the supplied `Tavernary-trihex.png`
artwork and restore the exact live tagline `Where AI roleplay tools gather`
beneath the `Tavernary` wordmark. The rest of the page branding, catalog UI,
colors, and behavior remain unchanged.

## Current context

The production header already renders the wordmark and tagline as accessible
HTML in `src/features/catalog/components/site-header.tsx`. It currently uses
`public/tavernary-gems.png` as the emblem, positioned after the text block.
The requested reference lockup places the trihex emblem before the wordmark and
tagline.

## Proposed change

- Copy the user-supplied `C:\Users\Keptin\Downloads\Tavernary-trihex.png`
  into `public/tavernary-trihex.png` without altering its pixels or
  transparency.
- Update the header image source and intrinsic dimensions to match the new
  asset.
- Reorder only the header lockup so the emblem appears to the left of the
  existing `.brand-copy` block.
- Keep `Tavernary` and `Where AI roleplay tools gather` as live text with the
  existing accessible home-link label.
- Tune only `.brand`, `.brand-logo`, and any required mobile header geometry so
  the new emblem is legible and does not collide with search or actions.
- Leave the existing color tokens, typography, page layout, and favicon assets
  unchanged unless a focused test proves a direct asset-contract update is
  required.

## Alternatives considered

1. Use the supplied PNG directly (selected): faithful, low-risk, and preserves
   the supplied visual identity.
2. Rebuild the trihex as SVG/CSS: potentially more scalable, but changes the
   supplied artwork and expands scope.
3. Bake the wordmark and tagline into a composite image: fixed composition,
   but weaker responsiveness and accessibility.

## Verification contract

- Unit/source contracts confirm the header references `./tavernary-trihex.png`,
  retains the exact tagline, and keeps the emblem before `.brand-copy`.
- Asset checks confirm the new PNG is present and served by the static export.
- Existing unit, typecheck, lint, build, static-export, and relevant Playwright
  header checks pass.
- Desktop and mobile visual checks confirm the new lockup matches the supplied
  reference direction and that the rest of the header is unchanged.

## Scope boundary

No catalog data, navigation behavior, favicon, footer copy, or unrelated visual
polish is part of this change.
