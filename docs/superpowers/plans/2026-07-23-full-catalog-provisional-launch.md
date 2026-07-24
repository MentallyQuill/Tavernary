# Full Catalog Provisional Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish all 214 unique seed projects through Tavernary's canonical validated registry while clearly marking 209 bulk-migrated records as provisional and progressively enriching their GitHub facts.

**Architecture:** Upgrade the curated record contract to schema version 2, then use a deterministic one-time migration to convert the 213-entry historical intake into per-project registry files without overwriting the five curated records. Build public cards from every published record even before a GitHub snapshot exists, while retaining identity quarantine for verified unsafe sources and adding a separate snapshot-to-registry identity backfill.

**Tech Stack:** Node.js 24 ESM scripts, JSON Schema draft-07 with Ajv, TypeScript 6, Next.js 16 static export, React 19, Vitest 4, and Playwright 1.61.

## Global Constraints

- The final public union is exactly 214 unique projects: 213 intake records plus registry-only SillyTavern.
- The migration creates 209 provisional records and preserves the five existing curated records.
- Final source counts are 204 GitHub repositories, one GitHub organization, and nine URL sources.
- All records are published; incomplete enrichment alone never hides a record.
- Existing curated records win every intake overlap and are never overwritten by the intake migration.
- Schema version 2 replaces version 1 in place; do not add legacy compatibility code.
- GitHub repository IDs may be `null` only while `metadata_status` is `provisional`.
- Tavern RPG Suite is the only `github-organization` seed exception.
- Unknown editorial classification uses `uncategorized`; do not infer capabilities or project behavior.
- Missing source facts render as pending or unavailable, never as zero or as verified missing.
- Identity changes and confirmed deleted or private sources remain excluded from the public build.
- `data/registry/projects/*.json` remains the curated source of truth; `data/catalog/projects.json` never becomes a runtime input.
- Do not add accounts, ratings, comments, installers, hosted project files, or project-detail pages.

---

### Task 1: Upgrade the Curated Registry Contract to Schema Version 2

**Files:**

- Modify: `data/schemas/project.schema.json`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `data/vocabularies/primary-functions.json`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `scripts/catalog/validate.d.mts`
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `data/registry/projects/mentallyquill-recursion.json`
- Modify: `data/registry/projects/platberlitz-sillytavern-image-gen.json`
- Modify: `data/registry/projects/purrfect-logic-4-max-mini.json`
- Modify: `data/registry/projects/sillytavern-sillytavern.json`
- Modify: `data/registry/projects/zorgonatis-stabs-edh.json`

**Interfaces:**

- Consumes: existing `validateCatalog(options)` schema and cross-record validation.
- Produces: schema-version-2 records with `metadata_status`, nullable provisional `repository_id`, `github-organization`, URL `license_status: "pending"`, and primary function `uncategorized`.

- [ ] **Step 1: Write failing schema and semantic-validation tests**

Update the shared fixture and add these cases to
`tests/unit/validate-catalog.test.ts`:

```ts
const validRecord = {
  schema_version: 2,
  metadata_status: "curated",
  id: "valid-preset",
  name: "Valid Preset",
  kind: "preset",
  summary: "A valid test fixture.",
  source: {
    type: "github",
    repository: "example/valid-preset",
    repository_id: 1,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: ["prompt-engineering"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "automatic",
};

test("accepts provisional GitHub identity and uncategorized metadata", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        id: "provisional-extension",
        kind: "extension",
        metadata_status: "provisional",
        primary_function: "uncategorized",
        capabilities: [],
        source: {
          type: "github",
          repository: "example/provisional-extension",
          repository_id: null,
        },
      },
    ],
    snapshots: [],
  });

  expect(result.errors).toEqual([]);
});

test("requires permanent identity for curated GitHub records", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        source: {
          type: "github",
          repository: "example/valid-preset",
          repository_id: null,
        },
      },
    ],
    snapshots: [],
  });

  expect(result.errors).toContain(
    "valid-preset: curated GitHub source requires permanent repository_id",
  );
});

test("allows only the paused provisional Tavern RPG Suite organization", async () => {
  const organization = {
    ...validRecord,
    id: "tavern-rpg-suite",
    kind: "extension",
    metadata_status: "provisional",
    primary_function: "uncategorized",
    capabilities: [],
    refresh_policy: "paused",
    source: {
      type: "github-organization",
      organization: "tavern-rpg-suite",
      url: "https://github.com/tavern-rpg-suite",
    },
  };

  expect(
    await validateCatalog({ records: [organization], snapshots: [] }),
  ).toMatchObject({ errors: [] });

  const invalid = await validateCatalog({
    records: [{ ...organization, id: "another-organization" }],
    snapshots: [],
  });
  expect(invalid.errors).toContain(
    "another-organization: github-organization is reserved for tavern-rpg-suite",
  );
});
```

Update the existing invalid-identity assertion to expect:

```ts
"bad-vocabulary: curated GitHub source requires permanent repository_id"
```

- [ ] **Step 2: Run the focused validation tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/validate-catalog.test.ts
```

Expected: FAIL because schema version 2, `metadata_status`,
`uncategorized`, `github-organization`, nullable repository IDs, and the
`snapshots` option are not accepted yet.

- [ ] **Step 3: Replace the schema-v1 identity and source contract**

In `data/schemas/project.schema.json`:

- change `schema_version` to `{ "const": 2 }`;
- add `metadata_status` to `required`;
- add:

```json
"metadata_status": {
  "enum": ["provisional", "curated"]
}
```

- replace the GitHub `repository_id` property with:

```json
"repository_id": {
  "anyOf": [
    { "type": "integer", "minimum": 1 },
    { "type": "null" }
  ]
}
```

- add this third `source.oneOf` branch:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["type", "organization", "url"],
  "properties": {
    "type": { "const": "github-organization" },
    "organization": {
      "type": "string",
      "pattern": "^[^/\\s]+$"
    },
    "url": { "type": "string", "format": "uri" }
  }
}
```

- add `"pending"` to the URL-source `license_status` enum;
- add `"uncategorized"` to the `primary_function` enum.

In `data/schemas/repository-snapshot.schema.json`, reserve explicit confirmed
critical states without changing generic 404 handling:

```json
"source_health": {
  "enum": [
    "healthy",
    "unavailable",
    "identity-change",
    "deleted",
    "private"
  ]
}
```

Append this controlled vocabulary entry to
`data/vocabularies/primary-functions.json`:

```json
{ "id": "uncategorized", "label": "Uncategorized" }
```

- [ ] **Step 4: Implement schema-v2 semantic validation**

Change `validateCatalog` to accept explicit snapshots:

```js
const records = options.records ?? (await loadRecords());
const snapshots =
  options.snapshots ?? (options.records ? [] : await loadSnapshots());
```

Replace the GitHub identity rule and add the organization rule:

```js
if (record.source?.type === "github") {
  const repositoryId = record.source.repository_id;
  if (
    record.metadata_status === "curated" &&
    (!Number.isInteger(repositoryId) || repositoryId <= 0)
  ) {
    errors.push(
      `${id}: curated GitHub source requires permanent repository_id`,
    );
  } else if (
    repositoryId !== null &&
    (!Number.isInteger(repositoryId) || repositoryId <= 0)
  ) {
    errors.push(`${id}: GitHub repository_id must be null or positive`);
  }
} else if (record.source?.type === "github-organization") {
  if (id !== "tavern-rpg-suite") {
    errors.push(
      `${id}: github-organization is reserved for tavern-rpg-suite`,
    );
  }
  if (
    record.kind !== "extension" ||
    record.metadata_status !== "provisional" ||
    record.refresh_policy !== "paused"
  ) {
    errors.push(
      `${id}: github-organization requires provisional paused extension`,
    );
  }
}
```

Change the Frontend/Extension source check to accept the one organization
exception:

```js
const repositoryBacked =
  record.source?.type === "github" ||
  (record.id === "tavern-rpg-suite" &&
    record.source?.type === "github-organization");

if (
  (record.kind === "frontend" || record.kind === "extension") &&
  !repositoryBacked
) {
  errors.push(`${id}: ${record.kind} requires a GitHub source`);
}
```

Update `sourceKey(source)`:

```js
if (source.type === "github") {
  return `github:${source.repository.toLowerCase()}`;
}
if (source.type === "github-organization") {
  return `github-organization:${source.organization.toLowerCase()}`;
}
```

Only compare snapshot identity when the curated ID is known:

```js
} else if (
  snapshot.source_health !== "identity-change" &&
  record.source.repository_id !== null &&
  snapshot.repository?.id !== record.source.repository_id
) {
```

Update `scripts/catalog/validate.d.mts`:

```ts
export interface ValidationResult {
  projectCount: number;
  snapshotCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
  snapshots?: unknown[];
}): Promise<ValidationResult>;
```

- [ ] **Step 5: Upgrade the five curated records in place**

For each existing registry JSON file:

```json
"schema_version": 2,
"metadata_status": "curated",
```

Keep every existing name, source, summary, classification, capability,
visibility, and refresh value unchanged.

- [ ] **Step 6: Run validation tests and catalog validation**

Run:

```powershell
npm test -- tests/unit/validate-catalog.test.ts
npm run catalog:validate
```

Expected:

```text
Tests passed
Validated 5 projects
```

- [ ] **Step 7: Commit the schema-v2 foundation**

```powershell
git add data/schemas/project.schema.json data/schemas/repository-snapshot.schema.json data/vocabularies/primary-functions.json scripts/catalog/validate.mjs scripts/catalog/validate.d.mts tests/unit/validate-catalog.test.ts data/registry/projects
git commit -m "feat(catalog): adopt registry schema v2"
```

---

### Task 2: Build the Deterministic Historical-Intake Migration

**Files:**

- Create: `scripts/catalog/intake-migration.mjs`
- Create: `scripts/catalog/intake-migration.d.mts`
- Create: `scripts/catalog/migrate-intake.mjs`
- Create: `tests/unit/intake-migration.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `migrateIntake({ intake, existingRecords })`, where both arrays
  contain parsed JSON records.
- Produces: `{ expectedRecords, recordsToWrite, report }`; a `--write` CLI
  stages, validates, and writes missing registry files plus
  `data/registry/seed-migration-report.json`.

- [ ] **Step 1: Write failing pure-migration tests**

Create `tests/unit/intake-migration.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  migrateIntake,
  provisionalSummary,
} from "../../scripts/catalog/intake-migration.mjs";

const githubEntry = {
  id: "example-tool",
  name: "Example Tool",
  repository: {
    owner: "Example",
    name: "Tool",
    url: "https://github.com/Example/Tool/",
  },
  status: "candidate",
  submission: "user-submitted",
  submitted_at: "2026-07-23",
  frontends: ["SillyTavern"],
};

