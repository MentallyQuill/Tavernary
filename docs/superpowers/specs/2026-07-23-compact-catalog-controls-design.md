# Tavernary Compact Catalog Controls Design

## Goal

Reduce vertical space above and inside the repository catalog without weakening
its at-a-glance search and comparison value. Standard cards remain available;
compact mode is an optional density setting.

## Catalog Header

- Render the “Tavernary” wordmark in `#E18A24`, sampled from the orange
  SillyTavern dialogue text in the supplied reference. Keep the square `T` mark
  neutral so the wordmark remains the sole orange brand accent in the top bar.
- Replace the square `T` mark with the supplied transparent
  `Tavernary-logo.png` bottle illustration. Render it without a border,
  background, or enclosing tile, using `object-fit: contain`.
- Size the logo at `48px × 48px` on desktop and `44px × 44px` in the 390 px
  mobile layout. Keep the desktop top bar at `66px`; the logo must not increase
  its height.
- Remove the sentence “Development activity reflects meaningful source work,
  never stars or reviews.”
- Move “Catalog refreshed 43 min ago” beneath the project count as plain subtitle
  text.
- Remove the separate boxed refresh chip and its otherwise empty query row when
  no filters are active.
- Put a compact density toggle beside the project count. It is an icon button
  with an accessible label, pressed state, and tooltip that switches between
  “Use compact cards” and “Use standard cards.”
- Use the supplied collapse icon for the density toggle: two vertically opposed
  chevrons pointing inward, with `viewBox="0 0 32 32"` and the path
  `M23 26l-7-7-7 7M9 6l7 7 7-7`. Render its stroke with `currentColor` so it
  follows the existing hover and pressed states.

## Mobile Controls

The primary mobile control row is ordered:

1. Icon-only Filters button on the left.
2. The All, Active, New, and Released segmented buttons in the center.
3. The sort dropdown on the right.

The Filters button retains the active-filter count badge. Its icon and accessible
label make the control identifiable without visible text. Controls must fit
without horizontal scrolling at a 390 px preview width.

On mobile, cap the sort dropdown at `120px`. Give the reclaimed width to the
segmented status control and render its All, Active, New, and Released labels at
`10px` with tighter horizontal padding. Preserve every full label; do not
abbreviate or clip “Released.”

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

## Metadata Tag Vocabulary

- Every compatible frontend appears first. Cross-compatible projects show every
  frontend as a leading chip.
- Standard cards show up to two rows and six total chips.
- Compact cards retain one clipped row.
- Prefer specific capability nouns over vague labels such as “Controls,”
  “Features,” or “Extensions.”
- Do not repeat the visible project kind as a chip unless it communicates a
  separate capability.
- Status and content labels such as `Deprecated` and `Adult` follow capability
  tags.
- Mockup tags reflect the existing mock summaries. Production tags require
  verification against project metadata or maintained catalog records.

Use these tags in the mock catalog:

| Project | Tags, in display order |
| --- | --- |
| Lumiverse | `Lumiverse`, `Extension runtime`, `Full-stack`, `Permissions`, `Versioned manifests` |
| Marinara Engine | `Marinara`, `Agents`, `Writer`, `State tracking`, `Compatibility lanes` |
| Memory Books | `SillyTavern`, `Long-term memory`, `Lorebooks`, `Automatic`, `Reviewable` |
| Recursion | `SillyTavern`, `Structured planning`, `Multi-provider`, `Review`, `Validation` |
| Directive | `SillyTavern`, `Campaigns`, `State tracking`, `Timekeeping`, `Simulation` |
| CarrotKernel | `SillyTavern`, `Character metadata`, `Worldbuilding`, `Structured tags`, `Authoring` |
| VectFox | `SillyTavern`, `Lumiverse`, `Vector RAG`, `Long-term memory`, `External service` |
| Chat Top Bar | `SillyTavern`, `Navigation`, `Chat controls`, `Quick actions` |
| LALib | `SillyTavern`, `Shared utilities`, `Dependency`, `Developer tools` |
| Polyceph | `SillyTavern`, `Multi-model`, `Orchestration`, `Provider routing` |
| Smart Memory | `SillyTavern`, `Long-term memory`, `Cross-chat`, `Group chat`, `Reviewable` |
| RPG Companion | `SillyTavern`, `Marinara`, `Deprecated`, `State tracking`, `Campaign assistance` |
| Celia V5.4 | `SillyTavern`, `Chat Completion`, `Prompt ordering`, `Regex`, `POV controls`, `302 prompt blocks` |
| Marinara’s Essentials | `SillyTavern`, `Chat Completion`, `Character roleplay`, `Regex`, `Logit bias`, `Adult` |

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
