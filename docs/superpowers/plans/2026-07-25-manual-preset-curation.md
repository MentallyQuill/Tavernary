# Manual Preset Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curate six manual System Preset records and the Tavern RPG Suite organization record, while consolidating Village Maker into one canonical card.

**Architecture:** Preserve Tavernary's curated-registry ownership boundary. Make the narrow validation change required for the approved organization exception, then update registry data, remove duplicate Village Maker intake and registry entries, and regenerate the ignored browser catalog through the existing build command.

**Tech Stack:** JSON registry records, Node.js catalog scripts, TypeScript, Vitest, Prettier, ESLint

## Global Constraints

- Preserve `data/registry/projects` as the authoritative curated layer.
- Keep `data/catalog/projects.json` as legacy flat intake data; remove the three superseded Village Maker entries so migration cannot recreate them.
- Enrichment selection and skip behavior are owned by another workstream and are out of scope.
- Do not overwrite, revert, or stage concurrent enrichment-skip changes.
- Keep the registry write boundary to `summary`, `metadata_status`, `primary_function`, and `capabilities`, except for the approved Village Maker consolidation and verified URL-source metadata.
- Summaries must be one factual sentence, 12-24 words, at most 140 characters, and contain no Markdown.
- Use only IDs already present in `data/vocabularies/primary-functions.json` and `data/vocabularies/capabilities.json`.
- Keep `village-maker-google-drive-prompt` as the surviving Village Maker ID and its Google Drive URL as the sole canonical source.
- Keep Tavern RPG Suite as one `github-organization` extension record with `refresh_policy: "paused"`.
- Preserve unrelated worktree changes.

---

## File Structure

- `scripts/catalog/validate.mjs` — permit the one approved GitHub organization record to carry curated editorial metadata while retaining its identity, kind, and paused-refresh restrictions.
- `tests/unit/validate-catalog.test.ts` — regression coverage for curated and invalid organization records.
- `tests/unit/full-catalog-data.test.ts` — authoritative record counts, exact manual-curation metadata, enrichment-contract checks, and removed-ID assertions.
- `tests/unit/build-catalog.test.ts` — generated public-card counts and manual-source identity assertions.
- `data/registry/projects/*.json` — seven surviving curated records and deletion of three superseded Village Maker records.
- `data/catalog/projects.json` — deletion of the three superseded Village Maker intake entries.
- `docs/reference/manual-preset-curation-report.md` — durable source/evidence notes for the manual editorial decisions.
- `src/generated/catalog.json` — regenerated locally by `npm run catalog:build`; ignored and never staged.

---

### Task 1: Permit Curated Metadata on the Organization Exception

**Files:**

- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `scripts/catalog/validate.mjs`

**Interfaces:**

- Consumes: schema-version-3 project records and the existing `approvedOrganizationRecord` identity allowlist.
- Produces: validation behavior that accepts `tavern-rpg-suite` as either provisional or curated while still requiring `kind: "extension"` and `refresh_policy: "paused"`.

- [ ] **Step 1: Reconcile the concurrent enrichment-skip work**

Run:

```powershell
git status --short
git diff -- scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts data/schemas/project.schema.json
```

Expected: identify any concurrent edits before changing these files. Preserve
them. Do not add, remove, or rename any enrichment-policy field in this task.

- [ ] **Step 2: Write the failing curated-organization test**

Replace the existing provisional-only acceptance test in
`tests/unit/validate-catalog.test.ts` with:

```ts
test("accepts curated metadata for the paused Tavern RPG Suite organization", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        id: "tavern-rpg-suite",
        name: "Tavern RPG Suite",
        kind: "extension",
        summary:
          "A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.",
        metadata_status: "curated",
        primary_function: "rpg-systems",
        capabilities: [
          "automation",
          "character-worldbuilding",
          "image-generation",
          "instruction-control",
          "model-routing",
        ],
        refresh_policy: "paused",
        source: {
          type: "github-organization",
          organization: "tavern-rpg-suite",
          url: "https://github.com/tavern-rpg-suite",
        },
      },
    ],
    snapshots: [],
  });

  expect(result.errors).toEqual([]);
});
```

Add a restriction test:

