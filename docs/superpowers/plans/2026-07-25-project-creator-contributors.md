# Project Creator and Contributor Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub project cards searchable by repository owner and every contributor, render the approved `by <owner>, plus N contributors` line in standard layouts, and preserve complete contributor attribution in static snapshots.

**Architecture:** Extend the existing GitHub snapshot refresh with a focused paginated contributor client, then derive display policy and search text during the static catalog build. The browser consumes only `src/generated/catalog.json`; it makes no GitHub requests and adds no backend.

**Tech Stack:** Node.js 24 ESM, TypeScript 6, React 19, Next.js 16 static export, GitHub GraphQL and REST APIs, AJV, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- Use GitHub usernames, not profile display names.
- Search must match the repository owner and every linked GitHub contributor, including bot and AI accounts.
- The visible contributor count excludes the owner, GitHub `Bot` accounts, usernames ending in `[bot]`, `claude`, `claude-*`, and `claude_*`.
- Bot and AI accounts remain searchable and remain in the complete contributor disclosure.
- Anonymous commit identities are excluded because they do not have stable GitHub usernames.
- Standard desktop and mobile cards show the attribution line.
- Desktop and mobile compact cards hide the entire attribution line.
- Mobile attribution is not a separate tap target; the card remains one GitHub link.
- Preserve prior contributor facts on a project-specific refresh failure; abort on authentication or rate-limit exhaustion.
- Follow every contributors API page without an application-level contributor cap.
- Do not add browser-time GitHub requests, accounts, databases, runtime APIs, or a backend.
- Preserve unrelated worktree changes. Inspect `git status --short` before every commit and stage only files named by the current task.

---

## File and Interface Map

- `scripts/catalog/github-contributors.mjs`: GitHub REST pagination, response validation, deduplication, and systemic error classification.
- `scripts/catalog/github-contributors.d.mts`: public types for the contributor client.
- `data/schemas/repository-snapshot.schema.json`: optional schema-v2 contributor fact object.
- `scripts/catalog/refresh-github.mjs`: concurrency-limited contributor jobs, last-known-good recovery, snapshot merge, and REST accounting.
- `src/lib/github/contributors.ts`: pure bot/AI classification and generated attribution derivation.
- `scripts/catalog/build.mjs`: owner/contributor search indexing and generated attribution.
- `src/features/catalog/catalog-types.ts`: browser-facing attribution contract.
- `src/features/catalog/project-attribution.ts`: pure visible line, tooltip, and accessible-description copy.
- `src/features/catalog/components/project-card.tsx`: standard-card rendering and accessible description.
- `src/styles/catalog.css`: muted standard attribution and compact-mode hiding.

---

### Task 1: Paginated GitHub Contributor Client

**Files:**
- Create: `scripts/catalog/github-contributors.mjs`
- Create: `scripts/catalog/github-contributors.d.mts`
- Create: `tests/unit/github-contributors.test.ts`

**Interfaces:**
- Consumes: `{ owner: string, name: string }`, GitHub token, and optional injected `fetchImpl`.
- Produces:

```ts
export interface GitHubContributorAccount {
  login: string;
  type: string;
}

export function fetchRepositoryContributors(
  repository: { owner: string; name: string },
  options: {
    token: string;
    fetchImpl?: typeof fetch;
    perPage?: number;
  },
): Promise<{
  accounts: GitHubContributorAccount[];
  requestCount: number;
}>;
```

- Rejected errors expose `status`, `systemic`, `rateLimited`, and
  `requestCount` when applicable so the refresh orchestrator can distinguish
  project failure from run failure and account for attempted REST calls.

- [ ] **Step 1: Write failing pagination, filtering, and deduplication tests**

