# First-Class Codeberg Provider Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fully automated first-class Codeberg repository support to Tavernary while preserving the existing GitHub submission, catalog, refresh, and review behavior.

**Architecture:** Introduce a provider-qualified repository identity and a shared repository-provider contract. Keep the existing GitHub implementation behind a GitHub adapter, add a fixed-origin Codeberg REST adapter, normalize both providers into repository snapshot schema v3, and let submission, catalog, and refresh orchestration dispatch by canonical source provider.

**Tech Stack:** Node.js ESM, JavaScript with `.d.mts` declarations, TypeScript 6, React 19, Next.js 16 static export, JSON Schema draft-07, GitHub Actions, Vitest, Testing Library, Playwright, Codeberg Forgejo REST API.

## Global Constraints

- Use strict red-green-refactor TDD for every behavior change.
- Accept only exact public `https://github.com/<owner>/<repository>` and `https://codeberg.org/<owner>/<repository>` repository URLs.
- Allow a trailing slash or `.git`; reject credentials, query strings, fragments, and extra path components.
- Codeberg HTTP calls must use the fixed `https://codeberg.org/api/v1` origin, never a submitted origin.
- Keep Tavernary submission issues and generated review PRs on GitHub.
- Keep project schema version 5 and add `source.type: "codeberg"`.
- Move repository snapshot schema from version 2 to version 3.
- Move generated catalog schema from version 2 to version 3.
- Keep GitHub snapshots in `data/snapshots/github/`.
- Write Codeberg snapshots to `data/snapshots/codeberg/`.
- Keep Kit reaction snapshots in `data/snapshots/github/kits/`.
- Duplicate detection is provider-local; do not infer cross-provider mirrors.
- A global project-ID collision must stop generation for maintainer resolution.
- Derive Codeberg contributors from account-backed commit authors and merged-pull-request authors.
- Do not expose unlinked Git author names or email addresses as contributor identities.
- Preserve last-known-good snapshots and mark them stale on recoverable refresh failure.
- Keep public unauthenticated Codeberg reads as the launch path; a token is optional.
- Do not add GitLab, generic Forgejo, arbitrary-host, mirror, or synchronization support.
- Runtime browser code must not call GitHub or Codeberg APIs.
- Preserve unrelated working-tree changes.

---

## File Structure

- Create `scripts/catalog/repository-provider.mjs` and `.d.mts`: define provider names, provider-qualified repository records, normalized observation shapes, and adapter lookup.
- Create `scripts/catalog/github-repository-provider.mjs` and `.d.mts`: wrap existing GitHub observer, activity, contributor, and content behavior behind the shared contract.
- Create `scripts/catalog/codeberg-client.mjs` and `.d.mts`: own fixed-origin Forgejo REST requests, pagination, response validation, rate-limit parsing, and error classification.
- Create `scripts/catalog/codeberg-repository-provider.mjs` and `.d.mts`: normalize Codeberg repository, activity, release, root-content, license, and contributor evidence.
- Create `scripts/catalog/migrate-repository-snapshots-v3.mjs` and `.d.mts`: mechanically migrate committed GitHub repository snapshots.
- Create `tests/unit/repository-provider.test.ts`: lock provider dispatch and normalized contracts.
- Create `tests/unit/codeberg-client.test.ts`: lock Codeberg endpoint, payload, pagination, rate-limit, and failure behavior.
- Create `tests/unit/codeberg-repository-provider.test.ts`: lock normalized observations, activity, license, releases, and contributor derivation.
- Create `tests/fixtures/codeberg/*.json`: deterministic public API fixtures for the issue reporter's repository shape.
- Modify `scripts/submissions/source-identity.mjs` and `.d.mts`: parse, resolve, title, and compare Codeberg identities.
- Modify `scripts/submissions/triage-issue.mjs` and `.d.mts`: inspect repository sources through provider lookup.
- Modify `scripts/submissions/admission.mjs` and `.d.mts`: admit GitHub or Codeberg repository identities.
- Modify `scripts/submissions/draft-project-record.mjs` and `.d.mts`: emit provider-specific canonical sources.
- Modify `scripts/submissions/generate-project-submission.mjs` and `.d.mts`: generate provider-specific observations and snapshots.
- Modify `src/features/submissions/project-submission-manifest.mjs` and `.d.mts`: treat Codeberg as a repository-backed source.
- Modify `src/features/submissions/components/project-submission-builder.tsx`: accept Codeberg URLs and update source copy.
- Modify `data/schemas/project.schema.json`: add the Codeberg source variant.
- Modify `data/schemas/repository-snapshot.schema.json`: define snapshot schema v3.
- Modify every `data/snapshots/github/*.json` repository snapshot: add provider and migrate community/contributor fields without recalculating evidence.
- Modify `scripts/catalog/repository-snapshot.mjs` and `.d.mts`: create provider-qualified schema-v3 snapshots.
- Modify `scripts/catalog/build.mjs` and `.d.mts`: join both provider directories and generate catalog schema v3.
- Modify `scripts/catalog/validate.mjs` and `.d.mts`: validate both directories and reject provider/source mismatches.
- Modify `scripts/catalog/enrichment-policy.mjs` and `.d.mts`: treat GitHub and Codeberg repository sources as automatic-enrichment sources.
- Modify `scripts/catalog/readme-source.mjs` and `.d.mts`: fetch README evidence through the selected repository provider.
- Modify `scripts/catalog/enrich-readmes.mjs` and `.d.mts`: load snapshots from both provider directories.
- Modify `scripts/catalog/select-enrichment-canary.mjs`: select eligible snapshots across both providers.
- Modify `scripts/catalog/enrichment-orchestrator.mjs` and `.d.mts`: recognize Codeberg snapshot changes and preserve provider-aware enrichment staging.
- Modify `src/features/catalog/catalog-types.ts`: expose provider-aware attribution and watcher terminology.
- Modify `src/features/catalog/project-attribution.ts` and `src/features/catalog/components/project-card.tsx`: expose provider context and neutral community copy.
- Modify `scripts/catalog/refresh-github.mjs` and `.d.mts`: orchestrate repository providers while retaining the existing CLI entrypoint.
- Create `scripts/catalog/refresh-repositories.mjs` and `.d.mts`: own provider-neutral scheduled refresh orchestration.
- Modify `scripts/catalog/github-refresh-manifest.mjs` and `.d.mts`: emit provider-level usage and outcome telemetry.
- Modify `data/schemas/github-refresh.schema.json`: validate provider telemetry.
- Modify `package.json`: point `catalog:refresh` at the provider-neutral refresh entrypoint.
- Modify `.github/workflows/refresh-catalog.yml` and `.github/workflows/generate-project-submission.yml`: stage and validate Codeberg snapshot paths safely.
- Modify `scripts/ci/classify-pr-paths.mjs`: recognize Codeberg snapshot content.
- Move `docs/reference/github-snapshot-schema.md` to `docs/reference/repository-snapshot-schema.md`: make the public schema reference provider-neutral.
- Modify `docs/reference/README.md`: link the renamed repository snapshot reference.
- Modify focused unit, submission E2E, catalog E2E, visual, documentation, and workflow contract tests listed in the tasks below.

