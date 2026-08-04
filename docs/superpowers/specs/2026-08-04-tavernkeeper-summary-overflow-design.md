# TavernKeeper Summary Overflow Design

## Goal

Keep TavernKeeper's concise card popup readable on narrow screens when an
imported assessment contains internal finding identifiers or encoded citation
markers.

## Design

The popup will derive display-only copy from the imported assessment summary.
It will remove encoded citation markers and parenthetical finding-ID lists,
trim an incomplete trailing sentence when one of those artifacts made the
source malformed, and preserve the raw imported assessment for report and
provenance surfaces.

The summary element will also use `overflow-wrap: anywhere` so an unforeseen
unbroken token cannot widen the fixed-position popup beyond its mobile width.
The scanned-source link remains unchanged: seven visible SHA characters with
the complete SHA retained in its URL and accessible name.

## Verification

Component regressions will cover the two production payload shapes shown in
the mobile screenshots: a parenthetical list of 64-character finding IDs and
an encoded citation marker. A style assertion will cover the final overflow
guard, followed by Tavernary's focused component test and full `npm run check`
gate.