```ts
import { expect, test } from "vitest";

import { fetchRepositoryContributors } from "../../scripts/catalog/github-contributors.mjs";

test("collects every linked contributor page and deduplicates usernames", async () => {
  const calls: string[] = [];
  const result = await fetchRepositoryContributors(
    { owner: "MentallyQuill", name: "Directive" },
    {
      token: "test-token",
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) {
          return new Response(
            JSON.stringify([
              { login: "Alice", type: "User" },
              { login: "Claude", type: "User" },
            ]),
            {
              status: 200,
              headers: {
                link: '<https://api.github.com/repositories/1/contributors?per_page=2&page=2>; rel="next"',
              },
            },
          );
        }
        return new Response(
          JSON.stringify([
            { login: "alice", type: "User" },
            { login: "dependabot[bot]", type: "Bot" },
          ]),
          { status: 200 },
        );
      },
      perPage: 2,
    },
  );

  expect(calls).toHaveLength(2);
  expect(result).toEqual({
    accounts: [
      { login: "Alice", type: "User" },
      { login: "Claude", type: "User" },
      { login: "dependabot[bot]", type: "Bot" },
    ],
    requestCount: 2,
  });
});

test("rejects anonymous and malformed contributor rows", async () => {
  await expect(
    fetchRepositoryContributors(
      { owner: "owner", name: "repo" },
      {
        token: "test-token",
        fetchImpl: async () =>
          new Response(JSON.stringify([{ name: "Anonymous" }]), {
            status: 200,
          }),
      },
    ),
  ).rejects.toThrow("GitHub contributors returned malformed account data");
});
```

- [ ] **Step 2: Run the tests and verify the client is missing**

Run:

```powershell
npm.cmd test -- tests/unit/github-contributors.test.ts
```

Expected: FAIL because `scripts/catalog/github-contributors.mjs` does not exist.

- [ ] **Step 3: Implement the minimal paginated client**

```js
const githubApi = "https://api.github.com";

function nextLink(value) {
  if (!value) return null;
  for (const part of value.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function contributorError(message, response) {
  const error = new Error(message);
  error.status = response.status;
  error.rateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.get("retry-after") !== null));
  error.systemic =
    response.status === 401 || error.rateLimited;
  return error;
}

export async function fetchRepositoryContributors(
  { owner, name },
  options,
) {
  if (typeof options.token !== "string" || options.token.length === 0) {
    throw new Error("GitHub contributors authentication token is required");
  }
  const perPage = options.perPage ?? 100;
  let url =
    `${githubApi}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
    `/contributors?anon=0&per_page=${perPage}`;
  let requestCount = 0;
  const accounts = new Map();

  while (url) {
    requestCount += 1;
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "Tavernary-catalog-refresh",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      const error = contributorError(
        `GitHub contributors returned ${response.status}`,
        response,
      );
      error.requestCount = requestCount;
      throw error;
    }
    let page;
    try {
      page = await response.json();
    } catch {
      const error = new Error("GitHub contributors returned malformed JSON");
      error.requestCount = requestCount;
      throw error;
    }
    if (!Array.isArray(page)) {
      const error = new Error("GitHub contributors returned malformed JSON");
      error.requestCount = requestCount;
      throw error;
    }
    for (const account of page) {
      if (
        typeof account?.login !== "string" ||
        account.login.length === 0 ||
        typeof account?.type !== "string" ||
        account.type.length === 0
      ) {
        const error = new Error(
          "GitHub contributors returned malformed account data",
        );
        error.requestCount = requestCount;
        throw error;
      }
      const key = account.login.toLocaleLowerCase("en");
      if (!accounts.has(key)) {
        accounts.set(key, { login: account.login, type: account.type });
      }
    }
    url = nextLink(response.headers.get("link"));
  }

  return { accounts: [...accounts.values()], requestCount };
}
```

- [ ] **Step 4: Add authentication, rate-limit, malformed-root, and request-count tests**

```ts
test.each([
  [401, {}, true],
  [429, {}, true],
  [403, { "x-ratelimit-remaining": "0" }, true],
  [404, {}, false],
])("classifies contributor HTTP %s", async (status, headers, systemic) => {
  let thrown: any;
  try {
    await fetchRepositoryContributors(
      { owner: "owner", name: "repo" },
      {
        token: "secret",
        fetchImpl: async () => new Response("", { status, headers }),
      },
    );
  } catch (error) {
    thrown = error;
  }
  expect(thrown.status).toBe(status);
  expect(Boolean(thrown.systemic)).toBe(systemic);
});
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/github-contributors.test.ts
```

Expected: PASS.

Commit:

```powershell
git add scripts/catalog/github-contributors.mjs scripts/catalog/github-contributors.d.mts tests/unit/github-contributors.test.ts
git commit -m "feat(catalog): collect GitHub contributors"
```

---

### Task 2: Snapshot Schema and Refresh Integration

**Files:**
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `tests/unit/refresh-failure-recovery.test.ts`
- Create: `tests/unit/refresh-github-contributors.test.ts`
- Modify: `docs/architecture/catalog-data-model.md`
- Modify: `docs/architecture/github-refresh-methodology.md`

**Interfaces:**
- Consumes: `fetchRepositoryContributors()` from Task 1 and the existing `mapConcurrent()` helper.
- Produces the optional snapshot field:

```ts
contributors?: {
  accounts: Array<{ login: string; type: string }>;
  refreshed_at: string;
  stale_since: string | null;
};
```

- Produces exported pure helpers:

```ts
export function contributorSnapshotForSuccess(
  accounts: Array<{ login: string; type: string }>,
  now: string,
): {
  accounts: Array<{ login: string; type: string }>;
  refreshed_at: string;
  stale_since: null;
};

