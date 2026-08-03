# TavernKeeper contextual V5 live acceptance

This record captures the first two complete production canaries for the
contextual V5 pipeline. Both scans used the ordinary staff-targeted handshake:
Tavernary refreshed an exact catalog source, TavernKeeper scanned the immutable
SHA and published a technical report, and Tavernary synthesized and deployed
the final card assessment automatically.

## Canary outcomes

| Project | Exact SHA | TavernKeeper result | Tavernary grade |
| --- | --- | --- | --- |
| [Recursion](https://github.com/MentallyQuill/Recursion) | `1bce1fa73fe6c0fe8e767c773a832b94bb336720` | Four deterministic candidates; all four assessed as high-confidence expected behavior with no impact and unlikely exploitability | Low concern |
| [Wandlight](https://github.com/MentallyQuill/Wandlight) | `2d4f818c2ad5855b0faff387d88c3f64479865c6` | Zero deterministic candidates across the complete checkout | Low concern |

Recursion scanned 444 files and 15,679,502 bytes. Its contextual review found
that the secret-like values were made-up fixtures used by tests and tooling,
not credentials shipped to users. Wandlight scanned 163 files and 15,522,678
bytes. Every required applicable scanner completed for both repositories; no
degraded report was published.

## Immutable report evidence

### Recursion

- TavernKeeper targeted run:
  [30805628117](https://github.com/MentallyQuill/TavernKeeper/actions/runs/30805628117)
- Report publication commit: `ac70a419fd672b6e85b3b3591add0726d5b0ee84`
- Report ID: `6c1e29d5430dd3dcb43f14c575e2c0a3aae62e1463eff0d402f0c15d9d37d260`
- [Full technical report](https://mentallyquill.github.io/TavernKeeper/reports/github/1285208664/1bce1fa73fe6c0fe8e767c773a832b94bb336720/2/6c1e29d5430dd3dcb43f14c575e2c0a3aae62e1463eff0d402f0c15d9d37d260/)
- [Technical history](https://mentallyquill.github.io/TavernKeeper/reports/github/1285208664/history/)
- Tavernary import run:
  [30805781805](https://github.com/MentallyQuill/Tavernary/actions/runs/30805781805)
- Tavernary summary commit: `2d324549fefcf5aeaaefead0bb679c42ccccb3aa`
- Exact Tavernary deployment:
  [30806483745](https://github.com/MentallyQuill/Tavernary/actions/runs/30806483745)

### Wandlight

- TavernKeeper targeted run:
  [30806744595](https://github.com/MentallyQuill/TavernKeeper/actions/runs/30806744595)
- Report publication commit: `711b3a98619fe184ecd3f0264ab778bad7b17e2d`
- Report ID: `0f8071af5a393ef801f7d37d24d373ec7c0012b4af88d08267c82b67525aadc0`
- [Full technical report](https://mentallyquill.github.io/TavernKeeper/reports/github/1254077407/2d4f818c2ad5855b0faff387d88c3f64479865c6/2/0f8071af5a393ef801f7d37d24d373ec7c0012b4af88d08267c82b67525aadc0/)
- [Technical history](https://mentallyquill.github.io/TavernKeeper/reports/github/1254077407/history/)
- Tavernary import run:
  [30807015104](https://github.com/MentallyQuill/Tavernary/actions/runs/30807015104)
- Tavernary summary commit: `d2ce096f746dd1fac1187d10f0174f42f8d1e394`
- Exact Tavernary deployment:
  [30807570067](https://github.com/MentallyQuill/Tavernary/actions/runs/30807570067)

## Live card acceptance

Fresh production browser checks confirmed that each supported project renders
the scan icon directly beside its title as **Low concern; current**. Opening
the icon exposes the **TavernKeeper Scan Results** panel with the plain-language
grade and summary, exact scanned SHA and dates, finding counts, immutable full
report link, compact one-entry history strip, and full scan history link.

Recursion's panel explains why all four secret-like scanner matches are benign
test fixtures. Wandlight's panel explains that the complete scan produced no
validated candidates. The unsupported `ST-Wandlight` preset remains dark teal
and does not expose an assessment.

## Cleanup and rollout state

The accidental `ST-Wandlight` preset report
`42ed790bc16eb4a70965c61918fbd7d611b593f667f4c639f60f6f9b04d9875f`
was removed from TavernKeeper's report tree and public index. Preset-only
sources are now excluded from both the public target manifest and the staff
targeted-scan resolver, while extension and frontend sources remain eligible.

Ordinary backlog scanning remains staff-paused after canary acceptance. This
record does not authorize resuming the top-30/new/old backlog; that remains a
separate operational action.