describe("historical intake migration", () => {
  test("creates a provisional extension without inventing capabilities", () => {
    const result = migrateIntake({
      intake: [githubEntry],
      existingRecords: [],
    });

    expect(result.expectedRecords).toEqual([
      {
        schema_version: 2,
        metadata_status: "provisional",
        id: "example-tool",
        name: "Example Tool",
        kind: "extension",
        summary: "Example Tool is an extension for SillyTavern.",
        source: {
          type: "github",
          repository: "Example/Tool",
          repository_id: null,
        },
        frontends: ["sillytavern"],
        primary_function: "uncategorized",
        capabilities: [],
        cataloged_at: "2026-07-23T00:00:00Z",
        catalog_cohort: "seed",
        visibility: "published",
        refresh_policy: "automatic",
      },
    ]);
  });

  test("classifies prompt links as paused URL presets", () => {
    const result = migrateIntake({
      intake: [
        {
          id: "example-prompt",
          name: "Example Prompt",
          source_url: "https://example.com/prompt",
          tags: ["Prompts"],
          submitted_at: "2026-07-23",
          frontends: ["SillyTavern"],
        },
      ],
      existingRecords: [],
    });

    expect(result.expectedRecords[0]).toMatchObject({
      kind: "preset",
      source: {
        type: "url",
        url: "https://example.com/prompt",
        published_at: null,
        version: null,
        artifact_size_bytes: null,
        license_status: "pending",
        license_spdx_id: null,
      },
      refresh_policy: "paused",
    });
  });

  test("preserves curated overlaps and detects drift on rerun", () => {
    const curated = {
      schema_version: 2,
      metadata_status: "curated",
      id: "example-tool",
      name: "Curated Tool",
      source: {
        type: "github",
        repository: "Example/Tool",
        repository_id: 42,
      },
    };
    const first = migrateIntake({
      intake: [githubEntry],
      existingRecords: [curated],
    });
    expect(first.expectedRecords).toEqual([]);
    expect(first.recordsToWrite).toEqual([]);
    expect(first.report.curated_overlaps).toBe(1);

    const provisional = migrateIntake({
      intake: [githubEntry],
      existingRecords: [],
    }).expectedRecords[0];
    const rerun = migrateIntake({
      intake: [githubEntry],
      existingRecords: [provisional],
    });
    expect(rerun.recordsToWrite).toEqual([]);
    expect(rerun.report.provisional_matches).toBe(1);
    expect(rerun.report.provisional_drift).toEqual([]);
  });

  test("formats deterministic grammatical summaries", () => {
    expect(
      provisionalSummary("Cross Tool", "extension", [
        "SillyTavern",
        "Marinara Engine",
      ]),
    ).toBe(
      "Cross Tool is an extension for SillyTavern and Marinara Engine.",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm test -- tests/unit/intake-migration.test.ts
```

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement the pure migration boundary**

Create `scripts/catalog/intake-migration.mjs` with these exported functions:

```js
const FRONTEND_IDS = new Map([
  ["SillyTavern", "sillytavern"],
  ["Lumiverse", "lumiverse"],
  ["Marinara Engine", "marinara-engine"],
  ["Sonder Engine", "sonder-engine"],
]);

function stable(value) {
  return JSON.stringify(value);
}

function joinLabels(labels) {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function provisionalSummary(name, kind, frontends) {
  const phrase = {
    frontend: "frontend",
    extension: "extension",
    preset: "System Preset",
  }[kind];
  const article = kind === "extension" ? "an" : "a";
  return `${name} is ${article} ${phrase} for ${joinLabels(frontends)}.`;
}

function kindFor(entry) {
  if (["frontend", "extension", "preset"].includes(entry.kind)) {
    return entry.kind;
  }
  if (
    entry.tags?.includes("Presets") ||
    entry.tags?.includes("Prompts")
  ) {
    return "preset";
  }
  return "extension";
}

function frontendsFor(entry) {
  return (entry.frontends ?? []).map((label) => {
    const id = FRONTEND_IDS.get(label);
    if (!id) throw new Error(`${entry.id}: unknown frontend ${label}`);
    return id;
  });
}

function sourceFor(entry) {
  if (entry.source_type === "organization") {
    return {
      type: "github-organization",
      organization: entry.repository.owner,
      url: entry.repository.url.replace(/\/+$/, ""),
    };
  }
  if (entry.repository?.owner && entry.repository?.name) {
    return {
      type: "github",
      repository: `${entry.repository.owner}/${entry.repository.name}`,
      repository_id: null,
    };
  }
  if (entry.source_url) {
    return {
      type: "url",
      url: entry.source_url.replace(/\/+$/, ""),
      published_at: null,
      version: null,
      artifact_size_bytes: null,
      license_status: "pending",
      license_spdx_id: null,
    };
  }
  throw new Error(`${entry.id}: missing canonical source`);
}

function canonicalSourceKey(source) {
  if (source.type === "github") {
    return `github:${source.repository.toLowerCase()}`;
  }
  if (source.type === "github-organization") {
    return `github-organization:${source.organization.toLowerCase()}`;
  }
  const url = new URL(source.url);
  url.hash = "";
  return `url:${url.href.toLowerCase()}`;
}

function recordFor(entry) {
  const kind = kindFor(entry);
  const frontends = frontendsFor(entry);
  return {
    schema_version: 2,
    metadata_status: "provisional",
    id: entry.id,
    name: entry.name,
    kind,
    summary: provisionalSummary(entry.name, kind, entry.frontends),
    source: sourceFor(entry),
    frontends,
    primary_function: "uncategorized",
    capabilities: [],
    cataloged_at: `${entry.submitted_at}T00:00:00Z`,
    catalog_cohort: "seed",
    visibility: "published",
    refresh_policy:
      entry.repository?.name && entry.source_type !== "organization"
        ? "automatic"
        : "paused",
  };
}

export function migrateIntake({ intake, existingRecords }) {
  const duplicateIds = intake
    .map(({ id }) => id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`duplicate intake ids: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  const intakeRecords = intake.map(recordFor);
  const sourceKeys = intakeRecords.map(({ source }) =>
    canonicalSourceKey(source),
  );
  const duplicateSources = sourceKeys.filter(
    (key, index, keys) => keys.indexOf(key) !== index,
  );
  if (duplicateSources.length) {
    throw new Error(
      `duplicate intake sources: ${[...new Set(duplicateSources)].join(", ")}`,
    );
  }

  const existingById = new Map(
    existingRecords.map((record) => [record.id, record]),
  );
  const expectedRecords = [];
  const recordsToWrite = [];
  const provisionalDrift = [];
  let curatedOverlaps = 0;
  let provisionalMatches = 0;

  for (const [index, entry] of intake.entries()) {
    const existing = existingById.get(entry.id);
    if (existing?.metadata_status === "curated") {
      curatedOverlaps += 1;
      continue;
    }

    const expected = intakeRecords[index];
    expectedRecords.push(expected);
    if (!existing) {
      recordsToWrite.push(expected);
    } else if (stable(existing) === stable(expected)) {
      provisionalMatches += 1;
    } else {
      provisionalDrift.push(entry.id);
    }
  }

  const unionIds = new Set([
    ...existingRecords.map(({ id }) => id),
    ...recordsToWrite.map(({ id }) => id),
  ]);
  const allExpected = [
    ...existingRecords.filter(
      ({ metadata_status }) => metadata_status === "curated",
    ),
    ...expectedRecords,
  ];

  const countBy = (values) =>
    Object.fromEntries(
      [...new Set(values)].sort().map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
    );

  return {
    expectedRecords,
    recordsToWrite,
    report: {
      intake_records: intake.length,
      curated_overlaps: curatedOverlaps,
      generated_records: expectedRecords.length,
      writes_required: recordsToWrite.length,
      provisional_matches: provisionalMatches,
      provisional_drift: provisionalDrift,
      final_union_records: unionIds.size,
      by_kind: countBy(allExpected.map(({ kind }) => kind)),
      by_source: countBy(allExpected.map(({ source }) => source.type)),
      provisional_summaries: expectedRecords.length,
      uncategorized_records: expectedRecords.length,
      null_repository_ids: expectedRecords.filter(
        ({ source }) =>
          source.type === "github" && source.repository_id === null,
      ).length,
      normalized_source_changes: intake
        .map((entry, index) => ({
          id: entry.id,
          before: entry.repository?.url ?? entry.source_url,
          after:
            intakeRecords[index].source.type === "github"
              ? `https://github.com/${intakeRecords[index].source.repository}`
              : intakeRecords[index].source.url,
        }))
        .filter(({ before, after }) => before !== after),
    },
  };
}
```

Create `scripts/catalog/intake-migration.d.mts`:

```ts
export interface MigrationResult {
  expectedRecords: Record<string, unknown>[];
  recordsToWrite: Record<string, unknown>[];
  report: {
    intake_records: number;
    curated_overlaps: number;
    generated_records: number;
    writes_required: number;
    provisional_matches: number;
    provisional_drift: string[];
    final_union_records: number;
    by_kind: Record<string, number>;
    by_source: Record<string, number>;
    provisional_summaries: number;
    uncategorized_records: number;
    null_repository_ids: number;
    normalized_source_changes: Array<{
      id: string;
      before: string;
      after: string;
    }>;
  };
}

export function provisionalSummary(
  name: string,
  kind: "frontend" | "extension" | "preset",
  frontends: string[],
): string;

export function migrateIntake(input: {
  intake: Record<string, unknown>[];
  existingRecords: Record<string, unknown>[];
}): MigrationResult;
```

- [ ] **Step 4: Implement the staged CLI**

Create `scripts/catalog/migrate-intake.mjs`. It must:

1. read UTF-8 JSON after stripping a leading BOM;
2. load existing registry records;
3. call `migrateIntake`;
4. reject non-empty `provisional_drift`;
5. assert counts `213`, `4`, `209`, and `214`;
6. validate the complete projected registry with
   `validateCatalog({ records, snapshots: [] })`;
7. print the report in dry-run mode;
8. on `--write`, stage formatted files under a unique directory beneath
   `.tmp`;
9. copy staged project files into `data/registry/projects` with
   `COPYFILE_EXCL`; and
10. write `data/registry/seed-migration-report.json`.

Use these exact count guards:

```js
const expected = {
  intake_records: 213,
  curated_overlaps: 4,
  generated_records: 209,
  final_union_records: 214,
};

for (const [field, value] of Object.entries(expected)) {
  if (result.report[field] !== value) {
    throw new Error(
      `migration ${field}: expected ${value}, received ${result.report[field]}`,
    );
  }
}
```

Build the projected registry from authoritative curated records plus the 209
deterministic provisional records. Do not concatenate all existing provisional
files on rerun:

```js
const projectedRecords = [
  ...existingRecords.filter(
    ({ metadata_status }) => metadata_status === "curated",
  ),
  ...result.expectedRecords,
];
const validation = await validateCatalog({
  records: projectedRecords,
  snapshots: [],
});
if (validation.errors.length) {
  throw new Error(validation.errors.join("\n"));
}
```

Use stable project formatting:

```js
const formatted = `${JSON.stringify(record, null, 2)}\n`;
```

Add to `package.json`:

```json
"catalog:migrate": "node scripts/catalog/migrate-intake.mjs"
```

- [ ] **Step 5: Run migration tests and a dry run**

Run:

```powershell
npm test -- tests/unit/intake-migration.test.ts
npm run catalog:migrate
```

Expected: tests pass and the dry-run report states:

```text
intake_records: 213
curated_overlaps: 4
generated_records: 209
writes_required: 209
final_union_records: 214
```

Expected filesystem state: no new registry project files.

- [ ] **Step 6: Commit the migration tooling**

```powershell
git add package.json scripts/catalog/intake-migration.mjs scripts/catalog/intake-migration.d.mts scripts/catalog/migrate-intake.mjs tests/unit/intake-migration.test.ts
git commit -m "feat(catalog): add deterministic intake migration"
```

---

### Task 3: Materialize and Verify the 214-Project Registry

**Files:**

- Create: 209 files in `data/registry/projects/`, each named
  `${record.id}.json` by the migration command
- Create: `data/registry/seed-migration-report.json`
- Create: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**

- Consumes: `npm run catalog:migrate -- --write` from Task 2.
- Produces: 214 schema-version-2 registry files, five curated and 209
  provisional, plus a tracked deterministic migration report.

- [ ] **Step 1: Write the failing full-data contract test**

Create `tests/unit/full-catalog-data.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const projectDirectory = resolve(root, "data/registry/projects");
const records = readdirSync(projectDirectory)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) =>
    JSON.parse(readFileSync(resolve(projectDirectory, name), "utf8")),
  );