---

### Task 1: Add provider-qualified source identity and intake validation

**Files:**

- Modify: `scripts/submissions/source-identity.mjs`
- Modify: `scripts/submissions/source-identity.d.mts`
- Modify: `scripts/submissions/admission.mjs`
- Modify: `scripts/submissions/validate-submission.mjs`
- Modify: `scripts/catalog/enrichment-policy.mjs`
- Modify: `scripts/catalog/enrichment-policy.d.mts`
- Modify: `src/features/submissions/project-submission-manifest.mjs`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `data/schemas/project.schema.json`
- Test: `tests/unit/source-identity.test.ts`
- Test: `tests/unit/project-submission-admission.test.ts`
- Test: `tests/unit/validate-submission.test.ts`
- Test: `tests/unit/project-submission-manifest.test.ts`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/unit/enrichment-policy.test.ts`

**Interfaces:**

- Consumes: submitted HTTPS source URLs and existing `SourceIdentity` behavior.
- Produces: `RepositoryProviderName = "github" | "codeberg"`, `RepositorySourceIdentity`, `isRepositoryIdentity(identity)`, provider-qualified duplicate keys, and repository-backed intake validation.

- [ ] **Step 1: Write failing Codeberg source-identity tests**

Add to `tests/unit/source-identity.test.ts`:

```ts
test.each([
  [
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  ],
  [
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber.git",
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  ],
  [
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber/",
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  ],
])("parses an exact Codeberg repository URL", (input, canonicalUrl) => {
  expect(parseSourceIdentity(input)).toEqual({
    kind: "repository",
    provider: "codeberg",
    canonicalUrl,
    repository: "targren/Lumiverse-SwipeScrubber",
    repositoryId: null,
    owner: "targren",
    name: "Lumiverse-SwipeScrubber",
  });
});

test.each([
  "https://codeberg.org/targren",
  "https://codeberg.org/targren/repo/issues",
  "https://codeberg.org/targren/repo?tab=activity",
  "https://codeberg.org/targren/repo#readme",
  "https://user@codeberg.org/targren/repo",
])("rejects a noncanonical Codeberg repository URL: %s", (input) => {
  expect(() => parseSourceIdentity(input)).toThrow(
    /Codeberg project URLs must identify exactly one owner\/repository/,
  );
});
```

Update the existing GitHub expectation from `kind: "github"` to:

```ts
{
  kind: "repository",
  provider: "github",
  canonicalUrl: "https://github.com/MentallyQuill/Recursion",
  repository: "MentallyQuill/Recursion",
  repositoryId: null,
  owner: "MentallyQuill",
  name: "Recursion",
}
```

- [ ] **Step 2: Write failing duplicate and admission tests**

Add assertions:

```ts
expect(
  sourceDuplicateKeys({
    kind: "repository",
    provider: "codeberg",
    canonicalUrl: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
    repository: "targren/Lumiverse-SwipeScrubber",
    repositoryId: 1699613,
    owner: "targren",
    name: "Lumiverse-SwipeScrubber",
  }),
).toEqual([
  "url:https://codeberg.org/targren/lumiverse-swipescrubber",
  "codeberg-repository:targren/lumiverse-swipescrubber",
  "codeberg-id:1699613",
]);
```

In `tests/unit/project-submission-admission.test.ts`, add a public Codeberg
repository case with `identity.kind === "repository"` and
`identity.provider === "codeberg"` and expect `status: "admitted"`.

Add a cross-provider case where GitHub and Codeberg use the same
`owner/repository` and assert that neither provider's duplicate keys match.

In `tests/unit/enrichment-policy.test.ts`, assert:

```ts
expect(
  defaultEnrichmentFields({
    type: "codeberg",
    repository: "targren/Lumiverse-SwipeScrubber",
    repository_id: 1699613,
  }),
).toEqual({ enrichment_policy: "automatic" });
```

- [ ] **Step 3: Write failing manifest and rendered-builder tests**

In `tests/unit/project-submission-manifest.test.ts`, assert that a Codeberg
Extension URL does not require external-preset name and description fields.

In `tests/unit/project-submission-builder.test.tsx`:

```tsx
test("accepts an exact public Codeberg repository for an Extension", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);
  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  );
  await user.click(screen.getByLabelText("Lumiverse"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));
  expect(openProjectSubmission).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      source_url:
        "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
    }),
  );
});
```

- [ ] **Step 4: Run the focused tests and verify the red state**

Run:

```powershell
npm.cmd test -- tests/unit/source-identity.test.ts tests/unit/project-submission-admission.test.ts tests/unit/validate-submission.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/enrichment-policy.test.ts
```

Expected: FAIL on Codeberg parsing and the GitHub-only admission/copy rules.

- [ ] **Step 5: Implement provider-qualified repository identity**

In `source-identity.mjs`, replace `githubIdentity` with a host table:

```js
const repositoryHosts = new Map([
  ["github.com", "github"],
  ["codeberg.org", "codeberg"],
]);

function repositoryIdentity(url) {
  const provider = repositoryHosts.get(url.hostname.toLowerCase());
  if (!provider) return null;
  if (url.search || url.hash) {
    throw new Error(
      `${provider === "github" ? "GitHub" : "Codeberg"} project URLs must identify exactly one owner/repository.`,
    );
  }
  const parts = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(
      `${provider === "github" ? "GitHub" : "Codeberg"} project URLs must identify exactly one owner/repository.`,
    );
  }
  const [owner, name] = parts;
  return {
    kind: "repository",
    provider,
    canonicalUrl: `https://${url.hostname.toLowerCase()}/${owner}/${name}`,
    repository: `${owner}/${name}`,
    repositoryId: null,
    owner,
    name,
  };
}

export function isRepositoryIdentity(identity) {
  return identity?.kind === "repository";
}
```

Declare in `source-identity.d.mts`:

```ts
export type RepositoryProviderName = "github" | "codeberg";

