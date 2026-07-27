# Reddit URL Triage Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit structurally valid Reddit post permalinks even when Reddit blocks anonymous GitHub Actions traffic with HTTP 403.

**Architecture:** Keep the existing Reddit identity parser as the authority for permalink validity and canonicalization. In source inspection, return a successful structural probe for parsed Reddit post identities instead of making an unreliable anonymous network request; GitHub and generic external sources retain their existing validation paths.

**Tech Stack:** Node.js 24, ECMAScript modules, Vitest, GitHub Actions.

## Global Constraints

- Do not weaken validation for non-Reddit external sources.
- Do not add Reddit credentials, OAuth, scraping, or browser impersonation.
- Preserve canonical Reddit identity and duplicate-detection behavior.
- Re-triage issue #21 after the fix reaches `main`.

---

### Task 1: Lock the Reddit permalink behavior with a regression test

**Files:**
- Modify: `tests/unit/triage-issue.test.ts`

**Interfaces:**
- Consumes: `inspectProjectSubmissionSource(manifest, { request, probe })`.
- Produces: A regression test proving a valid Reddit permalink is accepted without calling `probe`.

- [ ] **Step 1: Import the source inspection function**

Add `inspectProjectSubmissionSource` to the existing import from `scripts/submissions/triage-issue.mjs`.

- [ ] **Step 2: Write the failing test**

```ts
test("accepts Reddit permalinks without an anonymous availability probe", async () => {
  const result = await inspectProjectSubmissionSource(
    {
      schema_version: 1,
      project_type: "preset",
      source_url:
        "https://old.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
      name: "Writer's Block 5",
      description: "A narrative-focused preset.",
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    },
    {
      request: vi.fn(),
      probe: async () => {
        throw new Error("Reddit availability probe must not run.");
      },
    },
  );

  expect(result).toMatchObject({
    identity: {
      kind: "reddit",
      postId: "1v64r6z",
      canonicalUrl:
        "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
    },
    sourceProbe: { status: "ok", httpStatus: null },
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/unit/triage-issue.test.ts`

Expected: FAIL because the current implementation calls `probe` and reports HTTP 403 as `source-unavailable`.

### Task 2: Bypass unreliable network probing for parsed Reddit posts

**Files:**
- Modify: `scripts/submissions/admission.d.mts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Test: `tests/unit/triage-issue.test.ts`

**Interfaces:**
- Consumes: `parseSourceIdentity()` returning `{ kind: "reddit", canonicalUrl, postId, subreddit, slug }`.
- Produces: `inspectProjectSubmissionSource()` returning `{ identity, sourceProbe: { status: "ok", httpStatus: null } }` for Reddit posts.

- [ ] **Step 1: Implement the minimal Reddit branch**

After resolving the parsed identity and before the generic external probe, return structural success for `parsed.kind === "reddit"`:

```js
if (parsed.kind === "reddit") {
  return {
    identity,
    sourceProbe: { status: "ok", httpStatus: null },
  };
}
```

- [ ] **Step 2: Represent structural success without a fake HTTP status**

Allow `SourceProbeDecision` success records to use `httpStatus: number | null`, where `null` means the source identity was accepted without an HTTP probe.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm.cmd test -- tests/unit/triage-issue.test.ts`

Expected: PASS.

- [ ] **Step 4: Run adjacent source-identity tests**

Run: `npm.cmd test -- tests/unit/source-identity.test.ts tests/unit/triage-issue.test.ts`

Expected: PASS with no failures.

### Task 3: Verify, publish, and exercise the live workflow

**Files:**
- Verify: `scripts/submissions/triage-issue.mjs`
- Verify: `tests/unit/triage-issue.test.ts`

**Interfaces:**
- Consumes: Repository quality gates and `triage-submission.yml` workflow dispatch.
- Produces: Deployed default-branch behavior and a reprocessed issue #21.

- [ ] **Step 1: Run repository verification**

Run: `npm.cmd run check`

Expected: formatting, lint, palette audit, catalog validation/build, TypeScript, all unit tests, production build, and static-export verification exit 0.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check` and `git diff -- scripts/submissions/triage-issue.mjs tests/unit/triage-issue.test.ts`

Expected: no whitespace errors and only the scoped behavior/test changes.

- [ ] **Step 3: Commit and publish**

```powershell
git add docs/superpowers/plans/2026-07-26-reddit-url-triage.md scripts/submissions/admission.d.mts scripts/submissions/triage-issue.mjs tests/unit/triage-issue.test.ts
git commit -m "fix(submissions): accept Reddit permalinks"
git push -u origin agent/reddit-url-triage
```

Open and merge a focused pull request into `main`.

- [ ] **Step 4: Re-run issue #21 triage**

Dispatch `triage-submission.yml` on `main` with `issue_number=21`.

- [ ] **Step 5: Verify the live issue outcome**

Confirm issue #21 no longer has `needs-information`, receives the admitted/review state, and no longer reports the Reddit 403 as submitter-correctable information.