export function contributorSnapshotForFailure<T>(
  previous: T | undefined,
  now: string,
): T | undefined;
```

- [ ] **Step 1: Write failing snapshot compatibility and validation tests**

```ts
test("accepts absent and populated contributor facts in snapshot v2", async () => {
  const withContributors = structuredClone(validSnapshotV2);
  withContributors.contributors = {
    accounts: [
      { login: "Alice", type: "User" },
      { login: "Claude", type: "User" },
    ],
    refreshed_at: "2026-07-25T00:00:00.000Z",
    stale_since: null,
  };

  expect(
    (await validateCatalog({
      records: [validRecord],
      snapshots: [validSnapshotV2],
    })).errors,
  ).toEqual([]);
  expect(
    (await validateCatalog({
      records: [validRecord],
      snapshots: [withContributors],
    })).errors,
  ).toEqual([]);
});

test("rejects case-insensitive duplicate contributor usernames", async () => {
  const snapshot = structuredClone(validSnapshotV2);
  snapshot.contributors = {
    accounts: [
      { login: "Alice", type: "User" },
      { login: "alice", type: "User" },
    ],
    refreshed_at: "2026-07-25T00:00:00.000Z",
    stale_since: null,
  };
  const result = await validateCatalog({
    records: [validRecord],
    snapshots: [snapshot],
  });
  expect(result.errors).toContain(
    "valid-preset: duplicate contributor username alice",
  );
});
```

- [ ] **Step 2: Run validation tests and verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts
```

Expected: FAIL because the strict schema rejects `contributors`.

- [ ] **Step 3: Add the backward-compatible schema and semantic validation**

Add an optional `contributors` property to snapshot schema v2:

```json
"contributors": {
  "type": "object",
  "additionalProperties": false,
  "required": ["accounts", "refreshed_at", "stale_since"],
  "properties": {
    "accounts": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["login", "type"],
        "properties": {
          "login": { "type": "string", "minLength": 1 },
          "type": { "type": "string", "minLength": 1 }
        }
      }
    },
    "refreshed_at": { "type": "string", "format": "date-time" },
    "stale_since": {
      "anyOf": [
        { "type": "string", "format": "date-time" },
        { "type": "null" }
      ]
    }
  }
}
```

Add case-insensitive duplicate checking to `validateSnapshotEvidence()`:

```js
const contributorLogins = new Set();
for (const account of snapshot.contributors?.accounts ?? []) {
  const login = account.login.toLocaleLowerCase("en");
  if (contributorLogins.has(login)) {
    errors.push(`${id}: duplicate contributor username ${login}`);
  }
  contributorLogins.add(login);
}
```

