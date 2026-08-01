# TavernKeeper Mobile Safari Acceptance

This record separates automated WebKit regression coverage from the physical Safari release gate. Playwright WebKit is not branded Safari proof and does not satisfy the physical-device gate.

## Automated regression evidence

The TavernKeeper scan indicator suite runs these projects against the full 317-card scan fixture and an exact `?q=Recursion` filtered view:

- Desktop Chromium and Desktop WebKit for content, hover, focus, Escape, outside activation, report/history links, and viewport collision.
- Pixel 7 Chromium and iPhone 14 WebKit emulation for first-tap open, second-tap close, a minimum 44 CSS pixel target, portrait-to-landscape repositioning, dynamic viewport fit, focus return, and reduced motion.
- A Chromium feature-off/feature-on/full/filtered diagnostic for rendered cards, total DOM, SVGs, scan glyphs, tooltip anchors, observers, document listeners, mounted portals/history, long tasks, and five repeated scroll sequences after an idle pause. The test attaches its exact measurements as `tavernkeeper-catalog-costs.json`.

The automated commands are:

```powershell
npm.cmd run test:scan-e2e
npm.cmd run test:scan-visual
```

These checks are regression evidence only. They do not establish an exact Safari root cause and do not replace the physical matrix below.

## Physical Safari release matrix

Record the deployed Tavernary build SHA and fill every row before declaring the TavernKeeper card UI release-ready.

| Device | OS and Safari major | Catalog view | Portrait | Landscape | Repeated inertial scroll | Touch open and close | Trace captured | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone, current major | Pending | Full unfiltered catalog | Pending | Pending | Pending | Pending | Pending | Pending |
| iPhone, current major | Pending | `?q=Recursion` | Pending | Pending | Pending | Pending | Pending | Pending |
| iPhone, previous major | Pending | Full unfiltered catalog | Pending | Pending | Pending | Pending | Pending | Pending |
| iPhone, previous major | Pending | `?q=Recursion` | Pending | Pending | Pending | Pending | Pending | Pending |
| iPad, current major | Pending | Full unfiltered catalog | Pending | Pending | Pending | Pending | Pending | Pending |
| iPad, current major | Pending | `?q=Recursion` | Pending | Pending | Pending | Pending | Pending | Pending |
| iPad, previous major | Pending | Full unfiltered catalog | Pending | Pending | Pending | Pending | Pending | Pending |
| iPad, previous major | Pending | `?q=Recursion` | Pending | Pending | Pending | Pending | Pending | Pending |

## Physical test procedure

1. Open the deployed build and record its exact SHA, device model, OS major, Safari major, viewport orientation, visible card count, total rendered card count, and test time.
2. Let the page become idle. Perform at least five inertial scrolls through the full catalog, pause, and repeat in the other orientation.
3. Open and close gray, dark-teal, teal, orange, and red scan indicators by touch. Confirm the panel remains inside the dynamic viewport and safe area, both report links work, the history strip remains legible, and no sticky-hover state blocks interaction.
4. Repeat the same sequence at the exact `?q=Recursion` URL without changing its query text.
5. Capture Safari Web Inspector Timelines and Layers evidence covering scripting, style recalculation, layout, paint, compositing, event latency, and layer behavior for both views.
6. Attach or link the traces without credentials or private browsing data, enter the verdicts above, and record any visible stall with its timestamp and trace interval.

## Acceptance rule

Every matrix row must pass with no visible multi-hundred-millisecond scroll stall, no hover-only affordance, correct dynamic-viewport and safe-area behavior, correct orientation recovery, complete touch and keyboard operation, and no regression in the exact `?q=Recursion` search behavior. A full-catalog-only stall is evidence of scale sensitivity, but an exact root cause must not be stated unless the Safari traces prove it.
