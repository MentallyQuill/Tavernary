# TavernKeeper Card Popover Redesign

**Date:** August 3, 2026  
**Status:** Implemented; source-tree link amendment approved

## Objective

Make the TavernKeeper scan popover feel like a compact status card instead of
a stack of equally weighted text. Preserve the useful assessment facts, remove
the redundant malicious-evidence quotation, link the scanned SHA to the exact
project source tree, and eliminate the unexplained single history dot.

This work changes only the catalog card popover. The TavernKeeper report and
full history page are outside this change because their UI is being developed
separately.

## Content hierarchy

An assessed-project popover contains these regions, in order:

1. **Header** — the exact accessible heading `TavernKeeper Scan Results` and a
   compact status treatment containing the risk grade and freshness.
2. **Summary** — the existing one- or two-sentence plain-language assessment.
3. **Finding counts** — minor cautions, material concerns, and high-danger
   findings presented together as one compact, scannable row.
4. **Scan details** — the scan date and linked short SHA, followed by the
   assessment date and Tavernary attribution.
5. **Recent history** — a labeled miniature history strip only when at least
   two scan conclusions exist.
6. **Actions** — `View full report` and `View scan history` grouped together in
   one footer row.

The standalone `malicious_evidence` quotation is not rendered in the popover.
Equivalent finding-level reasoning already belongs in the full report; any
project-level report treatment remains owned by the report UI work.

Unassessed and unsupported popovers keep their existing concise explanatory
copy and use the same header styling without empty assessment sections.

## Visual design

- Increase the desktop popover width from 280px to 320px while
  preserving the existing 8px viewport margin and narrow-screen clamping.
- Raise body copy from 11px to at least 12px, with comfortable line height.
- Use spacing and subtle separators to establish regions instead of adding
  nested panels or decorative containers.
- Give the header and action footer the strongest structure. The summary is
  the primary body copy; counts and scan metadata use secondary text.
- Present risk and freshness as a compact status treatment using existing
  TavernKeeper colors. Text remains present so color never carries meaning by
  itself.
- Keep controls squared or gently rounded to match Tavernary's existing card
  language. Avoid oversized pills and dashboard-like metric tiles.
- Put both actions on one row when space permits and allow a clean wrap on
  narrow screens. Use a separator or spacing, never a decorative bullet.
- Retain the current raised surface, border, shadow, focus ring, and reduced
  motion behavior unless minor tuning is needed for the wider layout.

## Source-tree link

The short scanned SHA links to the exact GitHub source tree:

```text
https://github.com/{repository}/tree/{full target SHA}
```

The URL is derived from the already validated `repository` and `target_sha`
fields on the matched GitHub assessment, not by parsing display copy or a
potentially unrelated card URL. The summarized TavernKeeper report model
exposes this URL to the popover as explicit `treeUrl` data. The link opens in a
new tab with `noopener noreferrer`. Its accessible name is
`Browse scanned source at commit {full SHA} on GitHub`, while its visible text
remains the seven-character SHA. The tree page lets users inspect and download
the precise source snapshot without adding another popover action.

## History behavior

The history strip represents multiple assessments over time. Rendering one
block provides no trend information and currently resembles a stray dot.
Therefore:

- zero or one conclusion: do not render the strip;
- two through twelve conclusions: render the labeled strip using the existing
  oldest-left, newest-right ordering and risk colors;
- the full history action remains available whenever `historyUrl` exists,
  including when only one assessment exists.

Each rendered history point continues to link to its immutable report and
keeps its existing accessible label.

## Component boundaries and data flow

### `tavernkeeper-status.ts`

`summarize` derives and returns an explicit tree URL alongside the short and
full SHA. This module remains the authority for translating validated report
data into card-safe presentation data.

### `tavernkeeper-scan-indicator.tsx`

The component renders the new semantic regions and linked SHA. Interaction,
portal positioning, dismissal, keyboard traversal, and focus management remain
unchanged except for accommodating the additional focusable source-tree link in the
existing navigation order.

### `tavernkeeper-history-strip.tsx`

The component returns no visual strip for fewer than two conclusions. It keeps
the existing twelve-entry maximum and per-entry accessible report links.

### `catalog.css`

The existing TavernKeeper selectors gain the new layout, typography, status,
metadata, history, and action styles. New selectors remain scoped beneath the
popover to avoid changing the full history or report UI.

## Responsive and interaction behavior

- The popover remains fixed and collision-aware, using its measured size for
  viewport placement.
- Its maximum width remains `calc(100vw - 16px)`, so the wider desktop target
  cannot overflow a narrow screen.
- The panel remains scrollable when viewport height is constrained.
- Hover, focus, click/tap, Escape, outside click, pointer-exit delay, and
  one-open-at-a-time behavior remain unchanged.
- Keyboard focus proceeds from the scan trigger through the source-tree link and
  footer actions without a focus trap.
- Coarse-pointer behavior and minimum touch-target requirements remain intact.

## Accessibility

- Preserve `role="dialog"`, `aria-labelledby`, and the exact visible heading.
- Keep every status understandable without color.
- Give the linked SHA the accessible name
  `Browse scanned source at commit {full SHA} on GitHub`.
- Keep the history group label and individual history-point labels when the
  strip is rendered.
- Preserve visible focus rings and logical DOM/focus order.
- Decorative separators are hidden from assistive technology.

## Error and edge handling

- A matched assessed report always has a validated GitHub repository and full
  SHA; tree-link derivation happens only along that assessed GitHub path.
- Missing `historyUrl` omits the history action without leaving an empty footer
  slot.
- A missing report continues to use the current unassessed or unsupported copy
  and does not render an invalid tree link or counts.
- Long summaries and localized dates may wrap but must not overflow the panel.
- Stale and freshness-unavailable assessments retain their existing explanatory
  summary suffix and explicit freshness text.

## Verification

Tests will cover:

- tree URL derivation from validated repository and target SHA data;
- the short SHA link target, accessible name, and external-link attributes;
- absence of the malicious-evidence quotation in the popover;
- preservation of summary, all three counts, dates, grade, and freshness;
- no history strip for zero or one conclusion;
- history strip and report links for two or more conclusions;
- both footer actions and logical keyboard focus traversal;
- unassessed, unsupported, current, stale, and unavailable states;
- mobile-width containment and updated visual baselines.

Unit and existing catalog end-to-end tests provide behavioral coverage. The
focused visual catalog test is refreshed only after the new layout is manually
inspected at desktop and mobile sizes.