function count(property: "kind" | "metadata_status") {
  return Object.fromEntries(
    [...new Set(records.map((record) => record[property]))]
      .sort()
      .map((value) => [
        value,
        records.filter((record) => record[property] === value).length,
      ]),
  );
}

test("contains the complete public seed registry", () => {
  expect(records).toHaveLength(214);
  expect(new Set(records.map(({ id }) => id)).size).toBe(214);
  expect(count("metadata_status")).toEqual({
    curated: 5,
    provisional: 209,
  });
  expect(count("kind")).toEqual({
    extension: 198,
    frontend: 4,
    preset: 12,
  });
});

test("uses the approved source distribution", () => {
  const sourceTypes = records.map(({ source }) => source.type);
  expect(sourceTypes.filter((type) => type === "github")).toHaveLength(204);
  expect(
    sourceTypes.filter((type) => type === "github-organization"),
  ).toHaveLength(1);
  expect(sourceTypes.filter((type) => type === "url")).toHaveLength(9);
});

test("keeps provisional metadata deliberately thin", () => {
  const provisional = records.filter(
    ({ metadata_status }) => metadata_status === "provisional",
  );
  expect(
    provisional.every(
      ({ primary_function }) => primary_function === "uncategorized",
    ),
  ).toBe(true);
  expect(
    provisional.every(({ capabilities }) => capabilities.length === 0),
  ).toBe(true);
  expect(
    provisional
      .filter(({ source }) => source.type === "github")
      .every(({ source }) => source.repository_id === null),
  ).toBe(true);
});
```

- [ ] **Step 2: Run the full-data test and confirm RED**

Run:

```powershell
npm test -- tests/unit/full-catalog-data.test.ts
```

Expected: FAIL because only five registry records exist.

- [ ] **Step 3: Execute the migration write**

Run:

```powershell
npm run catalog:migrate -- --write
```

Expected:

```text
Wrote 209 provisional registry records
Final registry union: 214
```

- [ ] **Step 4: Prove migration rerun safety**

Run:

```powershell
npm run catalog:migrate
```

Expected report:

```text
generated_records: 209
writes_required: 0
provisional_matches: 209
provisional_drift: []
final_union_records: 214
```

- [ ] **Step 5: Validate the complete registry and test exact counts**

Run:

```powershell
npm run catalog:validate
npm test -- tests/unit/full-catalog-data.test.ts
```

Expected:

```text
Validated 214 projects
Tests passed
```

- [ ] **Step 6: Commit the generated registry records**

```powershell
git add data/registry/projects data/registry/seed-migration-report.json tests/unit/full-catalog-data.test.ts
git commit -m "data(catalog): publish full seed registry"
```

---

### Task 4: Build Public Cards Without Requiring Snapshots

**Files:**

- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/catalog/build.d.mts`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `tests/unit/build-catalog.test.ts`

**Interfaces:**

- Consumes: schema-v2 registry records and optional repository snapshots.
- Produces: `CatalogProject.metadataStatus`,
  `CatalogProject.sourceStatus`, license status `pending`, and public records
  for snapshotless GitHub and organization sources.

- [ ] **Step 1: Write failing builder tests for provisional sources**

Update fixture records to `schema_version: 2` and
`metadata_status: "curated"`, then add:

```ts
test("publishes snapshotless GitHub records with pending facts", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        id: "pending-github",
        kind: "extension",
        metadata_status: "provisional",
        source: {
          type: "github",
          repository: "example/pending",
          repository_id: null,
        },
        primary_function: "uncategorized",
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "pending-github",
      canonicalUrl: "https://github.com/example/pending",
      metadataStatus: "provisional",
      sourceStatus: "pending",
      community: null,
      repositorySizeKb: null,
      license: expect.objectContaining({
        status: "pending",
        label: "Pending",
      }),
    }),
  ]);
});

test("publishes the organization source without repository facts", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        id: "tavern-rpg-suite",
        kind: "extension",
        metadata_status: "provisional",
        source: {
          type: "github-organization",
          organization: "tavern-rpg-suite",
          url: "https://github.com/tavern-rpg-suite",
        },
        primary_function: "uncategorized",
        refresh_policy: "paused",
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects[0]).toMatchObject({
    canonicalUrl: "https://github.com/tavern-rpg-suite",
    sourceStatus: "manual",
    activity: {
      latestMeaningfulCommitAt: null,
      activeWeeks12: null,
      twoWeekBars: null,
      strength: null,
      dormant: false,
    },
  });
});

test("keeps stale prior facts but excludes verified identity changes", async () => {
  const record = fixtureProject({
    id: "stale-project",
    kind: "extension",
    source: {
      type: "github",
      repository: "example/stale",
      repository_id: 42,
    },
  });
  const unavailable = fixtureSnapshot({
    project_id: "stale-project",
    source_health: "unavailable",
    stale_since: "2026-07-24T00:00:00Z",
  });
  const stale = await buildCatalog({
    write: false,
    records: [record],
    snapshots: [unavailable],
  });
  expect(stale.projects[0]).toMatchObject({ sourceStatus: "stale" });

  const unsafe = await buildCatalog({
    write: false,
    records: [record],
    snapshots: [
      { ...unavailable, source_health: "identity-change" },
    ],
  });
  expect(unsafe.projects).toEqual([]);
});
```