```ts
test("requires the Tavern RPG Suite organization to remain paused", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        id: "tavern-rpg-suite",
        name: "Tavern RPG Suite",
        kind: "extension",
        metadata_status: "curated",
        primary_function: "rpg-systems",
        capabilities: ["automation"],
        refresh_policy: "automatic",
        source: {
          type: "github-organization",
          organization: "tavern-rpg-suite",
          url: "https://github.com/tavern-rpg-suite",
        },
      },
    ],
    snapshots: [],
  });

  expect(result.errors).toContain(
    "tavern-rpg-suite: github-organization requires paused extension",
  );
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts
```

Expected: FAIL because the current validator requires the organization record
to remain provisional.

- [ ] **Step 4: Make the minimal validator change**

In the `github-organization` branch of `scripts/catalog/validate.mjs`, replace
the combined provisional/kind/refresh check with:

```js
if (record.kind !== "extension" || record.refresh_policy !== "paused") {
  errors.push(`${id}: github-organization requires paused extension`);
}
```

Do not change the exact ID, organization name, canonical URL, or
`repositoryBacked` allowlist checks.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts
```

Expected: all tests in `validate-catalog.test.ts` pass.

- [ ] **Step 6: Commit Task 1**

Stage only the two Task 1 files:

```powershell
git add scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts
git diff --cached --check
git commit -m "fix(catalog): allow curated suite metadata"
```

---

### Task 2: Curate Manual Records and Consolidate Village Maker

**Files:**

- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `data/registry/projects/le-emotionalism-1-1-5-prompt.json`
- Modify: `data/registry/projects/puras-director-v15.json`
- Modify: `data/registry/projects/purrfect-logic-4-max-mini.json`
- Modify: `data/registry/projects/realistic-frankenstein-preset.json`
- Modify: `data/registry/projects/writers-block-4.json`
- Modify: `data/registry/projects/village-maker-google-drive-prompt.json`
- Modify: `data/registry/projects/tavern-rpg-suite.json`
- Delete: `data/registry/projects/village-maker-thornbeck-prompt.json`
- Delete: `data/registry/projects/village-maker-harrow-hundred-prompt.json`
- Delete: `data/registry/projects/village-maker-anonpaste-prompt.json`
- Modify: `data/catalog/projects.json`
- Create: `docs/reference/manual-preset-curation-report.md`

**Interfaces:**

- Consumes: existing controlled vocabularies and `validateEnrichmentOutput(output, vocabularies)`.
- Produces: 211 registry records, including nine System Presets, six URL sources, one organization source, and seven manually curated research units.

- [ ] **Step 1: Add exact manual-curation expectations**

In `tests/unit/full-catalog-data.test.ts`, extend `CatalogRecord["source"]`:

```ts
source: {
  type: string;
  repository_id?: number | null;
  license_status?: string | null;
  version?: string | null;
  artifact_size_bytes?: number | null;
};
```

Add these constants after `rootDirectory`:

```ts
const removedVillageMakerIds = [
  "village-maker-anonpaste-prompt",
  "village-maker-harrow-hundred-prompt",
  "village-maker-thornbeck-prompt",
];