export interface RepositorySourceIdentity {
  kind: "repository";
  provider: RepositoryProviderName;
  canonicalUrl: string;
  repository: string;
  repositoryId: number | null;
  owner: string;
  name: string;
}
```

Use `repositoryIdentity(url) ?? redditIdentity(url) ?? externalIdentity(url)`.
Change duplicate keys to `${provider}-repository:` and `${provider}-id:`.
Use the repository name for submission titles for both providers.
Replace `resolveGithub` with:

```ts
resolveRepository?: (
  identity: RepositorySourceIdentity,
) => Promise<{
  id: number;
  owner: string;
  name: string;
  url?: string;
}>;
```

- [ ] **Step 6: Generalize intake validation and schema**

Replace `identity.kind === "github"` checks with
`isRepositoryIdentity(identity)`. Change user-facing errors to:

```text
Frontends and Extensions require a public GitHub or Codeberg repository.
```

Add this source variant to `project.schema.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["type", "repository", "repository_id"],
  "properties": {
    "type": { "const": "codeberg" },
    "repository": {
      "type": "string",
      "pattern": "^[^/\\s]+/[^/\\s]+$"
    },
    "repository_id": {
      "anyOf": [{ "type": "integer", "minimum": 1 }, { "type": "null" }]
    }
  }
}
```

Replace builder and manifest helpers with
`repositoryProviderFromUrl(value): "github" | "codeberg" | null`.
Update `defaultEnrichmentFields(source)` so both `github` and `codeberg`
return `{ enrichment_policy: "automatic" }`.

- [ ] **Step 7: Run the focused tests and verify the green state**

Run the Step 4 command.

Expected: PASS.

- [ ] **Step 8: Commit provider-qualified intake**

```powershell
git add -- scripts/submissions/source-identity.mjs scripts/submissions/source-identity.d.mts scripts/submissions/admission.mjs scripts/submissions/validate-submission.mjs scripts/catalog/enrichment-policy.mjs scripts/catalog/enrichment-policy.d.mts src/features/submissions/project-submission-manifest.mjs src/features/submissions/components/project-submission-builder.tsx data/schemas/project.schema.json tests/unit/source-identity.test.ts tests/unit/project-submission-admission.test.ts tests/unit/validate-submission.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/enrichment-policy.test.ts
git commit -m "feat(submissions): accept Codeberg sources"
```

---

### Task 2: Migrate repository snapshots to provider-neutral schema v3

**Files:**

- Create: `scripts/catalog/migrate-repository-snapshots-v3.mjs`
- Create: `scripts/catalog/migrate-repository-snapshots-v3.d.mts`
- Modify: `scripts/catalog/repository-snapshot.mjs`
- Modify: `scripts/catalog/repository-snapshot.d.mts`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `data/snapshots/github/*.json`
- Test: `tests/unit/repository-snapshot.test.ts`
- Test: `tests/unit/refresh-snapshot-format.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`

**Interfaces:**

- Consumes: committed schema-v2 GitHub snapshots.
- Produces: `RepositorySnapshot` schema v3, `RepositoryProviderName`,
  provider-qualified contributor accounts, neutral community fields, and
  `migrateRepositorySnapshotV3(snapshot)`.

- [ ] **Step 1: Write failing schema-v3 snapshot tests**

Update the fixture expectation in `tests/unit/repository-snapshot.test.ts`:

```ts
expect(snapshot).toMatchObject({
  schema_version: 3,
  provider: "github",
  community: {
    stars_count: 5,
    forks_count: 2,
    watchers_count: 1,
    aggregate: 8,
  },
  contributors: {
    accounts: [
      { provider: "github", login: "fixture-user", type: "User" },
    ],
  },
});
```

Add a Codeberg construction case by passing `provider: "codeberg"` to
`createInitialRepositorySnapshot`.

- [ ] **Step 2: Write the failing migration test**

Add to `tests/unit/refresh-snapshot-format.test.ts`:

```ts
test("migrates a GitHub repository snapshot from v2 to v3 without recalculating evidence", () => {
  const migrated = migrateRepositorySnapshotV3(schemaV2Snapshot);
  expect(migrated.schema_version).toBe(3);
  expect(migrated.provider).toBe("github");
  expect(migrated.community).toEqual({
    stars_count: schemaV2Snapshot.community.stargazers_count,
    forks_count: schemaV2Snapshot.community.forks_count,
    watchers_count: schemaV2Snapshot.community.subscribers_count,
    aggregate: schemaV2Snapshot.community.aggregate,
  });
  expect(migrated.activity).toEqual(schemaV2Snapshot.activity);
  expect(migrated.refreshed_at).toBe(schemaV2Snapshot.refreshed_at);
});
```

- [ ] **Step 3: Run focused tests and verify the red state**

```powershell
npm.cmd test -- tests/unit/repository-snapshot.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/validate-catalog.test.ts
```

Expected: FAIL because schema v3 and the migration function do not exist.

- [ ] **Step 4: Implement snapshot schema v3**

Change `RepositorySnapshot` to:

```ts
export interface RepositorySnapshot {
  schema_version: 3;
  provider: "github" | "codeberg";
  project_id: string;
  // existing repository, health, activity, license and timestamps
  contributors?: {
    accounts: Array<{
      provider: "github" | "codeberg";
      login: string;
      type: string;
    }>;
    // existing contributor state
  };
  community: {
    stars_count: number;
    forks_count: number;
    watchers_count: number;
    aggregate: number;
  };
}
```

Add `provider` to `snapshotFromObservation` and
`createInitialRepositorySnapshot` inputs. Update the JSON Schema with
`schema_version: 3`, required top-level `provider`, provider-qualified
contributors, neutral community keys, and contributor method
`commit-and-merged-pull-request-authors`.

Change `contributorSnapshotForSuccess(collection, now, provider)` to add the
validated provider to every account returned by a provider collector. Existing
GitHub collectors may continue returning `{ login, type }`; schema-v3 snapshots
must always persist `{ provider, login, type }`.

- [ ] **Step 5: Implement and run the deterministic migration**

Export:

```js
export function migrateRepositorySnapshotV3(snapshot) {
  if (snapshot.schema_version === 3) return snapshot;
  if (snapshot.schema_version !== 2) {
    throw new Error(`Unsupported repository snapshot schema: ${snapshot.schema_version}`);
  }
  return {
    ...snapshot,
    schema_version: 3,
    provider: "github",
    ...(snapshot.contributors
      ? {
          contributors: {
            ...snapshot.contributors,
            accounts: snapshot.contributors.accounts.map((account) => ({
              provider: "github",
              ...account,
            })),
          },
        }
      : {}),
    community: {
      stars_count: snapshot.community.stargazers_count,
      forks_count: snapshot.community.forks_count,
      watchers_count: snapshot.community.subscribers_count,
      aggregate: snapshot.community.aggregate,
    },
  };
}
```

The CLI reads only `data/snapshots/github/*.json`, excludes the `kits`
directory, formats with `formatJson`, and writes only changed v2 files.

Run:

```powershell
node scripts/catalog/migrate-repository-snapshots-v3.mjs --write
```

Expected: every repository snapshot becomes schema v3; Kit snapshots remain
unchanged.

- [ ] **Step 6: Run schema and catalog validation**

```powershell
npm.cmd test -- tests/unit/repository-snapshot.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/validate-catalog.test.ts
npm.cmd run catalog:validate
```

Expected: PASS.

- [ ] **Step 7: Commit the schema migration**

```powershell
git add -- scripts/catalog/migrate-repository-snapshots-v3.mjs scripts/catalog/migrate-repository-snapshots-v3.d.mts scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts data/schemas/repository-snapshot.schema.json data/snapshots/github tests/unit/repository-snapshot.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/validate-catalog.test.ts
git commit -m "feat(catalog): qualify repository snapshots"
```

---

### Task 3: Put the existing GitHub path behind the shared provider contract

**Files:**

- Create: `scripts/catalog/repository-provider.mjs`
- Create: `scripts/catalog/repository-provider.d.mts`
- Create: `scripts/catalog/github-repository-provider.mjs`
- Create: `scripts/catalog/github-repository-provider.d.mts`
- Test: `tests/unit/repository-provider.test.ts`
- Modify: `tests/unit/refresh-github-contributors.test.ts`
- Modify: `tests/unit/incremental-refresh.test.ts`

**Interfaces:**

- Consumes: `observeRepositories`, `inspectApiActivity`,
  `fetchRepositoryContributors`, `fetchForkContributors`, and schema-v3
  snapshot helpers.
- Produces:
  `repositoryProvider(provider, clients?): RepositoryProvider`,
  `GitHubRepositoryProvider`, and the normalized `RepositoryObservation`
  contract used by later Codeberg and orchestration tasks.

- [ ] **Step 1: Write the failing provider-dispatch contract**

Create `tests/unit/repository-provider.test.ts`:

```ts
test("returns a GitHub adapter for github sources", () => {
  const provider = repositoryProvider("github", { github: githubClients });
  expect(provider.name).toBe("github");
  expect(provider.snapshotDirectory).toBe("data/snapshots/github");
});

test("rejects an unregistered provider", () => {
  expect(() => repositoryProvider("gitlab" as never)).toThrow(
    "Unsupported repository provider: gitlab",
  );
});
```

Add a normalized observation assertion:

```ts
expect(await provider.observe([githubRecord])).toEqual({
  observations: [
    expect.objectContaining({
      provider: "github",
      repository: expect.objectContaining({ id: 123 }),
      community: {
        starsCount: 4,
        forksCount: 2,
        watchersCount: 1,
      },
    }),
  ],
  failures: [],
  usage: expect.objectContaining({ requestCount: expect.any(Number) }),
});
```

- [ ] **Step 2: Run the contract test and verify the red state**

```powershell
npm.cmd test -- tests/unit/repository-provider.test.ts
```

Expected: FAIL because the provider registry and adapter do not exist.

- [ ] **Step 3: Define the shared provider interfaces**

Define:

```ts
export type RepositoryProviderName = "github" | "codeberg";

export interface ProviderRepositoryRecord {
  id: string;
  source: {
    type: RepositoryProviderName;
    repository: string;
    repository_id: number | null;
  };
}

export interface RepositoryObservation {
  provider: RepositoryProviderName;
  projectId: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    headSha: string;
    headCommittedAt: string | null;
    archived: boolean;
    fork: boolean;
    createdAt: string;
    sizeKb: number;
  };
  community: {
    starsCount: number;
    forksCount: number;
    watchersCount: number;
  };
  latestReleaseAt: string | null;
  coarseLicenseSpdxId: string | null;
}
```

Define the full adapter boundary:

```ts
export interface RepositoryProvider {
  name: RepositoryProviderName;
  snapshotDirectory: string;
  resolve(
    identity: RepositorySourceIdentity,
  ): Promise<RepositorySourceIdentity>;
  observe(records: ProviderRepositoryRecord[]): Promise<ObservationRun>;
  inspectActivity(
    input: ProviderActivityInput,
  ): Promise<ApiActivityInspection>;
  collectContributors(
    repository: RepositoryObservation["repository"],
    context: ContributorContext,
  ): Promise<ContributorCollection>;
  readRootReadme(input: {
    repository: string;
    ref: string;
  }): Promise<{
    path: string;
    content: string;
    encoding: "base64";
  } | null>;
}
```

- [ ] **Step 4: Wrap existing GitHub behavior without changing algorithms**

`GitHubRepositoryProvider` delegates to the current modules and maps:

```js
{
  ...observation,
  provider: "github",
  community: {
    starsCount: observation.community.stargazersCount,
    forksCount: observation.community.forksCount,
    watchersCount: observation.community.subscribersCount,
  },
}
```

Do not rewrite GraphQL, activity classification, fork contributor, or license
logic in this task.

- [ ] **Step 5: Run GitHub regression tests**

```powershell
npm.cmd test -- tests/unit/repository-provider.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/incremental-refresh.test.ts tests/unit/repository-snapshot.test.ts
```

Expected: PASS with unchanged GitHub evidence semantics.

- [ ] **Step 6: Commit the provider boundary**

```powershell
git add -- scripts/catalog/repository-provider.mjs scripts/catalog/repository-provider.d.mts scripts/catalog/github-repository-provider.mjs scripts/catalog/github-repository-provider.d.mts tests/unit/repository-provider.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/incremental-refresh.test.ts
git commit -m "refactor(catalog): add repository providers"
```

---

### Task 4: Implement the fixed-origin Codeberg provider

**Files:**

- Create: `scripts/catalog/codeberg-client.mjs`
- Create: `scripts/catalog/codeberg-client.d.mts`
- Create: `scripts/catalog/codeberg-repository-provider.mjs`
- Create: `scripts/catalog/codeberg-repository-provider.d.mts`
- Create: `tests/unit/codeberg-client.test.ts`
- Create: `tests/unit/codeberg-repository-provider.test.ts`
- Modify: `scripts/catalog/readme-source.mjs`
- Modify: `scripts/catalog/readme-source.d.mts`
- Modify: `tests/unit/readme-source.test.ts`
- Create: `tests/fixtures/codeberg/repository.json`
- Create: `tests/fixtures/codeberg/commits.json`
- Create: `tests/fixtures/codeberg/commit-detail.json`
- Create: `tests/fixtures/codeberg/root-contents.json`
- Create: `tests/fixtures/codeberg/releases.json`
- Create: `tests/fixtures/codeberg/pulls.json`
- Create: `tests/fixtures/codeberg/user.json`

**Interfaces:**

- Consumes: the Task 3 `RepositoryProvider` contract and shared activity,
  license, and snapshot helpers.
- Produces:
  `codebergRequest(path, options)`,
  `parseCodebergRateLimit(headers)`,
  `CodebergRepositoryProvider`,
  bounded Codeberg contributor evidence, normalized Codeberg observations, and
  provider-routed README evidence.

- [ ] **Step 1: Write failing fixed-origin client tests**

In `tests/unit/codeberg-client.test.ts`:

```ts
test("requests only the fixed Codeberg API origin", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(repositoryFixture));
  await codebergRequest(
    "/repos/targren/Lumiverse-SwipeScrubber",
    { fetchImpl },
  );
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://codeberg.org/api/v1/repos/targren/Lumiverse-SwipeScrubber",
    expect.objectContaining({
      headers: expect.objectContaining({
        Accept: "application/json",
        "User-Agent": expect.stringContaining("Tavernary"),
      }),
    }),
  );
});

test("rejects an absolute or traversal API path", async () => {
  await expect(codebergRequest("https://evil.example/api", {})).rejects.toThrow(
    "Codeberg API path must be relative",
  );
  await expect(codebergRequest("/../admin", {})).rejects.toThrow(
    "Codeberg API path is unsafe",
  );
});
```

Add status tests: 404 definitive for repository resolution, 429/5xx retryable,
and releases-route 404 normalized to an empty array only in `listReleases`.

- [ ] **Step 2: Write failing normalized-observation tests**

Use the committed fixtures:

```ts
expect(await provider.observe([codebergRecord])).toEqual({
  observations: [
    {
      provider: "codeberg",
      projectId: "targren-lumiverse-swipescrubber",
      repository: expect.objectContaining({
        id: 1699613,
        owner: "targren",
        name: "Lumiverse-SwipeScrubber",
        defaultBranch: "master",
        headSha: "111978ba6fcbc5236c060be2b2ad7484833145b9",
        archived: false,
        sizeKb: 409,
      }),
      community: {
        starsCount: 0,
        forksCount: 0,
        watchersCount: 1,
      },
      latestReleaseAt: null,
      coarseLicenseSpdxId: null,
    },
  ],
  failures: [],
  usage: expect.objectContaining({ requestCount: expect.any(Number) }),
});
```

- [ ] **Step 3: Write failing activity and contributor tests**

Assert that commit details feed the existing meaningful-change classifier and
that contributor results are:

```ts
{
  accounts: [
    { provider: "codeberg", login: "targren", type: "User" },
  ],
  method: "commit-and-merged-pull-request-authors",
  // existing scan timestamps
}
```

Add an unlinked commit-author fixture and assert its name and email do not
appear in the result.

Add to `tests/unit/readme-source.test.ts`:

```ts
test("loads a Codeberg README through the repository provider", async () => {
  const readRootReadme = vi.fn().mockResolvedValue({
    path: "README.md",
    content: Buffer.from("# Swipe Scrubber").toString("base64"),
    encoding: "base64",
  });
  const result = await loadReadmeSource(codebergRecord, codebergSnapshot, {
    providers: {
      codeberg: { readRootReadme },
    },
  });
  expect(readRootReadme).toHaveBeenCalledWith({
    repository: "targren/Lumiverse-SwipeScrubber",
    ref: codebergSnapshot.repository.head_sha,
  });
  expect(result).toMatchObject({
    status: "ready",
    sourceKind: "readme",
    readmePath: "README.md",
  });
});
```

- [ ] **Step 4: Run Codeberg tests and verify the red state**

```powershell
npm.cmd test -- tests/unit/codeberg-client.test.ts tests/unit/codeberg-repository-provider.test.ts tests/unit/readme-source.test.ts
```

Expected: FAIL because the Codeberg client and provider do not exist.

- [ ] **Step 5: Implement safe requests and rate-limit parsing**

`codebergRequest` must:

- accept only paths beginning with `/`;
- reject `..`, `://`, CR, and LF;
- set `Accept` and `User-Agent`;
- optionally set `Authorization: token ${CODEBERG_TOKEN}`;
- abort on a bounded timeout;
- validate JSON content type and maximum body size;
- return `{ data, status, rateLimit }`;
- attach `status`, `retryable`, and `code` to classified errors.

Parse Codeberg headers shaped like:

```text
ratelimit-policy: "baseline";q=2000;w=600
ratelimit: "baseline";r=1990;t=600
```

into:

```ts
{ limit: 2000, remaining: 1990, resetSeconds: 600 }
```

- [ ] **Step 6: Implement observation, activity, releases, license, and contributors**

Use these routes:

```text
/repos/{owner}/{repo}
/repos/{owner}/{repo}/commits?sha={head}&page={page}&limit=100
/repos/{owner}/{repo}/git/commits/{sha}
/repos/{owner}/{repo}/contents?ref={head}
/repos/{owner}/{repo}/contents/{path}?ref={head}
/repos/{owner}/{repo}/releases?limit=1
/repos/{owner}/{repo}/pulls?state=closed&page={page}&limit=50
/users/{login}
```

Map Codeberg `files[].filename` and `files[].patch` into the existing activity
inspector input. Bound commit history to the existing 12-week scan, merged pull
requests to the contributor cutoff, and unique user lookups to accounts
observed in those bounded scans.

Change `loadReadmeSource` to select a provider by `record.source.type` and call
`readRootReadme({ repository, ref })`. Keep the current GitHub failure codes,
but replace user-facing failure messages with provider-neutral `Repository
README ...` wording.

- [ ] **Step 7: Run Codeberg and shared contract tests**

```powershell
npm.cmd test -- tests/unit/codeberg-client.test.ts tests/unit/codeberg-repository-provider.test.ts tests/unit/repository-provider.test.ts tests/unit/repository-snapshot.test.ts tests/unit/readme-source.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the Codeberg adapter**

```powershell
git add -- scripts/catalog/codeberg-client.mjs scripts/catalog/codeberg-client.d.mts scripts/catalog/codeberg-repository-provider.mjs scripts/catalog/codeberg-repository-provider.d.mts scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/codeberg-client.test.ts tests/unit/codeberg-repository-provider.test.ts tests/unit/readme-source.test.ts tests/fixtures/codeberg
git commit -m "feat(catalog): inspect Codeberg repositories"
```

---

### Task 5: Route triage and generated review PRs through repository providers

**Files:**

- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/triage-issue.d.mts`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/submissions/generate-project-submission.d.mts`
- Modify: `.github/workflows/generate-project-submission.yml`
- Test: `tests/unit/project-submission-admission.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`
- Test: `tests/unit/generate-project-submission-cli.test.ts`
- Test: `tests/unit/project-submission-pr.test.ts`

**Interfaces:**

- Consumes: provider-qualified identities and `repositoryProvider(name)`.
- Produces: provider-resolved triage results, Codeberg canonical records,
  Codeberg initial snapshots, and safe generated-PR path allowlists.

- [ ] **Step 1: Write a failing Codeberg triage test**

Provide a fake Codeberg provider whose `resolve` returns repository ID 1699613.
Assert:

```ts
expect(decision).toMatchObject({
  status: "admitted",
  identity: {
    kind: "repository",
    provider: "codeberg",
    repository: "targren/Lumiverse-SwipeScrubber",
    repositoryId: 1699613,
  },
});
```

Assert 404 becomes `needs-information`, while 429 becomes `retryable`.

- [ ] **Step 2: Write a failing generated-draft test**

In `tests/unit/generate-project-submission.test.ts`:

```ts
expect(generated.files).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      path:
        "data/registry/projects/targren-lumiverse-swipescrubber.json",
      value: expect.objectContaining({
        source: {
          type: "codeberg",
          repository: "targren/Lumiverse-SwipeScrubber",
          repository_id: 1699613,
        },
      }),
    }),
    expect.objectContaining({
      path:
        "data/snapshots/codeberg/targren-lumiverse-swipescrubber.json",
      value: expect.objectContaining({
        schema_version: 3,
        provider: "codeberg",
      }),
    }),
  ]),
);
```

Add a collision fixture with an existing GitHub record using the same generated
project ID and assert generation stops with:

```text
Project ID targren-lumiverse-swipescrubber is already in use by a different source.
```

- [ ] **Step 3: Run submission tests and verify the red state**

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts
```

Expected: FAIL on GitHub-only resolution, draft creation, and snapshot paths.

- [ ] **Step 4: Route triage and generation by provider**

Replace GitHub-only inspection with:

```js
const provider = repositoryProvider(parsed.provider, options.providers);
const resolved = await provider.resolve(parsed);
```

`draftProjectRecord` emits `source.type = identity.provider`. Initial snapshot
creation passes the provider through Task 2 helpers. Generated snapshot path is:

```js
`data/snapshots/${draft.record.source.type}/${draft.record.id}.json`
```

Only `github` and `codeberg` source types may reach that interpolation.

- [ ] **Step 5: Expand generated-PR path safety**

In `.github/workflows/generate-project-submission.yml`, allow exactly:

```bash
data/registry/projects/*.json
data/snapshots/github/*.json
data/snapshots/codeberg/*.json
data/vocabularies/frontends.json
```

Update checks that collect the generated snapshot to select the directory from
the generated report's validated provider, not from untrusted issue text.

- [ ] **Step 6: Run submission and workflow tests**

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit provider-routed submission generation**

```powershell
git add -- scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts .github/workflows/generate-project-submission.yml tests/unit/project-submission-admission.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts tests/unit/workflows.test.ts
git commit -m "feat(submissions): generate Codeberg reviews"
```

---

### Task 6: Build, validate, search, and render mixed-provider catalogs

**Files:**

- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/catalog/build.d.mts`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `scripts/catalog/validate.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/select-enrichment-canary.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/project-attribution.ts`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/app/about/page.tsx`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`
- Test: `tests/unit/project-attribution.test.ts`
- Test: `tests/unit/catalog-selectors.test.ts`
- Test: `tests/unit/readme-source.test.ts`
- Test: `tests/unit/enrich-readmes.test.ts`
- Test: `tests/unit/select-enrichment-canary.test.ts`
- Test: `tests/e2e/catalog.spec.ts`

**Interfaces:**

- Consumes: schema-v3 GitHub and Codeberg snapshots.
- Produces: catalog schema v3, provider-aware owner/contributor attribution,
  neutral `watchers` community data, mixed-provider search and rendering.

- [ ] **Step 1: Write failing mixed-provider build and validation tests**

Add a Codeberg record and snapshot fixture. Assert:

```ts
expect(catalog.schemaVersion).toBe(3);
expect(codebergProject).toMatchObject({
  canonicalUrl:
    "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  attribution: {
    owner: { provider: "codeberg", login: "targren" },
    contributors: [
      { provider: "codeberg", login: "helper", botOrAi: false },
    ],
  },
  community: {
    stars: 0,
    forks: 0,
    watchers: 1,
    aggregate: 1,
  },
});
```

Validation must reject:

- a Codeberg record paired with a GitHub snapshot;
- the same project ID appearing in both snapshot directories;
- a repository-backed published record with a snapshot from another provider.

In `tests/unit/enrich-readmes.test.ts`, add an enrichment-loading test that
provides one GitHub and one Codeberg automatic record and asserts both
snapshots reach `enrichRecord`.

In `tests/unit/select-enrichment-canary.test.ts`, assert a healthy automatic
Codeberg record is eligible and a stale Codeberg snapshot is excluded under the
same rules as GitHub.

- [ ] **Step 2: Write failing attribution and search tests**

Update `CatalogContributor` and tests to use:

```ts
interface CatalogAccount {
  provider: "github" | "codeberg";
  login: string;
}
```

Assert attribution accessible text contains `Codeberg repository owner:
targren` and search matches `targren` and Codeberg contributors.

- [ ] **Step 3: Run focused tests and verify the red state**

```powershell
npm.cmd test -- tests/unit/build-catalog.test.ts tests/unit/validate-catalog.test.ts tests/unit/project-attribution.test.ts tests/unit/catalog-selectors.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts tests/unit/select-enrichment-canary.test.ts
```

Expected: FAIL on GitHub-only snapshot loading and runtime fields.

- [ ] **Step 4: Load, validate, and join both snapshot directories**

Replace the single snapshot read with:

```js
async function readOptionalJsonDirectory(path) {
  try {
    return await readJsonDirectory(path);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const [githubSnapshots, codebergSnapshots] = await Promise.all([
  readJsonDirectory("data/snapshots/github"),
  readOptionalJsonDirectory("data/snapshots/codeberg"),
]);
const snapshots = [...githubSnapshots, ...codebergSnapshots];
```

Exclude the GitHub `kits` subdirectory as today. Validate unique project IDs and
`snapshot.provider === record.source.type`.

Apply the same two-directory load to `enrich-readmes.mjs` and
`select-enrichment-canary.mjs`. Preserve automatic-enrichment policy and select
the snapshot directory from the validated record source.

- [ ] **Step 5: Generate provider-neutral runtime fields**

Set `schemaVersion: 3`. Change runtime community from `subscribers` to
`watchers`. Change attribution owner and contributor entries to include
provider. Build canonical URLs from the snapshot URL first and otherwise:

```js
`https://${record.source.type === "github" ? "github.com" : "codeberg.org"}/${record.source.repository}`
```

- [ ] **Step 6: Update rendered and accessible copy**

Use `stars`, `forks`, and `watchers` in card tooltips. Add provider to
attribution tooltip and accessible text without adding a permanent card badge.
Change About-page `creator's own GitHub` wording to `creator-owned
repositories`.

- [ ] **Step 7: Run focused unit and catalog E2E tests**

```powershell
npm.cmd test -- tests/unit/build-catalog.test.ts tests/unit/validate-catalog.test.ts tests/unit/project-attribution.test.ts tests/unit/catalog-selectors.test.ts tests/unit/full-catalog-data.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts tests/unit/select-enrichment-canary.test.ts
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd run test:e2e -- catalog.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit mixed-provider catalog support**

```powershell
git add -- scripts/catalog/build.mjs scripts/catalog/build.d.mts scripts/catalog/validate.mjs scripts/catalog/validate.d.mts scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/select-enrichment-canary.mjs src/features/catalog/catalog-types.ts src/features/catalog/project-attribution.ts src/features/catalog/components/project-card.tsx src/app/about/page.tsx src/generated/catalog.json tests/unit/build-catalog.test.ts tests/unit/validate-catalog.test.ts tests/unit/project-attribution.test.ts tests/unit/catalog-selectors.test.ts tests/unit/full-catalog-data.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts tests/unit/select-enrichment-canary.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat(catalog): publish Codeberg evidence"
```

---

### Task 7: Refresh both providers with isolated budgets and safe workflow paths

**Files:**

- Create: `scripts/catalog/refresh-repositories.mjs`
- Create: `scripts/catalog/refresh-repositories.d.mts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `scripts/catalog/github-refresh-manifest.mjs`
- Modify: `scripts/catalog/github-refresh-manifest.d.mts`
- Modify: `data/schemas/github-refresh.schema.json`
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `scripts/ci/classify-pr-paths.mjs`
- Modify: `scripts/catalog/enrichment-orchestrator.mjs`
- Modify: `scripts/catalog/enrichment-orchestrator.d.mts`
- Test: `tests/unit/github-refresh-manifest.test.ts`
- Test: `tests/unit/incremental-refresh.test.ts`
- Test: `tests/unit/refresh-failure-recovery.test.ts`
- Test: `tests/unit/refresh-github-workflow-safety.test.ts`
- Test: `tests/unit/classify-pr-paths.test.ts`
- Test: `tests/unit/workflows.test.ts`
- Test: `tests/unit/enrichment-orchestrator.test.ts`

**Interfaces:**

- Consumes: provider registry, provider-specific automatic records, and
  schema-v3 snapshots.
- Produces: provider-grouped refresh, isolated usage telemetry, safe staging,
  and the unchanged operator modes `incremental`, `baseline`, `project`, and
  `forensic`.

- [ ] **Step 1: Write failing provider-isolation refresh tests**

Create one GitHub and one Codeberg record. Inject fake providers and assert each
receives only its records. Make Codeberg fail with 429 and assert:

- the GitHub snapshot is still updated;
- the prior Codeberg snapshot is retained with `stale_since`;
- GitHub usage does not include Codeberg requests.

- [ ] **Step 2: Write failing manifest schema tests**

Expect manifest schema version 2:

```ts
expect(manifest.providers).toEqual({
  github: {
    checked: 1,
    changed: 1,
    failed: 0,
    requests: 3,
    remaining: 4997,
  },
  codeberg: {
    checked: 1,
    changed: 0,
    failed: 1,
    requests: 1,
    remaining: 0,
  },
});
```

Keep existing aggregate counts for dashboard compatibility.

- [ ] **Step 3: Write failing workflow and classifier tests**

Assert the content route recognizes
`data/snapshots/codeberg/example.json`, while unknown Codeberg subdirectories,
mixed code/data changes, and renames still select full CI.

Assert refresh staging includes:

```bash
git add data/snapshots/github/*.json
git add data/snapshots/codeberg/*.json
git add data/snapshots/github-refresh.json
```

and does not use `git add data/snapshots/**/*.json`.

Add an enrichment-orchestrator test asserting
`data/snapshots/codeberg/project.json` requires the full enrichment check and
is included in the exact provider-aware staged paths.

- [ ] **Step 4: Run refresh tests and verify the red state**

```powershell
npm.cmd test -- tests/unit/github-refresh-manifest.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/classify-pr-paths.test.ts tests/unit/workflows.test.ts tests/unit/enrichment-orchestrator.test.ts
```

Expected: FAIL on provider grouping, telemetry, and path allowlists.

- [ ] **Step 5: Group refresh work by source provider**

Move provider-neutral orchestration into `refresh-repositories.mjs` and select:

```js
const groups = Map.groupBy(records, (record) => record.source.type);
for (const [providerName, providerRecords] of groups) {
  const provider = repositoryProvider(providerName, clients);
  await refreshProviderGroup(provider, providerRecords, context);
}
```

On runtimes without `Map.groupBy`, use a local reducer with the same result.
Maintain independent request usage and concurrency for each provider. Codeberg
must stop scheduling new calls when its parsed remaining budget reaches the
configured reserve.

Keep `refresh-github.mjs` as a compatibility wrapper that re-exports the
existing public refresh helpers and forwards direct CLI execution to
`refresh-repositories.mjs`. Point `package.json` and `refresh-catalog.yml` at
the new provider-neutral entrypoint.

- [ ] **Step 6: Extend manifest schema and safe staging**

Set refresh manifest `schema_version: 2`, require `providers.github` and
`providers.codeberg`, and preserve aggregate `counts`, `snapshot_changes`, and
`deployment_requested`.

Update workflows and classifier allowlists with exact Codeberg snapshot paths.
Update enrichment orchestration dirty-path detection, checks, and staging with
the same exact Codeberg directory. Do not broaden it to an arbitrary snapshot
glob.

- [ ] **Step 7: Run refresh and workflow tests**

Run the Step 4 command.

Expected: PASS.

- [ ] **Step 8: Commit provider-aware refresh automation**

```powershell
git add -- scripts/catalog/refresh-repositories.mjs scripts/catalog/refresh-repositories.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/catalog/github-refresh-manifest.mjs scripts/catalog/github-refresh-manifest.d.mts scripts/catalog/enrichment-orchestrator.mjs scripts/catalog/enrichment-orchestrator.d.mts scripts/ci/classify-pr-paths.mjs data/schemas/github-refresh.schema.json data/snapshots/github-refresh.json .github/workflows/refresh-catalog.yml .github/workflows/ci.yml package.json tests/unit/github-refresh-manifest.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/classify-pr-paths.test.ts tests/unit/workflows.test.ts tests/unit/enrichment-orchestrator.test.ts
git commit -m "feat(catalog): refresh Codeberg sources"
```

---

### Task 8: Prove submission UX, rendered behavior, live API compatibility, and the full gate

**Files:**

- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/architecture/catalog-data-model.md`
- Move: `docs/reference/github-snapshot-schema.md` to `docs/reference/repository-snapshot-schema.md`
- Modify: `docs/reference/README.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `tests/unit/project-submission-docs.test.ts`
- Modify: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/visual/theme.visual.spec.ts`
- Update: affected visual snapshots only if rendered copy changes them

