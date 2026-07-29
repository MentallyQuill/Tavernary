# Source-Backed Multi-Card Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tavernary's one-card-per-source storage assumption with
non-public source records, migrate repository observation to source identity,
and let verified owners or trusted editors submit atomic, maintainer-approved
batches of up to ten sibling cards.

**Architecture:** Canonical project records reference a source registry by
`source_id`; repository snapshots, refresh policy, rename handling, and
permanent delisting belong to that source. Card editorial metadata and soft
listing lifecycle remain independent. The final cutover composes this source
migration with the approved Goals-and-Traits migration so exactly one
schema-version-6 project shape reaches the default branch.

**Tech Stack:** Node.js 24 ES modules, TypeScript 6, React 19, Next.js 16 static
export, AJV JSON Schema, Vitest, Playwright, GitHub Actions, GitHub CLI,
PowerShell.

## Global Constraints

- Work only in
  `F:\git\Tavernary\.worktrees\source-card-registry` on
  `codex/source-card-registry`.
- Do not merge into `main`; stop when the integrated branch is verified and
  ready to merge.
- Preserve unrelated work in the primary checkout and every other worktree.
- Every production behavior change follows red-green-refactor with one focused
  failing assertion before implementation.
- The default branch must never contain mixed version-5/version-6 project
  records.
- The canonical version-6 card shape uses `source_id`, `tags`, and independent
  `metadata_policy.summary` / `metadata_policy.tags`; it contains no inline
  `source`, `refresh_policy`, `capabilities`, `enrichment_policy`, or
  `enrichment_note`.
- `tags` contains zero to six unique IDs from the approved Goals-and-Traits
  vocabulary.
- Summary and tag policies are independent. Manual policies require a
  trusted-generated note; automatic policies forbid a note.
- Repository providers use immutable provider repository IDs as source
  identity. GitHub source IDs are `github-<repository-id>` and Codeberg source
  IDs are `codeberg-<repository-id>`.
- Existing project IDs never change. New sibling project IDs are assigned once
  from the source's current readable namespace plus card title.
- Ordinary project submissions remain duplicate-blocked. Only the owner Help
  operation `add-cards` may reference an existing source.
- Add-card requests are GitHub-only, contain one to ten cards, have one
  unresolved request per `source_id`, and publish atomically.
- Add-card requests never auto-merge. A maintainer must deliberately merge the
  generated pull request.
- Verified personal repository owners and trusted Tavernary editors may submit
  add-card requests. Collaborator, organization-member, and commit-author
  claims do not confer owner authority.
- Card retirement/restoration is soft and reversible. Source delisting is
  repository-wide, permanent through product workflows, and reserves the
  immutable source identity.
- Repository renames/transfers update one source and source snapshot without
  changing sibling project IDs.
- Source-backed facts are fetched once per source. Summaries, tags, metadata
  policy, and listing status remain card-specific.
- The source migration never infers offering boundaries or tag assignments.
- Generated `src/generated/catalog.json` is rebuilt, never hand-edited or
  committed.
- Use GitHub CLI with network permission for GitHub inspection and canary
  operations. If authentication is expired, stop and request reauthentication.
- Before the coordinated tag branch lands, source tasks use explicit v6 test
  fixtures and focused gates. Do not rewrite the checked-in project corpus or
  claim a full-suite pass until Task 12 composes both migrations and performs
  the single canonical v6 cutover.

---

## File Structure

### New source-domain units

- `src/features/catalog/source-record.mjs`
  - Pure stable-source ID, canonical URL, and sibling project-ID helpers.
- `src/features/catalog/source-record.d.mts`
  - Types source records and pure helper signatures.
- `src/features/catalog/listing-state.mjs`
  - Computes effective card visibility from card, source, and snapshot state.
- `src/features/catalog/listing-state.d.mts`
  - Types effective listing results and controlled reasons.
- `scripts/catalog/registry-context.mjs`
  - Loads and indexes projects, sources, and repository snapshots without
    recreating inline-source records.
- `scripts/catalog/registry-context.d.mts`
  - Types the canonical registry context.
- `scripts/catalog/migrate-source-registry-v1.mjs`
  - Plans, validates, reports, and explicitly writes the mechanical source,
    project, snapshot, and refresh-manifest migration.
- `scripts/catalog/migrate-source-registry-v1.d.mts`
  - Types migration input, output, counts, conflicts, and writer options.
- `tests/unit/source-record.test.ts`
  - Covers stable source and sibling project identifiers.
- `tests/unit/listing-state.test.ts`
  - Covers effective active, retired, quarantined, unhealthy, and delisted
    behavior.
- `tests/unit/registry-context.test.ts`
  - Covers canonical joins and missing/duplicate references.
- `tests/unit/migrate-source-registry-v1.test.ts`
  - Covers deterministic planning, dry-run safety, writes, and parity.

### New Help/publication units

- `src/features/help/components/owner-card-fields.tsx`
  - Shared complete card editor used by ordinary edits and add-card drafts.
- `src/features/help/components/source-card-batch-editor.tsx`
  - Owns one-to-ten draft creation, removal, per-card errors, and review rows.
- `scripts/help/source-request-lock.mjs`
  - Plans one unresolved add-card request per immutable source.
- `scripts/help/source-request-lock.d.mts`
  - Types source-lock inputs and admit/reject results.
- `tests/unit/source-request-lock.test.ts`
  - Covers existing issue/PR detection and concurrent admission.

### Existing canonical seams

- Schemas:
  `data/schemas/project.schema.json`,
  `data/schemas/repository-snapshot.schema.json`,
  `data/schemas/github-refresh.schema.json`.
- Catalog:
  `scripts/catalog/validate.mjs`,
  `scripts/catalog/build.mjs`,
  `scripts/catalog/build.d.mts`,
  `scripts/catalog/fork-relationship.mjs`,
  `scripts/catalog/fork-relationship.d.mts`.
- Repository observation:
  `scripts/catalog/repository-provider.mjs`,
  `scripts/catalog/repository-provider.d.mts`,
  `scripts/catalog/github-observer.mjs`,
  `scripts/catalog/github-observer.d.mts`,
  `scripts/catalog/github-repository-provider.mjs`,
  `scripts/catalog/github-repository-provider.d.mts`,
  `scripts/catalog/codeberg-repository-provider.mjs`,
  `scripts/catalog/codeberg-repository-provider.d.mts`,
  `scripts/catalog/repository-snapshot.mjs`,
  `scripts/catalog/repository-snapshot.d.mts`,
  `scripts/catalog/github-refresh-manifest.mjs`,
  `scripts/catalog/github-refresh-manifest.d.mts`,
  `scripts/catalog/refresh-github.mjs`,
  `scripts/catalog/refresh-github.d.mts`,
  `scripts/catalog/refresh-repositories.mjs`,
  `scripts/catalog/refresh-repositories.d.mts`,
  `.github/workflows/refresh-catalog.yml`.
- Enrichment and moderation:
  `scripts/catalog/enrichment-source.mjs`,
  `scripts/catalog/readme-source.mjs`,
  `scripts/catalog/enrich-readmes.mjs`,
  `scripts/catalog/select-enrichment-canary.mjs`,
  `scripts/moderation/review-catalog-policy.mjs`.
- Intake and dependency handling:
  `scripts/submissions/triage-issue.mjs`,
  `scripts/submissions/validate-submission.mjs`,
  `scripts/submissions/draft-project-record.mjs`,
  `scripts/submissions/draft-project-record.d.mts`,
  `scripts/submissions/generate-project-submission.mjs`,
  `scripts/submissions/frontend-reconciliation.mjs`,
  `scripts/submissions/fork-dependency.mjs`,
  `scripts/submissions/backfill-fork-dependencies.mjs`,
  `scripts/submissions/retry-fork-dependencies.mjs`,
  `scripts/submissions/retry-frontend-dependencies.mjs`.