- [ ] **Step 2: Run builder tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/build-catalog.test.ts
```

Expected: FAIL because snapshotless GitHub records and organization sources
are omitted.

- [ ] **Step 3: Extend browser catalog types**

Update `src/features/catalog/catalog-types.ts`:

```ts
export type ProjectKind = "frontend" | "extension" | "preset";
export type MetadataStatus = "provisional" | "curated";
export type SourceStatus = "pending" | "healthy" | "stale" | "manual";
export type LicenseStatus =
  | "osi-approved"
  | "proprietary"
  | "missing"
  | "pending";

export interface CatalogProject {
  id: string;
  name: string;
  kind: ProjectKind;
  metadataStatus: MetadataStatus;
  sourceStatus: SourceStatus;
  primaryFunction: string;
  summary: string;
  canonicalUrl: string;
  catalogedAt: string;
  catalogCohort: "seed" | "standard";
  frontends: CatalogLabel[];
  capabilities: CatalogLabel[];
  searchableText: string;
  activity: {
    latestMeaningfulCommitAt: string | null;
    activeWeeks12: number | null;
    twoWeekBars: [number, number, number, number, number, number] | null;
    strength: number | null;
    dormant: boolean;
  };
  latestReleaseAt: string | null;
  community: {
    stars: number;
    forks: number;
    subscribers: number;
    aggregate: number;
  } | null;
  repositorySizeKb: number | null;
  license: {
    status: LicenseStatus;
    label: string;
    tooltip: string;
  };
  preset: {
    version: string | null;
    publishedAt: string | null;
    artifactSizeBytes: number | null;
  } | null;
  refreshedAt: string | null;
  staleSince: string | null;
}
```

- [ ] **Step 4: Add pending and source-neutral builder helpers**

In `scripts/catalog/build.mjs`, add:

```js
const emptyActivity = {
  latestMeaningfulCommitAt: null,
  activeWeeks12: null,
  twoWeekBars: null,
  strength: null,
  dormant: false,
};

const pendingLicense = {
  status: "pending",
  label: "Pending",
  tooltip: "Repository metadata has not been refreshed yet.",
};

function sourceStatus(snapshot) {
  if (!snapshot) return "pending";
  return snapshot.stale_since || snapshot.source_health === "unavailable"
    ? "stale"
    : "healthy";
}
```

Add the first branch to `licenseDisplay` so provisional URL sources remain
pending instead of falling through to missing:

```js
if (status === "pending") {
  return {
    status,
    label: "Pending",
    tooltip: "License information has not been verified yet.",
  };
}
```

Change `githubProject(record, snapshot, vocabularies)` so all snapshot reads
are guarded and these fields are always present:

```js
metadataStatus: record.metadata_status,
sourceStatus: sourceStatus(snapshot),
canonicalUrl:
  snapshot?.repository.url ??
  `https://github.com/${record.source.repository}`,
activity: snapshot
  ? {
      latestMeaningfulCommitAt:
        snapshot.activity.latest_meaningful_commit_at,
      activeWeeks12: snapshot.activity.active_weeks_12,
      twoWeekBars: twoWeekBars(
        snapshot.activity.weekly_meaningful_commits,
      ),
      strength: snapshot.activity.strength,
      dormant: snapshot.activity.dormant,
    }
  : emptyActivity,
community: snapshot
  ? {
      stars: snapshot.community.stargazers_count,
      forks: snapshot.community.forks_count,
      subscribers: snapshot.community.subscribers_count,
      aggregate:
        snapshot.community.stargazers_count +
        snapshot.community.forks_count +
        snapshot.community.subscribers_count,
    }
  : null,
repositorySizeKb: snapshot?.repository.size_kb ?? null,
license: snapshot
  ? licenseDisplay(snapshot.license.status, snapshot.license.spdx_id)
  : pendingLicense,
refreshedAt: snapshot?.refreshed_at ?? null,
staleSince: snapshot?.stale_since ?? null,
```

Add `organizationProject(record, vocabularies)` using the same labeled
frontend/capability/search construction, `emptyActivity`, `pendingLicense`,
`sourceStatus: "manual"`, `canonicalUrl: record.source.url`, and all generated
repository facts `null`.

Add `metadataStatus` and `sourceStatus: "manual"` to `urlPreset`.

Replace the public-build loop with:

```js
for (const record of records) {
  if (record.visibility !== "published") continue;

  const snapshot = snapshotsByProject.get(record.id);
  if (
    snapshot &&
    ["identity-change", "deleted", "private"].includes(
      snapshot.source_health,
    )
  ) {
    continue;
  }

  if (record.source.type === "url") {
    if (record.kind === "preset") {
      projects.push(urlPreset(record, vocabularies));
    }
    continue;
  }

  if (record.source.type === "github-organization") {
    projects.push(organizationProject(record, vocabularies));
    continue;
  }

  projects.push(githubProject(record, snapshot, vocabularies));
}
```

- [ ] **Step 5: Update the build declaration and full-count assertion**

Keep `scripts/catalog/build.d.mts` accepting arbitrary records and snapshots:

```ts
import type { Catalog } from "../../src/features/catalog/catalog-types.ts";

export function buildCatalog(options?: {
  write?: boolean;
  now?: string;
  records?: unknown[];
  snapshots?: unknown[];
}): Promise<Catalog>;
```

Change the production builder test:

```ts
test("builds all 214 public cards without leaking intake metadata", async () => {
  const catalog = await buildCatalog({ write: false });
  expect(catalog.projects).toHaveLength(214);
  expect(new Set(catalog.projects.map(({ id }) => id)).size).toBe(214);
  expect(JSON.stringify(catalog)).not.toContain("submitted_at");
  expect(JSON.stringify(catalog)).not.toContain("submission");
  expect(
    catalog.projects.filter(
      ({ metadataStatus }) => metadataStatus === "provisional",
    ),
  ).toHaveLength(209);
});
```

- [ ] **Step 6: Run builder and data tests**

Run:

```powershell
npm test -- tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
npm run catalog:build
```

Expected:

```text
Tests passed
Built 214 projects
```

- [ ] **Step 7: Commit snapshot-optional catalog generation**

```powershell
git add scripts/catalog/build.mjs scripts/catalog/build.d.mts src/features/catalog/catalog-types.ts tests/unit/build-catalog.test.ts
git commit -m "feat(catalog): publish provisional project cards"
```

---

### Task 5: Bootstrap GitHub Identity and Continue Through Refresh Failures

**Files:**

- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Create: `scripts/catalog/repository-identity-backfill.mjs`
- Create: `scripts/catalog/repository-identity-backfill.d.mts`
- Create: `scripts/catalog/backfill-repository-identities.mjs`
- Modify: `package.json`
- Modify: `tests/unit/refresh-failure-recovery.test.ts`
- Create: `tests/unit/repository-identity-backfill.test.ts`

**Interfaces:**

- Consumes: provisional GitHub records with `repository_id: null` and healthy
  generated snapshots.
- Produces: successful first refreshes without false identity quarantine,
  bounded batches that continue after individual failures, and curated files
  with snapshot-proven immutable repository IDs.

- [ ] **Step 1: Write failing refresh and backfill tests**

Add to `tests/unit/refresh-failure-recovery.test.ts`:

```ts
import { repositoryIdentityChanged } from "../../scripts/catalog/refresh-github.mjs";

