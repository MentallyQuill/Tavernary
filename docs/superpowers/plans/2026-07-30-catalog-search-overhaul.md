# Catalog Search Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tavernary's contiguous-substring catalog search with structured MiniSearch-powered all-term search, relevance sorting, conservative typo tolerance, match evidence, and deterministic fallback behavior for Projects and Kits.

**Architecture:** Catalog generation emits validated structured search fields for every Project and Kit. A focused `src/features/search/` boundary owns normalization, MiniSearch configuration, ranking, evidence, suggestions, and exact-token fallback; catalog selectors consume its result IDs and scores without importing MiniSearch. URL query state owns the effective sort, while `CatalogPage` remembers each mode's non-search browsing sort and resets meaningful search edits to Relevance.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, MiniSearch 7.2.0, Vitest 4, Testing Library, Playwright 1.61, static JSON catalog generation.

## Global Constraints

- Keep Tavernary fully static; browser search makes no runtime network calls.
- Install exactly `minisearch@7.2.0` and commit the resulting `package-lock.json`.
- Require every meaningful query term; terms may match in any order and across fields.
- Ignore only `a`, `an`, `and`, `for`, `of`, `the`, `to`, and `with`, and only when another meaningful term remains.
- Allow prefix matching only for terms of at least three characters.
- Allow no typo tolerance below five characters, one edit for five-to-seven characters, and two edits for eight or more characters.
- Rank exact title, alias, source identity, phrase, and title-token matches above prefix and fuzzy matches.
- Search defaults to Relevance whenever a meaningful query changes.
- Manual non-relevance sorts change ordering only and remain active until the query meaning changes.
- Clearing search removes Relevance and restores the mode's remembered browsing sort.
- Preserve all existing filter-group semantics, relationship-view behavior, URL sharing, `/` focus, and card-density behavior.
- Do not edit `src/generated/catalog.json` directly; regenerate it with `npm.cmd run catalog:build`.
- Use red-green-refactor for every production behavior change and commit each task separately.

---

## File and responsibility map

### New files

- `src/features/search/search-types.ts` — public Tavernary search documents, result, evidence, and index interfaces.
- `src/features/search/search-normalization.ts` — shared Unicode normalization, tokenization, query meaning, stop-word, prefix, and fuzzy-limit rules.
- `src/features/search/catalog-search.ts` — the only MiniSearch integration; index creation, search, Tavernary boosts, evidence, suggestions, and fallback.
- `src/features/search/search-sort-transition.ts` — pure Project/Kit relevance-sort state transitions.
- `src/features/search/components/search-evidence.tsx` — one restrained, user-facing hidden-field match reason.
- `src/features/search/components/search-empty-state.tsx` — search-aware empty/filter/correction messages.
- `src/features/search/use-search-announcement.ts` — delayed accessibility-only result-count announcements.
- `scripts/catalog/search-document.mjs` — build-time Project/Kit search-field construction and validation.
- `scripts/catalog/search-document.d.mts` — declaration contract for the build-time helper.
- `tests/fixtures/catalog-search-relevance.json` — versioned real-catalog inclusion, exclusion, and ordering corpus.
- `tests/unit/catalog-search.test.ts` — synthetic search-engine and fallback contract tests.
- `tests/unit/catalog-search-relevance.test.ts` — generated-catalog relevance corpus runner.
- `tests/unit/search-sort-transition.test.ts` — pure sort-state tests.
- `tests/unit/search-evidence.test.tsx` — evidence and empty-state component tests.
- `tests/benchmarks/catalog-search-benchmark.test.ts` — generated-catalog index/query/payload measurement without machine-specific timing thresholds.

### Existing files with focused changes

- `package.json`, `package-lock.json` — MiniSearch dependency and `search:benchmark` command.
- `data/schemas/project.schema.json` — optional curated project aliases.
- `scripts/catalog/build.mjs` — emit validated structured search fields for all source types and Kits.
- `src/features/catalog/catalog-types.ts` — add structured search fields and later remove legacy `searchableText`.
- `src/features/kits/kit-types.ts` — add structured search fields and later remove legacy `searchableText`.
- `src/features/catalog/catalog-selectors.ts` — consume search eligibility/scores and support Relevance.
- `src/features/kits/kit-selectors.ts` — consume search eligibility/scores and support Relevance.
- `src/features/catalog/catalog-query.ts` — parse and serialize search-only Relevance.
- `src/features/kits/kit-query.ts` — add search-only Kit Relevance.
- `src/features/catalog/components/catalog-page.tsx` — memoize indexes, drive search results, remember browse sorts, and provide feedback.
- `src/features/catalog/components/catalog-toolbar.tsx` — conditionally render Relevance in Project and Kit sort lists.
- `src/features/catalog/components/project-grid.tsx`, `src/features/catalog/components/project-card.tsx` — Project search evidence and search-aware empty state.
- `src/features/kits/components/kit-grid.tsx`, `src/features/kits/components/kit-card.tsx` — Kit search evidence and search-aware empty state.
- `src/styles/catalog.css`, `src/styles/responsive.css` — compact evidence and empty-state styling.
- `src/app/help/report-project/page.tsx` — derive Help search text from structured fields after legacy removal.
- `tests/helpers/generated-catalog.ts` — generated search types and relevance-aware expected counts.
- `tests/unit/build-catalog.test.ts`, `tests/unit/full-catalog-data.test.ts` — generated search-field coverage.
- `tests/unit/catalog-selectors.test.ts`, `tests/unit/kit-selectors.test.ts` — selector eligibility and sorting.
- `tests/unit/catalog-toolbar.test.tsx`, `tests/unit/use-catalog-query.test.tsx`, `tests/unit/catalog-batch-flow.test.tsx` — UI/URL/search transitions.
- `tests/e2e/catalog.spec.ts`, `tests/e2e/mobile.spec.ts` — browser search, sorting, clearing, and accessibility behavior.
- `docs/guides/using-the-catalog.md`, `docs/architecture/catalog-data-model.md`, `docs/architecture/system-overview.md` — user and technical search contracts.

---

### Task 1: Build the isolated MiniSearch engine

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/search/search-types.ts`
- Create: `src/features/search/search-normalization.ts`
- Create: `src/features/search/catalog-search.ts`
- Create: `tests/unit/catalog-search.test.ts`

**Interfaces:**
- Produces: `CatalogSearchFields`, `CatalogSearchDocument`, `SearchFieldName`, `SearchMatchKind`, `SearchEvidence`, `CatalogSearchMatch`, `CatalogSearchResults`, `CatalogSearchIndex`.
- Produces: `normalizeSearchText(value: string): string`.
- Produces: `searchTerms(value: string): string[]`.
- Produces: `searchMeaning(value: string): string`.
- Produces: `allowedEditDistance(term: string): 0 | 1 | 2`.
- Produces: `createCatalogSearchIndex(documents: CatalogSearchDocument[]): CatalogSearchIndex`.
- Produces: `exactAllTermSearch(documents: CatalogSearchDocument[], query: string): CatalogSearchResults`.

- [ ] **Step 0: Capture the pre-feature payload and JavaScript baseline**

Before changing dependencies or generated fields, run:

```powershell
npm.cmd run catalog:build
npm.cmd run build
Get-Item 'src/generated/catalog.json' | Select-Object Length
Get-ChildItem '.next/static/chunks' -Recurse -File -Filter '*.js' | Measure-Object -Property Length -Sum
```

Record both byte totals in the execution notes. Task 8 repeats these exact
measurements after the implementation and reports the absolute and percentage
deltas. Do not add timing thresholds to CI from a single workstation.

- [ ] **Step 1: Write failing normalization and engine tests**

Create `tests/unit/catalog-search.test.ts` with synthetic documents that isolate each rule:

```ts
import MiniSearch from "minisearch";
import { describe, expect, test, vi } from "vitest";

import {
  createCatalogSearchIndex,
  exactAllTermSearch,
} from "@/features/search/catalog-search";
import {
  allowedEditDistance,
  normalizeSearchText,
  searchMeaning,
  searchTerms,
} from "@/features/search/search-normalization";
import type { CatalogSearchDocument } from "@/features/search/search-types";