**Interfaces:**

- Consumes: completed Codeberg source, submission, catalog, and refresh paths.
- Produces: public documentation, rendered desktop/mobile evidence, a
  read-only live smoke result, and full repository verification.

- [ ] **Step 1: Write failing documentation and E2E copy tests**

Assert issue-form and builder copy says:

```text
Frontends and Extensions require a public GitHub or Codeberg repository.
```

Add a project-submission E2E case that fills:

```text
https://codeberg.org/targren/Lumiverse-SwipeScrubber
```

and asserts the prefilled GitHub issue manifest preserves that URL.

- [ ] **Step 2: Add a rendered Codeberg card fixture and assertions**

Use a deterministic Codeberg project fixture. Assert:

- card body links to Codeberg;
- attribution accessible text names Codeberg;
- search finds `targren`;
- community tooltip says watchers, not subscribers;
- desktop and mobile cards have no clipped content.

- [ ] **Step 3: Run focused UI and documentation tests in red**

```powershell
npm.cmd test -- tests/unit/project-submission-docs.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-attribution.test.ts
npm.cmd run test:e2e -- project-submission.spec.ts catalog.spec.ts
```

Expected: FAIL until copy, docs, and fixtures are updated.

- [ ] **Step 4: Update public and operator documentation**

Document:

- accepted GitHub and Codeberg repository forms;
- provider-local duplicate behavior;
- Codeberg snapshot path;
- snapshot schema v3 provider and neutral community fields;
- derived Codeberg contributor evidence;
- provider-level refresh telemetry;
- stale-state and rate-limit operations;
- no arbitrary Forgejo or cross-provider mirror inference.

Use `apply_patch` to move
`docs/reference/github-snapshot-schema.md` to
`docs/reference/repository-snapshot-schema.md` while changing its title and
provider-specific wording in the same patch.

Run this exact search and update every returned documentation link:

```powershell
rg -n "github-snapshot-schema" docs README.md
```

The completed search must return no stale references.

- [ ] **Step 5: Run focused unit, E2E, and visual suites**

```powershell
npm.cmd test -- tests/unit/project-submission-docs.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-attribution.test.ts
npm.cmd run test:e2e -- project-submission.spec.ts catalog.spec.ts
npm.cmd run test:visual
```

Expected: PASS. If only approved copy snapshots differ, update those exact
baselines, inspect them, and rerun without update mode.

- [ ] **Step 6: Run the read-only live Codeberg smoke**

Add a non-default CLI smoke option to the Codeberg provider:

```powershell
node scripts/catalog/codeberg-repository-provider.mjs --smoke targren/Lumiverse-SwipeScrubber
```