test("does not classify the first provisional refresh as identity change", () => {
  const provisionalRecord = {
    id: "pending",
    source: { repository_id: null },
  };
  const repository = { id: 42 };

  expect(repositoryIdentityChanged(provisionalRecord, repository)).toBe(false);
  expect(
    repositoryIdentityChanged(
      { id: "verified", source: { repository_id: 7 } },
      repository,
    ),
  ).toBe(true);
});
```

Create `tests/unit/repository-identity-backfill.test.ts`:

```ts
import { expect, test } from "vitest";

import { backfillRepositoryIdentities } from "../../scripts/catalog/repository-identity-backfill.mjs";

test("backfills only null IDs from healthy matching snapshots", () => {
  const records = [
    {
      id: "pending",
      source: {
        type: "github",
        repository: "Example/Pending",
        repository_id: null,
      },
    },
    {
      id: "curated",
      source: {
        type: "github",
        repository: "Example/Curated",
        repository_id: 7,
      },
    },
  ];
  const snapshots = [
    {
      project_id: "pending",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Pending",
      },
    },
    {
      project_id: "curated",
      source_health: "healthy",
      repository: {
        id: 99,
        owner: "Example",
        name: "Curated",
      },
    },
  ];

  const result = backfillRepositoryIdentities(records, snapshots);
  expect(result.updated).toEqual([
    expect.objectContaining({
      id: "pending",
      source: expect.objectContaining({ repository_id: 42 }),
    }),
  ]);
  expect(result.conflicts).toEqual([
    {
      id: "curated",
      reason: "repository-id-mismatch",
      expected: 7,
      received: 99,
    },
  ]);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/refresh-failure-recovery.test.ts tests/unit/repository-identity-backfill.test.ts
```

Expected: FAIL because the backfill module does not exist.

- [ ] **Step 3: Permit identity bootstrap during refresh**

In `refreshProject`:

```js
export function repositoryIdentityChanged(record, repository) {
  return (
    record.source.repository_id !== null &&
    repository.id !== record.source.repository_id
  );
}
```

Use the helper in `refreshProject`:

```js
if (repositoryIdentityChanged(record, repository)) {
  const snapshot = identityChangeSnapshot({
    record,
    repository,
    previous: prior,
    now,
  });
  await writeSnapshot(record.id, snapshot);
  return snapshot;
}
```

Wrap each CLI refresh so one unavailable provisional source does not stop the
remaining batch:

```js
for (const record of selected) {
  try {
    const snapshot = await refreshProject(record);
    if (snapshot) {
      console.log(
        `${record.id}: ${snapshot.source_health} at ${snapshot.refreshed_at}`,
      );
    }
  } catch (error) {
    process.exitCode = 1;
    console.error(`${record.id}: ${error.message}`);
  }
}
```

Update the declaration's record identity:

```ts
export function repositoryIdentityChanged(
  record: { id: string; source: { repository_id: number | null } },
  repository: { id: number },
): boolean;

export function identityChangeSnapshot(input: {
  record: { id: string; source: { repository_id: number | null } };
  repository: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  now: string;
}): {
  source_health: string;
  repository: { id: number; [key: string]: unknown };
  activity: unknown;
  license: unknown;
  stale_since: string | null;
  [key: string]: unknown;
};
```

- [ ] **Step 4: Implement pure identity backfill**

Create `scripts/catalog/repository-identity-backfill.mjs`:

```js
export function backfillRepositoryIdentities(records, snapshots) {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const updated = [];
  const conflicts = [];

  for (const record of records) {
    if (record.source.type !== "github") continue;
    const snapshot = snapshotsById.get(record.id);
    if (!snapshot || snapshot.source_health !== "healthy") continue;

    const expectedRepository = record.source.repository.toLowerCase();
    const receivedRepository =
      `${snapshot.repository.owner}/${snapshot.repository.name}`.toLowerCase();
    if (expectedRepository !== receivedRepository) {
      conflicts.push({
        id: record.id,
        reason: "repository-name-mismatch",
        expected: record.source.repository,
        received: `${snapshot.repository.owner}/${snapshot.repository.name}`,
      });
      continue;
    }

    const repositoryId = snapshot.repository.id;
    if (record.source.repository_id === null) {
      updated.push({
        ...record,
        source: {
          ...record.source,
          repository_id: repositoryId,
        },
      });
    } else if (record.source.repository_id !== repositoryId) {
      conflicts.push({
        id: record.id,
        reason: "repository-id-mismatch",
        expected: record.source.repository_id,
        received: repositoryId,
      });
    }
  }

  return { updated, conflicts };
}
```

Create the matching declaration:

```ts
interface IdentityRecord {
  id: string;
  source: {
    type: string;
    repository?: string;
    repository_id?: number | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface IdentitySnapshot {
  project_id: string;
  source_health: string;
  repository: {
    id: number;
    owner: string;
    name: string;
  };
  [key: string]: unknown;
}

export function backfillRepositoryIdentities(
  records: IdentityRecord[],
  snapshots: IdentitySnapshot[],
): {
  updated: IdentityRecord[];
  conflicts: Array<{
    id: string;
    reason: "repository-name-mismatch" | "repository-id-mismatch";
    expected: string | number;
    received: string | number;
  }>;
};
```

- [ ] **Step 5: Implement the safe backfill CLI**

Create `scripts/catalog/backfill-repository-identities.mjs`. It must load all
records and snapshots, call `backfillRepositoryIdentities`, reject any
conflicts, validate the projected complete registry, and write only updated
project files when `--write` is present.

Use:

```js
await writeFile(
  resolve(projectDirectory, `${record.id}.json`),
  `${JSON.stringify(record, null, 2)}\n`,
);
```

Add:

```json
"catalog:backfill-identities": "node scripts/catalog/backfill-repository-identities.mjs"
```

- [ ] **Step 6: Run refresh/backfill tests**

Run:

```powershell
npm test -- tests/unit/refresh-failure-recovery.test.ts tests/unit/repository-identity-backfill.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit progressive identity enrichment**

```powershell
git add package.json scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/catalog/repository-identity-backfill.mjs scripts/catalog/repository-identity-backfill.d.mts scripts/catalog/backfill-repository-identities.mjs tests/unit/refresh-failure-recovery.test.ts tests/unit/repository-identity-backfill.test.ts
git commit -m "feat(catalog): bootstrap repository identities"
```

---

### Task 6: Present and Query Provisional Metadata Honestly

**Files:**

- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/catalog/components/active-query.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/components/icons/category-icon.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Consumes: `CatalogProject.metadataStatus`, `sourceStatus`, pending license,
  and `primaryFunction: "uncategorized"` from Task 4.
- Produces: visible `Provisional details`, pending fact presentation, a
  controlled Uncategorized category, pending-license filtering, and
  deterministic missing-metric ordering.

- [ ] **Step 1: Write failing query, selector, and source-contract tests**

Update the `project()` fixture with:

```ts
metadataStatus: "curated",
sourceStatus: "healthy",
```

Add:

```ts
test("round-trips uncategorized and pending-license query state", () => {
  const query = {
    ...DEFAULT_QUERY,
    category: "uncategorized",
    licenses: ["pending" as const],
  };
  const serialized = serializeCatalogQuery(query);
  expect(serialized).toBe("category=uncategorized&license=pending");
  expect(parseCatalogQuery(`?${serialized}`)).toEqual(query);
});

test("orders missing metrics alphabetically by name then id", () => {
  const missing = [
    project("z-id", {
      name: "Same",
      activity: {
        latestMeaningfulCommitAt: null,
        activeWeeks12: null,
        twoWeekBars: null,
        strength: null,
        dormant: false,
      },
      community: null,
    }),
    project("a-id", {
      name: "Same",
      activity: {
        latestMeaningfulCommitAt: null,
        activeWeeks12: null,
        twoWeekBars: null,
        strength: null,
        dormant: false,
      },
      community: null,
    }),
    project("beta", {
      name: "Beta",
      activity: {
        latestMeaningfulCommitAt: null,
        activeWeeks12: null,
        twoWeekBars: null,
        strength: null,
        dormant: false,
      },
      community: null,
    }),
  ];

  expect(
    selectProjects(missing, DEFAULT_QUERY, context).map(({ id }) => id),
  ).toEqual(["beta", "a-id", "z-id"]);
});
```

Update `tests/unit/visual-alignment-contract.test.ts`:

```ts
expect(css).toMatch(
  /\.category-navigation\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\)/s,
);
expect(filters).toContain('{ id: "pending", label: "Pending verification" }');
expect(cards).toContain("Provisional details");
```

Read `project-card.tsx` into `cards` in that test.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/catalog-selectors.test.ts tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL on the unknown category/license, nine-column navigation, and
missing provisional presentation.

- [ ] **Step 3: Add controlled query values**

In `catalog-query.ts`, add:

```ts
export type LicenseFilter =
  | "open-source"
  | "proprietary"
  | "missing"
  | "pending";
```

Append:

```ts
{
  id: "uncategorized",
  label: "Uncategorized",
  shortLabel: "Uncategorized",
},
```

Add `"uncategorized"` to `validCategories` and `"pending"` to
`validLicenses`.

In `filter-panel.tsx`, append:

```ts
{ id: "pending", label: "Pending verification" },
```

Change the final license count branch:

```ts
if (value === "missing") return project.license.status === "missing";
return project.license.status === "pending";
```

Add to the license labels in `active-query.tsx`:

```ts
pending: "Pending verification",
```

- [ ] **Step 4: Make missing-metric ordering deterministic**

Replace date-based missing-metric fallback in `catalog-selectors.ts`:

```ts
function alphabeticalOrder(
  left: CatalogProject,
  right: CatalogProject,
) {
  return (
    collator.compare(left.name, right.name) ||
    collator.compare(left.id, right.id)
  );
}
```

Use `alphabeticalOrder(leftProject, rightProject)` when both compared metric
values are `null`, and use it for equal non-null metrics. Use it for the
alphabetical sort as well.

The existing `licenseFilter(project)` may return `pending` directly after the
type expansion.

- [ ] **Step 5: Add the neutral Uncategorized icon contract**

Add `"uncategorized"` to `IconName` in
`src/components/icons/category-icon.tsx`. Let it use the existing final
four-square fallback SVG; do not add a new color token.

Change the category grid:

```css
.category-navigation {
  grid-template-columns: repeat(10, minmax(0, 1fr));
}
```

The existing generic extension-category selector keeps the neutral fallback
icon within the extension accent family.

- [ ] **Step 6: Render provisional and pending card states**

In `project-card.tsx`, add the metadata marker to the card root:

```tsx
data-metadata-status={project.metadataStatus}
```

Inside `.card-chips`, before frontend chips:

```tsx
{project.metadataStatus === "provisional" ? (
  <span className="chip provisional-chip">Provisional details</span>
) : null}
```

Replace the no-activity branch with kind-aware output:

```tsx
{project.kind === "preset" ? (
  <span className="development preset-development">
    {project.preset?.version ? (
      <b>{formatVersion(project.preset.version)}</b>
    ) : (
      <b>Preset</b>
    )}
    <span>
      {project.preset?.publishedAt
        ? `Published ${relativeTime(project.preset.publishedAt, now)}`
        : "Source linked"}
    </span>
    <span>{formatBytes(project.preset?.artifactSizeBytes ?? null)}</span>
  </span>
) : (
  <span className="development pending-development">
    <b>Provisional</b>
    <span>Details pending</span>
  </span>
)}
```

Add:

```css
.provisional-chip {
  border-style: dashed;
  border-color: var(--color-border-strong);
  color: var(--color-muted);
}

.pending-development {
  grid-template-columns: auto;
}

.pending-development b {
  color: var(--color-muted);
  font-size: 9px;
}

.pending-development span {
  color: var(--color-muted);
  font-size: 9px;
}

.license-pending {
  color: var(--color-muted);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
```

- [ ] **Step 7: Run focused unit tests**

Run:

```powershell
npm test -- tests/unit/catalog-selectors.test.ts tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit provisional catalog presentation**

```powershell
git add src/features/catalog src/components/icons/category-icon.tsx src/styles/catalog.css tests/unit/catalog-selectors.test.ts tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(ui): expose provisional catalog details"
```

---

### Task 7: Prove Static Export and Browser Behavior at Full Volume

**Files:**

- Modify: `scripts/verify-static-export.mjs`
- Modify: `tests/unit/static-export-verification.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/static-export.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Regenerate: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-win32.png`
- Regenerate: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-tablet-win32.png`
- Regenerate: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-win32.png`

**Interfaces:**

- Consumes: generated 214-project browser catalog and full-volume static site.
- Produces: exact public count, canonical-link coverage, responsive layout
  proof, and bounded visual snapshots that do not create 214-card full-page
  images.

- [ ] **Step 1: Write failing static-export count tests**

Update `tests/unit/static-export-verification.test.ts` fixtures and assertions:

```ts
const heading = "<h1>214 projects</h1>";

test("requires the complete catalog heading", () => {
  expect(() =>
    verifyStaticExport("<h1>5 projects</h1>"),
  ).toThrow("Static export does not contain all 214 catalog projects");
});

test("accepts a complete heading split by React comments", () => {
  expect(() =>
    verifyStaticExport(
      '<h1>214<!-- --> <!-- -->projects</h1><script src="/_next/static/app.js"></script>',
    ),
  ).not.toThrow();
});
```

- [ ] **Step 2: Run the static verification test and confirm RED**

Run:

```powershell
npm test -- tests/unit/static-export-verification.test.ts
```

Expected: FAIL because the verifier still requires five projects.

- [ ] **Step 3: Require the complete static catalog**

Change `verifyStaticExport`:

```js
if (!renderedText.includes("214 projects")) {
  throw new Error(
    "Static export does not contain all 214 catalog projects",
  );
}
```

- [ ] **Step 4: Update end-to-end count and provisional assertions**

In `tests/e2e/catalog.spec.ts`:

- replace default `"5 projects"` headings with `"214 projects"`;
- replace `.project-card` count `5` with `214`;
- change the category-strip track count from `9` to `10`;
- retain search assertions that resolve Recursion to one project;
- add:

```ts
test("publishes every canonical destination and provisional state", async ({
  page,
}) => {
  const cards = page.locator(".project-card");
  await expect(cards).toHaveCount(214);
  await expect(
    page.locator('.project-card[data-metadata-status="provisional"]'),
  ).toHaveCount(209);

  const hrefs = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("href")),
  );
  expect(hrefs.every((href) => href?.startsWith("https://"))).toBe(true);
  expect(new Set(hrefs).size).toBe(214);
});

test("filters provisional metadata and pending licenses", async ({ page }) => {
  await page
    .getByRole("button", { name: "Uncategorized", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "209 projects" }),
  ).toBeVisible();

  await page.getByLabel("Pending verification").check();
  await expect(page.locator(".license-pending").first()).toBeVisible();
});
```

In `tests/e2e/static-export.spec.ts`, expect `"214 projects"`.

- [ ] **Step 5: Bound visual snapshots to the initial viewport**

Change `tests/visual/catalog.visual.spec.ts`:

```ts
await expect(page).toHaveScreenshot(`catalog-${viewport.name}.png`, {
  fullPage: false,
  animations: "disabled",
});
```

This preserves visual regression coverage for the approved catalog surface
without generating enormous full-page images. Full 214-card presence remains
an explicit E2E assertion.

- [ ] **Step 6: Run unit, build, export, and E2E tests**

Run:

```powershell
npm test -- tests/unit/static-export-verification.test.ts
npm run build
npm run verify:export
npm run test:e2e
```

Expected: all commands pass; E2E reports 214 cards and 209 provisional cards.

- [ ] **Step 7: Regenerate and inspect bounded visual snapshots**

Run:

```powershell
npm run test:visual -- --update-snapshots
npm run test:visual
```

Expected: the three updated viewport snapshots pass on the second run. Inspect
desktop, tablet, and mobile images for:

- no category-label collision after the tenth category;
- no project-card overflow;
- a quiet readable provisional marker;
- pending license text that does not dominate the footer; and
- unchanged header, toolbar, filter, and card geometry.

- [ ] **Step 8: Commit full-volume verification**

```powershell
git add scripts/verify-static-export.mjs tests/unit/static-export-verification.test.ts tests/e2e/catalog.spec.ts tests/e2e/static-export.spec.ts tests/visual/catalog.visual.spec.ts tests/visual/catalog.visual.spec.ts-snapshots
git commit -m "test(catalog): verify full seed launch"
```

---

### Task 8: Update Operator Documentation and Run Final Gates

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/production-development-handoff.md`
- Modify: `docs/architecture/catalog-data-model.md`

