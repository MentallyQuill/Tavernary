# Task 2 Completion Report

Status: complete

Commits:
- Planned commit: `feat: add deterministic intake migration`

Tests/output:
- `npm.cmd test -- tests/unit/intake-migration.test.ts`
  - Passed: 8 tests in `tests/unit/intake-migration.test.ts`
- `npm.cmd run catalog:migrate`
  - Dry-run report:
    - `intake_records`: 213
    - `curated_overlaps`: 4
    - `generated_records`: 209
    - `writes_required`: 209
    - `provisional_matches`: 0
    - `final_union_records`: 214

Self-review notes:
- Confirmed BOM-safe intake loading from `data/catalog/projects.json`.
- Confirmed deterministic provisional output for GitHub, URL preset, and reserved organization handling.
- Confirmed curated records stay authoritative, matching provisional reruns collapse to zero writes, and provisional drift fails hard.
- Confirmed CLI stages generated artifacts under `.tmp`, validates the projected registry before writing, and uses exclusive copy semantics for new project files.

Concerns:
- No known functional blockers from the focused suite or the required dry run.

---

Follow-up fixes on 2026-07-24:

Status:
- Fixed the four review findings only:
  - enforced the full-dataset audit counts in `scripts/catalog/migrate-intake.mjs`;
  - validated the projected registry from curated existing records plus `expectedRecords`;
  - changed `normalized_source_changes` to detailed `{ id, before, after }` entries;
  - staged each run under a unique directory beneath `.tmp`, with the report temp kept inside that staging directory.

Tests/output:
- `npm.cmd test -- tests/unit/intake-migration.test.ts`
  - Passed: 11 tests in `tests/unit/intake-migration.test.ts`
  - Added focused coverage for:
    - audit count enforcement;
    - projected-registry validation independence from stale provisional files;
    - unique staging directories beneath `.tmp`;
    - detailed `normalized_source_changes` output.
- `npm.cmd run catalog:migrate`
  - Passed dry-run audit:
    - `intake_records`: 213
    - `curated_overlaps`: 4
    - `generated_records`: 209
    - `writes_required`: 209
    - `provisional_matches`: 0
    - `provisional_drift`: []
    - `final_union_records`: 214

Self-review notes:
- Kept the behavior scope narrow to the four requested fixes.
- Confirmed the projected validation set now excludes non-curated stale provisional records.
- Confirmed the real dry run now matches the required full-dataset audit counts exactly.
- Confirmed staging no longer reuses a fixed `.tmp/catalog-migrate` directory.

Concerns:
- No known remaining blockers from the focused migration suite or the required dry run.
