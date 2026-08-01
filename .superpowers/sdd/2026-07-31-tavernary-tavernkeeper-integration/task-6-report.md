# Task 6 Report: Static Export, Hydrated Scan Coverage, and Long Titles

## Fix round 1

The colored TavernKeeper browser fixture is now fully isolated. `scripts/build-tavernkeeper-test-export.mjs` creates a disposable workspace under the system temp directory, copies the build inputs and already-installed dependencies, writes fixture-only report summaries there, builds there, and returns only the temporary `out` directory. It never writes canonical summaries, `next.config.ts`, `.next`, `out`, or generated catalog data in the checkout. Its cleanup removes the complete temporary tree on successful runs, failures, and handled SIGINT/SIGTERM; primary failures remain primary and cleanup failures are reported separately. SIGKILL can leave only a temporary tree, never fabricated checkout data.

The initial Windows junction approach was rejected by Turbopack with `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Copying the existing dependency tree is intentional: it is the Turbopack-safe reuse strategy for an out-of-worktree fixture.

Normal Playwright commands now only serve the ordinary `out` export. The fixture is activated solely by `--scan-fixture`, through dedicated `test:scan`, `test:scan-e2e`, and `test:scan-visual` scripts. The wrapper considers every HTTP response to mean the port is occupied and checks again immediately after the fixture build, before spawning the server.

`verifyTavernKeeperStaticExport` now uses `ajv-formats`; its tests cover a missing manifest, malformed JSON, invalid date-time, invalid URI, invalid repository value, and additional properties.

The scan E2E contract covers exact heading/result content; green, yellow, gray, and unsupported states; exact yellow severity spans; retained SHA/date shape; report-link cardinality; natural Tab navigation; touch; Escape; external primary-card navigation interception; independent Kit and relationship controls; and document-wide interactive nesting. Visual cases wait for a genuine hydrated hover/popover/Escape cycle before mutating the title, assert natural text width/truncation, preserve the title-icon gap, and assert vertical as well as horizontal popover containment. All Windows snapshots were regenerated and visually inspected: each short card reads `Scan Title`; each long card visibly truncates before the icon.

## Verification

- `npm.cmd run test:content` — passed, 97 tests.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run test:scan-e2e` — passed, 2 focused hydrated scan tests.
- `npm.cmd run test:scan-visual` — passed, 6 Windows scan visual tests after snapshot regeneration.
- `npm.cmd run test:scan` — final combined browser/visual fixture gate (2 E2E + 6 visual) is the CI command and builds the disposable fixture once.
- The CI visual job remains `windows-latest`; it invokes `npm run test:scan` once before the existing catalog visual suite, retaining the Windows-only snapshot convention.

The ordinary full `catalog.spec.ts` baseline was also run without `--scan-fixture`: 26 passed, 3 fixture-only scan tests skipped, 6 failed. The failures are Wandlight model-family filtering, Directive owner search, two missing `aria-describedby` tooltip expectations, Recursion compact-card lookup, and SillyTavern tooltip lookup. A bounded `d18d3afd..HEAD` diff shows Task 6 production behavior changed only `tavernkeeper-scan-indicator.tsx` (the touch-only pointer-down handler); the listed paths are unrelated. They are retained for the release-gate task rather than being attributed to fixture work.
