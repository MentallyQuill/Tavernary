# TavernKeeper Coverage Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a backward-compatible Catalog v8 that carries TavernKeeper JavaScript/TypeScript coverage while preserving the existing v7 feed.

**Architecture:** CatalogCore gains explicit v7 and v8 parsers backed by separate schemas and a normalized report-summary model. The catalog build produces both artifacts from the same validated report data, stripping the v8-only field from the legacy artifact so old clients remain compatible.

**Tech Stack:** TypeScript, Node.js ESM, AJV, Vitest, Next.js static export

**Spec:** `docs/superpowers/specs/2026-08-21-tavernkeeper-coverage-contract.md`

## Global Constraints

- Keep the existing Catalog v7 URL and payload shape unchanged.
- Publish Catalog v8 at `public/catalog/tavernary-catalog-v8.json`.
- Source `javascriptAnalysisStatus` only from `coverage.javascript_analysis_status` in the validated report summary.
- Parsed v7 reports normalize missing coverage to `null`; do not call it `legacy`.
- Do not alter risk grading or install policy.

---

### Task 1: Add the versioned CatalogCore contract

**Files:**
- Modify: `packages/catalog-core/src/tavernkeeper.ts`
- Modify: `packages/catalog-core/src/catalog-types.ts`
- Create: `packages/catalog-core/src/catalog-v8-schema.ts`
- Modify: `packages/catalog-core/src/catalog-schema.ts`
- Test: `packages/catalog-core/tests/catalog-schema.test.ts`
- Test: `tests/unit/tavernkeeper-status.test.ts`

**Interfaces:**
- Consumes: `TavernKeeperAssessedReport.coverage.javascript_analysis_status`
- Produces: `TavernKeeperReportSummary.javascriptAnalysisStatus`, `CatalogV8`, and `parseCatalogV8(value)`

- [ ] Add failing tests proving v8 requires and preserves `javascriptAnalysisStatus`, v7 rejects the raw v8 field, parsed v7 normalizes it to `null`, and status derivation copies the validated value.
- [ ] Run the focused tests and confirm they fail because the v8 contract and coverage projection do not exist.
- [ ] Implement the minimal types, schema, parser, and projection needed to satisfy the tests while sharing semantic validation between parsers.
- [ ] Run the focused tests and confirm they pass.
- [ ] Refactor duplicated schema validation without changing behavior and rerun the focused tests.

### Task 2: Publish v7 and v8 artifacts

**Files:**
- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/verify-static-export.mjs`
- Modify: `src/lib/catalog/load-catalog.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/static-export-verification.test.ts`

**Interfaces:**
- Consumes: normalized Catalog v8 objects from `deriveTavernKeeperCardStatus`
- Produces: unchanged `public/catalog/tavernary-catalog.json` and enriched `public/catalog/tavernary-catalog-v8.json`

- [ ] Add failing build and export tests proving both artifacts are written, v7 omits the field, v8 requires it, and the application loads v8.
- [ ] Run the focused tests and confirm the expected missing-artifact or schema failures.
- [ ] Implement a deterministic v7 projection that removes `javascriptAnalysisStatus`, write both artifacts atomically, and update static-export verification.
- [ ] Run focused tests plus `npm.cmd run catalog:build` and validate both outputs.

### Task 3: Verify and publish Tavernary

**Files:**
- Modify generated catalog artifacts only through the catalog build.

**Interfaces:**
- Produces: a commit SHA Companion can vendor and a live v8 catalog URL.

- [ ] Run `npm.cmd run check` and inspect the complete output.
- [ ] Review `git diff --check`, generated artifact changes, and the v7/v8 TavernKeeper field difference.
- [ ] Commit, push, open a PR, merge after checks, and verify the Pages deployment serves both schemas.
