# Compact Activity Status Tooltips

## Goal

Keep source-activity status text readable inside the existing project-card
header without widening or otherwise redesigning the card.

## Visible labels

The card uses short status labels comparable in width to `Today` and `3mo ago`:

- `Quiet` when a complete baseline found no source activity in the last twelve
  weeks.
- `Pending` when the source-activity baseline is still provisional.
- `Partial` when source-activity evidence is incomplete.
- `No data` when activity metrics are unavailable.

The adjacent `0/12` or `~0/12` value continues to communicate the twelve-week
measurement window.

## Full explanations

Each short label is wrapped in the existing tooltip component. Hover and
keyboard focus expose the corresponding full explanation:

- `Quiet`: `No source activity in the last 12 weeks`
- `Pending`: `Source activity baseline pending`
- `Partial`: `Source activity evidence incomplete`
- `No data`: `Activity unavailable`

The full explanation is also the label's accessible name. The tooltip does not
change the underlying activity evidence, sorting, refresh behavior, or graph.

## Verification

Component tests assert every visible short label and its full tooltip label.
Existing activity-state tests are updated to preserve the distinction between
complete, provisional, incomplete, and unavailable evidence.