- Help frontend and contracts:
  `src/lib/help/load-owner-project-options.ts`,
  `src/features/help/project-owner-record.mjs`,
  `src/features/help/project-owner-record.d.mts`,
  `src/features/help/project-owner-manifest.mjs`,
  `src/features/help/project-owner-manifest.d.mts`,
  `src/features/help/components/project-owner-builder.tsx`,
  `src/features/help/components/permanent-delist-dialog.tsx`,
  `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`.
- Help backend:
  `scripts/help/project-owner-authority.mjs`,
  `scripts/help/project-owner-authority.d.mts`,
  `scripts/help/triage-project-owner-request.mjs`,
  `scripts/help/triage-project-owner-request.d.mts`,
  `scripts/help/apply-project-owner-request.mjs`,
  `scripts/help/apply-project-owner-request.d.mts`,
  `scripts/help/generate-project-owner-request.mjs`,
  `scripts/help/generate-project-owner-request.d.mts`,
  `scripts/help/project-owner-pr.mjs`,
  `scripts/help/project-owner-pr.d.mts`,
  `scripts/help/project-owner-lifecycle.mjs`,
  `scripts/help/project-owner-lifecycle.d.mts`.
- Publication:
  `scripts/publication/project-publication-transaction.mjs`,
  `scripts/publication/project-publication-transaction.d.mts`,
  `scripts/publication/project-publication-planner.mjs`,
  `scripts/publication/project-publication-planner.d.mts`,
  `scripts/publication/project-publication-notices.mjs`,
  `scripts/publication/project-publication-notices.d.mts`,
  `scripts/ci/classify-pr-paths.mjs`,
  `.github/workflows/generate-project-submission.yml`,
  `.github/workflows/generate-project-owner-request.yml`,
  `.github/workflows/triage-project-owner-request.yml`,
  `.github/workflows/project-owner-request-lifecycle.yml`,
  `.github/workflows/publish-project-transaction.yml`,
  `.github/workflows/ci.yml`.
- Public types and fork UI:
  `src/features/catalog/catalog-types.ts`,
  `src/features/catalog/catalog-selectors.ts`,
  `src/features/catalog/components/project-relationship-control.tsx`.
- Documentation:
  `docs/contributing/submission-and-review.md`,
  `docs/maintenance/operations-runbook.md`,
  `docs/maintenance/github-actions-user-guides.md`.

---

### Task 1: Add Stable Source and Effective-Listing Primitives

**Files:**

- Create: `src/features/catalog/source-record.mjs`
- Create: `src/features/catalog/source-record.d.mts`
- Create: `src/features/catalog/listing-state.mjs`
- Create: `src/features/catalog/listing-state.d.mts`
- Create: `data/schemas/source.schema.json`
- Test: `tests/unit/source-record.test.ts`
- Test: `tests/unit/listing-state.test.ts`

**Interfaces:**

- Produces:
  `repositorySourceId(provider: "github" | "codeberg", repositoryId: number): string`.
- Produces:
  `legacySourceId(project: LegacyProjectRecord): string`.
- Produces:
  `canonicalSourceUrl(source: SourceRecord): string`.
- Produces:
  `siblingProjectId(source: SourceRecord, title: string): string`.
- Produces:
  `effectiveListingState({ project, source, snapshot }): { public: boolean; reason: string | null }`.
- Later tasks consume these helpers; no task may duplicate their normalization.

- [ ] **Step 1: Write the failing stable repository-source ID test**

```ts
import {
  repositorySourceId,
  siblingProjectId,
} from "@/features/catalog/source-record.mjs";

test("uses immutable repository identity and a readable sibling slug", () => {
  const source = {
    id: "github-1189674883",
    type: "github",
    repository: "Arif-salah/Megumin-Suite",
    repository_id: 1189674883,
  };
  expect(repositorySourceId("github", 1189674883)).toBe(
    "github-1189674883",
  );
  expect(siblingProjectId(source, "V9 Mirage")).toBe(
    "arif-salah-megumin-suite-v9-mirage",
  );
});
```

- [ ] **Step 2: Run the source-record test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/source-record.test.ts
```

Expected: FAIL because `source-record.mjs` does not exist.

- [ ] **Step 3: Implement strict source and sibling identifiers**

Implement these rules:

```js
export function repositorySourceId(provider, repositoryId) {
  if (!["github", "codeberg"].includes(provider)) {
    throw new Error(`Unsupported repository provider: ${provider}`);
  }
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    throw new Error("Repository source ID requires a positive repository ID.");
  }
  return `${provider}-${repositoryId}`;
}

export function siblingProjectId(source, title) {
  const namespace =
    source.type === "github" || source.type === "codeberg"
      ? source.repository
      : source.id;
  const value = `${namespace}-${title}`
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!value) throw new Error("Sibling card title cannot produce a project ID.");
  return value;
}
```

`legacySourceId` uses immutable IDs for repository sources and
`github-organization-<project-id>` / `url-<project-id>` for the two
non-repository shapes.

- [ ] **Step 4: Add source-schema assertions**

The schema must enforce:

```json
{
  "schema_version": 1,
  "id": "github-1189674883",
  "type": "github",
  "repository": "Arif-salah/Megumin-Suite",
  "repository_id": 1189674883,
  "status": "active",
  "status_reason": null,
  "refresh_policy": "automatic"
}
```

Active sources require `status_reason: null`; delisted sources require
`status_reason: "removed"` and `refresh_policy: "paused"`. URL sources retain
the current publication/version/artifact/license fields. Organization and URL
sources require paused refresh.

- [ ] **Step 5: Write the failing effective-listing matrix**

```ts
import { effectiveListingState } from "@/features/catalog/listing-state.mjs";

test.each([
  ["active", "active", "healthy", true, null],
  ["retired", "active", "healthy", false, "retired"],
  ["active", "delisted", "healthy", false, "removed"],
  ["active", "active", "identity-change", false, "identity-change"],
  ["active", "active", "unavailable", true, null],
])(
  "%s card on %s source with %s health",
  (listing, sourceStatus, health, visible, reason) => {
    expect(
      effectiveListingState({
        project: { listing_status: listing, listing_status_reason: null },
        source: { status: sourceStatus, status_reason: sourceStatus === "delisted" ? "removed" : null },
        snapshot: { source_health: health },
      }),
    ).toEqual({ public: visible, reason });
  },
);
```

- [ ] **Step 6: Implement and pass the listing matrix**

Use the existing hidden source-health set exactly:
`identity-change`, `deleted`, and `private`. Preserve current behavior where
`unavailable` is stale but still public.

Run:

```powershell
npm.cmd test -- tests/unit/source-record.test.ts tests/unit/listing-state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the primitives**

```powershell
git add src/features/catalog/source-record.mjs src/features/catalog/source-record.d.mts src/features/catalog/listing-state.mjs src/features/catalog/listing-state.d.mts data/schemas/source.schema.json tests/unit/source-record.test.ts tests/unit/listing-state.test.ts
git commit -m "feat(catalog): add source identity model"
```

---

### Task 2: Add Canonical Registry Joins and Mechanical Migration Planning

**Files:**

- Create: `scripts/catalog/registry-context.mjs`
- Create: `scripts/catalog/registry-context.d.mts`
- Create: `scripts/catalog/migrate-source-registry-v1.mjs`
- Create: `scripts/catalog/migrate-source-registry-v1.d.mts`
- Test: `tests/unit/registry-context.test.ts`
- Test: `tests/unit/migrate-source-registry-v1.test.ts`

**Interfaces:**

- Consumes: `legacySourceId`, `repositorySourceId`.
- Produces:
  `indexRegistry({ projects, sources, snapshots }): RegistryContext`.
- Produces:
  `loadRegistryContext(root?: string): Promise<RegistryContext>`.
- Produces:
  `planSourceRegistryMigration({ projects, snapshots, refreshManifest, metadataByProjectId }): SourceMigrationPlan`.
- Produces:
  `writeSourceRegistryMigration(plan, { root, write }): Promise<MigrationReport>`.
- `metadataByProjectId` is mandatory and contains the tag task's final
  `{ tags, metadata_policy }` values; source migration never creates them.

- [ ] **Step 1: Write the failing registry-context join test**

