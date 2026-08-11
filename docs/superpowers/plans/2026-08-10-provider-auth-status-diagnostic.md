# Provider Authentication Status Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Tavernary's stable provider-authentication error while safely distinguishing upstream HTTP 401 from HTTP 403.

**Architecture:** Extend the existing `EnrichmentProviderError.diagnosticCode` field at the HTTP status-classification boundary. Authentication responses remain unread and cancelled; only a fixed token derived from the numeric status enters the error object and Actions logs.

**Tech Stack:** Node.js 24, JavaScript ESM, TypeScript/Vitest tests, GitHub Actions

## Global Constraints

- Keep `provider-authentication-failed` as the stable error code.
- Emit only `http-401` or `http-403`; never read or expose authentication response bodies.
- Do not change retry, provider routing, workflow secrets, models, or public catalog copy.
- Work in the isolated `codex/provider-auth-status-diagnostic` worktree and preserve the dirty primary checkout.

---

### Task 1: Attach safe HTTP status diagnostics

**Files:**
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Test: `tests/unit/enrichment-provider.test.ts`

**Interfaces:**
- Consumes: `EnrichmentProviderError(code, diagnosticCode, details)` and `statusError(response, maximumBytes)`.
- Produces: authentication errors with `code === "provider-authentication-failed"` and `diagnosticCode === "http-401" | "http-403"`.

- [ ] **Step 1: Write the failing tests**

Add a parameterized test with HTTP 401 and 403 responses whose bodies contain a private marker. For each status, assert the thrown error matches:

```ts
{
  code: "provider-authentication-failed",
  diagnosticCode: `http-${status}`,
}
```

Also assert the response body is cancelled and `JSON.stringify(error)` does not contain the private marker.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-provider.test.ts
```

Expected: FAIL because authentication errors currently have `diagnosticCode: null`.

- [ ] **Step 3: Implement the minimal status mapping**

Change only the 401/403 branch in `statusError`:

```js
if (status === 401 || status === 403) {
  await cancelResponseBody(response);
  return new EnrichmentProviderError(
    "provider-authentication-failed",
    `http-${status}`,
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-provider.test.ts
```

Expected: all tests in the file pass with no private marker in errors.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, type checking, unit tests, catalog/security validation, build, and static export all pass.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- scripts/catalog/enrichment-provider.mjs tests/unit/enrichment-provider.test.ts
git commit -m "fix(provider): expose auth status safely"
```

- [ ] **Step 7: Publish and verify live diagnostic**

Push the branch, open a PR, wait for all required checks, merge to `main`, then dispatch only issue #504 with `force_regeneration=false`. Confirm the run reports `http-401` or `http-403` without response content before deciding the next provider action.
