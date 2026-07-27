# Disabled Fork Pull Requests Contributors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project submission generation complete when a GitHub fork has pull requests disabled while preserving owner attribution and rejecting unrelated 404 responses.

**Architecture:** Keep `fetchForkContributors` as the fork attribution boundary. On a pull-request 404, use the same authenticated fetch client to inspect repository metadata; only `has_pull_requests: false` converts the scan into a successful empty/current result. The ordinary contributors endpoint remains unused for forks.

**Tech Stack:** Node.js 24, JavaScript ES modules, TypeScript declaration files, Vitest

## Global Constraints

- Fork attribution continues to use merged pull-request authors rather than inherited repository contributors.
- The repository owner remains separate from additional contributors.
- Only an explicit repository metadata value of `has_pull_requests: false` suppresses the pull-request 404.
- The metadata probe counts as a GitHub request.
- No schema or catalog-data changes.

---

### Task 1: Handle Disabled Pull Requests in Fork Contributor Discovery

**Files:**
- Modify: `scripts/catalog/github-contributors.mjs:35-260`
- Test: `tests/unit/github-contributors.test.ts:153-370`

**Interfaces:**
- Consumes: `fetchForkContributors(repository, options)` and the injected `options.fetchImpl`.
- Produces: The existing `ForkContributorCollection` shape with `accounts`, `requestCount`, `baselineCompletedAt`, `refreshedAt`, and `scan`.

- [ ] **Step 1: Write the disabled-pull-request regression test**

Add one test after the existing merged-fork-author test:

```ts
test("completes fork attribution when pull requests are disabled", async () => {
  const urls: string[] = [];
  const result = await fetchForkContributors(
    { owner: "vadash", name: "Extension-Summaryception" },
    {
      token: "test-token",
      now: "2026-07-27T00:00:00.000Z",
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (urls.length === 1) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
          });
        }
        return new Response(JSON.stringify({ has_pull_requests: false }), {
          status: 200,
        });
      },
    },
  );

  expect(urls).toEqual([
    "https://api.github.com/repos/vadash/Extension-Summaryception/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1",
    "https://api.github.com/repos/vadash/Extension-Summaryception",
  ]);
  expect(result).toEqual({
    accounts: [],
    requestCount: 2,
    baselineCompletedAt: "2026-07-27T00:00:00.000Z",
    refreshedAt: "2026-07-27T00:00:00.000Z",
    scan: null,
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/github-contributors.test.ts -t "completes fork attribution when pull requests are disabled"
```

Expected: FAIL with `GitHub contributors returned 404` after the first request.

- [ ] **Step 3: Implement the authenticated metadata probe**

Add a repository URL helper beside `forkPullsUrl`:

```js
function repositoryUrl({ owner, name }) {
  return (
    `${githubApi}/repos/${encodeURIComponent(owner)}/` +
    encodeURIComponent(name)
  );
}
```

Add a focused helper that probes only after a pull-request 404:

```js
async function pullRequestsDisabled(repository, options) {
  const response = await (options.fetchImpl ?? fetch)(repositoryUrl(repository), {
    headers: githubHeaders(options.token),
  });
  if (!response.ok) return false;
  let metadata;
  try {
    metadata = await response.json();
  } catch {
    return false;
  }
  return metadata?.has_pull_requests === false;
}
```

In `fetchForkContributors`, when the pull-request response is a 404, increment
`requestCount`, call the helper, and return the existing completed collection
shape if pull requests are explicitly disabled. Otherwise throw the original
contributor error with the total request count.

- [ ] **Step 4: Run the focused contributor suite and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/github-contributors.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add a regression test preserving unrelated 404 failures**

```ts
test("preserves a fork 404 when repository metadata does not disable pull requests", async () => {
  let requests = 0;
  await expect(
    fetchForkContributors(
      { owner: "owner", name: "missing-fork" },
      {
        token: "test-token",
        now: "2026-07-27T00:00:00.000Z",
        fetchImpl: async () => {
          requests += 1;
          return requests === 1
            ? new Response(JSON.stringify({ message: "Not Found" }), {
                status: 404,
              })
            : new Response(JSON.stringify({ has_pull_requests: true }), {
                status: 200,
              });
        },
      },
    ),
  ).rejects.toMatchObject({
    message: "GitHub contributors returned 404",
    status: 404,
    requestCount: 2,
  });
});
```

- [ ] **Step 6: Run the new preservation test and verify it passes**

Run:

```powershell
npx.cmd vitest run tests/unit/github-contributors.test.ts -t "preserves a fork 404"
```

Expected: PASS because the implementation distinguishes disabled pull requests
from other not-found conditions.

- [ ] **Step 7: Run submission and type verification**

Run:

```powershell
npx.cmd vitest run tests/unit/github-contributors.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/refresh-github-contributors.test.ts
npm.cmd run typecheck
npm.cmd run format:check
```

Expected: all tests and checks pass with no warnings.

- [ ] **Step 8: Commit the fix**

```powershell
git add scripts/catalog/github-contributors.mjs tests/unit/github-contributors.test.ts
git commit -m "fix: handle disabled fork pull requests"
```