```ts
import { indexRegistry } from "../../scripts/catalog/registry-context.mjs";

test("joins sibling cards to one source and one snapshot", () => {
  const source = {
    id: "github-42",
    type: "github",
    repository: "owner/repo",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  };
  const context = indexRegistry({
    projects: [
      { id: "card-a", source_id: source.id },
      { id: "card-b", source_id: source.id },
    ],
    sources: [source],
    snapshots: [{ source_id: source.id }],
  });
  expect(context.projectsBySourceId.get(source.id)?.map(({ id }) => id)).toEqual([
    "card-a",
    "card-b",
  ]);
  expect(context.snapshotsBySourceId.get(source.id)?.source_id).toBe(source.id);
});
```

- [ ] **Step 2: Run the join test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/registry-context.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict indexes**

`indexRegistry` returns:

```ts
{
  projects: ProjectRecord[];
  sources: SourceRecord[];
  snapshots: RepositorySnapshot[];
  projectsById: Map<string, ProjectRecord>;
  sourcesById: Map<string, SourceRecord>;
  projectsBySourceId: Map<string, ProjectRecord[]>;
  snapshotsBySourceId: Map<string, RepositorySnapshot>;
  sourcesByRepositoryKey: Map<string, SourceRecord>;
}
```

Throw named errors for duplicate project IDs, duplicate source IDs, duplicate
provider repository IDs, missing project source references, duplicate
snapshots, and snapshots without sources.

- [ ] **Step 4: Write the failing migration-plan test**

Use one published GitHub project, one removed GitHub project, and two snapshots.
Require:

```ts
expect(plan.counts).toEqual({
  projects: 2,
  sources: 2,
  snapshots: 2,
  delistedSources: 1,
});
expect(plan.projects[0]).toMatchObject({
  schema_version: 6,
  source_id: "github-42",
  listing_status: "active",
  listing_status_reason: null,
  tags: ["memory-management"],
});
expect(plan.projects[0]).not.toHaveProperty("source");
expect(plan.projects[0]).not.toHaveProperty("refresh_policy");
expect(plan.sources[1]).toMatchObject({
  status: "delisted",
  status_reason: "removed",
  refresh_policy: "paused",
});
expect(plan.snapshots[0]).toMatchObject({
  schema_version: 4,
  source_id: "github-42",
});
expect(plan.refreshManifest).toMatchObject({
  schema_version: 3,
  source_timings: [{ source_id: "github-42" }],
});
```

- [ ] **Step 5: Implement a pure migration plan**

The planner:

1. validates all version-5 input records;
2. requires metadata for every project ID;
3. extracts exact source records;
4. maps lifecycle without inspecting repository contents;
5. rekeys snapshots and the timing manifest;
6. formats planned JSON with the existing JSON formatter; and
7. returns path-level create/update/delete operations without writing.

Conflicting source facts for one repository key produce:

```js
{
  code: "conflicting-source-identity",
  sourceId,
  projectIds,
}
```

- [ ] **Step 6: Prove dry-run cannot write**

Pass a recording `writeFile` and `rename` to
`writeSourceRegistryMigration(plan, { write: false })`. Assert zero calls and a
report containing every planned path.

- [ ] **Step 7: Prove explicit write is contained**

Use a temporary registry fixture. Assert all resolved destinations remain
inside the supplied root, source files are written before project files,
snapshots are renamed only after their replacement content validates, and a
write failure rolls back temporary files without deleting version-5 inputs.

Run:

```powershell
npm.cmd test -- tests/unit/registry-context.test.ts tests/unit/migrate-source-registry-v1.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit migration planning**

```powershell
git add scripts/catalog/registry-context.mjs scripts/catalog/registry-context.d.mts scripts/catalog/migrate-source-registry-v1.mjs scripts/catalog/migrate-source-registry-v1.d.mts tests/unit/registry-context.test.ts tests/unit/migrate-source-registry-v1.test.ts
git commit -m "feat(catalog): plan source registry migration"
```

---

### Task 3: Make Validation, Catalog Build, Kits, and Forks Source-Aware

**Files:**

- Modify: `data/schemas/project.schema.json`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `data/schemas/github-refresh.schema.json`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/catalog/build.d.mts`
- Modify: `scripts/catalog/fork-relationship.mjs`
- Modify: `scripts/catalog/fork-relationship.d.mts`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/components/project-relationship-control.tsx`
- Modify: `src/features/kits/kit-domain.mjs`
- Modify: `src/features/kits/kit-domain.d.mts`
- Test: `tests/unit/validate-catalog.test.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/validate-kits.test.ts`
- Test: `tests/unit/fork-relationship.test.ts`
- Test: `tests/unit/fork-relationship-flow.test.tsx`

**Interfaces:**

- Consumes: `indexRegistry`, `effectiveListingState`.
- `buildCatalog` gains `sources?: unknown[]`.
- `resolveForkRelationship` consumes source and sibling indexes.
- `CatalogForkRelationship` gains `parentUrl: string | null` and status
  `"repository"` for an ambiguous multi-card parent source.

- [ ] **Step 1: Write the failing schema-v6 validator fixture**

Add one fixture with two cards referencing `github-42`, one source, and one
snapshot. Assert:

```ts
await expect(
  validateCatalog({ projects, sources: [source], snapshots: [snapshot] }),
).resolves.toEqual([]);
```

Then remove the source and assert:

```ts
expect(errors).toContain("card-a: source github-42 does not exist");
```

- [ ] **Step 2: Run catalog validation and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts
```

Expected: FAIL because validation still expects inline source and
snapshot `project_id`.

- [ ] **Step 3: Implement canonical v6 validation**

Validate:

- all project, source, snapshot, refresh, Kit, vocabulary, and moderation
  schemas;
- no inline source/refresh/legacy metadata fields;
- every project source reference;
- one repository ID per source, while allowing many projects per source;
- snapshot provider and repository ID against its source;
- delisted-source invariants;
- metadata policy and tag rules supplied by the integrated tag contract; and
- no mixed project schema versions.

- [ ] **Step 4: Write the failing catalog sibling test**

```ts
const catalog = await buildCatalog({
  records: [extensionCard, presetCard],
  sources: [source],
  snapshots: [snapshot],
  // existing vocabulary and site test inputs
});

expect(catalog.projects.map(({ id }) => id)).toEqual([
  "megumin-extension",
  "megumin-preset",
]);
expect(catalog.projects[0].canonicalUrl).toBe(
  catalog.projects[1].canonicalUrl,
);
expect(catalog.projects[0].community).toEqual(
  catalog.projects[1].community,
);
```

- [ ] **Step 5: Implement project-source-snapshot joins**

Change the builders to:

```js
repositoryProject(project, source, snapshot, vocabularies, now)
urlProject(project, source, vocabularies)
manualProject(project, source, vocabularies)
```

Use `effectiveListingState` for both catalog cards and Kit component
availability. Keep project ordering and all public fields stable.

- [ ] **Step 6: Implement source-level fork resolution**

Use:

```js
resolveForkRelationship({
  snapshot,
  sourcesByRepositoryKey,
  publicProjectsBySourceId,
})
```

Return:

- one active parent card: internal `parentProjectId`, status `published`;
- several active parent cards: `parentUrl`, status `repository`;
- known source with no active card: status `unavailable`;
- unknown source: status `not-listed`.

Render `status: repository` as a normal external anchor. Do not choose a
primary sibling.

- [ ] **Step 7: Run focused catalog, Kit, and fork tests**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/validate-kits.test.ts tests/unit/fork-relationship.test.ts tests/unit/fork-relationship-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit source-aware read paths**

```powershell
git add data/schemas/project.schema.json data/schemas/repository-snapshot.schema.json data/schemas/github-refresh.schema.json scripts/catalog/validate.mjs scripts/catalog/build.mjs scripts/catalog/build.d.mts scripts/catalog/fork-relationship.mjs scripts/catalog/fork-relationship.d.mts src/features/catalog/catalog-types.ts src/features/catalog/components/project-relationship-control.tsx src/features/kits/kit-domain.mjs src/features/kits/kit-domain.d.mts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/validate-kits.test.ts tests/unit/fork-relationship.test.ts tests/unit/fork-relationship-flow.test.tsx
git commit -m "refactor(catalog): join cards through sources"
```