const documents: CatalogSearchDocument[] = [
  {
    id: "freaky",
    title: ["Preset Introducing Freaky Frankenstein 50"],
    aliases: [],
    source: ["reddit-1v9u18m"],
    summary: ["A relationship-focused system preset."],
    kind: ["preset", "system preset"],
    primaryFunction: ["generation and reasoning"],
    tags: ["slow burn", "relationship tracking"],
    frontends: ["SillyTavern"],
    compatibility: ["Claude", "GLM", "Kimi"],
    maintainers: [],
    relationships: [],
  },
  {
    id: "memory",
    title: ["SillyTavern MemoryBooks"],
    aliases: ["Memory Books"],
    source: ["aikohanasaki/sillytavern-memorybooks"],
    summary: ["Stores durable conversation memories."],
    kind: ["extension"],
    primaryFunction: ["memory and retrieval"],
    tags: ["long-term memory"],
    frontends: ["SillyTavern"],
    compatibility: [],
    maintainers: ["aikohanasaki"],
    relationships: [],
  },
];

describe("search normalization", () => {
  test("normalizes Unicode, punctuation, camel case, and whitespace", () => {
    expect(normalizeSearchText("  SíllyTavern / Memory_Books  ")).toBe(
      "silly tavern memory books",
    );
  });

  test("drops only approved function words when content terms remain", () => {
    expect(searchTerms("preset for the freaky")).toEqual(["preset", "freaky"]);
    expect(searchTerms("the")).toEqual(["the"]);
  });

  test("uses normalized terms as query meaning", () => {
    expect(searchMeaning(" Preset   Freaky ")).toBe("preset freaky");
    expect(searchMeaning("PRESET FREAKY")).toBe("preset freaky");
  });

  test.each([
    ["four", 0],
    ["freaky", 1],
    ["frankenstein", 2],
  ] as const)("limits edits for %s", (term, distance) => {
    expect(allowedEditDistance(term)).toBe(distance);
  });
});