**Interfaces:**

- Consumes: the finished schema-v2, migration, build, refresh, UI, and
  verification behavior.
- Produces: current operator instructions and a fully verified implementation
  ready for branch completion review.

- [ ] **Step 1: Update README catalog status and operations**

Replace the five-project statement with:

```markdown
The public seed catalog contains 214 projects. Five records are curated and
209 are visibly provisional while repository enrichment and editorial review
continue.
```

Document:

```powershell
npm run catalog:migrate
npm run catalog:refresh -- --mode backfill --start-index 0 --batch-size 20
npm run catalog:backfill-identities -- --write
npm run catalog:build
```

State that `catalog:migrate` is a deterministic audit/rerun command after the
seed files exist and should report zero required writes.

- [ ] **Step 2: Reconcile architecture documentation**

In `docs/architecture/catalog-data-model.md` and
`docs/architecture/production-development-handoff.md`, record:

- schema version 2 and `metadata_status`;
- exact 214-project union;
- `data/catalog/projects.json` as historical intake only;
- snapshotless publication with pending facts;
- the sole Tavern RPG Suite organization exception;
- repository identity backfill after successful refresh;
- identity failures versus transient refresh failures; and
- the `uncategorized` provisional editorial state.

Remove statements that the current production site contains only five
projects or that every published GitHub record must already have a healthy
snapshot.