- [ ] **Step 4: Write failing refresh merge and failure-preservation tests**

```ts
import {
  contributorSnapshotForFailure,
  contributorSnapshotForSuccess,
  runRefresh,
} from "../../scripts/catalog/refresh-github.mjs";

test("stores successful contributor facts", () => {
  expect(
    contributorSnapshotForSuccess(
      [{ login: "Alice", type: "User" }],
      "2026-07-25T00:00:00.000Z",
    ),
  ).toEqual({
    accounts: [{ login: "Alice", type: "User" }],
    refreshed_at: "2026-07-25T00:00:00.000Z",
    stale_since: null,
  });
});

test("preserves previous contributor facts as stale", () => {
  const previous = {
    accounts: [{ login: "Alice", type: "User" }],
    refreshed_at: "2026-07-24T00:00:00.000Z",
    stale_since: null,
  };
  expect(
    contributorSnapshotForFailure(
      previous,
      "2026-07-25T00:00:00.000Z",
    ),
  ).toEqual({
    ...previous,
    stale_since: "2026-07-25T00:00:00.000Z",
  });
  expect(
    contributorSnapshotForFailure(
      undefined,
      "2026-07-25T00:00:00.000Z",
    ),
  ).toBeUndefined();
});
```

The `runRefresh` integration test must inject:

```ts
fetchContributors: async () => ({
  accounts: [
    { login: "MentallyQuill", type: "User" },
    { login: "Claude", type: "User" },
  ],
  requestCount: 2,
}),
```

and assert both the snapshot field and `manifest.api.rest_requests`.

- [ ] **Step 5: Implement concurrency-limited refresh integration**

Import the client:

```js
import { fetchRepositoryContributors } from "./github-contributors.mjs";
```

After the GraphQL observation sweep, create contributor jobs only for valid
observations:

```js
const fetchContributors =
  options.fetchContributors ??
  ((repository) =>
    fetchRepositoryContributors(repository, { token }));
const contributorJobs = observed.observations.map((observation) => ({
  projectId: observation.projectId,
  repository: {
    owner: observation.repository.owner,
    name: observation.repository.name,
  },
}));
const contributorResults = await mapConcurrent(
  contributorJobs,
  3,
  (job) => fetchContributors(job.repository),
);
```

Before project snapshot processing:

1. Abort if a rejected result has `systemic`, `rateLimited`, or status `401`.
2. Add fulfilled `requestCount` values and rejected
   `reason.requestCount ?? 0` values to `restRequests`.
3. Build a map from `projectId` to settled result.
4. Merge success through `contributorSnapshotForSuccess()`.
5. On project-specific rejection, merge
   `contributorSnapshotForFailure(previous?.contributors, now)`.
6. Omit `contributors` when the first request fails.

- [ ] **Step 6: Update architecture docs with the exact contract**

Add to `catalog-data-model.md`:

```markdown
Repository snapshot v2 may contain generated `contributors` facts:
linked GitHub `login` and account `type`, the last successful contributor
refresh timestamp, and contributor-specific staleness. Absence means pending,
not an empty contributor set.
```

Add to `github-refresh-methodology.md`:

```markdown
The observation pass follows all REST contributor pages with bounded
concurrency. Project-specific failure preserves prior contributor facts;
authentication or rate exhaustion aborts the refresh.
```

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/github-contributors.test.ts tests/unit/validate-catalog.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-github-description.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: PASS.

Commit:

```powershell
git add data/schemas/repository-snapshot.schema.json scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-contributors.test.ts docs/architecture/catalog-data-model.md docs/architecture/github-refresh-methodology.md
git commit -m "feat(catalog): persist contributor facts"
```

---

### Task 3: Generated Attribution and Creator Search

**Files:**
- Create: `src/lib/github/contributors.ts`
- Create: `tests/unit/contributors.test.ts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `tests/unit/catalog-license-filter-contract.test.tsx`
- Modify: `tests/unit/kit-builder.test.tsx`
- Modify: `tests/unit/project-batch-selection.test.tsx`
- Modify: `tests/unit/project-card.test.tsx`

**Interfaces:**
- Consumes: snapshot contributor facts from Task 2.
- Produces:

```ts
export interface CatalogContributor {
  login: string;
  botOrAi: boolean;
}