const manualCuratedRecords = {
  "le-emotionalism-1-1-5-prompt": {
    summary:
      "A modular SillyTavern preset for grounded roleplay, autonomous NPCs, deliberate reasoning, continuity, pacing, and expressive prose.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
      "character-worldbuilding",
    ],
    version: "1.1.5",
    artifact_size_bytes: 146359,
  },
  "puras-director-v15": {
    summary:
      "A customizable SillyTavern preset combining director-style scene control, grounded prose, reasoning aids, trackers, and RPG systems.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
      "character-worldbuilding",
    ],
    version: "15.0",
    artifact_size_bytes: null,
  },
  "purrfect-logic-4-max-mini": {
    summary:
      "A streamlined SillyTavern roleplay preset reducing prompt overhead while strengthening structure, instruction following, and prose.",
    primary_function: "generation-reasoning",
    capabilities: ["prompt-engineering", "instruction-control"],
    version: "4 Max Mini",
    artifact_size_bytes: null,
  },
  "realistic-frankenstein-preset": {
    summary:
      "A three-tier SillyTavern preset family promoting character autonomy, realistic behavior, living-world continuity, and scalable prompting.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
    ],
    version: null,
    artifact_size_bytes: null,
  },
  "writers-block-4": {
    summary:
      "A SillyTavern co-writing preset with director modes, adaptive pacing, structured reasoning, prose styles, character agency, and subtext.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
    ],
    version: "4",
    artifact_size_bytes: null,
  },
  "village-maker-google-drive-prompt": {
    summary:
      "An interview-driven guide for creating village-as-character cards with communities, locations, events, lore, and roleplay structure.",
    primary_function: "character-worldbuilding",
    capabilities: ["character-worldbuilding", "prompt-engineering"],
    version: "1.0",
    artifact_size_bytes: null,
  },
  "tavern-rpg-suite": {
    summary:
      "A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.",
    primary_function: "rpg-systems",
    capabilities: [
      "automation",
      "character-worldbuilding",
      "image-generation",
      "instruction-control",
      "model-routing",
    ],
    version: undefined,
    artifact_size_bytes: undefined,
  },
} as const;
```

Change the registry contract counts:

```ts
expect(records).toHaveLength(211);
expect(ids.size).toBe(211);
expect(countBy(records, (record) => record.kind)).toEqual({
  extension: 198,
  frontend: 4,
  preset: 9,
});
expect(countBy(records, (record) => record.source.type)).toEqual({
  github: 204,
  "github-organization": 1,
  url: 6,
});
```

Rename `"matches the stable 214-record contract"` to
`"matches the consolidated 211-record contract"`.

Change URL-license expectations to zero pending and six missing:

```ts
expect(
  records.filter(
    (record) =>
      record.source.type === "url" &&
      record.source.license_status === "pending",
  ),
).toHaveLength(0);
expect(
  records.filter(
    (record) =>
      record.source.type === "url" &&
      record.source.license_status === "missing",
  ),
).toHaveLength(6);
```

Add a new test:

```ts
test("keeps manual curation exact and Village Maker consolidated", async () => {
  const records = await loadRegistryRecords();
  const byId = new Map(records.map((record) => [record.id, record]));
  const primaryFunctions = JSON.parse(
    await readFile(
      resolve(rootDirectory, "data/vocabularies/primary-functions.json"),
      "utf8",
    ),
  ).primary_functions;
  const capabilities = JSON.parse(
    await readFile(
      resolve(rootDirectory, "data/vocabularies/capabilities.json"),
      "utf8",
    ),
  ).capabilities;

  for (const id of removedVillageMakerIds) {
    expect(byId.has(id), id).toBe(false);
  }

  for (const [id, expected] of Object.entries(manualCuratedRecords)) {
    const record = byId.get(id);
    expect(record, id).toBeDefined();
    expect(record).toMatchObject({
      summary: expected.summary,
      metadata_status: "curated",
      primary_function: expected.primary_function,
      capabilities: expected.capabilities,
    });
    expect(
      validateEnrichmentOutput(
        {
          summary: expected.summary,
          metadata_status: "curated",
          primary_function: expected.primary_function,
          capabilities: [...expected.capabilities],
        },
        { primaryFunctions, capabilities },
      ),
      id,
    ).toEqual({ valid: true });
    expect(record?.source.version, id).toBe(expected.version);
    expect(record?.source.artifact_size_bytes, id).toBe(
      expected.artifact_size_bytes,
    );
  }
});
```

- [ ] **Step 2: Update the generated-catalog contract test**

In `tests/unit/build-catalog.test.ts`, rename
`"builds 214 public cards without leaking intake-only metadata"` to
`"builds 211 public cards with consolidated manual sources"`.

Change:

```ts
expect(catalog.projects).toHaveLength(211);
```

Change:

```ts
expect(sourceStatuses.manual).toBe(7);
```

Add:

```ts
const manualIds = catalog.projects
  .filter(({ sourceStatus }) => sourceStatus === "manual")
  .map(({ id }) => id)
  .sort();

expect(manualIds).toEqual(
  [
    "le-emotionalism-1-1-5-prompt",
    "puras-director-v15",
    "purrfect-logic-4-max-mini",
    "realistic-frankenstein-preset",
    "tavern-rpg-suite",
    "village-maker-google-drive-prompt",
    "writers-block-4",
  ].sort(),
);
expect(catalog.projects.map(({ id }) => id)).not.toEqual(
  expect.arrayContaining([
    "village-maker-anonpaste-prompt",
    "village-maker-harrow-hundred-prompt",
    "village-maker-thornbeck-prompt",
  ]),
);
expect(
  catalog.projects.find(
    ({ id }) => id === "village-maker-google-drive-prompt",
  ),
).toMatchObject({
  canonicalUrl:
    "https://drive.google.com/file/d/1Q6-tNRgEsp3jwDmrZeSVyPbbsf_xckp5/view?usp=sharing",
  metadataStatus: "curated",
  primaryFunction: "character-worldbuilding",
});
expect(
  catalog.projects.find(({ id }) => id === "tavern-rpg-suite"),
).toMatchObject({
  canonicalUrl: "https://github.com/tavern-rpg-suite",
  metadataStatus: "curated",
  primaryFunction: "rpg-systems",
});
```

- [ ] **Step 3: Run the focused data tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts
```