describe("catalog search", () => {
  test("requires noncontiguous terms across the complete document", () => {
    const index = createCatalogSearchIndex(documents);
    expect(index.search("preset freaky").matches.map(({ id }) => id)).toEqual([
      "freaky",
    ]);
    expect(index.search("freaky preset").matches.map(({ id }) => id)).toEqual([
      "freaky",
    ]);
  });

  test("ranks exact title terms above supporting-field matches", () => {
    const index = createCatalogSearchIndex([
      ...documents,
      {
        ...documents[1],
        id: "supporting",
        title: ["Unrelated Toolkit"],
        summary: ["Preset support for Freaky Frankenstein."],
      },
    ]);
    expect(index.search("preset freaky").matches[0]?.id).toBe("freaky");
  });

  test("keeps exact matches above prefix and fuzzy matches", () => {
    const index = createCatalogSearchIndex([
      ...documents,
      {
        ...documents[1],
        id: "exact-supporting",
        title: ["Unrelated Toolkit"],
        summary: ["Frankenstien"],
      },
    ]);
    expect(index.search("frankenstien").matches.map(({ id }) => id)).toEqual([
      "exact-supporting",
      "freaky",
    ]);
  });

  test("recognizes complete aliases and source identities", () => {
    const index = createCatalogSearchIndex(documents);
    expect(index.search("memory books").matches[0]?.id).toBe("memory");
    expect(
      index.search("aikohanasaki sillytavern memorybooks").matches[0]?.id,
    ).toBe("memory");
  });

  test("permits bounded typos but rejects typos below five characters", () => {
    const index = createCatalogSearchIndex(documents);
    expect(index.search("frankenstien").matches[0]?.id).toBe("freaky");
    expect(index.search("frankenstien").correction).toBe("frankenstein");
    expect(index.search("presrt freaky").matches[0]?.id).toBe("freaky");
    expect(index.search("gln").matches).toEqual([]);
  });

  test("returns hidden-field evidence without repeating title evidence", () => {
    const index = createCatalogSearchIndex(documents);
    expect(index.search("aikohanasaki").matches[0]?.evidence[0]).toMatchObject({
      field: "maintainers",
      value: "aikohanasaki",
    });
    expect(index.search("freaky").matches[0]?.evidence[0]?.field).toBe("title");
  });

  test("falls back to exact all-term matching", () => {
    expect(
      exactAllTermSearch(documents, "preset freaky").matches.map(({ id }) => id),
    ).toEqual(["freaky"]);
    expect(exactAllTermSearch(documents, "frankenstien").matches).toEqual([]);
    expect(exactAllTermSearch(documents, "set freaky").matches).toEqual([]);
  });

  test("degrades to exact tokens when MiniSearch initialization fails", () => {
    const addAll = vi
      .spyOn(MiniSearch.prototype, "addAll")
      .mockImplementation(() => {
        throw new Error("synthetic index failure");
      });
    const index = createCatalogSearchIndex(documents);
    addAll.mockRestore();

    expect(index.search("preset freaky")).toMatchObject({
      degraded: true,
      matches: [{ id: "freaky" }],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search.test.ts
```

Expected: FAIL because the three `src/features/search/` modules do not exist.

- [ ] **Step 3: Install MiniSearch**

Run:

```powershell
npm.cmd install minisearch@7.2.0
```

Expected: `package.json` contains `"minisearch": "^7.2.0"` and
`package-lock.json` resolves version `7.2.0`.

- [ ] **Step 4: Define the Tavernary search types**

Create `src/features/search/search-types.ts`:

```ts
export const SEARCH_FIELD_NAMES = [
  "title",
  "aliases",
  "source",
  "summary",
  "kind",
  "primaryFunction",
  "tags",
  "frontends",
  "compatibility",
  "maintainers",
  "relationships",
] as const;

export type SearchFieldName = (typeof SEARCH_FIELD_NAMES)[number];
export type SearchMatchKind = "exact" | "prefix" | "fuzzy";

export type CatalogSearchFields = Record<SearchFieldName, string[]>;

export interface CatalogSearchDocument extends CatalogSearchFields {
  id: string;
}

export interface SearchEvidence {
  field: SearchFieldName;
  value: string;
  kind: SearchMatchKind;
  queryTerm: string;
  matchedTerm: string;
}

export interface CatalogSearchMatch {
  id: string;
  score: number;
  evidence: SearchEvidence[];
}

export interface CatalogSearchResults {
  normalizedQuery: string;
  matches: CatalogSearchMatch[];
  correction: string | null;
  degraded: boolean;
}

export interface CatalogSearchIndex {
  search(query: string): CatalogSearchResults;
}
```

- [ ] **Step 5: Implement one normalization contract**

Create `src/features/search/search-normalization.ts` with:

```ts
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "of",
  "the",
  "to",
  "with",
]);

function separateCamelCase(value: string) {
  return value.replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2");
}

export function normalizeSearchText(value: string) {
  return separateCamelCase(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function searchTerms(value: string) {
  const terms = normalizeSearchText(value).split(" ").filter(Boolean);
  const meaningful = terms.filter((term) => !FUNCTION_WORDS.has(term));
  return meaningful.length > 0 ? meaningful : terms;
}

export function searchMeaning(value: string) {
  return searchTerms(value).join(" ");
}

export function allowedEditDistance(term: string): 0 | 1 | 2 {
  if (term.length < 5) return 0;
  if (term.length < 8) return 1;
  return 2;
}
```

If the normalization test exposes a soft-hyphen or camel-case ordering issue,
adjust `normalizeSearchText` while preserving the exact expected result.

- [ ] **Step 6: Implement the MiniSearch wrapper and exact fallback**

Create `src/features/search/catalog-search.ts`. Use MiniSearch only in this
file. Configure all fields, store `id` and `title`, and extract array fields as
joined strings:

```ts
import MiniSearch from "minisearch";

import {
  allowedEditDistance,
  normalizeSearchText,
  searchMeaning,
  searchTerms,
} from "./search-normalization";
import {
  SEARCH_FIELD_NAMES,
  type CatalogSearchDocument,
  type CatalogSearchIndex,
  type CatalogSearchMatch,
  type CatalogSearchResults,
  type SearchEvidence,
  type SearchFieldName,
} from "./search-types";

const FIELD_BOOST: Record<SearchFieldName, number> = {
  title: 12,
  aliases: 10,
  source: 8,
  summary: 4,
  kind: 5,
  primaryFunction: 5,
  tags: 5,
  frontends: 3,
  compatibility: 3,
  maintainers: 2,
  relationships: 2,
};

function documentText(document: CatalogSearchDocument) {
  return SEARCH_FIELD_NAMES.flatMap((field) => document[field]).join(" ");
}

function authorityTier(document: CatalogSearchDocument, query: string) {
  const title = normalizeSearchText(document.title.join(" "));
  if (title === query) return 5;
  if (document.aliases.some((value) => normalizeSearchText(value) === query)) {
    return 4;
  }
  if (document.source.some((value) => normalizeSearchText(value) === query)) {
    return 4;
  }
  if (title.includes(query)) return 3;
  const positions = searchTerms(query)
    .map((term) => title.split(" ").indexOf(term))
    .filter((position) => position >= 0);
  if (positions.length === searchTerms(query).length) {
    return 2;
  }
  return 0;
}
```

Build a normalized copy of each document for MiniSearch while retaining an
`originalDocumentsById` map for evidence labels. Construct the MiniSearch
instance with these exact search controls, then call
`miniSearch.addAll(normalizedDocuments)` inside the initialization `try`:

```ts
const miniSearch = new MiniSearch<CatalogSearchDocument>({
  fields: [...SEARCH_FIELD_NAMES],
  storeFields: ["id", "title"],
  extractField: (document, fieldName) => {
    const value = document[fieldName as keyof CatalogSearchDocument];
    return Array.isArray(value) ? value.join(" ") : String(value ?? "");
  },
  tokenize: (value) => normalizeSearchText(value).split(" ").filter(Boolean),
  processTerm: (term) => term,
  searchOptions: {
    boost: FIELD_BOOST,
    combineWith: "AND",
    prefix: (term) => term.length >= 3,
    fuzzy: (term) => {
      const edits = allowedEditDistance(term);
      return edits === 0 ? false : edits;
    },
    maxFuzzy: 2,
  },
});
```

Implement `evidenceForResult` by reading MiniSearch's `match` map, comparing
each matched term with the normalized query terms, and selecting original field
values in field-boost order. Classify exact equality as `exact`, a matched term
starting with the query term as `prefix`, and the remaining permitted match as
`fuzzy`.

Implement `createCatalogSearchIndex` so:

- documents are normalized once during index construction and user queries
  pass `searchMeaning(query)` to MiniSearch;
- empty query returns `{ matches: [], correction: null, degraded: false }`;
- `normalizeSearchText(query)` is retained separately for complete-title,
  complete-alias, complete-source, and title-phrase ranking;
- each result's weakest per-term match determines an exactness tier:
  all-exact `3`, exact-plus-prefix `2`, any fuzzy `1`;
- the public score uses disjoint bands:
  `exactnessTier * 1_000_000 + authorityTier * 100_000 + proximityBonus * 1_000 + Math.min(miniSearchScore, 999)`;
- `proximityBonus` is `0..99`, with adjacent ordered title terms strongest;
  these disjoint bands guarantee all-exact results outrank prefix results,
  prefix results outrank fuzzy results, and exact title/alias/source authority
  cannot be overturned by MiniSearch's raw score;
- matches sort descending by this Tavernary score, then by ID;
- exact/prefix search is run without fuzzy matching to determine whether a
  `Did you mean` suggestion is eligible;
- `autoSuggest` is consulted only when exact/prefix all-term search is empty;
- suggestions are accepted only when searching the suggestion yields at least
  one card under the same fuzzy limits;
- constructor or search exceptions return `exactAllTermSearch` with
  `degraded: true`;
- caught exceptions are reported with their original error in development and
  test builds, while production falls back without exposing internal details
  to users.

Implement `exactAllTermSearch` by converting normalized `documentText` to a
token `Set` and requiring every `searchTerms(query)` entry to equal a complete
document token. Do not use substring matching in the fallback. Apply the same
authority/proximity bonuses and stable ID ordering, without fuzzy matching,
prefix matching, or suggestions.

- [ ] **Step 7: Run focused tests and type checking**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search.test.ts
npm.cmd run typecheck
```

Expected: the search test passes and TypeScript reports no errors.

- [ ] **Step 8: Commit the core engine**

```powershell
git add package.json package-lock.json src/features/search/search-types.ts src/features/search/search-normalization.ts src/features/search/catalog-search.ts tests/unit/catalog-search.test.ts
git commit -m "feat(search): add MiniSearch engine"
```

---

### Task 2: Generate validated structured search documents

**Files:**
- Create: `scripts/catalog/search-document.mjs`
- Create: `scripts/catalog/search-document.d.mts`
- Modify: `data/schemas/project.schema.json`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/kits/kit-types.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Consumes: `CatalogSearchFields` from Task 1.
- Produces: `search: CatalogSearchFields` on every `CatalogProject` and `CatalogKit`.
- Produces: `projectSearchFields(input): CatalogSearchFields`.
- Produces: `kitSearchFields(input): CatalogSearchFields`.
- Produces: `assertSearchFields(fields, context): void`.

- [ ] **Step 1: Write failing build-output tests**

Add focused assertions to `tests/unit/build-catalog.test.ts` using its existing
temporary registry/snapshot builders. Set that fixture record's `aliases` to
`["Memory Companion"]` before building:

```ts
expect(catalog.projects[0].search).toMatchObject({
  title: ["Memory Engine"],
  aliases: ["Memory Companion"],
  kind: ["extension"],
  primaryFunction: expect.arrayContaining(["Memory and retrieval"]),
  tags: expect.arrayContaining(["Maintain long-term memory"]),
  frontends: expect.arrayContaining(["SillyTavern"]),
  maintainers: expect.arrayContaining(["example-owner"]),
});
expect(JSON.stringify(catalog.projects[0].search)).not.toContain(
  "[object Object]",
);
```

Add full-catalog assertions to `tests/unit/full-catalog-data.test.ts`:

```ts
test("publishes valid structured search fields for every card", async () => {
  const catalog = await buildCatalog({ write: false });
  for (const item of [...catalog.projects, ...catalog.kits]) {
    expect(item.search.title).toHaveLength(1);
    for (const values of Object.values(item.search)) {
      expect(values.every((value) => typeof value === "string")).toBe(true);
      expect(values).not.toContain("[object Object]");
    }
  }
});
```

Add a direct regression for `tavern-rpg-suite`:

```ts
expect(
  catalog.projects.find(({ id }) => id === "tavern-rpg-suite")?.search
    .primaryFunction,
).toContain("RPG systems and suites");
```

- [ ] **Step 2: Run build tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
```

Expected: FAIL because generated cards do not have `search`.

- [ ] **Step 3: Add optional curated project aliases**

Modify `data/schemas/project.schema.json` to allow:

```json
"aliases": {
  "type": "array",
  "items": {
    "type": "string",
    "minLength": 1,
    "pattern": "\\S"
  },
  "uniqueItems": true,
  "default": []
}
```

Keep aliases optional so schema-version-6 records require no bulk migration.
Do not add guessed aliases to registry records in this task.

- [ ] **Step 4: Implement the build-time search helper**

Create `scripts/catalog/search-document.mjs` with one empty-field constructor,
string-array validation, source identity extraction, and Project/Kit builders:

```js
const FIELD_NAMES = [
  "title",
  "aliases",
  "source",
  "summary",
  "kind",
  "primaryFunction",
  "tags",
  "frontends",
  "compatibility",
  "maintainers",
  "relationships",
];

function strings(values) {
  return [
    ...new Set(
      values
        .flat()
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function assertSearchFields(fields, context) {
  const unknownFields = Object.keys(fields).filter(
    (field) => !FIELD_NAMES.includes(field),
  );
  if (unknownFields.length > 0) {
    throw new TypeError(
      `${context}.search has unknown fields: ${unknownFields.join(", ")}`,
    );
  }
  for (const field of FIELD_NAMES) {
    if (!Array.isArray(fields[field])) {
      throw new TypeError(`${context}.search.${field} must be an array`);
    }
    for (const value of fields[field]) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.includes("[object Object]")
      ) {
        throw new TypeError(`${context}.search.${field} has invalid text`);
      }
    }
  }
  if (fields.title.length !== 1) {
    throw new TypeError(`${context}.search.title must contain one title`);
  }
}
```

`projectSearchFields` must receive already-resolved labels and emit:

```js
const fields = {
  title: strings([project.name]),
  aliases: strings(record.aliases ?? []),
  source: strings([
    project.id,
    source.id,
    sourceIdentity(source),
    project.canonicalUrl,
  ]),
  summary: strings([project.summary]),
  kind: strings([project.kind, kindLabel]),
  primaryFunction: strings([
    primaryFunction.label,
    ...(primaryFunction.aliases ?? []),
  ]),
  tags: strings(
    tags.flatMap(({ label, aliases }) => [label, ...(aliases ?? [])]),
  ),
  frontends: strings(
    frontends.flatMap(({ label, aliases }) => [label, ...(aliases ?? [])]),
  ),
  compatibility: strings([
    ...modelFamilies.flatMap(({ label, aliases }) => [
      label,
      ...(aliases ?? []),
    ]),
    ...completionFormats.flatMap(({ label, aliases }) => [
      label,
      ...(aliases ?? []),
    ]),
  ]),
  maintainers: strings([
    project.attribution?.owner.login,
    ...(
      project.attribution?.contributors.map(({ login }) => login) ?? []
    ),
    sourceOwnerOrOrganization(source),
  ]),
  relationships: strings([
    project.fork?.parentName,
    project.fork?.parentProjectId,
  ]),
};
```

`kitSearchFields` must populate title, summary, aliases from included-project
names, source from Kit ID, maintainers from author, and the applicable tags,
frontends, compatibility, and relationships arrays. Put included-project names
and IDs in both aliases and relationships so a component lookup is
authoritative and explainable. Fields without a Kit equivalent remain empty
arrays.

Add matching declarations to `scripts/catalog/search-document.d.mts`.

- [ ] **Step 5: Use the helper from every catalog build path**

Modify `scripts/catalog/build.mjs` so the final Project mapping calls
`projectSearchFields` only after `resolveForkRelationship` has populated
`project.fork`; this prevents relationship terms from being lost. The Kit
builder calls `kitSearchFields` after its components and labeled facets are
complete.

Correct the manual primary-function lookup from:

```js
vocabularies.primaryFunctions.get(record.primary_function)
```

to:

```js
vocabularies.primaryFunctions.get(record.primary_function)?.label
```

Pass each Project's registry record, source record, finalized runtime card, and
resolved vocabulary entries into the helper. Pass vocabulary aliases instead
of flattening them only into `searchableText`. Add `search` to the returned
runtime object while retaining `searchableText` temporarily for compatibility.

- [ ] **Step 6: Publish the runtime types**

Import `CatalogSearchFields` into `src/features/catalog/catalog-types.ts` and
`src/features/kits/kit-types.ts`, then add:

```ts
search: CatalogSearchFields;
```

Keep `searchableText: string` until Task 7.

- [ ] **Step 7: Run generated-data gates**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
npm.cmd run typecheck
```

Expected: all commands pass; every generated Project and Kit has valid search
fields; `tavern-rpg-suite` contains a real primary-function label.

- [ ] **Step 8: Commit structured search generation**

```powershell
git add data/schemas/project.schema.json scripts/catalog/search-document.mjs scripts/catalog/search-document.d.mts scripts/catalog/build.mjs src/features/catalog/catalog-types.ts src/features/kits/kit-types.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts
git commit -m "feat(search): generate structured card fields"
```

Do not stage `src/generated/catalog.json` if it remains ignored.

---

### Task 3: Integrate Project search and establish the relevance corpus

**Files:**
- Create: `tests/fixtures/catalog-search-relevance.json`
- Create: `tests/unit/catalog-search-relevance.test.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `tests/helpers/generated-catalog.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `createCatalogSearchIndex`, `CatalogSearchResults`, and generated `project.search`.
- Produces: `selectProjects(projects, query, context, searchResults?)`.
- Produces: `projectEvidenceById: ReadonlyMap<string, SearchEvidence[]>` in `CatalogPage`.
- Leaves all category/filter/view semantics unchanged.

- [ ] **Step 1: Add the initial real-catalog relevance corpus**

Create `tests/fixtures/catalog-search-relevance.json`:

```json
[
  {
    "mode": "projects",
    "query": "preset freaky",
    "top": ["reddit-1v9u18m"],
    "required": ["reddit-1v9u18m"],
    "forbidden": ["mentallyquill-recursion"]
  },
  {
    "mode": "projects",
    "query": "freaky preset",
    "top": ["reddit-1v9u18m"],
    "required": ["reddit-1v9u18m"],
    "forbidden": ["mentallyquill-recursion"]
  },
  {
    "mode": "projects",
    "query": "frankenstien",
    "required": ["reddit-1v9u18m"],
    "forbidden": ["mentallyquill-directive"]
  },
  {
    "mode": "projects",
    "query": "mentallyquill directive",
    "top": ["mentallyquill-directive"],
    "required": ["mentallyquill-directive"],
    "forbidden": ["mentallyquill-recursion"]
  },
  {
    "mode": "projects",
    "query": "recursion",
    "top": ["mentallyquill-recursion"],
    "required": ["mentallyquill-recursion"],
    "forbidden": ["mentallyquill-directive"]
  },
  {
    "mode": "projects",
    "query": "wandlight",
    "required": [
      "mentallyquill-st-wandlight",
      "mentallyquill-wandlight"
    ],
    "forbidden": ["mentallyquill-saga"]
  },
  {
    "mode": "projects",
    "query": "memory silly tavern",
    "required": ["aikohanasaki-sillytavern-memorybooks"],
    "forbidden": ["reddit-1v9u18m"]
  },
  {
    "mode": "projects",
    "query": "aikohanasaki/sillytavern-memorybooks",
    "top": ["aikohanasaki-sillytavern-memorybooks"],
    "required": ["aikohanasaki-sillytavern-memorybooks"],
    "forbidden": ["mentallyquill-recursion"]
  },
  {
    "mode": "projects",
    "query": "persistent memory",
    "required": ["aikohanasaki-sillytavern-memorybooks"],
    "forbidden": ["reddit-1v9u18m"]
  },
  {
    "mode": "projects",
    "query": "freaky claude chat",
    "top": ["reddit-1v9u18m"],
    "required": ["reddit-1v9u18m"],
    "forbidden": ["mentallyquill-directive"]
  },
  {
    "mode": "projects",
    "query": "rpg maps inventory",
    "required": ["tavern-rpg-suite"],
    "forbidden": ["mentallyquill-recursion"]
  },
  {
    "mode": "projects",
    "query": "gln",
    "required": [],
    "forbidden": [],
    "expectEmpty": true
  }
]
```

The corpus runner added next must print the failing query and actual ordered IDs
so weight failures are actionable.

- [ ] **Step 2: Write failing corpus and selector tests**

Create `tests/unit/catalog-search-relevance.test.ts` to build the real catalog,
create Project documents from `{ id, ...project.search }`, and assert each
corpus entry. Type scenarios as:

```ts
interface RelevanceScenario {
  mode: "projects" | "kits";
  query: string;
  top?: string[];
  required: string[];
  forbidden: string[];
  expectEmpty?: boolean;
}
```

Use this assertion loop:

```ts
for (const scenario of scenarios.filter(({ mode }) => mode === "projects")) {
  const resultIds = index.search(scenario.query).matches.map(({ id }) => id);
  expect(resultIds, scenario.query).toEqual(
    expect.arrayContaining(scenario.required),
  );
  expect(resultIds, scenario.query).toEqual(
    expect.not.arrayContaining(scenario.forbidden),
  );
  if (scenario.top) {
    expect(resultIds.slice(0, scenario.top.length), scenario.query).toEqual(
      scenario.top,
    );
  }
  if (scenario.expectEmpty) {
    expect(resultIds, scenario.query).toEqual([]);
  }
}
```

Add selector tests to `tests/unit/catalog-selectors.test.ts` proving:

```ts
const searchResults = {
  normalizedQuery: "preset freaky",
  correction: null,
  degraded: false,
  matches: [
    { id: "freaky", score: 50, evidence: [] },
    { id: "supporting", score: 10, evidence: [] },
  ],
};

expect(
  selectProjects(
    [supportingProject, freakyProject],
    { ...DEFAULT_QUERY, search: "preset freaky" },
    context,
    searchResults,
  ).map(({ id }) => id),
).toEqual(expect.arrayContaining(["freaky", "supporting"]));
```

Also prove a selected frontend or category can exclude a textual match without
introducing any non-search match.

- [ ] **Step 3: Run focused tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search-relevance.test.ts tests/unit/catalog-selectors.test.ts
```

Expected: FAIL because selectors do not accept structured search results, and
some initial corpus ordering may expose missing field data.

- [ ] **Step 4: Integrate search eligibility and scores into Project selection**

Change the selector signature:

```ts
export function selectProjects(
  projects: CatalogProject[],
  query: CatalogQuery,
  context: { now: string; tagVocabulary?: PublicTagDefinition[] },
  searchResults?: CatalogSearchResults,
): CatalogProject[];
```

When `searchMeaning(query.search)` is nonempty:

- require `project.id` in `searchResults.matches`;
- when no search results were supplied, call `exactAllTermSearch` over generated
  Project search documents;
- apply existing category, frontend, kind, tag, compatibility, development,
  license, and view predicates without modification;
- preserve all four existing browsing comparators in this task. Task 5 adds the
  Relevance comparator after the shared sort types exist.

Remove the old contiguous `project.searchableText.includes(search)` predicate.

- [ ] **Step 5: Memoize the Project index and query in CatalogPage**

In `CatalogPage`, add:

```ts
const projectSearchIndex = useMemo(
  () =>
    createCatalogSearchIndex(
      catalog.projects.map((project) => ({
        id: project.id,
        ...project.search,
      })),
    ),
  [catalog.projects],
);
const projectSearchResults = useMemo(
  () => projectSearchIndex.search(searchInput),
  [projectSearchIndex, searchInput],
);
```

Pass `projectSearchResults` into `selectProjects`. Build:

```ts
const projectEvidenceById = useMemo(
  () =>
    new Map(
      projectSearchResults.matches.map(({ id, evidence }) => [id, evidence]),
    ),
  [projectSearchResults],
);
```

Do not render evidence until Task 6.

- [ ] **Step 6: Update generated test helpers and browser expectations**

Replace direct generated `searchableText.includes("recursion")` expected-count
logic in `tests/helpers/generated-catalog.ts` and `tests/e2e/catalog.spec.ts`
with the Tavernary search engine. Keep the existing browser search assertions
and add:

```ts
await search.fill("preset freaky");
await expect(
  page.getByRole("heading", {
    name: "Preset Introducing Freaky Frankenstein 50",
  }),
).toBeVisible();
```

Add a character-by-character unit regression in
`tests/unit/catalog-batch-flow.test.tsx` that types `preset freaky`, observes
the target card, and retains the complete visible input value.

- [ ] **Step 7: Run Project search gates**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search-relevance.test.ts tests/unit/catalog-selectors.test.ts tests/unit/catalog-batch-flow.test.tsx
npm.cmd run test:e2e -- --grep "search"
npm.cmd run typecheck
```

Expected: all Project search eligibility, engine relevance corpus, spaces, and
existing search browser tests pass.

- [ ] **Step 8: Commit Project search integration**

```powershell
git add tests/fixtures/catalog-search-relevance.json tests/unit/catalog-search-relevance.test.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components/catalog-page.tsx tests/unit/catalog-selectors.test.ts tests/unit/catalog-batch-flow.test.tsx tests/helpers/generated-catalog.ts tests/e2e/catalog.spec.ts
git commit -m "feat(search): rank Project matches"
```

---

### Task 4: Integrate Kit search with the shared engine

**Files:**
- Modify: `tests/fixtures/catalog-search-relevance.json`
- Modify: `tests/unit/catalog-search-relevance.test.ts`
- Modify: `src/features/kits/kit-selectors.ts`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `tests/unit/kit-selectors.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: generated `kit.search` and the Task 1 engine.
- Produces: `selectKits(kits, query, search, searchResults?)`.
- Produces: `kitEvidenceById: ReadonlyMap<string, SearchEvidence[]>`.

- [ ] **Step 1: Add real Kit corpus entries and failing selector tests**

Append these entries to `tests/fixtures/catalog-search-relevance.json`:

```json
{
  "mode": "kits",
  "query": "aiko loadout",
  "top": ["aiko-s-loadout-30"],
  "required": ["aiko-s-loadout-30"],
  "forbidden": ["ultimate-harry-potter-18"]
},
{
  "mode": "kits",
  "query": "memorybooks loadout",
  "top": ["aiko-s-loadout-30"],
  "required": ["aiko-s-loadout-30"],
  "forbidden": ["ultimate-harry-potter-18"]
},
{
  "mode": "kits",
  "query": "mentally quill harry",
  "required": ["ultimate-harry-potter-18"],
  "forbidden": ["aiko-s-loadout-30"]
},
{
  "mode": "kits",
  "query": "super awesome",
  "top": ["super-awesome-test-kit-109"],
  "required": ["super-awesome-test-kit-109"],
  "forbidden": ["test-135"]
}
```

Extend the corpus runner to create a Kit index and select scenarios by mode.

Add a Kit selector test:

```ts
expect(
  selectKits(
    [secondaryKit, exactKit],
    DEFAULT_KIT_QUERY,
    "super awesome",
    {
      normalizedQuery: "super awesome",
      correction: null,
      degraded: false,
      matches: [
        { id: exactKit.id, score: 40, evidence: [] },
        { id: secondaryKit.id, score: 5, evidence: [] },
      ],
    },
  ).map(({ id }) => id),
).toEqual(expect.arrayContaining([exactKit.id, secondaryKit.id]));
```

- [ ] **Step 2: Run Kit tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search-relevance.test.ts tests/unit/kit-selectors.test.ts
```

Expected: FAIL because Kit selectors still use contiguous `searchableText` and
do not accept scored search results.

- [ ] **Step 3: Integrate Kit eligibility and scores**

Change the Kit selector signature:

```ts
export function selectKits(
  kits: CatalogKit[],
  query: KitQuery,
  search?: string,
  searchResults?: CatalogSearchResults,
): CatalogKit[];
```

Use the same eligibility and exact-fallback rules as Projects. Apply the
existing frontend, model-family, purpose, included-project, size, availability,
and four browsing comparators unchanged. Task 5 adds the Relevance comparator
after the shared sort types exist.

- [ ] **Step 4: Memoize the Kit index and pass results**

In `CatalogPage`, create the Kit index from `catalog.kits` once and search it
with `searchInput`. Pass results into `selectKits` and build `kitEvidenceById`
using the same map shape as Projects.

- [ ] **Step 5: Add a browser Kit search**

In `tests/e2e/catalog.spec.ts`, enter Kits mode, type `aiko loadout`
character-by-character, and assert only the matching Kit remains visible. Clear
the query and assert the full Kit count returns.

- [ ] **Step 6: Run Project and Kit search tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-search.test.ts tests/unit/catalog-search-relevance.test.ts tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
npm.cmd run test:e2e -- --grep "search"
```

Expected: both modes pass the shared engine and real-catalog corpus.

- [ ] **Step 7: Commit Kit search integration**

```powershell
git add tests/fixtures/catalog-search-relevance.json tests/unit/catalog-search-relevance.test.ts src/features/kits/kit-selectors.ts src/features/catalog/components/catalog-page.tsx tests/unit/kit-selectors.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat(search): rank Kit matches"
```

---

### Task 5: Add search-only Relevance and sort restoration

**Files:**
- Create: `src/features/search/search-sort-transition.ts`
- Create: `tests/unit/search-sort-transition.test.ts`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/kits/kit-query.ts`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `tests/unit/use-catalog-query.test.tsx`
- Modify: `tests/unit/catalog-toolbar.test.tsx`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/kit-selectors.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `CatalogBrowseSort`, `CatalogSort = CatalogBrowseSort | "relevance"`.
- Produces: `KitBrowseSort`, `KitSort = KitBrowseSort | "relevance"`.
- Produces: `nextSearchSort(input): "relevance" | BrowseSort`.
- Produces: `rememberedBrowseSort(current, fallback): BrowseSort`.

- [ ] **Step 1: Write failing pure transition tests**

Create `tests/unit/search-sort-transition.test.ts`:

```ts
import { expect, test } from "vitest";

import { nextSearchSort } from "@/features/search/search-sort-transition";

test("enters relevance for a new meaningful search", () => {
  expect(
    nextSearchSort({
      previousSearch: "",
      nextSearch: "preset freaky",
      currentSort: "popularity",
      browseSort: "popularity",
    }),
  ).toBe("relevance");
});

test("preserves a manual override for equivalent query edits", () => {
  expect(
    nextSearchSort({
      previousSearch: "Preset Freaky",
      nextSearch: "  preset   freaky ",
      currentSort: "alphabetical",
      browseSort: "alphabetical",
    }),
  ).toBe("alphabetical");
});

test("resets a manual override after a meaningful edit", () => {
  expect(
    nextSearchSort({
      previousSearch: "preset freaky",
      nextSearch: "preset freaky claude",
      currentSort: "alphabetical",
      browseSort: "alphabetical",
    }),
  ).toBe("relevance");
});

test("restores the remembered browse sort when cleared", () => {
  expect(
    nextSearchSort({
      previousSearch: "preset freaky",
      nextSearch: "",
      currentSort: "relevance",
      browseSort: "popularity",
    }),
  ).toBe("popularity");
});
```

Add URL tests to `tests/unit/use-catalog-query.test.tsx` and query round-trip
tests proving:

- `?q=preset+freaky` parses as Relevance;
- `?q=preset+freaky&sort=popularity` preserves Popularity;
- `?sort=relevance` with no `q` parses as Recent Activity;
- punctuation-only `?q=---` does not activate Relevance;
- Relevance is omitted when serializing a search URL;
- explicit non-relevance sorts are serialized.

- [ ] **Step 2: Write failing toolbar and component-transition tests**

In `tests/unit/catalog-toolbar.test.tsx`, assert:

```ts
expect(
  screen.queryByRole("option", { name: "Relevance" }),
).not.toBeInTheDocument();

rerender(
  <CatalogToolbar
    {...props}
    query={{ ...DEFAULT_QUERY, search: "memory", sort: "relevance" }}
  />,
);
expect(screen.getByRole("option", { name: "Relevance" })).toBeVisible();
expect(screen.getByRole("combobox", { name: "Sort projects" })).toHaveValue(
  "relevance",
);
```

In `tests/unit/catalog-batch-flow.test.tsx`, cover:

1. choose Popularity before search;
2. type `preset freaky`;
3. observe Relevance;
4. choose Alphabetical;
5. add ` claude`;
6. observe Relevance again;
7. remove only capitalization or surrounding whitespace and keep the override;
8. clear search and observe restored Popularity.

Repeat the state transition for Kits with Trending as the remembered browse
sort, and switch modes before and after a meaningful edit to prove both
effective sorts reset together while both browsing sorts remain independently
remembered. Add browser-history coverage that loads a shared search URL with and
without an explicit browse sort, reloads it, and uses Back/Forward after a query
edit. The visible draft, URL, active sort, and result order must agree after
each navigation.

Extend Project and Kit selector tests with the scored fixtures from Tasks 3 and
4. Assert Relevance follows descending Tavernary score and deterministic
mode-specific ties, while each manual sort reorders the identical matching ID
set with its existing comparator.

- [ ] **Step 3: Run focused tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/search-sort-transition.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/catalog-toolbar.test.tsx tests/unit/catalog-batch-flow.test.tsx
```

Expected: FAIL because Relevance and transition helpers do not exist.

- [ ] **Step 4: Add browse and effective sort types**

In `catalog-query.ts`:

```ts
export type CatalogBrowseSort =
  | "recent"
  | "sustained"
  | "popularity"
  | "alphabetical";
export type CatalogSort = CatalogBrowseSort | "relevance";
export const DEFAULT_CATALOG_BROWSE_SORT: CatalogBrowseSort = "recent";
```

In `kit-query.ts`:

```ts
export type KitBrowseSort =
  | "trending"
  | "newest"
  | "updated"
  | "alphabetical";
export type KitSort = KitBrowseSort | "relevance";
export const DEFAULT_KIT_BROWSE_SORT: KitBrowseSort = "trending";
```

Use those constants in `DEFAULT_QUERY` and `DEFAULT_KIT_QUERY`. Export
browse-sort sets separately from effective sort sets.

- [ ] **Step 5: Parse and serialize conditional Relevance**

In `parseCatalogQuery`, compute `searchMeaning(search)` before the sort. If that
meaning is nonempty and `sort` is absent, return Relevance. If a valid explicit
browse sort is present, preserve it. Accept an explicit Relevance value only
while search meaning is nonempty; reject it to the mode default when search
meaning is empty.

In `serializeCatalogQuery`:

```ts
if (searchMeaning(query.search) && query.sort !== "relevance") {
  parameters.set("sort", query.sort);
}
```

Apply the same rule to `query.kits.sort` in Kit mode.

- [ ] **Step 6: Implement pure search-sort transitions**

Create `search-sort-transition.ts`:

```ts
import { searchMeaning } from "./search-normalization";

export function nextSearchSort<BrowseSort extends string>({
  previousSearch,
  nextSearch,
  currentSort,
  browseSort,
}: {
  previousSearch: string;
  nextSearch: string;
  currentSort: BrowseSort | "relevance";
  browseSort: BrowseSort;
}): BrowseSort | "relevance" {
  const previous = searchMeaning(previousSearch);
  const next = searchMeaning(nextSearch);
  if (!next) return browseSort;
  if (next !== previous) return "relevance";
  return currentSort;
}

export function rememberedBrowseSort<BrowseSort extends string>(
  current: BrowseSort | "relevance",
  fallback: BrowseSort,
): BrowseSort {
  return current === "relevance" ? fallback : current;
}
```

- [ ] **Step 7: Render and drive Relevance**

In `catalog-selectors.ts`, add the Relevance comparator using the score map from
`CatalogSearchResults`: descending Tavernary score, then recent activity, then
name and ID. In `kit-selectors.ts`, use descending Tavernary score, then newest
update, then title and ID. Existing browsing comparators and the matching set
remain unchanged.

In `CatalogToolbar`, render `<option value="relevance">Relevance</option>` as
the first option only when `searchMeaning(query.search)` is nonempty. Apply the
same conditional option to Projects and Kits.

In `CatalogPage`, keep refs for remembered Project and Kit browse sorts:

```ts
const projectBrowseSortRef = useRef<CatalogBrowseSort>(
  query.sort === "relevance" ? DEFAULT_CATALOG_BROWSE_SORT : query.sort,
);
const kitBrowseSortRef = useRef<KitBrowseSort>(
  query.kits.sort === "relevance"
    ? DEFAULT_KIT_BROWSE_SORT
    : query.kits.sort,
);
```

When a user selects a non-relevance sort, update the applicable ref. In
`updateSearch`, call `nextSearchSort` using the visible previous value and
update both Project and Kit effective sorts in the same `setQuery` transaction:
a meaningful shared-query edit resets both modes to Relevance, an equivalent
cosmetic edit preserves each mode's current override, and clearing restores
both remembered browsing sorts. This ensures switching modes during an
unchanged search never exposes a stale pre-search default. Route search-chip
removal and Clear All through the same transition.

- [ ] **Step 8: Verify URL, component, selector, and browser transitions**

Run:

```powershell
npm.cmd test -- --run tests/unit/search-sort-transition.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/catalog-toolbar.test.tsx tests/unit/catalog-batch-flow.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
npm.cmd run test:e2e -- --grep "search|sort"
npm.cmd run typecheck
```

Expected: Relevance is conditional, query edits reset it, manual sorts are
respected, and clearing restores mode-specific browse sorts.

- [ ] **Step 9: Commit sort-state behavior**

```powershell
git add src/features/search/search-sort-transition.ts tests/unit/search-sort-transition.test.ts src/features/catalog/catalog-query.ts src/features/kits/kit-query.ts src/features/catalog/components/catalog-toolbar.tsx src/features/catalog/components/catalog-page.tsx tests/unit/use-catalog-query.test.tsx tests/unit/catalog-toolbar.test.tsx tests/unit/catalog-batch-flow.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat(search): add relevance sort state"
```

---

### Task 6: Add match evidence, corrections, empty states, and announcements

**Files:**
- Create: `src/features/search/components/search-evidence.tsx`
- Create: `src/features/search/components/search-empty-state.tsx`
- Create: `src/features/search/use-search-announcement.ts`
- Create: `tests/unit/search-evidence.test.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/kits/components/kit-grid.tsx`
- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/kit-card.test.tsx`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `SearchEvidence[]`, pre-filter match counts, correction, and visible result count.
- Produces: `visibleSearchEvidence(evidence): SearchEvidence | null`.
- Produces: `SearchCorrection` as an explicit, never-automatic query action.
- Produces: `SearchEmptyState` with search/filter/correction variants.
- Produces: `useSearchAnnouncement(message, delayMs = 250): string`.

- [ ] **Step 1: Write failing evidence and empty-state tests**

Create `tests/unit/search-evidence.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SearchEvidence } from "@/features/search/components/search-evidence";
import {
  SearchCorrection,
  SearchEmptyState,
} from "@/features/search/components/search-empty-state";

test("hides evidence already obvious in title or summary", () => {
  const { rerender } = render(
    <SearchEvidence
      evidence={[
        {
          field: "title",
          value: "Freaky",
          kind: "exact",
          queryTerm: "freaky",
          matchedTerm: "freaky",
        },
      ]}
    />,
  );
  expect(screen.queryByText(/Matched/u)).not.toBeInTheDocument();

  rerender(
    <SearchEvidence
      evidence={[
        {
          field: "maintainers",
          value: "MentallyQuill",
          kind: "exact",
          queryTerm: "mentallyquill",
          matchedTerm: "mentallyquill",
        },
      ]}
    />,
  );
  expect(screen.getByText("Matched maintainer: MentallyQuill")).toBeVisible();
});

test("explains matches hidden by filters", () => {
  render(
    <SearchEmptyState
      mode="projects"
      query="preset freaky"
      textMatchCount={2}
      activeFilterCount={1}
      correction={null}
      onUseCorrection={vi.fn()}
    />,
  );
  expect(screen.getByText("2 search matches are hidden by filters")).toBeVisible();
});

test("offers but does not apply a spelling correction", () => {
  const onUseCorrection = vi.fn();
  render(
    <SearchCorrection
      correction="frankenstein"
      onUseCorrection={onUseCorrection}
    />,
  );
  const action = screen.getByRole("button", {
    name: "Search for frankenstein",
  });
  expect(action).toBeVisible();
  expect(onUseCorrection).not.toHaveBeenCalled();
});
```

Add fake-timer coverage for `useSearchAnnouncement` proving that the visible
result count changes immediately while the live-region text changes only after
250 ms and collapses rapid intermediate updates.

- [ ] **Step 2: Run component tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/search-evidence.test.tsx tests/unit/catalog-batch-flow.test.tsx
```

Expected: FAIL because the feedback components and announcement hook do not
exist.

- [ ] **Step 3: Implement the evidence component**

`SearchEvidence` chooses the first evidence item outside `title` and `summary`.
Use these singular labels:

```ts
const FIELD_LABEL = {
  aliases: "alias",
  source: "source",
  kind: "project type",
  primaryFunction: "function",
  tags: "goal or trait",
  frontends: "frontend",
  compatibility: "compatibility",
  maintainers: "maintainer",
  relationships: "related project",
} as const;
```

Render:

```tsx
<p className="search-match-evidence">
  Matched {FIELD_LABEL[evidence.field]}: <b>{evidence.value}</b>
</p>
```

Return `null` when only title or summary evidence exists.

- [ ] **Step 4: Implement search-aware empty states**

`SearchEmptyState` behavior:

- empty query and no cards: preserve the mode's existing ordinary empty copy;
- search matches before filters but zero after filters: state the count hidden
  by filters and offer the existing Clear filters action through its parent;
- no text matches and correction exists: state that all terms are required and
  render an explicit correction button;
- no text matches and no correction: state that no card matches all search
  terms and suggest removing a term;
- never apply a correction without button activation.

Export `SearchCorrection` from the same module. Render it next to the search
result summary whenever the engine returns a correction, including when fuzzy
results remain visible; render the same control inside the no-text-match state
when no results remain. Pass both components through `ProjectGrid` and
`KitGrid` rather than duplicating the branching. Activating the action must
replace the visible raw draft, update URL state, and trigger the normal
meaningful-query transition back to Relevance.

- [ ] **Step 5: Add evidence to cards**

Add optional `searchEvidence?: SearchEvidence[]` props to `ProjectCard` and
`KitCard`. Render `<SearchEvidence>` immediately after the visible summary or
description. Extend each card's accessible description with the same evidence
only when it is not already title/summary evidence.

Pass evidence maps from `CatalogPage` through both grids.

- [ ] **Step 6: Add delayed live-region announcements**

Create `use-search-announcement.ts`:

```ts
import { useEffect, useState } from "react";

export function useSearchAnnouncement(message: string, delayMs = 250) {
  const [announcement, setAnnouncement] = useState(message);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(message), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, message]);
  return announcement;
}
```

Use it only for the visually hidden `aria-live="polite"` result-count message.
Render that node with `role="status"` and `aria-atomic="true"`. Do not delay
visible results, sort changes, or counts.

- [ ] **Step 7: Style evidence and responsive empty actions**

In `catalog.css`, add a one-line, low-emphasis evidence treatment using existing
secondary/muted text and teal focus tokens. In compact density, clamp evidence
to one line. In `responsive.css`, allow correction and Clear filters actions to
wrap without horizontal overflow at 320 px.

Do not add a new color token, pill style, nested scrollbar, or animation.

- [ ] **Step 8: Add browser coverage**

In Playwright:

- search a maintainer and assert the evidence line;
- search visible title text and assert no redundant evidence line;
- combine a textual match with an excluding filter and assert the filtered
  message;
- use a correction button and assert the visible input and URL update;
- type rapidly and inspect the final live-region text;
- repeat evidence and correction layout at 320 px.

- [ ] **Step 9: Run feedback, accessibility, and visual-layout gates**

Run:

```powershell
npm.cmd test -- --run tests/unit/search-evidence.test.tsx tests/unit/project-card.test.tsx tests/unit/kit-card.test.tsx tests/unit/catalog-batch-flow.test.tsx
npm.cmd run test:e2e -- --grep "search"
npm.cmd run test:e2e -- --grep "320"
npm.cmd run lint -- --quiet
npm.cmd run typecheck
```

Expected: evidence appears only when useful, corrections are explicit, empty
states distinguish filters from zero text matches, and announcements settle.

- [ ] **Step 10: Commit search feedback**

```powershell
git add src/features/search/components/search-evidence.tsx src/features/search/components/search-empty-state.tsx src/features/search/use-search-announcement.ts tests/unit/search-evidence.test.tsx src/features/catalog/components/catalog-page.tsx src/features/catalog/components/project-grid.tsx src/features/catalog/components/project-card.tsx src/features/kits/components/kit-grid.tsx src/features/kits/components/kit-card.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/project-card.test.tsx tests/unit/kit-card.test.tsx tests/unit/catalog-batch-flow.test.tsx tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git commit -m "feat(search): explain search results"
```

---

### Task 7: Retire flattened search authority and migrate consumers

**Files:**
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/kits/kit-types.ts`
- Modify: `src/app/help/report-project/page.tsx`
- Modify: `src/features/help/components/project-picker.tsx`
- Modify: `src/features/help/components/project-report-form.tsx`
- Modify: `tests/helpers/generated-catalog.ts`
- Modify: every typed Project/Kit fixture that still declares `searchableText`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `tests/unit/help-project-options.test.ts`
- Modify: `tests/unit/project-report-form.test.tsx`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: structured `search` fields.
- Produces: `flattenSearchFields(fields: CatalogSearchFields): string`.
- Removes: runtime `searchableText` from `CatalogProject` and `CatalogKit`.
- Advances the generated catalog's camel-case `schemaVersion` from `4` to `5`;
  registry, submission, and snapshot `schema_version` values are unrelated and
  remain unchanged.

- [ ] **Step 1: Write failing legacy-removal and Help-search tests**

Add a build test:

```ts
expect(catalog.schemaVersion).toBe(5);
expect(catalog.projects[0]).not.toHaveProperty("searchableText");
expect(catalog.kits[0]).not.toHaveProperty("searchableText");
```

Update Help option tests so a project can be found by a structured maintainer,
tag alias, and repository identity after mapping:

```ts
expect(options[0].searchText).toContain("mentallyquill");
expect(options[0].searchText).toContain("persistent memory");
expect(options[0].searchText).toContain("github mentallyquill directive");
```

- [ ] **Step 2: Run focused tests and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/help-project-options.test.ts tests/unit/project-report-form.test.tsx
```

Expected: FAIL because generated objects still contain `searchableText` and
Help mapping still reads it.

- [ ] **Step 3: Add one compatibility flattener**

Export from `search-types.ts`:

```ts
export function flattenSearchFields(fields: CatalogSearchFields) {
  return SEARCH_FIELD_NAMES.flatMap((field) => fields[field]).join(" ");
}
```

Use this only for secondary simple-search consumers that do not require
relevance, such as the Help project picker. Name its mapped field `searchText`
so it cannot be mistaken for the retired generated authority.

- [ ] **Step 4: Remove generated `searchableText`**

Delete all three Project-source `searchableText` builders and the Kit builder
from `scripts/catalog/build.mjs`. Remove the property from `CatalogProject` and
`CatalogKit`. Change only the generated catalog's `schemaVersion` and
`Catalog["schemaVersion"]` type from `4` to `5`, then update catalog fixture and
generated-output assertions. Do not change snake-case registry, submission,
snapshot, or manifest schema versions.

Update Help mapping, generated test helpers, and browser expected counts to use
structured fields or the shared engine. Remove stale `searchableText` fixture
properties across unit tests; add minimal `search` fields through existing
fixture factories rather than repeating eleven arrays in every test.

Do not change unrelated Help combobox matching semantics in this task.

- [ ] **Step 5: Run a repository-wide legacy scan**

Run:

```powershell
rg -n "searchableText" src scripts tests
```

Expected: no runtime catalog or Kit reference remains. A separately scoped Help
type is also renamed to `searchText`.

- [ ] **Step 6: Run content, Help, selector, and type gates**

Run:

```powershell
npm.cmd run catalog:build
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/help-project-options.test.ts tests/unit/project-report-form.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
npm.cmd run typecheck
```

Expected: structured fields are the only catalog search authority and all
secondary consumers compile and pass.

- [ ] **Step 7: Commit legacy removal**

Stage only files reported by the legacy scan and focused tests:

```powershell
git add scripts/catalog/build.mjs src/features/catalog/catalog-types.ts src/features/kits/kit-types.ts src/features/search/search-types.ts src/app/help/report-project/page.tsx src/features/help/components/project-picker.tsx src/features/help/components/project-report-form.tsx tests/helpers/generated-catalog.ts tests/e2e/catalog.spec.ts tests/unit/build-catalog.test.ts tests/unit/catalog-batch-flow.test.tsx tests/unit/catalog-license-filter-contract.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/fork-relationship-flow.test.tsx tests/unit/frontend-filter-order.test.tsx tests/unit/full-catalog-data.test.ts tests/unit/help-project-options.test.ts tests/unit/kit-active-query.test.tsx tests/unit/kit-builder.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/kit-card.test.tsx tests/unit/kit-filter-panel.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/kit-selectors.test.ts tests/unit/project-card.test.tsx tests/unit/project-report-form.test.tsx
git commit -m "refactor(search): retire flattened index"
```

Review `git diff --cached --name-only` before committing so unrelated tests are
not swept into the mechanical fixture update.

---

### Task 8: Document, benchmark, and certify the complete search flow

**Files:**
- Create: `tests/benchmarks/catalog-search-benchmark.test.ts`
- Modify: `package.json`
- Modify: `docs/guides/using-the-catalog.md`
- Modify: `docs/architecture/catalog-data-model.md`
- Modify: `docs/architecture/system-overview.md`
- Modify: `tests/unit/static-export-verification.test.ts`

**Interfaces:**
- Consumes: generated structured search fields and the public search engine.
- Produces: `npm.cmd run search:benchmark`.
- Produces: final user and architecture documentation.

- [ ] **Step 1: Write a failing package-script and documentation contract**

Add a static contract test asserting:

```ts
expect(packageJson.scripts["search:benchmark"]).toBe(
  "vitest run tests/benchmarks/catalog-search-benchmark.test.ts --reporter=verbose",
);
expect(usingCatalogGuide).toContain("all meaningful words");
expect(usingCatalogGuide).toContain("Relevance");
expect(catalogDataModel).toContain("structured search fields");
expect(systemOverview).toContain("MiniSearch");
```

- [ ] **Step 2: Run the contract and confirm the red state**

Run:

```powershell
npm.cmd test -- --run tests/unit/static-export-verification.test.ts
```

Expected: FAIL because the script and documentation do not exist yet.

- [ ] **Step 3: Add the non-gating benchmark**

Create `tests/benchmarks/catalog-search-benchmark.test.ts` so it can import the
same TypeScript search boundary used by the application instead of duplicating
MiniSearch configuration in a Node-only script. It must:

1. call `buildCatalog({ write: false })`;
2. create Project and Kit indexes;
3. measure each index-construction duration with `performance.now()`;
4. execute every relevance-corpus query 100 times;
5. report median and maximum query durations;
6. report JSON byte size for structured search fields;
7. exit nonzero only for missing results or non-finite measurements, not for
   machine-specific timing.

Print one JSON object from the test:

```js
{
  projects: catalog.projects.length,
  kits: catalog.kits.length,
  projectIndexMs,
  kitIndexMs,
  medianQueryMs,
  maxQueryMs,
  searchPayloadBytes,
}
```

Add:

```json
"search:benchmark": "vitest run tests/benchmarks/catalog-search-benchmark.test.ts --reporter=verbose"
```

to `package.json`.

- [ ] **Step 4: Update user and architecture documentation**

Document these exact user-facing rules in `using-the-catalog.md`:

- all meaningful words are required but may appear in any order;
- title, alias, source, description, metadata, compatibility, and maintainer
  fields are searchable;
- conservative typo and prefix matching;
- Relevance appears only during search;
- manual sorts persist until query meaning changes;
- clearing restores the prior browsing sort;
- corrections require explicit activation.

Update `catalog-data-model.md` with generated catalog schema version 5, the
eleven structured field arrays, and conditional sort URL rules. Update
`system-overview.md` to describe MiniSearch as an in-browser dependency behind
Tavernary's own search boundary and affirm that no query leaves the browser.

- [ ] **Step 5: Run benchmark and focused regression gates**

Run:

```powershell
npm.cmd run search:benchmark
npm.cmd test -- --run tests/unit/catalog-search.test.ts tests/unit/catalog-search-relevance.test.ts tests/unit/search-sort-transition.test.ts tests/unit/search-evidence.test.tsx tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/static-export-verification.test.ts
```

Expected: benchmark emits finite measurements and every focused search gate
passes.

Repeat the Task 1 baseline commands after the production build, calculate the
absolute and percentage changes for generated catalog bytes and emitted
JavaScript bytes, and include those numbers in the implementation handoff.

- [ ] **Step 6: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected:

- formatting passes;
- ESLint passes;
- palette audit passes;
- catalog validation and generation pass;
- TypeScript passes;
- all Vitest tests pass;
- production build and static-export verification pass.

- [ ] **Step 7: Run complete browser proof**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
```

Manually verify through the Playwright-controlled local export:

1. type `preset freaky` character-by-character;
2. confirm `Preset Introducing Freaky Frankenstein 50` is the first result;
3. confirm Relevance appears and is selected;
4. select Popularity and confirm the match set is unchanged;
5. add ` claude` and confirm Relevance returns;
6. clear search and confirm Relevance disappears and the prior browse sort
   returns;
7. repeat a creator search, typo correction, filter-excluded search, and Kit
   search;
8. repeat core interactions at 320 px and with keyboard-only input.

Expected: automated browser suites pass and the exact approved interaction
sequence behaves correctly.

- [ ] **Step 8: Review the final diff and commit certification artifacts**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Then commit:

```powershell
git add tests/benchmarks/catalog-search-benchmark.test.ts package.json docs/guides/using-the-catalog.md docs/architecture/catalog-data-model.md docs/architecture/system-overview.md tests/unit/static-export-verification.test.ts
git commit -m "docs(search): document relevance behavior"
```

Do not push or deploy without separate user authorization.

---

## Final acceptance checklist

- [ ] `preset freaky` returns and highly ranks `reddit-1v9u18m`.
- [ ] Query order does not matter and every meaningful term is required.
- [ ] Exact title/alias/source matches outrank supporting, prefix, and fuzzy matches.
- [ ] Typo limits are 0 edits below five characters, 1 edit at five-to-seven, and 2 edits at eight or more.
- [ ] Project and Kit searches use validated structured fields.
- [ ] Relevance appears only for nonempty meaningful searches.
- [ ] Meaningful edits reset manual sorting to Relevance.
- [ ] Clearing restores each mode's remembered browsing sort.
- [ ] Shared and reloaded URL behavior is deterministic.
- [ ] Active filters constrain search without admitting partial-term results.
- [ ] Hidden-field matches receive one restrained explanation.
- [ ] Corrections are explicit and never silently replace a query.
- [ ] Exact all-term fallback works if MiniSearch throws.
- [ ] Legacy `searchableText` is absent from runtime cards.
- [ ] Generated catalog `schemaVersion` is `5`; unrelated snake-case schemas remain unchanged.
- [ ] Relevance corpus, full unit suite, build, export, E2E, and visual suites pass.
- [ ] Benchmark reports finite index, query, and payload measurements.