---

### Task 4: Rekey Repository Observation, Snapshots, and Refresh Scheduling

**Files:**

- Modify: `scripts/catalog/repository-provider.d.mts`
- Modify: `scripts/catalog/github-observer.mjs`
- Modify: `scripts/catalog/github-observer.d.mts`
- Modify: `scripts/catalog/codeberg-repository-provider.mjs`
- Modify: `scripts/catalog/codeberg-repository-provider.d.mts`
- Modify: `scripts/catalog/repository-snapshot.mjs`
- Modify: `scripts/catalog/repository-snapshot.d.mts`
- Modify: `scripts/catalog/github-refresh-manifest.mjs`
- Modify: `scripts/catalog/github-refresh-manifest.d.mts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `scripts/catalog/refresh-repositories.mjs`
- Modify: `scripts/catalog/refresh-repositories.d.mts`
- Modify: `scripts/catalog/repository-identity-backfill.mjs`
- Modify: `scripts/catalog/backfill-repository-identities.mjs`
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `.github/workflows/backfill-repository-identities.yml`
- Test: `tests/unit/github-observer.test.ts`
- Test: `tests/unit/repository-provider.test.ts`
- Test: `tests/unit/repository-snapshot.test.ts`
- Test: `tests/unit/incremental-refresh.test.ts`
- Test: `tests/unit/refresh-repositories.test.ts`
- Test: `tests/unit/github-refresh-manifest.test.ts`
- Test: `tests/unit/repository-identity-backfill.test.ts`

**Interfaces:**

- `ProviderRepositoryRecord` becomes `RepositorySourceRecord`.
- Observation/failure fields become `sourceId`, never `projectId`.
- Snapshot factories accept `sourceId` and emit `source_id`.
- Refresh selection becomes
  `selectRefreshSources(sources, snapshots, { sourceId, sourceIds, ... })`.
- CLI/workflow input becomes `source_id` / `--source-id`.
- The backfill operation updates source records only.

- [ ] **Step 1: Write the failing provider source-ID test**

```ts
expect(
  await observeRepositories(
    [{ id: "github-42", type: "github", repository: "owner/repo", repository_id: 42 }],
    options,
  ),
).toMatchObject({
  observations: [{ sourceId: "github-42" }],
});
```

- [ ] **Step 2: Run observer/provider tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/github-observer.test.ts tests/unit/repository-provider.test.ts
```

Expected: FAIL because providers still consume `record.source` and emit
`projectId`.

- [ ] **Step 3: Convert provider contracts to source records**

Use exact source shape:

```ts
interface RepositorySourceRecord {
  id: string;
  type: "github" | "codeberg";
  repository: string;
  repository_id: number;
  status: "active" | "delisted";
  refresh_policy: "automatic" | "paused";
}
```

Providers do not receive cards and cannot schedule duplicate observations.

- [ ] **Step 4: Write the failing snapshot and refresh-manifest tests**

Assert snapshot schema version 4 with `source_id` and refresh schema version 3
with:

```json
{
  "source_timings": [
    {
      "source_id": "github-42",
      "outcome": "unchanged",
      "duration_ms": 12,
      "error_code": null
    }
  ]
}
```

- [ ] **Step 5: Implement source-owned refresh**

Rename in runtime and types:

- `projectId` → `sourceId`
- `projectIds` → `sourceIds`
- `project_id` → `source_id`
- `project_timings` → `source_timings`

Write snapshots as
`data/snapshots/<provider>/<source_id>.json`. Delisted or paused sources are
never selected. Project/baseline/forensic refresh modes retain their names for
operator familiarity but accept source IDs.

- [ ] **Step 6: Update refresh and backfill workflows**

`refresh-catalog.yml` dispatch input is `source_id`; fork retry dispatches
derive source ID from the changed snapshot. Backfill reads/writes
`data/registry/sources`, not project records.

- [ ] **Step 7: Run the complete refresh slice**

Run:

```powershell
npm.cmd test -- tests/unit/github-observer.test.ts tests/unit/repository-provider.test.ts tests/unit/repository-snapshot.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-repositories.test.ts tests/unit/github-refresh-manifest.test.ts tests/unit/repository-identity-backfill.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-github-description.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit source-owned observation**

```powershell
git add scripts/catalog/repository-provider.d.mts scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts scripts/catalog/codeberg-repository-provider.mjs scripts/catalog/codeberg-repository-provider.d.mts scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts scripts/catalog/github-refresh-manifest.mjs scripts/catalog/github-refresh-manifest.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/catalog/refresh-repositories.mjs scripts/catalog/refresh-repositories.d.mts scripts/catalog/repository-identity-backfill.mjs scripts/catalog/backfill-repository-identities.mjs .github/workflows/refresh-catalog.yml .github/workflows/backfill-repository-identities.yml
git commit -m "refactor(catalog): refresh immutable sources"
```

Stage these exact focused tests:

```powershell
git add tests/unit/github-observer.test.ts tests/unit/repository-provider.test.ts tests/unit/repository-snapshot.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-repositories.test.ts tests/unit/github-refresh-manifest.test.ts tests/unit/repository-identity-backfill.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-github-description.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

---

### Task 5: Move Enrichment, Policy Review, and Dependency Reads to Source Context

**Files:**

- Modify: `scripts/catalog/enrichment-source.mjs`
- Modify: `scripts/catalog/enrichment-source.d.mts`
- Modify: `scripts/catalog/readme-source.mjs`
- Modify: `scripts/catalog/readme-source.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-orchestrator.mjs`
- Modify: `scripts/catalog/enrichment-rollout-plan.mjs`
- Modify: `scripts/catalog/select-enrichment-canary.mjs`
- Modify: `scripts/catalog/select-enrichment-canary.d.mts`
- Modify: `scripts/moderation/review-catalog-policy.mjs`
- Modify: `scripts/submissions/frontend-reconciliation.mjs`
- Modify: `scripts/submissions/fork-dependency.mjs`
- Modify: `scripts/submissions/fork-dependency.d.mts`
- Modify: `scripts/submissions/backfill-fork-dependencies.mjs`
- Modify: `scripts/submissions/retry-fork-dependencies.mjs`
- Modify: `scripts/submissions/retry-frontend-dependencies.mjs`
- Modify: `scripts/submissions/kit-submission-reconciliation.mjs`
- Test: `tests/unit/enrichment-source.test.ts`
- Test: `tests/unit/readme-source.test.ts`
- Test: `tests/unit/enrich-readmes.test.ts`
- Test: `tests/unit/enrichment-orchestrator.test.ts`
- Test: `tests/unit/select-enrichment-canary.test.ts`
- Test: `tests/unit/catalog-policy-review-workflow.test.ts`
- Test: `tests/unit/frontend-reconciliation.test.ts`
- Test: `tests/unit/fork-dependency.test.ts`
- Test: `tests/unit/backfill-fork-dependencies.test.ts`

**Interfaces:**

- `loadEnrichmentSource(project, source, snapshot, options)`.
- `assessSourceReadiness(source, snapshot, validateSnapshot)`.
- `enrichRecord(project, source, snapshot, provider, options)`.
- Fork and frontend reconciliation receive project/source contexts rather than
  inline source records.

- [ ] **Step 1: Write the failing shared-evidence test**

```ts
const first = await loadEnrichmentSource(cardA, source, snapshot, options);
const second = await loadEnrichmentSource(cardB, source, snapshot, options);

expect(first.sourceIdentity).toBe("github:owner/repo");
expect(second.sourceIdentity).toBe(first.sourceIdentity);
expect(options.provider.readRootReadme).toHaveBeenCalledTimes(2);
```

At orchestration level, cache by `source.id` and assert the provider is called
once for the two-card batch.