Expected: FAIL on the old 214/12/9 counts, provisional metadata, and three
Village Maker records that still exist.

- [ ] **Step 4: Update the seven surviving registry records**

Apply these exact editorial fields:

| ID | Summary | Primary function | Capabilities |
| --- | --- | --- | --- |
| `le-emotionalism-1-1-5-prompt` | `A modular SillyTavern preset for grounded roleplay, autonomous NPCs, deliberate reasoning, continuity, pacing, and expressive prose.` | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning`, `character-worldbuilding` |
| `puras-director-v15` | `A customizable SillyTavern preset combining director-style scene control, grounded prose, reasoning aids, trackers, and RPG systems.` | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning`, `character-worldbuilding` |
| `purrfect-logic-4-max-mini` | `A streamlined SillyTavern roleplay preset reducing prompt overhead while strengthening structure, instruction following, and prose.` | `generation-reasoning` | `prompt-engineering`, `instruction-control` |
| `realistic-frankenstein-preset` | `A three-tier SillyTavern preset family promoting character autonomy, realistic behavior, living-world continuity, and scalable prompting.` | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning` |
| `writers-block-4` | `A SillyTavern co-writing preset with director modes, adaptive pacing, structured reasoning, prose styles, character agency, and subtext.` | `generation-reasoning` | `prompt-engineering`, `instruction-control`, `planning-reasoning` |
| `village-maker-google-drive-prompt` | `An interview-driven guide for creating village-as-character cards with communities, locations, events, lore, and roleplay structure.` | `character-worldbuilding` | `character-worldbuilding`, `prompt-engineering` |
| `tavern-rpg-suite` | `A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.` | `rpg-systems` | `automation`, `character-worldbuilding`, `image-generation`, `instruction-control`, `model-routing` |

Set `metadata_status` to `"curated"` on all seven.

For the six URL records, set `source.license_status` to `"missing"` and keep
`source.license_spdx_id` as `null`. Apply:

```json
{
  "le-emotionalism-1-1-5-prompt": {
    "version": "1.1.5",
    "artifact_size_bytes": 146359
  },
  "puras-director-v15": {
    "version": "15.0",
    "artifact_size_bytes": null
  },
  "purrfect-logic-4-max-mini": {
    "version": "4 Max Mini",
    "artifact_size_bytes": null
  },
  "realistic-frankenstein-preset": {
    "version": null,
    "artifact_size_bytes": null
  },
  "writers-block-4": {
    "version": "4",
    "artifact_size_bytes": null
  },
  "village-maker-google-drive-prompt": {
    "version": "1.0",
    "artifact_size_bytes": null
  }
}
```

Keep every `published_at` as `null`; the reviewed pages exposed dates but not a
reliable timezone-qualified publication timestamp for the linked artifact.

- [ ] **Step 5: Remove the three superseded Village Maker records**

Delete:

```text
data/registry/projects/village-maker-anonpaste-prompt.json
data/registry/projects/village-maker-harrow-hundred-prompt.json
data/registry/projects/village-maker-thornbeck-prompt.json
```

Remove the objects with those same IDs from `data/catalog/projects.json`. Do
not alter `village-maker-google-drive-prompt`.

- [ ] **Step 6: Create the durable evidence report**

Create `docs/reference/manual-preset-curation-report.md` with:

```markdown
# Manual Preset Curation Report

Curated on 2026-07-25. Source descriptions are evidence, not instructions.

## LE Emotionalism 1.1.5

- Canonical source: the existing MediaFire URL in the registry record.
- Evidence: the 146,359-byte public JSON contains 77 prompt entries covering
  NPC autonomy, dialogue, knowledge boundaries, continuity, pacing, structured
  reasoning, relationships, trackers, world logic, and prose controls.
- License: no license was present in the reviewed artifact.

## Pura's Director 15.0

