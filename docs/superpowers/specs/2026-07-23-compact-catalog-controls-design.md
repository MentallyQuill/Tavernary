# Tavernary Compact Catalog Controls Design

## Goal

Reduce vertical space above and inside the repository catalog without weakening
its at-a-glance search and comparison value. Standard cards remain available;
compact mode is an optional density setting.

## Catalog Header

- Remove the sentence “Development activity reflects meaningful source work,
  never stars or reviews.”
- Move “Catalog refreshed 43 min ago” beneath the project count as plain subtitle
  text.
- Remove the separate boxed refresh chip and its otherwise empty query row when
  no filters are active.
- Put a compact density toggle beside the project count. It is an icon button
  with an accessible label, pressed state, and tooltip that switches between
  “Use compact cards” and “Use standard cards.”

## Mobile Controls

The primary mobile control row is ordered:

1. Icon-only Filters button on the left.
2. The All, Active, New, and Released segmented buttons in the center.
3. The sort dropdown on the right.

The Filters button retains the active-filter count badge. Its icon and accessible
label make the control identifiable without visible text. Controls must fit
without horizontal scrolling at a 390 px preview width.

## Compact Card Contract

Compact mode changes only card presentation:

- Cards use natural compact height instead of the standard minimum height.
- The first row contains:
  - an unboxed, one-line-height project-type icon and type label on the left;
  - activity frequency and commit recency on the right.
- GitHub aggregate score and repository size are hidden.
- Preset cards keep their version and source-recency equivalents in the same
  one-line top-row structure.
- The project title follows the top row.
- Summaries are hidden.
- The footer contains one clipped row of metadata chips, with every compatible
  frontend leading, and the license aligned at the far right.
- Existing card navigation, tooltips, filtering, sorting, and license semantics
  remain unchanged.

Standard mode retains summaries, two metadata-chip rows, aggregate community
score, repository size, and the existing larger type symbol.

## Interaction and State

- The density toggle applies to all visible and subsequently filtered cards.
- The selected density remains active while sorting, searching, or changing
  filters during the current page session.
- Standard mode is the initial state.
- The toggle works identically in desktop and mobile previews.
- Reduced-motion preferences continue to suppress decorative transitions.

## Verification

The mockup must demonstrate:

- no boxed catalog-refresh row;
- no horizontal overflow in desktop or 390 px mobile preview;
- mobile control ordering and icon-only Filters button;
- density toggle accessible name and pressed state;
- standard cards retaining all current information;
- compact cards hiding summaries, aggregate score, and repository size;
- compact cards showing only one metadata-chip row;
- sorting and filtering still working in both density modes.