- [ ] **Step 2: Run enrichment tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-source.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts
```

Expected: FAIL because enrichment still reads `project.source` and snapshot
`project_id`.

- [ ] **Step 3: Implement source-aware evidence with card-specific output**

The source and snapshot determine evidence identity/readiness. The project
determines name, kind, summary, tags, and metadata policy. Cache prepared source
evidence by `source_id`, never generated card output.

Manual summary skips summary generation; manual tags skip tag generation.
Automatic fields remain independently eligible.

- [ ] **Step 4: Convert moderation and dependency joins**

Policy review fingerprints include project ID, source ID, source evidence head,
and policy version. Fork dependency resolves parent repository identity to a
source. Frontend reconciliation derives canonical URLs from the joined source.
Kit reconciliation uses effective listing state.

- [ ] **Step 5: Run focused enrichment/dependency tests**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-source.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/select-enrichment-canary.test.ts tests/unit/catalog-policy-review-workflow.test.ts tests/unit/frontend-reconciliation.test.ts tests/unit/fork-dependency.test.ts tests/unit/backfill-fork-dependencies.test.ts tests/unit/retry-fork-dependencies.test.ts tests/unit/retry-frontend-dependencies.test.ts tests/unit/kit-submission-reconciliation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit source-aware evidence and dependencies**

Stage only the files listed in this task and commit:

```powershell
git commit -m "refactor(catalog): share source evidence"
```

---

### Task 6: Generate New Submissions as Source, Card, and Snapshot Transactions

**Files:**

- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/triage-issue.d.mts`
- Modify: `scripts/submissions/validate-submission.mjs`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/submissions/generate-project-submission.d.mts`
- Modify: `scripts/submissions/project-submission-pr.mjs`
- Modify: `scripts/submissions/project-submission-pr.d.mts`
- Modify: `scripts/submissions/inflight-submissions.mjs`
- Test: `tests/unit/triage-issue.test.ts`
- Test: `tests/unit/validate-submission.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`
- Test: `tests/unit/generate-project-submission-cli.test.ts`
- Test: `tests/unit/project-submission-pr.test.ts`
- Test: `tests/unit/inflight-submissions.test.ts`

**Interfaces:**

- `loadProjectSubmissionCatalogData()` returns projects and sources.
- `projectSubmissionExistingSource(source)` replaces project-inline identity
  parsing.
- `draftProjectRecord` returns `{ record, source, snapshot?, ... }`.
- `generateProjectSubmission` writes a source path, project path, and optional
  source snapshot path atomically.

- [ ] **Step 1: Write the failing ordinary duplicate-source test**

```ts
expect(
  validateSubmission({
    identity: incomingIdentity,
    existingIdentities: [identityFromSource(existingSource)],
  }),
).toMatchObject({ status: "rejected", reasonCode: "duplicate-source" });
```

Confirm this remains rejected even when the existing source has several cards.

- [ ] **Step 2: Run submission validation and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/validate-submission.test.ts tests/unit/triage-issue.test.ts
```

Expected: FAIL because existing identity is still project-derived.

- [ ] **Step 3: Move intake duplicate identity to sources**

Ordinary submission never attaches to an existing source. Diagnostic output may
list sibling card IDs, but the decision remains `duplicate-source`.

- [ ] **Step 4: Write the failing generated-file-set test**

```ts
expect(generated.files.map(({ path }) => path).sort()).toEqual([
  "data/registry/projects/owner-repo.json",
  "data/registry/sources/github-42.json",
  "data/snapshots/github/github-42.json",
]);
expect(generated.record.source_id).toBe("github-42");
expect(generated.snapshot.source_id).toBe("github-42");
```

- [ ] **Step 5: Implement the three-record draft**

Repository-backed creation:

```ts
{
  source: SourceRecord;
  record: ProjectV6Record;
  snapshot: RepositorySnapshotV4;
}
```

URL and organization creation writes source plus project without a repository
snapshot. Final project metadata comes from the integrated tag/metadata
contract.

- [ ] **Step 6: Run the complete submission slice**

Run:

```powershell
npm.cmd test -- tests/unit/triage-issue.test.ts tests/unit/validate-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts tests/unit/inflight-submissions.test.ts tests/unit/project-submission-admission.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit source-backed submission generation**

Stage only this task's files and commit:

```powershell
git commit -m "refactor(submissions): create source-backed cards"
```

---

### Task 7: Replace Singular Publication Transactions with Source/Card Transactions

**Files:**

- Modify: `scripts/publication/project-publication-transaction.mjs`
- Modify: `scripts/publication/project-publication-transaction.d.mts`
- Modify: `scripts/publication/project-publication-planner.mjs`
- Modify: `scripts/publication/project-publication-planner.d.mts`
- Modify: `scripts/submissions/project-submission-pr.mjs`
- Modify: `scripts/help/project-owner-pr.mjs`
- Modify: `scripts/ci/classify-pr-paths.mjs`
- Test: `tests/unit/project-publication-transaction.test.ts`
- Test: `tests/unit/project-publication-planner.test.ts`
- Test: `tests/unit/project-submission-pr.test.ts`
- Test: `tests/unit/project-owner-pr.test.ts`
- Test: `tests/unit/classify-pr-paths.test.ts`

**Interfaces:**

- Transaction schema version 2 fields:

```ts
interface ProjectPublicationTransactionV2 {
  schema_version: 2;
  operation:
    | "create"
    | "edit-card"
    | "add-cards"
    | "retire-card"
    | "restore-card"
    | "move-source"
    | "delist-source";
  producer: "project-submission" | "project-owner-request";
  publication_mode: "automatic" | "manual";
  issue_number: number;
  project_ids: string[];
  source_id: string;
  input_fingerprints: {
    projects: Record<string, string>;
    source: string | null;
  };
  generated_paths: string[];
  // existing actor, authority, source identity, digest, SHA, policy, copy fields
}
```

- `expectedTransactionPaths(transaction)` derives exact source/card/snapshot
  paths by operation.
- Planner returns `await-maintainer` for `publication_mode: manual`.

- [ ] **Step 1: Write the failing add-card transaction test**

```ts
const transaction = createProjectPublicationTransaction({
  schema_version: 2,
  operation: "add-cards",
  producer: "project-owner-request",
  publication_mode: "manual",
  project_ids: ["card-a", "card-b"],
  source_id: "github-42",
  input_fingerprints: { projects: {}, source: "a".repeat(64) },
  generated_paths: [
    "data/registry/projects/card-a.json",
    "data/registry/projects/card-b.json",
  ],
  // valid existing security fields
});
expect(expectedTransactionPaths(transaction)).toEqual(
  transaction.generated_paths,
);
```

- [ ] **Step 2: Run transaction tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-publication-transaction.test.ts
```

Expected: FAIL because schema version 1 requires one `project_id`.

- [ ] **Step 3: Implement exact operation/path matrix**

Use:

| Operation | Existing fingerprint | Allowed generated paths |
|---|---|---|
| create | none | source, one card, optional source snapshot |
| edit-card | one card | one card |
| add-cards | source | one to ten new cards |
| retire-card | one card | one card |
| restore-card | one card | one card |
| move-source | source | source and source snapshot |
| delist-source | source | source |

Reject duplicate/unsorted project IDs, unexpected paths, source/path mismatch,
and automatic mode for `add-cards`.

- [ ] **Step 4: Write the failing manual-publication planner test**

```ts
expect(
  planProjectPublication(validInputFor({ publication_mode: "manual" })),
).toEqual({ action: "await-maintainer", reasonCode: "manual-approval-required" });
```

- [ ] **Step 5: Implement publication planning**

Automatic operations retain exact-SHA merge behavior. Manual operations perform
all current-state and exact-file validation but never request merge or
regeneration merely because the PR remains open.

- [ ] **Step 6: Update PR path classification and markers**

Add `data/registry/sources/*.json` as content. PR markers render all project IDs,
source ID, operation, and publication mode.

- [ ] **Step 7: Run focused publication tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts tests/unit/project-submission-pr.test.ts tests/unit/project-owner-pr.test.ts tests/unit/classify-pr-paths.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit transaction v2**

