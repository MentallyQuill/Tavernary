# Catalog Filter and Aging Polish Design

## Goal

Improve the catalog’s filter discoverability and visual status language while fixing tile tooltips so they cannot be clipped by card or page boundaries.

## Exact site palette

Site-authored CSS and SVG declarations may use only these exact colors:

| Role | Color |
|---|---|
| Page background | `#07181D` |
| Primary surface | `#0B2229` |
| Card surface | `#102B33` |
| Raised/active surface | `#173740` |
| Border | `#284A52` |
| Strong border | `#3B6068` |
| Primary text | `#F3F1E8` |
| Secondary text | `#CBD6D3` |
| Muted text | `#849A9E` |
| Frontend crimson | `#D62839` |
| Preset/activity mint | `#57C5A3` |
| Extension/brand orange | `#E18A24` |

The muted token changes from the mockup’s older `#6F7E82` to the approved `#849A9E`.

Raster artwork is exempt because it contains its own authored colors. Browser font antialiasing is not treated as a site-authored color. `transparent`, `currentColor`, and `inherit` are allowed because they introduce no independent visible color. The commit-age `color-mix` described below is the only approved generated color range.

No other hex, named color, `rgb()`, `rgba()`, `hsl()`, `hsla()`, semi-transparent fill, or color-mix declaration may remain in site CSS, inline styles, or authored SVGs. Shadows, focus rings, overlays, hover backgrounds, tooltip surfaces, chips, and controls must use exact palette tokens rather than black, white, or alpha-blended variants.

### Semantic assignments

- Top navigation labels remain primary near-white, matching the mockup.
- Top navigation icons use crimson for Frontends, mint for System Presets, and orange for extension categories.
- Card/project titles use primary near-white.
- Frontend card type identities and frontend compatibility chips use crimson.
- Preset card type identities, fresh commit ages, activity bars, and OSI-approved license labels use mint.
- Extension card type identities, the Tavernary wordmark, and the Submit Project control use orange.
- Capability/characteristic chips use strong-border outlines with secondary text.
- General explanatory text uses secondary or muted text according to hierarchy.
- Proprietary and missing-license labels use muted text.

The audit will replace currently off-palette declarations such as alternate grays, desaturated chip colors, dark tooltip fills, activity green variants, translucent white fills, and black alpha shadows.

### Automated palette audit

A repository script scans production CSS and TSX under `src/` plus production SVG assets under `public/` for literal color values. Documentation mockups, test snapshots, generated browser screenshots, and raster files are outside the scan. The script normalizes hex case and fails when a literal is outside the approved set or an unapproved functional/named color is present.

The script has narrow allowances for:

- `transparent`, `currentColor`, and `inherit`;
- the single commit-age `color-mix` rule using mint and muted tokens;
- zero/one opacity used only to show or hide tooltips;
- raster image files, which are not scanned.

The audit runs inside `npm run check`. Unit coverage proves every approved color passes, representative off-palette hex/RGB/alpha declarations fail, and an unauthorized second `color-mix` fails.

## Compatible frontend filter

The frontend filter uses the canonical entries and order in `data/vocabularies/frontends.json`, not only the frontends represented by currently visible projects. Known frontends therefore remain available with a count of `0`.

The collapsed list always shows these first three entries in this order:

1. SillyTavern
2. Lumiverse
3. Marinara Engine

Remaining vocabulary entries appear after an expansion control. Its label is derived from the number of hidden entries, such as `Show 1 more`; it becomes `Show fewer` while expanded.

Searching the frontend list bypasses the collapsed limit and shows every matching vocabulary entry. Any selected frontend outside the first three also remains visible when the list is collapsed so an active filter is never hidden.

The same behavior applies in the desktop sidebar and mobile filter sheet because both use `FilterPanel`.

## Project-kind checkbox colors

Only the three Project kind checkboxes receive kind-specific outlines and checked states:

- Frontend: `--color-kind-frontend`
- Extension: `--color-kind-extension`
- System Preset: `--color-kind-preset`

The checkboxes use a shared custom checkbox treatment so the unchecked border is consistently theme-colored across browsers. Capability, development, license, and frontend filters retain their existing neutral/orange checkbox treatment.

## Commit-age color

Repository cards compute whole days since `latestMeaningfulCommitAt` using the same `now` timestamp that drives visible relative time.

The displayed commit age receives a CSS custom percentage:

- 0 days: 100% fresh teal
- 15 days: 50% teal and 50% muted gray
- 30 or more days: 100% muted gray

CSS uses `color-mix(in srgb, var(--color-kind-preset) <freshness>, var(--color-muted))`. Values are clamped from 0% through 100%. Missing commit dates use muted gray. The previous dormant red override is removed so all repository ages follow one continuous scale.

Preset publication text is unchanged because it is not a last-commit value.

## License color

The bottom-right license label uses `--color-kind-preset` when the catalog reports `osi-approved`. `proprietary` and `missing` remain `--color-muted`; the existing dotted underline for missing licenses remains.

## Inkwell geometry

The supplied Tavernary inkwell image remains the same asset and retains an empty alt because the adjacent wordmark supplies the link name.

- Desktop: 34px wide by 45px high
- Mobile: 31px wide by 41px high
- Both layouts: translate 12px left toward the Tavernary wordmark

Header column sizing and the search/action layout remain unchanged unless visual verification shows the smaller transformed image creates overlap.

## Viewport-level tooltips

### Root cause

The deployed tooltip is absolutely positioned inside a project card. Cards clip overflow, and a right-anchored 240px tooltip on a left-side fact can extend past the card edge. Changing card overflow or manually assigning left/right alignment only treats particular placements and can still fail at viewport edges.

### Rendering

`Tooltip` becomes a client component that keeps the trigger wrapper in the tile but renders the visible tooltip content through `createPortal(..., document.body)`. The portal uses `position: fixed` and a site-wide tooltip z-index, so neither card overflow nor grid stacking can clip it.

On pointer entry or focus within the trigger:

1. Measure the trigger and tooltip rectangles.
2. Center the tooltip horizontally on the trigger.
3. Clamp its left edge to 8px and its right edge to `viewport width - 8px`.
4. Prefer placement 8px above the trigger.
5. If the tooltip would cross the top 8px margin, place it 8px below the trigger.

While visible, positioning is recomputed on window resize and capture-phase scroll. Pointer leave, blur outside the trigger, unmount, or navigation hides the portal.

The trigger retains `aria-describedby`. The portal tooltip keeps the stable ID and `role="tooltip"`. Existing card `aria-label` values prevent tooltip copy from bloating each card link’s accessible name.

At widths of 760px or less, floating tooltip bubbles remain disabled. The underlying card facts stay visible.

The old per-tooltip `align` option and card hover overflow exception are removed because positioning is centralized.

## Testing

Test-first coverage will include:

- vocabulary-driven frontend options with zero counts;
- fixed top-three order;
- dynamic expand/collapse text;
- search exposing all matches;
- selected extra frontends remaining visible while collapsed;
- kind-specific checkbox borders and checked colors;
- freshness values at 0, 15, 30, and more than 30 days;
- teal OSI-approved and muted proprietary/missing licenses;
- exact semantic palette assignments and zero unauthorized authored colors;
- rejection of off-palette CSS, inline TSX colors, and authored SVG colors;
- desktop and mobile inkwell geometry;
- portal tooltips for leftmost, rightmost, top-row, and bottom-row anchors;
- every visible tooltip rectangle staying inside 8px viewport margins;
- no horizontal page overflow;
- full unit, end-to-end, static-export, responsive, and visual-regression suites.

Desktop, tablet, and mobile screenshots will be examined before intentional baselines are updated.
