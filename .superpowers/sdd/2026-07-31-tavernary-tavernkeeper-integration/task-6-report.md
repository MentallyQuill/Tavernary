# Task 6 Report: Static Export, Hydrated Scan Coverage, and Long Titles

Commit: `test(catalog): verify scan indicators end to end`

Files changed:

- `.gitignore`
- `scripts/build-tavernkeeper-test-export.mjs`
- `scripts/run-playwright.mjs`
- `scripts/verify-static-export.mjs`
- `scripts/verify-static-export.d.mts`
- `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- `tests/unit/static-export-verification.test.ts`
- `tests/e2e/static-export.spec.ts`
- `tests/e2e/catalog.spec.ts`
- `tests/visual/catalog.visual.spec.ts` and 12 scan/card popover snapshots

Verification:

- `npm.cmd run build` passed.
- `npm.cmd run verify:export` passed, including the exported TavernKeeper target manifest schema check.
- `npm.cmd test -- tests/unit/static-export-verification.test.ts` passed: 10 tests.
- `node scripts/run-playwright.mjs tests/e2e/catalog.spec.ts --grep "hydrates (pending|current)"` passed: 2 tests, covering hydrated green, yellow, gray, and unsupported cards; pointer, keyboard, touch, Escape, outside click, report links, independent Kit controls, and non-nested controls.
- `node scripts/run-playwright.mjs tests/visual/catalog.visual.spec.ts --grep "scan indicator" --update-snapshots` passed: 6 tests. Desktop, compact, and phone snapshots cover short and ellipsized titles plus viewport-contained popovers.

Notes and concerns:

- Browser fixture reports are synthesized only during the Playwright wrapper, matched to two real healthy source snapshots, and are restored before the runner exits. The wrapper clears `.next` before fixture and restoration builds because Turbopack otherwise reuses stale generated catalog output in this worktree layout.
- A full `catalog.spec.ts` run passed the first 26 relevant tests, including both new scan tests, but exceeded the 120-second command cap. It also retained unrelated existing failures in model-family filtering, owner-attribution search, external-preset metadata, tooltip flow, and compact-card behavior. They are outside Task 6.