```powershell
git add scripts/publication/project-publication-transaction.mjs scripts/publication/project-publication-transaction.d.mts scripts/publication/project-publication-planner.mjs scripts/publication/project-publication-planner.d.mts scripts/submissions/project-submission-pr.mjs scripts/help/project-owner-pr.mjs scripts/ci/classify-pr-paths.mjs tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts tests/unit/project-submission-pr.test.ts tests/unit/project-owner-pr.test.ts tests/unit/classify-pr-paths.test.ts
git commit -m "refactor(publication): support source transactions"
```

---

### Task 8: Define Owner Manifest v2 and Card/Source Fingerprints

**Files:**

- Modify: `src/features/help/project-owner-record.mjs`
- Modify: `src/features/help/project-owner-record.d.mts`
- Modify: `src/features/help/project-owner-manifest.mjs`
- Modify: `src/features/help/project-owner-manifest.d.mts`
- Modify: `src/lib/help/load-owner-project-options.ts`
- Test: `tests/unit/project-owner-record.test.ts`
- Test: `tests/unit/project-owner-manifest.test.ts`
- Test: `tests/unit/load-owner-project-options.test.ts`
- Test: `tests/unit/help-project-options.test.ts`

**Interfaces:**

- Produces:
  `fingerprintProjectRecord(project): string`.
- Produces:
  `fingerprintSourceRecord(source): string`.
- Owner operations:
  `edit-card`, `add-cards`, `retire-card`, `restore-card`, `move-source`,
  `delist-source`.
- Manifest version 2 uses operation-specific `project_fingerprint` or
  `source_fingerprint`.
- `OwnerProjectOption` exposes source ID, both fingerprints, sibling summaries,
  listing status, and source status.

- [ ] **Step 1: Write the failing manifest-v2 add-card test**

```ts
const result = normalizeProjectOwnerManifest(
  {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "add-cards",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: "a".repeat(64),
    proposed_cards: [validDraft],
    explanation: null,
  },
  vocabularies,
);
expect(result).toMatchObject({
  valid: true,
  manifest: { operation: "add-cards", proposed_cards: [validDraft] },
});
```

`validDraft` contains `draft_id`, generated `project_id`, name, kind, summary,
frontends, primary function, tags, summary/tag policy modes, and Preset-only
compatibility.

- [ ] **Step 2: Run manifest tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-manifest.test.ts
```

Expected: FAIL because only manifest version 1 and three operations exist.

- [ ] **Step 3: Implement strict operation unions**

Rules:

- add-cards has one to ten cards;
- project IDs are unique and match `siblingProjectId`;
- zero to six valid tags per card;
- automatic policy forbids a note in user input;
- manual policy input carries mode only; backend creates trusted notes;
- kind-specific primary function and Preset fields validate independently;
- retire requires current active card;
- restore requires current retired card and active source;
- delist-source requires repository identity confirmation.

- [ ] **Step 4: Write the failing owner-option join test**

```ts
expect(await loadOwnerProjectOptions(root)).toMatchObject([
  {
    id: "card-a",
    sourceId: "github-42",
    projectFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    siblings: [{ id: "card-b", name: "Card B", listingStatus: "retired" }],
    sourceState: { status: "active", refreshPolicy: "automatic" },
  },
]);
```

- [ ] **Step 5: Implement source-aware Help options**

Load projects and sources separately. Include retired/quarantined cards for
management, but do not expose internal source records through public catalog
data. Eligibility remains GitHub with a positive immutable repository ID.

- [ ] **Step 6: Run contract and loader tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-record.test.ts tests/unit/project-owner-manifest.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/help-project-options.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit owner contract v2**

```powershell
git add src/features/help/project-owner-record.mjs src/features/help/project-owner-record.d.mts src/features/help/project-owner-manifest.mjs src/features/help/project-owner-manifest.d.mts src/lib/help/load-owner-project-options.ts tests/unit/project-owner-record.test.ts tests/unit/project-owner-manifest.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/help-project-options.test.ts
git commit -m "feat(help): define source card requests"
```

---

### Task 9: Build the Multi-Card Help Editor and Soft Lifecycle UX

**Files:**

- Create: `src/features/help/components/owner-card-fields.tsx`
- Create: `src/features/help/components/source-card-batch-editor.tsx`
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `src/features/help/components/permanent-delist-dialog.tsx`
- Modify: `src/styles/help.css`
- Test: `tests/unit/project-owner-builder.test.tsx`
- Test: `tests/unit/permanent-delist-dialog.test.tsx`
- Test: `tests/e2e/help-project-owner.spec.ts`

**Interfaces:**

- `OwnerCardFields` consumes one draft, vocabularies, validation state, and
  `onChange`.
- `SourceCardBatchEditor` consumes source/card seed plus up to ten drafts and
  emits a normalized manifest-ready array.
- The integrated tag task supplies the shared searchable tag picker and tag
  descriptions; this task must reuse it.

- [ ] **Step 1: Write the failing action-list UI test**

Assert an eligible active GitHub card offers:

```text
Edit card details
Add cards from this source
Retire this card
Update repository location
Permanently delist this source
```

A retired card offers **Restore this card** and not **Retire this card**. A
delisted source offers none of add/move/restore.

- [ ] **Step 2: Run the builder test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx
```

Expected: FAIL because the action union is still edit/move/delist.

- [ ] **Step 3: Extract the shared complete card field editor**

Move existing name, summary, frontends, primary function, kind-specific
compatibility, and tag controls into `OwnerCardFields`. Ordinary edit keeps
kind fixed; add-card drafts permit kind changes.

Summary and tag policy controls are independent:

```text
Let Tavernary write/select automatically (default)
Use these values as owner/editor-authored
```

Prefill values but default both modes to automatic. Changing kind clears
inapplicable Preset fields and invalid tags through explicit user-visible
validation, never silent inference.

- [ ] **Step 4: Write the failing batch-boundary tests**

Assert:

- first draft is a complete clone with a new opaque `draft_id`;
- add reaches ten and then disables;
- removing leaves at least one;
- per-card errors name the draft title/index;
- duplicate generated IDs block review;
- one invalid card blocks the entire batch; and
- the exact unresolved-request disclaimer is visible.

- [ ] **Step 5: Implement batch editor and review**

Review rows group each card and show generated project ID, full field values,
summary policy, tag policy, and source. No internal React key enters the
manifest.

- [ ] **Step 6: Update destructive and soft lifecycle copy**

Retire/restore dialogs name one card and state reversibility. Permanent
delisting lists every sibling and requires the current repository
`owner/repository`, not one card title.

- [ ] **Step 7: Run UI and E2E slice**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/permanent-delist-dialog.test.tsx
npm.cmd run build
npm.cmd run test:e2e -- help-project-owner.spec.ts
```

Expected: PASS on desktop and mobile Help flows.

- [ ] **Step 8: Commit the Help editor**

```powershell
git add src/features/help/components/owner-card-fields.tsx src/features/help/components/source-card-batch-editor.tsx src/features/help/components/project-owner-builder.tsx src/features/help/components/permanent-delist-dialog.tsx src/styles/help.css tests/unit/project-owner-builder.test.tsx tests/unit/permanent-delist-dialog.test.tsx tests/e2e/help-project-owner.spec.ts
git commit -m "feat(help): add source card batch editor"
```

---

### Task 10: Apply Card and Source Operations with One Unresolved Batch Lock

**Files:**

- Create: `scripts/help/source-request-lock.mjs`
- Create: `scripts/help/source-request-lock.d.mts`
- Modify: `scripts/help/project-owner-authority.mjs`
- Modify: `scripts/help/project-owner-authority.d.mts`
- Modify: `scripts/help/triage-project-owner-request.mjs`
- Modify: `scripts/help/triage-project-owner-request.d.mts`
- Modify: `scripts/help/apply-project-owner-request.mjs`
- Modify: `scripts/help/apply-project-owner-request.d.mts`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.d.mts`
- Modify: `scripts/help/project-owner-pr.mjs`
- Modify: `scripts/help/project-owner-pr.d.mts`
- Modify: `scripts/help/project-owner-lifecycle.mjs`
- Modify: `scripts/help/project-owner-lifecycle.d.mts`
- Test: `tests/unit/source-request-lock.test.ts`
- Test: `tests/unit/project-owner-authority.test.ts`
- Test: `tests/unit/triage-project-owner-request.test.ts`
- Test: `tests/unit/apply-project-owner-request.test.ts`
- Test: `tests/unit/generate-project-owner-request.test.ts`
- Test: `tests/unit/project-owner-pr.test.ts`
- Test: `tests/unit/project-owner-lifecycle.test.ts`