Expected output contains:

```text
provider=codeberg
repository_id=1699613
repository=targren/Lumiverse-SwipeScrubber
public=true
head_sha=111978ba6fcbc5236c060be2b2ad7484833145b9
```

The exact head SHA is evidence from 2026-07-27 and may advance. If it differs,
verify the new SHA through the same Codeberg API response; do not loosen
identity, visibility, or 40-hex validation.

- [ ] **Step 7: Run the complete repository gate**

```powershell
npm.cmd run format
npm.cmd run check
git diff --check
git status --short
```

Expected: formatting and every repository check pass; `git diff --check`
prints nothing; status contains only planned Codeberg implementation,
fixtures, generated catalog, documentation, and approved visual snapshots.

- [ ] **Step 8: Commit end-to-end proof and documentation**

```powershell
git add -- .github/ISSUE_TEMPLATE/01-project-submission.yml docs/contributing/submission-and-review.md docs/architecture/catalog-data-model.md docs/reference/repository-snapshot-schema.md docs/reference/README.md docs/maintenance/operations-runbook.md tests/unit/project-submission-docs.test.ts tests/e2e/project-submission.spec.ts tests/e2e/catalog.spec.ts tests/visual/theme.visual.spec.ts tests/visual/theme.visual.spec.ts-snapshots
git commit -m "test(codeberg): prove provider support"
```

Stage visual snapshot paths only when the inspected baseline actually changed.

---

## Completion Criteria

- Exact public Codeberg repository URLs pass the static builder and admission.
- Issue #66's repository resolves to permanent Codeberg ID `1699613`.
- Generated maintainer-review PRs include a canonical Codeberg record and
  schema-v3 Codeberg snapshot.
- GitHub and Codeberg produce the same normalized repository evidence shape.
- Codeberg activity, community, release, size, license, owner, and contributor
  evidence are fully automated.
- Contributor attribution never exposes unlinked commit author names or email.
- Same-provider duplicates are blocked; cross-provider sources remain distinct.
- Global project-ID collisions stop generation instead of overwriting records.
- Mixed-provider catalog validation, build, search, sorting, Kits, and cards
  work without runtime API calls.
- Scheduled refresh isolates provider budgets and retains stale Codeberg
  evidence on recoverable failure.
- CI treats recognized Codeberg submission snapshots like existing project
  content and fails closed for unknown or mixed changes.
- Deterministic unit, E2E, visual, catalog, build, and full checks pass.
- A read-only live smoke verifies the reporter's current Codeberg repository.
- Issue #66 is closed only after the deployed submission flow successfully
  processes the repository.