- [ ] **Step 3: Run formatting and lint gates**

Run:

```powershell
npm run format
npm run format:check
npm run lint
npm run typecheck
```

Expected: all commands exit zero.

- [ ] **Step 4: Re-run catalog-specific deterministic gates**

Run:

```powershell
npm run catalog:migrate
npm run catalog:validate
npm run catalog:build
npm test -- tests/unit/intake-migration.test.ts tests/unit/full-catalog-data.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/repository-identity-backfill.test.ts tests/unit/catalog-selectors.test.ts
```

Expected:

```text
writes_required: 0
provisional_matches: 209
Validated 214 projects
Built 214 projects
Tests passed
```

- [ ] **Step 5: Run the complete automated verification suite**

Run:

```powershell
npm run check
npm run test:e2e
npm run test:visual
```

Expected: all formatting, lint, validation, generation, type, unit, build,
static-export, E2E, and visual checks pass.

- [ ] **Step 6: Inspect final repository truth**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm:

- only intended implementation, data, test, snapshot, and documentation files
  changed;
- registry contains exactly 214 JSON project records;
- migration rerun requires no writes;
- generated browser catalog contains 214 unique canonical links;
- all 209 imported records remain visibly provisional; and
- no intake-only `submission`, `submitted_at`, or `status: candidate` fields
  appear in browser output.

- [ ] **Step 7: Commit documentation and formatting**

```powershell
git add README.md docs/architecture scripts src tests data package.json
git commit -m "docs(catalog): document full seed operations"
```

- [ ] **Step 8: Request completion review**

Invoke `superpowers:requesting-code-review` against the complete implementation
diff. Address any correctness findings, rerun the affected focused tests, then
rerun:

```powershell
npm run check
npm run test:e2e
npm run test:visual
```

Only after those gates pass should the branch be handed to
`superpowers:finishing-a-development-branch`.