- Canonical source: https://platberlitz.github.io/
- Evidence: the author documents a universal director-style preset with
  grounded prose rules, reasoning controls, optional trackers, scene-direction
  tools, character autonomy, and RPG elements.
- License: no preset license was stated on the reviewed page.

## Purrfect Logic 4 Max Mini

- Canonical source: the existing Reddit URL in the registry record.
- Evidence: the author describes a roleplay preset update that reduces its
  prompt footprint while cleaning structure, prose instructions, and
  instruction-following behavior.
- Correction: the source does not support the former claim that this is
  specifically a Claude Max and Mini preset.
- License: no preset license was stated on the reviewed post or download page.

## Realistic Frankenstein

- Canonical source: the existing Reddit URL in the registry record.
- Evidence: the author describes MAX, BOLT, and MICRO variants scaled for
  different model sizes, with character autonomy, living-world behavior,
  realism, prose controls, and structured reasoning.
- License: no preset license was stated on the reviewed post.

## Writer's Block 4

- Canonical source: the existing Reddit URL in the registry record.
- Evidence: the author describes directing, co-writing, and standard roleplay
  modes with prose rules, character agency, dialogue, subtext, adaptive pacing,
  selectable styles, and optional structured reasoning.
- License: no preset license was stated on the reviewed post or download page.

## Village Maker 1.0

- Canonical source:
  https://drive.google.com/file/d/1Q6-tNRgEsp3jwDmrZeSVyPbbsf_xckp5/view?usp=sharing
- Evidence: the public document is an interview-driven build guide that has a
  language model create a village-as-character card with a narrator voice,
  residents, locations, events, and lore.
- Consolidation: Thornbeck and Harrow Hundred are examples cited by the guide,
  not separate Village Maker projects. Their BotBooru pages report that the
  characters do not exist. The supplementary AnonPaste has expired.
- License: no license was stated in the reviewed document.

## Tavern RPG Suite

- Canonical source: https://github.com/tavern-rpg-suite
- Evidence: the organization describes an interconnected SillyTavern suite
  spanning maps, inventory, vitals, equipment, memory, minigames, image-backed
  locations, prompt injection, and secondary-model tools.
- Catalog treatment: one organization-level extension card remains the
  intentional exception for this multi-repository suite.
```

- [ ] **Step 7: Run focused tests and catalog validation**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts tests/unit/validate-catalog.test.ts
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Expected:

- all focused tests pass;
- validation reports 211 curated project records with no errors;
- build reports `Built 211 projects and 0 Kits`;
- `src/generated/catalog.json` is regenerated locally and remains ignored.

- [ ] **Step 8: Inspect the generated manual cards**

Run:

```powershell
node -e "const c=require('./src/generated/catalog.json'); const ids=['le-emotionalism-1-1-5-prompt','puras-director-v15','purrfect-logic-4-max-mini','realistic-frankenstein-preset','writers-block-4','village-maker-google-drive-prompt','tavern-rpg-suite']; console.log(JSON.stringify(c.projects.filter(p=>ids.includes(p.id)).map(p=>({id:p.id,summary:p.summary,metadataStatus:p.metadataStatus,primaryFunction:p.primaryFunction,capabilities:p.capabilities.map(x=>x.id),canonicalUrl:p.canonicalUrl})),null,2));"
```

Expected: exactly seven records, all `metadataStatus: "curated"`, with the
summaries, primary functions, capabilities, and canonical URLs specified above.

- [ ] **Step 9: Run the full repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: format, lint, palette, catalog validation, catalog build, typecheck,
unit tests, production build, and static-export verification all pass.

- [ ] **Step 10: Commit Task 2**

Review scope:

```powershell
git status --short
git diff --check
git diff --stat
```

Stage only Task 2 files, excluding `src/generated/catalog.json` and any
concurrent enrichment-skip changes:

```powershell
git add tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts data/catalog/projects.json data/registry/projects/le-emotionalism-1-1-5-prompt.json data/registry/projects/puras-director-v15.json data/registry/projects/purrfect-logic-4-max-mini.json data/registry/projects/realistic-frankenstein-preset.json data/registry/projects/writers-block-4.json data/registry/projects/village-maker-google-drive-prompt.json data/registry/projects/tavern-rpg-suite.json docs/reference/manual-preset-curation-report.md
git add -u data/registry/projects
git diff --cached --check
git diff --cached --stat
git commit -m "feat(catalog): curate manual preset sources"
```