export interface CatalogAttribution {
  owner: string;
  contributors: CatalogContributor[];
  humanContributorCount: number;
  status: "current" | "stale" | "pending";
}
```

- `CatalogProject.attribution` is `CatalogAttribution | null`.
- `contributors` excludes the owner because the owner is represented separately.

- [ ] **Step 1: Write failing bot/AI classification tests**

```ts
import { expect, test } from "vitest";

import { isBotOrAiAccount } from "@/lib/github/contributors";

test.each([
  [{ login: "alice", type: "User" }, false],
  [{ login: "release-bot", type: "Bot" }, true],
  [{ login: "dependabot[bot]", type: "User" }, true],
  [{ login: "claude", type: "User" }, true],
  [{ login: "Claude-Code", type: "User" }, true],
  [{ login: "claude_assistant", type: "User" }, true],
])("classifies $0", (account, expected) => {
  expect(isBotOrAiAccount(account)).toBe(expected);
});
```

- [ ] **Step 2: Run the classification test and verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/contributors.test.ts
```

Expected: FAIL because `src/lib/github/contributors.ts` does not exist.

- [ ] **Step 3: Implement pure attribution derivation**

```ts
export type GitHubAccount = { login: string; type: string };

export function isBotOrAiAccount(account: GitHubAccount): boolean {
  const login = account.login.toLocaleLowerCase("en");
  return (
    account.type.toLocaleLowerCase("en") === "bot" ||
    login.endsWith("[bot]") ||
    login === "claude" ||
    login.startsWith("claude-") ||
    login.startsWith("claude_")
  );
}

export function catalogAttribution(
  owner: string,
  contributors:
    | {
        accounts: GitHubAccount[];
        stale_since: string | null;
      }
    | undefined,
) {
  const accounts = (contributors?.accounts ?? [])
    .filter(
      ({ login }) =>
        login.toLocaleLowerCase("en") !== owner.toLocaleLowerCase("en"),
    )
    .map((account) => ({
      login: account.login,
      botOrAi: isBotOrAiAccount(account),
    }));
  return {
    owner,
    contributors: accounts,
    humanContributorCount: accounts.filter(({ botOrAi }) => !botOrAi).length,
    status: !contributors
      ? ("pending" as const)
      : contributors.stale_since
        ? ("stale" as const)
        : ("current" as const),
  };
}
```

- [ ] **Step 4: Write failing catalog build and search tests**

Extend the GitHub build fixture:

```ts
contributors: {
  accounts: [
    { login: "example", type: "User" },
    { login: "Alice", type: "User" },
    { login: "Claude", type: "User" },
    { login: "dependabot[bot]", type: "Bot" },
  ],
  refreshed_at: "2026-07-25T00:00:00.000Z",
  stale_since: null,
},
```

Assert:

```ts
expect(catalog.projects[0].attribution).toEqual({
  owner: "example",
  contributors: [
    { login: "Alice", botOrAi: false },
    { login: "Claude", botOrAi: true },
    { login: "dependabot[bot]", botOrAi: true },
  ],
  humanContributorCount: 1,
  status: "current",
});
expect(catalog.projects[0].searchableText).toContain("example");
expect(catalog.projects[0].searchableText).toContain("alice");
expect(catalog.projects[0].searchableText).toContain("claude");
expect(catalog.projects[0].searchableText).toContain("dependabot[bot]");
```

Also assert:

- an existing snapshot without `contributors` generates `status: "pending"`;
- a GitHub record without a snapshot derives `owner` from `source.repository`;
- a URL-backed preset generates `attribution: null`;
- `selectProjects()` finds the fixture through each owner/contributor query.

- [ ] **Step 5: Wire attribution into the catalog build and browser type**

In `githubProject()`:

```js
const owner =
  snapshot?.repository?.owner ?? record.source.repository.split("/")[0];
const attribution = catalogAttribution(owner, snapshot?.contributors);
const searchableText = [
  record.name,
  record.kind,
  record.summary,
  primaryFunction.label,
  ...frontends.map(({ label }) => label),
  ...capabilities.map(({ label }) => label),
  attribution.owner,
  ...attribution.contributors.map(({ login }) => login),
]
  .join(" ")
  .toLowerCase();
```

Return `attribution` for GitHub projects and `attribution: null` from every
non-GitHub build path. Add the interfaces above to `catalog-types.ts`. Add
`attribution: null` to the complete `CatalogProject` fixture builders in
`catalog-batch-flow.test.tsx`, `catalog-license-filter-contract.test.tsx`,
`catalog-selectors.test.ts`, `kit-builder.test.tsx`,
`project-batch-selection.test.tsx`, and `project-card.test.tsx`.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts
npm.cmd run typecheck
```

Expected: PASS.

Commit:

```powershell
git add src/lib/github/contributors.ts tests/unit/contributors.test.ts scripts/catalog/build.mjs src/features/catalog/catalog-types.ts tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/catalog-batch-flow.test.tsx tests/unit/catalog-license-filter-contract.test.tsx tests/unit/kit-builder.test.tsx tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx
git commit -m "feat(catalog): index creator attribution"
```

---

### Task 4: Standard Card Attribution and Accessible Copy

**Files:**
- Create: `src/features/catalog/project-attribution.ts`
- Create: `tests/unit/project-attribution.test.ts`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Consumes: `CatalogAttribution` from Task 3.
- Produces:

```ts
export function attributionLine(attribution: CatalogAttribution): string;
export function attributionTooltip(attribution: CatalogAttribution): string;
export function attributionDescription(
  attribution: CatalogAttribution,
): string;
```

- [ ] **Step 1: Write failing copy tests**

```ts
import { expect, test } from "vitest";

import {
  attributionDescription,
  attributionLine,
  attributionTooltip,
} from "@/features/catalog/project-attribution";

const attribution = (humanContributorCount: number) => ({
  owner: "MentallyQuill",
  contributors: [
    { login: "Alice", botOrAi: false },
    { login: "Claude", botOrAi: true },
  ],
  humanContributorCount,
  status: "current" as const,
});

test("formats zero, singular, and plural visible attribution", () => {
  expect(attributionLine({ ...attribution(0), contributors: [] })).toBe(
    "by MentallyQuill",
  );
  expect(attributionLine(attribution(1))).toBe(
    "by MentallyQuill, plus 1 contributor",
  );
  expect(attributionLine(attribution(5))).toBe(
    "by MentallyQuill, plus 5 contributors",
  );
});

test("groups owner, humans, and bots in complete disclosure", () => {
  expect(attributionTooltip(attribution(1))).toBe(
    "Owner: MentallyQuill · Contributors: Alice · Bots/AI: Claude",
  );
  expect(attributionDescription(attribution(1))).toContain(
    "Owner: MentallyQuill.",
  );
});
```

Add cases for pending, stale, and no-additional-contributors copy.

- [ ] **Step 2: Run copy tests and verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/project-attribution.test.ts
```

Expected: FAIL because the copy module does not exist.

- [ ] **Step 3: Implement the pure copy helpers**

```ts
export function attributionLine(attribution: CatalogAttribution) {
  const count = attribution.humanContributorCount;
  return count === 0
    ? `by ${attribution.owner}`
    : `by ${attribution.owner}, plus ${count} ${
        count === 1 ? "contributor" : "contributors"
      }`;
}

export function attributionTooltip(attribution: CatalogAttribution) {
  if (attribution.status === "pending") {
    return `Owner: ${attribution.owner} · Contributor data pending refresh`;
  }
  const humans = attribution.contributors
    .filter(({ botOrAi }) => !botOrAi)
    .map(({ login }) => login);
  const bots = attribution.contributors
    .filter(({ botOrAi }) => botOrAi)
    .map(({ login }) => login);
  const groups = [`Owner: ${attribution.owner}`];
  if (humans.length) groups.push(`Contributors: ${humans.join(", ")}`);
  if (bots.length) groups.push(`Bots/AI: ${bots.join(", ")}`);
  if (!humans.length && !bots.length) {
    groups.push("No additional contributors reported by GitHub");
  }
  if (attribution.status === "stale") {
    groups.push("Contributor data may be stale");
  }
  return groups.join(" · ");
}
```