**Interfaces:**

- Produces:
  `planSourceRequestAdmission({ sourceId, issueNumber, issues, pulls }): { action: "admit" } | { action: "reject"; conflictingIssueNumber: number }`.
- Triage returns both current card and source contexts plus operation-specific
  fingerprints.
- Apply returns `{ projects, source, snapshot, changedPaths, before, after }`.

- [ ] **Step 1: Write the failing unresolved-source lock tests**

```ts
expect(
  planSourceRequestAdmission({
    sourceId: "github-42",
    issueNumber: 12,
    issues: [openAddCardsIssue(11, "github-42")],
    pulls: [],
  }),
).toEqual({
  action: "reject",
  reasonCode: "source-request-already-open",
  conflictingIssueNumber: 11,
});
```

Also prove closed/declined/merged issues clear the lock, card edits do not
occupy it, and two simultaneous candidates deterministically admit the lower
issue number.

- [ ] **Step 2: Run lock tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/source-request-lock.test.ts
```

Expected: FAIL because the lock module does not exist.

- [ ] **Step 3: Implement lock planning without semantic guesses**

The lock parses only validated manifests/transaction markers. Repository slug
changes cannot change the key. Rejected requests receive a link to the admitted
issue/PR.

- [ ] **Step 4: Write one failing apply test per operation**

Use exact assertions:

- edit-card writes one project;
- add-cards writes one to ten new projects and no source/snapshot;
- retire-card writes `listing_status: retired`;
- restore-card writes `listing_status: active` only for an active source;
- move-source writes source and snapshot, preserving IDs;
- delist-source writes source `delisted/removed/paused` and no sibling cards.

For add-cards, manual summary/tag policies receive new trusted notes referencing
the issue; automatic policies contain no note.

- [ ] **Step 5: Implement source-aware authority and conflict checks**

Owner authority fetches `/repositories/<source.repository_id>`. Trusted staff
retains immutable-ID plus association validation. Card operations compare card
fingerprints; source operations and add-cards compare source fingerprints.

- [ ] **Step 6: Generate atomic reports and PR paths**

One add-card issue produces one branch, one PR, all card JSON files, one
transaction, and publication mode `manual`. `sameProjectOwnerGenerationReport`
compares sorted project arrays and source identity exactly.

- [ ] **Step 7: Run the complete backend slice**

Run:

```powershell
npm.cmd test -- tests/unit/source-request-lock.test.ts tests/unit/project-owner-authority.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/project-owner-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit owner source operations**

Stage only this task's source and test files and commit:

```powershell
git commit -m "feat(help): apply source card operations"
```

---

### Task 11: Wire GitHub Forms, Workflows, Publication Mode, and Notices

**Files:**

- Modify: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Modify: `.github/workflows/triage-project-owner-request.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/project-owner-request-lifecycle.yml`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Modify: `.github/workflows/publish-project-transaction.yml`
- Modify: `.github/workflows/review-catalog-policy.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/publication/project-publication-notices.mjs`
- Modify: `scripts/publication/project-publication-notices.d.mts`
- Test: `tests/unit/issue-forms.test.ts`
- Test: `tests/unit/workflows.test.ts`
- Test: `tests/unit/project-automatic-publication-workflow.test.ts`
- Test: `tests/unit/project-publication-notices.test.ts`
- Test: `tests/unit/project-owner-lifecycle.test.ts`

**Interfaces:**

- Form fallback labels all six owner operations.
- Generation workflow queries existing source-request issues/PRs before
  add-card admission.
- Publisher recognizes `await-maintainer` as a successful non-merge terminal
  action for that run.
- Lifecycle closes the source issue only after manual PR merge or explicit
  decline.

- [ ] **Step 1: Write failing workflow contract assertions**

Assert:

- source registry paths trigger content validation;
- transaction schema version 2 is required;
- add-card publication mode is manual;
- publisher has no merge command on `await-maintainer`;
- source-scoped concurrency uses `source_id`;
- source delist notice enumerates sibling cards/Kits; and
- old schema-version-1 generated PRs fail closed and request regeneration.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/workflows.test.ts tests/unit/project-automatic-publication-workflow.test.ts
```

Expected: FAIL on the new operation and source-path assertions.

- [ ] **Step 3: Update Issue Form fallback**

Readable request types:

```text
Edit card details
Add cards from this source
Retire this card
Restore this card
Update repository location
Permanently delist this source
```

The fallback add-card path accepts the complete JSON manifest as the authority
because GitHub Issue Forms cannot model ten dynamic cards.

- [ ] **Step 4: Update workflow generation and publication**

The publisher validates manual transactions and writes a job summary explaining
that maintainer merge is required. It does not add an automatic-merge label,
call `gh pr merge`, close the issue, or dispatch post-merge review before the
actual merge event.

- [ ] **Step 5: Update notices**

Card retirement notices remain card-specific. Source delist notices list every
sibling, affected Kit, source repository, and permanent blocked identity.
Sanitize all owner-provided text with existing helpers.

- [ ] **Step 6: Run workflow and notice tests**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/workflows.test.ts tests/unit/project-automatic-publication-workflow.test.ts tests/unit/project-publication-notices.test.ts tests/unit/project-owner-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit GitHub orchestration**

Stage only files in this task and commit:

```powershell
git commit -m "ci: publish source card requests safely"
```

---

### Task 12: Integrate the Goals-and-Traits Branch and Execute One Canonical v6 Migration

**Files:**

- Integrate from: `codex/catalog-schema-v6` at or after `e091af70`
- Read:
  `docs/superpowers/specs/2026-07-29-catalog-tag-system-schema-v6-design.md`
- Modify after integration:
  `data/schemas/project.schema.json`,
  `scripts/catalog/migrate-source-registry-v1.mjs`,
  `scripts/catalog/validate.mjs`,
  `scripts/catalog/build.mjs`,
  `scripts/submissions/draft-project-record.mjs`,
  `src/features/help/components/owner-card-fields.tsx`.
- Create through migration: `data/registry/sources/*.json`
- Modify through migration: `data/registry/projects/*.json`
- Rename/modify through migration:
  `data/snapshots/github/*.json`,
  `data/snapshots/codeberg/*.json`.
- Modify through migration: `data/snapshots/github-refresh.json`
- Test: tag branch's focused schema, picker, filter, classifier, and migration
  tests.
- Test: `tests/unit/migrate-source-registry-v1.test.ts`
- Test: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**

- Tag integration provides:

```ts
interface ProjectMetadataV6 {
  tags: string[];
  metadata_policy: {
    summary: { mode: "automatic" } | { mode: "manual"; note: string };
    tags: { mode: "automatic" } | { mode: "manual"; note: string };
  };
}
```

- Source migration consumes a complete `Map<projectId, ProjectMetadataV6>`.
- One CLI command composes source and tag metadata migrations, validates the
  complete result, and writes only with `--write`.

- [ ] **Step 1: Inspect and integrate the exact tag branch SHA**

Use GitHub/local Git inspection to confirm the tag branch contains only its
owned vocabulary, metadata-policy, classifier, picker/filter, and migration
delta. Merge or cherry-pick into this feature branch; do not merge either
branch into `main`.

- [ ] **Step 2: Resolve combined schema and consumer conflicts**

The final project required fields are:

```json
[
  "schema_version",
  "id",
  "source_id",
  "name",
  "kind",
  "summary",
  "metadata_status",
  "frontends",
  "primary_function",
  "tags",
  "metadata_policy",
  "cataloged_at",
  "catalog_cohort",
  "listing_status",
  "listing_status_reason"
]
```

Reject all legacy fields. Ensure multi-card drafts reuse the shared tag picker
and do not clone metadata-policy notes.

- [ ] **Step 3: Run the migration dry run**

Run:

```powershell
node scripts/catalog/migrate-source-registry-v1.mjs
```

Expected report:

```text
projects=305
sources=305
repository_snapshots=295
delisted_sources=2
kits=7
kit_project_references=48
writes=0
```

The source count is 305 before any new sibling is added because every current
project has a unique source.

- [ ] **Step 4: Run the explicit migration**

Run:

```powershell
node scripts/catalog/migrate-source-registry-v1.mjs --write
```

Expected: all new/updated files validate; no legacy project/snapshot path is
left canonical; generated catalog remains ignored.

- [ ] **Step 5: Prove parity before adding a sibling fixture**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd test -- tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts tests/unit/validate-kits.test.ts
```

Expected:

- 305 cards stored;
- 303 visible;
- 7 Kits and 48 project references unchanged;
- all existing project IDs unchanged;
- 295 source snapshots with unchanged repository evidence; and
- the two Lumiverse source tombstones hidden.

- [ ] **Step 6: Add a deterministic two-card shared-source test fixture**

Do not add an unreviewed real public card merely to exercise the schema.
Create a test-only Megumin-like fixture with one extension and two Presets
sharing one source/snapshot. Assert independent tags/policies and shared source
facts.

- [ ] **Step 7: Run tag and source migration suites together**

Run the exact focused tag commands documented by the integrated tag plan plus:

```powershell
npm.cmd test -- tests/unit/migrate-source-registry-v1.test.ts tests/unit/source-record.test.ts tests/unit/registry-context.test.ts tests/unit/listing-state.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the canonical migration**

Stage schemas, migration code, all canonical source/project/snapshot/manifest
changes, tag integration, and exact tests. Verify the staged diff contains no
generated catalog or local evidence corpus.

Commit:

```powershell
git commit -m "feat(catalog): migrate cards to shared sources"
```

Commit body must record the 305/305/295/2/7/48 migration counts.

---

### Task 13: Document Cutover, Reconcile In-Flight Work, and Verify the Full Product

**Files:**

- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/maintenance/github-actions-user-guides.md`
- Modify: `docs/superpowers/specs/2026-07-29-source-backed-multi-card-registry-design.md`
  only if implementation facts require a correction.
- Test: `tests/unit/help-docs.test.ts`
- Test: `tests/unit/project-submission-docs.test.ts`
- Test: `tests/unit/kit-maintenance-docs.test.ts`
- Test: `tests/e2e/help-project-owner.spec.ts`
- Test: `tests/e2e/project-submission.spec.ts`
- Test: `tests/e2e/static-export.spec.ts`

**Interfaces:**

- Runbook explains source/card lifecycle, add-card lock, manual approval,
  migration rollback, and old-transaction regeneration.
- Cutover audit records every open version-1 generated PR before merge.

- [ ] **Step 1: Inspect live GitHub in-flight publication state**

With network permission:

```powershell
gh auth status
gh pr list --state open --limit 100 --json number,title,headRefName,url,updatedAt
gh issue list --state open --limit 100 --json number,title,labels,url,updatedAt
```

Record open `automation/project-submission-*` and
`automation/project-owner-request-*` PRs. Do not close, rerun, or mutate them
without explicit operator approval. Document which must merge first or be
regenerated after cutover.

- [ ] **Step 2: Write and verify maintenance documentation**

Document:

- source vs card terminology;
- one-to-ten atomic add-card requests;
- one unresolved batch per source;
- manual add-card approval;
- retire/restore vs permanent delist;
- rename/transfer handling;
- source refresh and snapshot paths;
- transaction v1 cutover behavior; and
- dry-run/write/rollback migration commands.

Run:

```powershell
npm.cmd test -- tests/unit/help-docs.test.ts tests/unit/project-submission-docs.test.ts tests/unit/kit-maintenance-docs.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run formatting, validation, type, and unit gates**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run palette:audit
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd run typecheck
npm.cmd test
```

Expected: zero failures. Record exact file/test totals.

- [ ] **Step 4: Run production build and export verification**

Run:

```powershell
npm.cmd run build
npm.cmd run verify:export
```

Expected: static build and export verification pass.

- [ ] **Step 5: Run focused E2E**

Run:

```powershell
npm.cmd run test:e2e -- help-project-owner.spec.ts project-submission.spec.ts static-export.spec.ts
```

Expected: pass on configured desktop and mobile projects.

- [ ] **Step 6: Run local workflow canaries**

Use disposable fixture directories and mocked GitHub responses to exercise one
complete successful and one complete rejected path for each operation:

- atomic two-card `add-cards`;
- GitHub repository rename with stable source and project IDs;
- card retire followed by restore; and
- permanent source delist hiding every sibling.

The successful add-card canary must prove that one transaction produces all
project files and no partial write. The rejected canary must prove that any
invalid draft leaves the fixture tree unchanged.

Run:

```powershell
npm.cmd test -- tests/unit/apply-project-owner-request.test.ts tests/unit/project-publication-planner.test.ts tests/unit/project-publication-transaction.test.ts tests/unit/refresh-repositories.test.ts tests/unit/listing-state.test.ts
```

Expected: PASS with explicit atomicity, rename, soft-lifecycle, and nuclear
delist assertions.

A mutating live GitHub canary requires a pushed branch and disposable or
operator-approved issue/repository targets. Request that separate authorization
before performing it; never infer permission from this local implementation
task.

- [ ] **Step 7: Commit docs and final deterministic corrections**

Stage only documentation and corrections directly required by failed gates.
Commit:

```powershell
git commit -m "docs: document source card operations"
```

---

### Task 14: Rebase on Current Main, Run Merge-Readiness Proof, and Stop

**Files:**

- No planned production changes.
- Any conflict resolution must remain within files already owned by this plan
  or the coordinated tag plan.

**Interfaces:**

- Final branch contains the approved source-registry and tag-system commits,
  current `main`, no unrelated work, and no uncommitted files.

- [ ] **Step 1: Refresh current repository truth**

With GitHub/network permission:

```powershell
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
git fetch origin
git status --short
```

Expected: authenticated GitHub, correct repository, clean feature branch.

- [ ] **Step 2: Integrate the latest default branch**

Merge `origin/main` into `codex/source-card-registry`. Resolve only relevant
overlaps. Never reset, discard, or modify other worktrees.

- [ ] **Step 3: Rerun the complete repository gate from the integrated head**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette, schema validation, catalog build,
typecheck, all unit tests, production build, and static export verification
pass.

- [ ] **Step 4: Rerun source/tag/Help regression slices**

Run:

```powershell
npm.cmd test -- tests/unit/source-record.test.ts tests/unit/registry-context.test.ts tests/unit/listing-state.test.ts tests/unit/migrate-source-registry-v1.test.ts tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/source-request-lock.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts tests/unit/workflows.test.ts
npm.cmd run test:e2e -- help-project-owner.spec.ts project-submission.spec.ts static-export.spec.ts
```

Also run the tag plan's final focused command from its integrated plan.

Expected: zero failures.

- [ ] **Step 5: Inspect the final diff and migration invariants**

Run:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
node scripts/catalog/migrate-source-registry-v1.mjs
```

Expected: clean worktree, no diff-check errors, dry run reports zero pending
writes against the migrated tree.

- [ ] **Step 6: Prepare the merge-readiness report**

Report:

- branch and worktree;
- final HEAD SHA;
- commits and high-level scope;
- schema/data counts;
- exact verification commands and results;
- current-main integration SHA;
- tag-branch integration SHA;
- in-flight GitHub transaction audit;
- local workflow-canary results;
- whether the separately authorized mutating live GitHub canary was run, and if
  not, the exact authorization/environment needed; and
- confirmation that `main` was not merged into by this task.

Stop and notify the user that the branch is ready to merge. Do not push, open a
pull request, or merge unless the user separately authorizes that external
state change.