`attributionDescription()` converts the same facts to complete sentences
instead of duplicating contributor policy.

- [ ] **Step 4: Write failing component and compact-contract tests**

Render a project with attribution and assert:

```tsx
expect(
  screen.getByText("by MentallyQuill, plus 1 contributor"),
).toHaveClass("card-attribution-text");
fireEvent.pointerEnter(
  screen.getByText("by MentallyQuill, plus 1 contributor"),
);
expect(
  screen.getByRole("tooltip", {
    name: "Owner: MentallyQuill · Contributors: Alice · Bots/AI: Claude",
  }),
).toBeVisible();
expect(
  container.querySelector(".project-card")?.textContent,
).toContain("by MentallyQuill");
```

Assert the card's visually hidden description contains owner, human, and bot
usernames. Assert a project with `attribution: null` renders no
`.card-attribution`.

In the CSS contract test require:

```ts
expect(css).toMatch(
  /\.compact-cards \.card-attribution\s*\{[^}]*display:\s*none/s,
);
```

- [ ] **Step 5: Render the attribution without adding a mobile action**

In `ProjectCard`, add an attribution tooltip ID and append
`attributionDescription(project.attribution)` to `cardDescription`.
Immediately after `</h2>` render:

```tsx
{project.attribution ? (
  <p className="card-attribution">
    <Tooltip
      id={`${project.id}-attribution`}
      label={attributionTooltip(project.attribution)}
      className="card-attribution-text"
    >
      {attributionLine(project.attribution)}
    </Tooltip>
  </p>
) : null}
```

Do not add a `button`, `tabIndex`, click handler, or pointer cancellation.
The existing card anchor remains the only mobile action.

Add CSS:

```css
.card-attribution {
  margin: -5px 0 8px;
  color: var(--color-muted);
  font-size: 10px;
  line-height: 1.35;
}

.card-attribution-text {
  display: inline;
}

.compact-cards .card-attribution {
  display: none;
}
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-attribution.test.ts tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS.

Commit:

```powershell
git add src/features/catalog/project-attribution.ts tests/unit/project-attribution.test.ts src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(catalog): show project attribution"
```

---

### Task 5: Browser Behavior and Layout Regression

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`

**Interfaces:**
- Consumes: generated catalog and card markup from Tasks 3 and 4.
- Produces: browser-level proof for search, desktop hover, mobile single-action
  behavior, compact hiding, and attribution layout without screenshot
  baselines.

- [ ] **Step 1: Write failing desktop and compact E2E tests**

```ts
test("searches by owner and discloses desktop attribution", async ({ page }) => {
  const input = page.getByRole("searchbox", { name: "Search catalog" });
  await input.fill("MentallyQuill");
  const card = page.locator(".project-card", { hasText: "Directive" });
  await expect(card).toBeVisible();
  const attribution = card.locator(".card-attribution-text");
  await expect(attribution).toContainText("by MentallyQuill");
  await attribution.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Owner: MentallyQuill",
  );

  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(card.locator(".card-attribution")).toBeHidden();
});
```

The exact accessible searchbox name is `Search projects`.

- [ ] **Step 2: Write failing mobile single-action test**

```ts
test("shows mobile attribution without opening a tooltip", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator(".project-card", { hasText: "Directive" });
  await expect(card.locator(".card-attribution")).toContainText(
    "by MentallyQuill",
  );
  await expect(card.locator(".card-attribution button")).toHaveCount(0);
  await card.locator(".card-attribution").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
```

- [ ] **Step 3: Build and run E2E tests**

Run:

```powershell
npm.cmd run catalog:build
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected before completing Tasks 3 and 4: FAIL on missing attribution. Expected
after implementation: PASS.

- [ ] **Step 4: Extend deterministic layout coverage**

In the viewport loop in `catalog.visual.spec.ts`, assert that standard cards
show the attribution and remain bounded:

```ts
const attribution = page.locator(".project-card .card-attribution").first();
await expect(attribution).toBeVisible();
await expectWithinViewport(page, attribution);
```

In the desktop and mobile compact branch, assert:

```ts
await expect(firstCard.locator(".card-attribution")).toBeHidden();
```

These assertions extend the in-progress layout/geometry suite. Do not restore
or generate committed Playwright screenshot baselines.

- [ ] **Step 5: Run browser and layout suites**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
npm.cmd run test:visual
```

Expected: PASS with standard attribution visible and within each viewport,
compact attribution hidden, compact cards shorter than standard cards, and no
horizontal overflow.

- [ ] **Step 6: Commit browser and layout tests**

```powershell
git add tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/visual/catalog.visual.spec.ts
git commit -m "test(catalog): cover creator attribution"
```

---

### Task 6: Full Verification and Targeted Directive Proof

**Files:**
- Modify when credentials are available: `data/snapshots/github/mentallyquill-directive.json`
- Modify when refresh facts change: `data/snapshots/github-refresh.json`
- Regenerate: `src/generated/catalog.json`

**Interfaces:**
- Consumes: complete implementation from Tasks 1–5.
- Produces: repository-wide verification and, when credentials exist, live
  evidence that Directive stores and publishes real contributor identities.

- [ ] **Step 1: Run formatting and focused regression checks**

```powershell
npm.cmd run format:check
npm.cmd test -- tests/unit/github-contributors.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/validate-catalog.test.ts tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/project-attribution.test.ts tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full repository gate**

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: all commands exit `0`.

- [ ] **Step 3: Run a targeted live Directive refresh when a token exists**

Confirm `GITHUB_TOKEN` or `GH_TOKEN` is present without printing its value, then
run:

```powershell
npm.cmd run catalog:refresh -- --mode project --project-id mentallyquill-directive
npm.cmd run catalog:build
```

If neither token exists, record the live refresh as pending external
verification; do not fabricate contributor data or hand-edit the snapshot.

- [ ] **Step 4: Inspect live snapshot and generated catalog facts**

Run:

```powershell
node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('data/snapshots/github/mentallyquill-directive.json','utf8'));const c=JSON.parse(fs.readFileSync('src/generated/catalog.json','utf8')).projects.find(p=>p.id==='mentallyquill-directive');console.log(JSON.stringify({snapshot:{owner:s.repository.owner,contributors:s.contributors},catalog:{attribution:c.attribution,searchableText:c.searchableText}},null,2));"
```

Expected:

- snapshot owner is `MentallyQuill`;
- `contributors.accounts` is present after a credentialed successful refresh;
- generated attribution excludes the owner from its contributor list;
- every returned username appears in `searchableText`;
- bot/AI accounts have `botOrAi: true`;
- the visible count includes only additional humans.

- [ ] **Step 5: Review the final diff and commit only intended generated facts**

Run:

```powershell
git status --short
git diff --check
git diff -- data/snapshots/github/mentallyquill-directive.json data/snapshots/github-refresh.json src/generated/catalog.json
```

If the live refresh changed tracked generated data, commit it:

```powershell
git add data/snapshots/github/mentallyquill-directive.json data/snapshots/github-refresh.json src/generated/catalog.json
git commit -m "chore(catalog): refresh Directive attribution"
```

If those files are unchanged, do not create an empty commit.

- [ ] **Step 6: Final completion evidence**

Record:

- commit IDs for Tasks 1–5 and any live-data commit;
- exact exit results for `npm.cmd run check`, E2E, and visual suites;
- whether the credentialed Directive refresh ran;
- Directive's stored owner, human contributor count, bot/AI count, and compact
  visibility result;
- any unrelated dirty files that were deliberately preserved.
