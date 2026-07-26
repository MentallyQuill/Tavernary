# Project Submission Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every admissible project-submission issue into one complete,
correctable review pull request while resolving duplicates and correctable
intake failures before PR creation.

**Architecture:** Keep GitHub Issues as intake and generated pull requests as
the sole maintainer review surface. A read-mostly issue triage workflow parses a
shared manifest, normalizes source identity, synchronizes titles and labels,
and dispatches a separate privileged generation workflow only after admission.
Focused Node modules reuse Tavernary's existing GitHub observer, snapshot,
enrichment, catalog validation, CI, and Pages boundaries.

**Tech Stack:** Next.js static export, React 19, TypeScript, Node.js 24 ESM,
GitHub Actions, GitHub REST/GraphQL APIs, Vitest, Testing Library, Playwright,
AJV, Prettier.

## Global Constraints

- Tavernary remains static and build-time: no accounts, runtime database,
  runtime API, or project hosting.
- Frontends and Extensions require a public GitHub repository.
- System Presets may use GitHub or another stable public HTTPS URL.
- The issue is intake; the generated PR is the only maintainer review surface.
- Submitted repositories are never cloned, installed, imported, or executed.
- User text, URLs, repository metadata, README text, and model input are
  untrusted data.
- One issue owns one deterministic branch and at most one open generated PR.
- Automation never force-pushes over maintainer edits.
- `src/generated/catalog.json` remains ignored and must not be committed.
- Canonical records live in `data/registry/projects/*.json`.
- GitHub snapshots live in `data/snapshots/github/*.json`.
- JSON writes use `scripts/catalog/json-format.mjs`.
- GitHub Actions use Node 24 and pinned first-party action SHAs.
- Use `npm.cmd` in local Windows verification commands.
- Preserve unrelated worktree changes and stage only files named by each task.
- Do not create or switch branches during implementation unless the user
  explicitly approves it.

---

## File Structure

### Browser submission experience

- `src/app/submit/project/page.tsx` — static route that supplies current
  frontend choices to the client builder.
- `src/features/submissions/components/project-submission-builder.tsx` —
  conditional accessible form UI.
- `src/features/submissions/project-submission-manifest.mjs` — shared manifest
  normalization and validation used by browser and workflow code.
- `src/features/submissions/project-submission-manifest.d.mts` — exact shared
  manifest types.
- `src/features/submissions/submission-transport.ts` — safe GitHub issue-form
  handoff with URL-length fallback.
- `src/styles/submission.css` — route-local visual treatment in Tavernary's
  production visual language.

### Intake and source identity

- `scripts/submissions/parse-project-submission.mjs` — issue-body headings and
  embedded manifest parsing.
- `scripts/submissions/source-identity.mjs` — GitHub, Reddit, and generic URL
  canonical identity and generated titles.
- `scripts/submissions/safe-source-fetch.mjs` — bounded HTTPS probes and safe
  redirect/DNS policy.
- `scripts/submissions/frontend-reconciliation.mjs` — current vocabulary,
  aliases, close matches, and new-Frontend vocabulary proposals.
- `scripts/submissions/admission.mjs` — pure admission decision matrix.
- Matching `.d.mts` files — public interfaces for TypeScript tests and clients.

### Candidate generation and pull-request lifecycle

- `scripts/catalog/repository-snapshot.mjs` — reusable API-only snapshot
  composition extracted from refresh code.
- `scripts/submissions/draft-project-record.mjs` — canonical record,
  enrichment fallback, and optional vocabulary proposal.
- `scripts/submissions/generate-project-submission.mjs` — issue-to-files
  orchestration with no Git operations.
- `scripts/submissions/project-submission-pr.mjs` — branch/PR state,
  generated-head markers, conflict detection, and PR body rendering.
- `scripts/submissions/project-submission-lifecycle.mjs` — merged/declined
  issue and branch cleanup decisions.

### Workflows

- `.github/workflows/triage-submission.yml` — issue event, title/label/comment
  synchronization, and admitted-generation dispatch.
- `.github/workflows/generate-project-submission.yml` — privileged issue-number
  dispatch, source inspection, file generation, branch/PR update, and CI
  dispatch.
- `.github/workflows/project-submission-lifecycle.yml` — unmerged decline and
  safe branch cleanup.

---

### Task 1: Define the shared submission manifest and fallback issue form

**Files:**

- Create: `src/features/submissions/project-submission-manifest.mjs`
- Create: `src/features/submissions/project-submission-manifest.d.mts`
- Create: `scripts/submissions/parse-project-submission.mjs`
- Create: `scripts/submissions/parse-project-submission.d.mts`
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Test: `tests/unit/project-submission-manifest.test.ts`
- Test: `tests/unit/issue-forms.test.ts`

**Interfaces:**

- Produces:
  `normalizeProjectSubmissionManifest(value: unknown): ManifestValidation`
- Produces:
  `serializeProjectSubmissionManifest(manifest: ProjectSubmissionManifest): string`
- Produces:
  `parseProjectSubmissionIssue(body: string): ProjectSubmissionParseResult`
- `ProjectSubmissionManifest` has exact fields:

```ts
interface ProjectSubmissionManifest {
  schema_version: 1;
  project_type: "frontend" | "extension" | "preset";
  source_url: string;
  name: string | null;
  description: string | null;
  frontends: {
    known_ids: string[];
    other: Array<{ name: string; url: string }>;
  };
  frontend_independent: boolean;
  additional_context: string | null;
}
```

- `ManifestValidation` is
  `{ valid: true; manifest: ProjectSubmissionManifest }` or
  `{ valid: false; errors: string[] }`.
- `ProjectSubmissionParseResult` adds
  `source: "manifest" | "headings"` to `ManifestValidation`.

- [ ] **Step 1: Write failing manifest tests**

Add focused cases that prove normalization, duplicate frontend removal,
frontend-kind self handling, and external-preset required copy:

```ts
test("normalizes a builder manifest without trusting whitespace", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 1,
      project_type: "extension",
      source_url: " https://github.com/Owner/Repo ",
      name: " Example ",
      description: "",
      frontends: {
        known_ids: ["sillytavern", "sillytavern"],
        other: [],
      },
      frontend_independent: false,
      additional_context: " ",
    }),
  ).toEqual({
    valid: true,
    manifest: {
      schema_version: 1,
      project_type: "extension",
      source_url: "https://github.com/Owner/Repo",
      name: "Example",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    },
  });
});

test("requires name and description for an external preset", () => {
  const result = normalizeProjectSubmissionManifest({
    schema_version: 1,
    project_type: "preset",
    source_url: "https://example.com/preset",
    name: null,
    description: null,
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
  });
  expect(result).toMatchObject({ valid: false });
  expect(result.errors).toEqual(
    expect.arrayContaining([
      "External System Presets require a project name.",
      "External System Presets require a short description.",
    ]),
  );
});
```

- [ ] **Step 2: Run the manifest tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts
```

Expected: FAIL because the manifest module does not exist.

- [ ] **Step 3: Implement the manifest contract**

Implement one pure normalizer. Keep URL reachability and frontend vocabulary
lookups out of this module:

```js
export function normalizeProjectSubmissionManifest(value) {
  const errors = [];
  const projectType = value?.project_type;
  const sourceUrl =
    typeof value?.source_url === "string" ? value.source_url.trim() : "";
  const name = nullableText(value?.name);
  const description = nullableText(value?.description);
  const knownIds = uniqueStrings(value?.frontends?.known_ids);
  const other = normalizeOtherFrontends(value?.frontends?.other);
  const frontendIndependent = value?.frontend_independent === true;

  if (value?.schema_version !== 1)
    errors.push("Submission manifest must use schema version 1.");
  if (!["frontend", "extension", "preset"].includes(projectType))
    errors.push("Project type is invalid.");
  if (!sourceUrl) errors.push("Project URL is required.");
  if (projectType === "frontend" && (knownIds.length || other.length))
    errors.push("Frontend submissions cannot declare supported frontends.");
  if (projectType === "extension" && frontendIndependent)
    errors.push("Extensions cannot be marked frontend-independent.");
  if (
    projectType === "extension" &&
    knownIds.length === 0 &&
    other.length === 0
  )
    errors.push("Extensions require at least one supported frontend.");

  // Parse URL syntax only to identify external-preset field requirements.
  const github = githubRepositoryShape(sourceUrl);
  if (projectType === "preset" && !github && !name)
    errors.push("External System Presets require a project name.");
  if (projectType === "preset" && !github && !description)
    errors.push("External System Presets require a short description.");

  return errors.length
    ? { valid: false, errors: [...new Set(errors)] }
    : {
        valid: true,
        manifest: {
          schema_version: 1,
          project_type: projectType,
          source_url: sourceUrl,
          name,
          description,
          frontends: { known_ids: knownIds, other },
          frontend_independent: frontendIndependent,
          additional_context: nullableText(value?.additional_context),
        },
      };
}
```

- [ ] **Step 4: Add issue-body parsing tests**

Test both an embedded `Project manifest` JSON block and fallback readable
headings. A non-empty embedded manifest is authoritative: invalid JSON or an
invalid manifest produces an error instead of silently falling back to
different readable-heading values. Empty or `_No response_` manifest content
uses the fallback headings:

```ts
test("parses the fallback form into the shared contract", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
Extension
### Project URL
https://github.com/Owner/Repo
### Project Name
Example
### Short Description
_No response_
### Supported frontends
SillyTavern, https://github.com/prolix-oc/Lumiverse
### Frontend-independent
No
### Anything we should know?
_No response_
`);
  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      project_type: "extension",
      source_url: "https://github.com/Owner/Repo",
    },
  });
});
```

- [ ] **Step 5: Implement parsing and update the fallback form**

The fallback form must contain these IDs in order:

```yaml
- project-type
- project-url
- project-name
- project-description
- supported-frontends
- frontend-independent
- additional-context
- project-manifest
```

Use a textarea for `supported-frontends` with instructions to enter comma- or
newline-separated names/URLs. Use a dropdown with `No` and `Yes` for
`frontend-independent`. Keep `project-manifest` optional and explain that
Tavernary's builder fills it automatically.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts tests/unit/issue-forms.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the manifest contract**

```powershell
git add -- .github/ISSUE_TEMPLATE/01-project-submission.yml src/features/submissions/project-submission-manifest.mjs src/features/submissions/project-submission-manifest.d.mts scripts/submissions/parse-project-submission.mjs scripts/submissions/parse-project-submission.d.mts tests/unit/project-submission-manifest.test.ts tests/unit/issue-forms.test.ts
git commit -m "feat(submissions): define project manifest"
```

---

### Task 2: Add canonical source identity and generated issue titles

**Files:**

- Create: `scripts/submissions/source-identity.mjs`
- Create: `scripts/submissions/source-identity.d.mts`
- Test: `tests/unit/source-identity.test.ts`
- Modify: `scripts/submissions/validate-submission.mjs`
- Modify: `scripts/submissions/validate-submission.d.mts`
- Test: `tests/unit/validate-submission.test.ts`

**Interfaces:**

- Produces:
  `parseSourceIdentity(url: string): ParsedSourceIdentity`
- Produces:
  `resolveSourceIdentity(parsed, options): Promise<SourceIdentity>`
- Produces:
  `sourceDuplicateKeys(identity: SourceIdentity): string[]`
- Produces:
  `projectSubmissionTitle(identity: SourceIdentity): string`
- `SourceIdentity` is the discriminated union:

```ts
type SourceIdentity =
  | {
      kind: "github";
      canonicalUrl: string;
      repository: string;
      repositoryId: number | null;
      owner: string;
      name: string;
    }
  | {
      kind: "reddit";
      canonicalUrl: string;
      postId: string;
      subreddit: string | null;
      slug: string | null;
    }
  | {
      kind: "external";
      canonicalUrl: string;
      hostname: string;
      pathSlug: string;
    };
```

- Consumes the existing project registry only as data; this module never reads
  files or calls GitHub by itself.

- [ ] **Step 1: Write the identity matrix tests**

Cover GitHub casing/`.git`, generic fragment removal, Reddit host variants,
`redd.it`, and stable post-ID identity:

```ts
test.each([
  "https://reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://www.reddit.com/r/SillyTavernAI/comments/abc123/other/",
  "https://old.reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://new.reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://m.reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://redd.it/abc123",
])("uses Reddit post ID as duplicate identity for %s", (url) => {
  const identity = parseSourceIdentity(url);
  expect(sourceDuplicateKeys(identity)).toContain("reddit-post:abc123");
});

test("normalizes GitHub repository identity and title", () => {
  const identity = parseSourceIdentity(
    "https://github.com/MentallyQuill/Recursion.git/",
  );
  expect(identity).toMatchObject({
    kind: "github",
    repository: "MentallyQuill/Recursion",
    canonicalUrl: "https://github.com/MentallyQuill/Recursion",
  });
  expect(projectSubmissionTitle(identity)).toBe(
    "[Project submission] MentallyQuill/Recursion",
  );
});
```

- [ ] **Step 2: Run the identity tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/source-identity.test.ts
```

Expected: FAIL because the identity module does not exist.

- [ ] **Step 3: Implement synchronous parsing and titles**

Implement explicit host routing. Reject credentials, non-HTTPS protocols,
GitHub URLs that are not exactly `owner/repository`, and malformed Reddit
permalinks. Humanize Reddit slugs by replacing `_` and `-`, collapsing spaces,
and title-casing without changing the stable post ID.

```js
export function sourceDuplicateKeys(identity) {
  if (identity.kind === "github") {
    return [
      `url:${identity.canonicalUrl.toLowerCase()}`,
      `github-repository:${identity.repository.toLowerCase()}`,
      ...(identity.repositoryId
        ? [`github-id:${identity.repositoryId}`]
        : []),
    ];
  }
  if (identity.kind === "reddit") {
    return [`reddit-post:${identity.postId.toLowerCase()}`];
  }
  return [`url:${identity.canonicalUrl}`];
}
```

- [ ] **Step 4: Replace duplicate URL logic in submission validation**

Change `validateSubmission` to consume normalized duplicate keys rather than
its private `canonicalSource` function:

```ts
validateSubmission({
  projectType,
  identity,
  existingIdentities,
}: {
  projectType: ProjectSubmissionManifest["project_type"];
  identity: SourceIdentity;
  existingIdentities: SourceIdentity[];
}): {
  duplicate: boolean;
  errors: string[];
};
```

Keep source eligibility exact: GitHub for Frontend/Extension; GitHub or external
HTTPS for Preset.

- [ ] **Step 5: Run identity and validation tests**

Run:

```powershell
npm.cmd test -- tests/unit/source-identity.test.ts tests/unit/validate-submission.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit source identity**

```powershell
git add -- scripts/submissions/source-identity.mjs scripts/submissions/source-identity.d.mts scripts/submissions/validate-submission.mjs scripts/submissions/validate-submission.d.mts tests/unit/source-identity.test.ts tests/unit/validate-submission.test.ts
git commit -m "feat(submissions): normalize source identity"
```

---

### Task 3: Implement bounded external URL and Reddit share-link resolution

**Files:**

- Create: `scripts/submissions/safe-source-fetch.mjs`
- Create: `scripts/submissions/safe-source-fetch.d.mts`
- Test: `tests/unit/safe-source-fetch.test.ts`
- Modify: `scripts/submissions/source-identity.mjs`
- Modify: `scripts/submissions/source-identity.d.mts`
- Test: `tests/unit/source-identity.test.ts`

**Interfaces:**

- Produces:
  `safeProbe(url: string, options: SafeProbeOptions): Promise<SafeProbeResult>`
- Produces:
  `resolveRedditShareIdentity(parsed, options): Promise<SourceIdentity>`
- `SafeProbeOptions` injects `fetchImpl`, `lookup`, `timeoutMs`,
  `maxRedirects`, `maxBytes`, and `allowedRedirectHosts`.
- `SafeProbeResult` contains `finalUrl`, `status`, `contentType`,
  `contentLength`, and ordered `redirects`.

- [ ] **Step 1: Write failing SSRF and redirect tests**

Use injected DNS and fetch fixtures; never make real network calls:

```ts
test.each([
  "http://example.com/file",
  "https://user:pass@example.com/file",
  "https://127.0.0.1/file",
  "https://[::1]/file",
  "https://example.com:8443/file",
])("rejects unsafe source URL %s", async (url) => {
  await expect(safeProbe(url, fixtures())).rejects.toThrow(
    /safe public HTTPS source/iu,
  );
});

test("rejects a Reddit share redirect leaving trusted hosts", async () => {
  await expect(
    resolveRedditShareIdentity(
      parseSourceIdentity("https://reddit.com/r/Test/s/share123"),
      redirectFixtures(["https://evil.example/post"]),
    ),
  ).rejects.toMatchObject({ code: "reddit-share-unresolved" });
});
```

- [ ] **Step 2: Run safe-fetch tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/safe-source-fetch.test.ts tests/unit/source-identity.test.ts
```

Expected: FAIL because `safeProbe` is missing.

- [ ] **Step 3: Implement URL and DNS safety**

Use explicit redirect handling (`redirect: "manual"`), an abort timeout, a
maximum of three redirects, and a 256 KiB response ceiling. Validate the
hostname before every request and every `Location` transition. Reject private,
loopback, link-local, multicast, documentation, and reserved IPv4/IPv6 ranges.
Permit only port 443 or no explicit port.

```js
for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
  await assertPublicHttps(current, { lookup });
  const response = await fetchImpl(current, {
    method: "GET",
    redirect: "manual",
    headers: { Range: `bytes=0-${maxBytes - 1}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!redirectStatus(response.status)) return summarize(response, current);
  const next = new URL(requiredLocation(response), current);
  assertAllowedTransition(current, next, allowedRedirectHosts);
  redirects.push(next.toString());
  current = next;
}
throw sourceError("too-many-redirects");
```

- [ ] **Step 4: Add trusted Reddit `/s/` resolution**

Recognize `/r/<subreddit>/s/<token>` as unresolved Reddit input. Resolve only
through `reddit.com`, `www`, `old`, `new`, `m`, and `redd.it`; require the final
identity to contain a stable post ID. Map timeout, off-host, malformed-final,
and redirect-limit failures to `reddit-share-unresolved`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/safe-source-fetch.test.ts tests/unit/source-identity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit safe source resolution**

```powershell
git add -- scripts/submissions/safe-source-fetch.mjs scripts/submissions/safe-source-fetch.d.mts scripts/submissions/source-identity.mjs scripts/submissions/source-identity.d.mts tests/unit/safe-source-fetch.test.ts tests/unit/source-identity.test.ts
git commit -m "feat(submissions): probe sources safely"
```

---

### Task 4: Reconcile frontend selections and propose new frontend vocabulary

**Files:**

- Create: `scripts/submissions/frontend-reconciliation.mjs`
- Create: `scripts/submissions/frontend-reconciliation.d.mts`
- Test: `tests/unit/frontend-reconciliation.test.ts`

**Interfaces:**

- Produces:
  `reconcileFrontends(input: FrontendReconciliationInput): FrontendResolution`
- Produces:
  `proposeFrontendVocabularyEntry(input): FrontendVocabularyProposal`
- `FrontendResolution` is:

```ts
type FrontendResolution =
  | { status: "resolved"; ids: string[]; warnings: string[] }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
    };

interface FrontendSuggestion {
  submitted: string;
  candidates: Array<{ id: string; label: string }>;
}
```

- Consumes current `data/vocabularies/frontends.json` and published frontend
  project records.

- [ ] **Step 1: Write failing reconciliation tests**

```ts
test("matches IDs, labels, aliases, and frontend repository URLs", () => {
  const result = reconcileFrontends({
    projectType: "extension",
    knownIds: ["sillytavern"],
    other: [
      {
        name: "Lumi Verse",
        url: "https://github.com/prolix-oc/Lumiverse",
      },
    ],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });
  expect(result).toEqual({
    status: "resolved",
    ids: ["sillytavern", "lumiverse"],
    warnings: [],
  });
});

test("returns candidates instead of guessing an ambiguous typo", () => {
  const result = reconcileFrontends({
    projectType: "preset",
    knownIds: [],
    other: [{ name: "Tavern", url: "" }],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });
  expect(result.status).toBe("needs-information");
  expect(result.suggestions[0].candidates.length).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run reconciliation tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/frontend-reconciliation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic reconciliation**

Normalize labels with Unicode NFKD, lowercase, punctuation collapse, and
whitespace collapse. Keep a small explicit alias map beside the normalizer.
Repository URL matching uses Task 2 source identities. Close-match suggestions
may use normalized edit distance but become a match only when exactly one
candidate is within the tested threshold.

Frontend-independent Presets resolve to an empty ID array. Extensions may not
be frontend-independent. Frontend submissions do not call this resolver.

- [ ] **Step 4: Implement vocabulary proposals for Frontend submissions**

Use the normalized submitted/preferred display name as the first ID candidate.
When it collides with another label/source, append the normalized GitHub owner.
Return the collision as a PR warning:

```js
return {
  entry: {
    id,
    label: displayName,
    description: `Works with the ${displayName} roleplay frontend.`,
  },
  warning: collided
    ? `Frontend ID ${baseId} was already used; proposed ${id}.`
    : null,
};
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/frontend-reconciliation.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/submissions/frontend-reconciliation.mjs scripts/submissions/frontend-reconciliation.d.mts tests/unit/frontend-reconciliation.test.ts
git commit -m "feat(submissions): reconcile frontends"
```

---

### Task 5: Build the admission state machine and idempotent triage

**Files:**

- Create: `scripts/submissions/admission.mjs`
- Create: `scripts/submissions/admission.d.mts`
- Test: `tests/unit/project-submission-admission.test.ts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/triage-issue.d.mts`
- Test: `tests/unit/triage-issue.test.ts`

**Interfaces:**

- Produces:
  `evaluateProjectSubmission(input): ProjectSubmissionDecision`
- Produces:
  `buildProjectSubmissionTriage(decision, previousMarker): TriageMutation`
- `ProjectSubmissionDecision` is:

```ts
type ProjectSubmissionDecision =
  | {
      status: "duplicate";
      identity: SourceIdentity;
      existingProject: { id: string; name: string; canonicalUrl: string };
    }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
    }
  | {
      status: "retryable";
      code: string;
      message: string;
    }
  | {
      status: "admitted";
      manifest: ProjectSubmissionManifest;
      identity: SourceIdentity;
      frontendIds: string[];
      warnings: string[];
    };
```

- `TriageMutation` declares the desired issue title, labels, stable comment
  body, close action, and whether to dispatch generation.

- [ ] **Step 1: Write the admission matrix tests**

Cover duplicate, malformed, definitive 404, transient timeout, private GitHub
repository, unknown frontend, archived warning, and admitted cases:

```ts
test("closes a permanent repository-ID duplicate before PR generation", () => {
  const decision = evaluateProjectSubmission(
    admittedFixture({
      identity: { ...githubIdentity, repositoryId: 1285208664 },
      existingIdentities: [
        { ...githubIdentity, repositoryId: 1285208664 },
      ],
    }),
  );
  expect(decision).toMatchObject({ status: "duplicate" });
});

test("keeps transient source failures retryable", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        sourceProbe: { status: "retryable", code: "source-timeout" },
      }),
    ),
  ).toEqual({
    status: "retryable",
    code: "source-timeout",
    message: expect.any(String),
  });
});
```

- [ ] **Step 2: Run admission tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts
```

Expected: FAIL because `evaluateProjectSubmission` is missing.

- [ ] **Step 3: Implement the pure decision matrix**

Use exactly these queue labels:

```js
export const submissionQueueLabels = [
  "needs-maintainer-review",
  "needs-information",
  "duplicate-candidate",
  "submission-retryable",
  "submission-pr-open",
  "submission-declined",
];
```

Duplicate takes precedence only after a valid stable identity exists.
Correctable deterministic failures map to `needs-information`; transient
network/API failures map to `submission-retryable`; archived repositories add
a warning but remain admissible.

- [ ] **Step 4: Write failing triage synchronization tests**

Test:

- generic and automation-owned titles update;
- manually changed titles remain unchanged;
- the stable marker records `generated_title`;
- duplicate comments link the existing project and close the issue;
- admitted reruns do not dispatch a second generation while
  `submission-pr-open` is present;
- comments update by marker rather than duplicate.

Use this marker:

```text
<!-- tavernary-project-submission-state
{"schema_version":1,"generated_title":"[Project submission] owner/repo","status":"admitted"}
-->
```

- [ ] **Step 5: Refactor triage around the decision**

Keep GitHub mutation methods injected in tests. The script may update issue
title/labels/comments and close duplicates, but it may not write repository
content. Emit `admitted=true` and `issue_number=<n>` through `$GITHUB_OUTPUT`
for workflow dispatch.

- [ ] **Step 6: Run triage tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit admission and triage**

```powershell
git add -- scripts/submissions/admission.mjs scripts/submissions/admission.d.mts scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts
git commit -m "feat(submissions): gate project admission"
```

---

### Task 6: Extract reusable API-only snapshot composition

**Files:**

- Create: `scripts/catalog/repository-snapshot.mjs`
- Create: `scripts/catalog/repository-snapshot.d.mts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Test: `tests/unit/repository-snapshot.test.ts`
- Modify: `tests/unit/incremental-refresh.test.ts`
- Modify: `tests/unit/refresh-snapshot-format.test.ts`
- Modify: `tests/unit/refresh-github-contributors.test.ts`

**Interfaces:**

- Produces:
  `createInitialRepositorySnapshot(input): RepositorySnapshot`
- Produces:
  `snapshotFromObservation(input): RepositorySnapshot`
- Reused by `runRefresh` and Task 7 submission drafting.
- Consumes `RepositoryObservation`, API activity inspection, contributor
  accounts, normalized license facts, and current ISO timestamp.

- [ ] **Step 1: Write a failing initial-snapshot test**

```ts
test("creates a schema-v2 initial snapshot from API observations only", () => {
  const snapshot = createInitialRepositorySnapshot({
    projectId: "owner-repo",
    observation,
    activityInspection,
    contributors: [{ login: "owner", type: "User" }],
    now: "2026-07-25T18:00:00.000Z",
  });
  expect(snapshot).toMatchObject({
    schema_version: 2,
    project_id: "owner-repo",
    source_health: "healthy",
    repository: {
      id: observation.repository.id,
      head_sha: observation.repository.headSha,
    },
    activity: { evidence_status: "complete" },
    stale_since: null,
  });
});
```

- [ ] **Step 2: Run snapshot tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/repository-snapshot.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract snapshot composition without changing refresh behavior**

Move pure `repositoryFacts`, provisional activity, normalized license,
contributor snapshot, and `snapshotFromObservation` logic out of
`refresh-github.mjs`. Keep the exact serialized schema-v2 shape and timestamps.
Do not move network, selection, retry, or write logic.

- [ ] **Step 4: Implement API-only initial snapshot**

`createInitialRepositorySnapshot` must not call `inspectGitBaseline`, spawn
Git, or clone. It receives already-fetched API activity evidence. If the
bounded API activity scan is incomplete, record `evidence_status:
"provisional"` and retain its continuation scan rather than falling back to a
clone.

- [ ] **Step 5: Prove refresh behavior is unchanged**

Run:

```powershell
npm.cmd test -- tests/unit/repository-snapshot.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/github-inspector.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit snapshot extraction**

```powershell
git add -- scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts tests/unit/repository-snapshot.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-github-contributors.test.ts
git commit -m "refactor(catalog): share snapshot builder"
```

---

### Task 7: Draft canonical records and submission artifacts

**Files:**

- Create: `scripts/submissions/draft-project-record.mjs`
- Create: `scripts/submissions/draft-project-record.d.mts`
- Create: `scripts/submissions/generate-project-submission.mjs`
- Create: `scripts/submissions/generate-project-submission.d.mts`
- Test: `tests/unit/draft-project-record.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`

**Interfaces:**

- Produces:
  `draftProjectRecord(input): Promise<ProjectDraftResult>`
- Produces:
  `generateProjectSubmission(input): Promise<GeneratedSubmission>`
- `ProjectDraftResult` contains `record`, optional `snapshot`, optional
  `frontendVocabulary`, `submitted`, `observed`, `inferred`, and `warnings`.
- `GeneratedSubmission` contains ordered relative files with parsed JSON
  values plus a complete admission report; it does not write Git or call
  GitHub issue/PR APIs.

- [ ] **Step 1: Write failing GitHub record-drafting tests**

```ts
test("drafts a schema-v4 GitHub project with permanent identity", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    enrichment: {
      status: "curated",
      summary: curatedSummary,
      primary_function: "generation-reasoning",
      capabilities: ["planning-reasoning"],
    },
    now: "2026-07-25T18:00:00.000Z",
  });
  expect(result.record).toMatchObject({
    schema_version: 4,
    id: "owner-repo",
    kind: "extension",
    metadata_status: "curated",
    source: {
      type: "github",
      repository: "Owner/Repo",
      repository_id: observation.repository.id,
    },
    frontends: ["sillytavern"],
    catalog_cohort: "standard",
    visibility: "published",
    visibility_reason: null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
  });
});
```

- [ ] **Step 2: Add fallback and external-preset tests**

Provider failure must use, in order, submitted description, repository
description, or exact fallback `No README file found.`; it sets
`metadata_status: "provisional"`, uses `uncategorized` except Frontends use
`frontend`, and adds a warning.

External Presets use:

```json
{
  "source": {
    "type": "url",
    "url": "https://example.com/preset",
    "published_at": null,
    "version": null,
    "artifact_size_bytes": null,
    "license_status": "pending",
    "license_spdx_id": null
  },
  "refresh_policy": "paused",
  "enrichment_policy": "manual",
  "enrichment_note": "External URL source; requires manual curation."
}
```

- [ ] **Step 3: Run drafting tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/draft-project-record.test.ts
```

Expected: FAIL because the drafter does not exist.

- [ ] **Step 4: Implement GitHub inspection and enrichment composition**

Reuse:

- `observeRepositories` for permanent repository facts;
- `inspectApiActivity` for bounded API-only activity;
- `createInitialRepositorySnapshot` from Task 6;
- `loadReadmeSource` for prepared README/description evidence;
- `createEnrichmentProvider` and `enrichRecord` for controlled output;
- `defaultEnrichmentFields` for source-based policy.

Catch provider unavailability and invalid output only at the drafting boundary,
record the diagnostic warning, and use the deterministic fallback. Do not catch
identity, schema, or source-safety failures as enrichment fallback.

- [ ] **Step 5: Implement deterministic file generation**

`generateProjectSubmission` returns:

```ts
{
  files: [
    {
      path: `data/registry/projects/${record.id}.json`,
      value: record,
    },
    ...(snapshot
      ? [{
          path: `data/snapshots/github/${record.id}.json`,
          value: snapshot,
        }]
      : []),
    ...(frontendVocabularyChanged
      ? [{
          path: "data/vocabularies/frontends.json",
          value: frontendVocabulary,
        }]
      : []),
  ],
  report: {
    schema_version: 1,
    issue_number: issueNumber,
    project_id: record.id,
    submitted,
    observed,
    inferred,
    warnings,
  },
};
```

Sort files and vocabulary entries deterministically. Use `formatJson` only at
the CLI write boundary.

- [ ] **Step 6: Test exact file boundaries**

Assert:

- no `src/generated/catalog.json`;
- no `data/catalog/projects.json`;
- no issue submitter identity in public project data;
- Frontend submissions include a vocabulary proposal;
- Extension/Presets never invent unknown frontend IDs.

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/enrich-readmes.test.ts tests/unit/build-catalog.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts
git commit -m "feat(submissions): draft catalog projects"
```

---

### Task 8: Add deterministic PR state, review body, and conflict protection

**Files:**

- Create: `scripts/submissions/project-submission-pr.mjs`
- Create: `scripts/submissions/project-submission-pr.d.mts`
- Test: `tests/unit/project-submission-pr.test.ts`

**Interfaces:**

- Produces:
  `submissionBranch(issueNumber: number): string`
- Produces:
  `renderSubmissionPullRequest(input): string`
- Produces:
  `parseSubmissionPullRequestMarker(body: string): GeneratedPrMarker | null`
- Produces:
  `planSubmissionPrUpdate(input): SubmissionPrPlan`
- Marker:

```ts
interface GeneratedPrMarker {
  schema_version: 1;
  issue_number: number;
  generated_head_sha: string;
  generated_paths: string[];
}
```

- `SubmissionPrPlan` is `create`, `update`, `conflict`, or `noop`.

- [ ] **Step 1: Write failing branch and PR-body tests**

```ts
test("uses one deterministic issue-owned branch", () => {
  expect(submissionBranch(123)).toBe("automation/project-submission-123");
});

test("renders the issue link, evidence groups, warnings, and marker", () => {
  const body = renderSubmissionPullRequest(reviewFixture);
  expect(body).toContain("Closes #123");
  expect(body).toContain("## Submitted");
  expect(body).toContain("## Observed");
  expect(body).toContain("## Inferred");
  expect(body).toContain("## Warnings");
  expect(parseSubmissionPullRequestMarker(body)).toEqual(
    reviewFixture.marker,
  );
});
```

- [ ] **Step 2: Write conflict-planning tests**

Test create, untouched update, maintainer-head divergence, explicit force, and
no-op. Force may replace only `generated_paths`; it never stages unrelated
files.

```ts
test("refuses to overwrite a maintainer-edited head", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: "maintainer",
      markerHeadSha: "generated",
      forceRegeneration: false,
    }),
  ).toEqual({
    action: "conflict",
    message: expect.stringContaining("maintainer changes"),
  });
});
```

- [ ] **Step 3: Run PR-state tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-pr.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement pure PR planning and rendering**

Escape untrusted Markdown values, bound displayed source text, and put raw
machine evidence only in the workflow artifact. The PR checklist must include:

```markdown
- [ ] Canonical source and permanent identity are correct
- [ ] Project kind and supported frontends are correct
- [ ] Name and summary are factual
- [ ] Primary function and capabilities are appropriate
- [ ] License, archival, and source warnings were reviewed
- [ ] The generated card passes CI
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-pr.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/submissions/project-submission-pr.mjs scripts/submissions/project-submission-pr.d.mts tests/unit/project-submission-pr.test.ts
git commit -m "feat(submissions): plan review pull requests"
```

---

### Task 9: Implement issue-to-PR workflow orchestration

**Files:**

- Modify: `.github/workflows/triage-submission.yml`
- Create: `.github/workflows/generate-project-submission.yml`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Test: `tests/unit/workflows.test.ts`
- Test: `tests/unit/generate-project-submission-cli.test.ts`

**Interfaces:**

- `triage-submission.yml` dispatches generation only when the triage step emits
  `admitted=true`.
- `generate-project-submission.yml` inputs:
  `issue_number` required number and `force_regeneration` optional boolean
  default false.
- Generation CLI accepts:
  `--issue-number`, `--output-directory`, and `--report-path`.

- [ ] **Step 1: Write failing workflow contract tests**

Add exact assertions:

```ts
expect(triage.permissions).toEqual({
  contents: "read",
  issues: "write",
  actions: "write",
});
expect(generation.permissions).toEqual({
  contents: "write",
  issues: "write",
  "pull-requests": "write",
  actions: "write",
});
expect(generation.on.workflow_dispatch.inputs.issue_number.required).toBe(true);
expect(
  generation.on.workflow_dispatch.inputs.force_regeneration.default,
).toBe(false);
expect(generation.concurrency.group).toContain(
  "project-submission-${{ inputs.issue_number }}",
);
```

Also assert every first-party action is pinned and generation never runs a
submitted repository command.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because the generation workflow is absent.

- [ ] **Step 3: Implement admitted dispatch in triage**

After triage synchronization:

```yaml
- name: Generate admitted submission
  if: steps.triage.outputs.admitted == 'true'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ISSUE_NUMBER: ${{ steps.triage.outputs.issue_number }}
  run: >
    gh workflow run generate-project-submission.yml
    --ref main
    -f issue_number="$ISSUE_NUMBER"
    -f force_regeneration=false
```

Do not grant `contents: write` or `pull-requests: write` to the triage job.

- [ ] **Step 4: Implement generation workflow checkout and conflict gate**

The workflow:

1. checks out full `main`;
2. fetches the issue and existing generated PR;
3. verifies the current issue is still admitted;
4. compares remote head with the PR marker;
5. stops safely on maintainer divergence unless force is true;
6. regenerates from current `origin/main`;
7. writes only declared generated files;
8. runs `npm run catalog:validate` and `npm run catalog:build`;
9. commits to `automation/project-submission-<n>`;
10. creates or updates the PR and marker;
11. applies `submission-pr-open`;
12. uploads the admission report;
13. explicitly dispatches `ci.yml` on the generated branch.

Use `git push --force-with-lease=<branch>:<expected-sha>` only for an untouched
generated branch rebased from current `main`; initial creation uses a normal
push. Never use an unguarded force push.

- [ ] **Step 5: Add CLI boundary tests**

Inject issue fetch, source clients, clock, and filesystem destination. Assert a
dry temporary directory receives only:

```text
data/registry/projects/<id>.json
data/snapshots/github/<id>.json
data/vocabularies/frontends.json (Frontend only when changed)
admission-report.json (outside repository output root)
```

- [ ] **Step 6: Run focused workflow and CLI tests**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit workflow orchestration**

```powershell
git add -- .github/workflows/triage-submission.yml .github/workflows/generate-project-submission.yml scripts/submissions/generate-project-submission.mjs tests/unit/workflows.test.ts tests/unit/generate-project-submission-cli.test.ts
git commit -m "ci(submissions): generate review PRs"
```

---

### Task 10: Automate merged and declined submission cleanup

**Files:**

- Create: `scripts/submissions/project-submission-lifecycle.mjs`
- Create: `scripts/submissions/project-submission-lifecycle.d.mts`
- Create: `.github/workflows/project-submission-lifecycle.yml`
- Test: `tests/unit/project-submission-lifecycle.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:
  `planProjectSubmissionClosure(input): SubmissionClosurePlan`
- Closure plan is `merged`, `declined`, or `ignore`.
- Only PRs with a valid Tavernary submission marker and matching deterministic
  head branch are eligible.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
test("declines a marked generated PR closed without merge", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "automation/project-submission-123",
      body: markedBody(123),
    }),
  ).toEqual({
    action: "decline",
    issueNumber: 123,
    addLabels: ["submission-declined"],
    removeLabels: ["needs-maintainer-review", "submission-pr-open"],
    closeReason: "not_planned",
    deleteBranch: "automation/project-submission-123",
  });
});

test("ignores an unmarked pull request", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "feature/example",
      body: "Closes #123",
    }),
  ).toEqual({ action: "ignore" });
});
```

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-lifecycle.test.ts
```

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 3: Implement safe lifecycle planning**

Merged PRs rely on `Closes #<issue>` for issue closure. The lifecycle workflow
may remove queue labels and delete the generated branch. Unmerged PRs comment
with the PR URL, apply `submission-declined`, close as not planned, and delete
the branch only after confirming the ref still points to the closed PR head
SHA.

- [ ] **Step 4: Implement and test the workflow**

Trigger:

```yaml
on:
  pull_request:
    types: [closed]
```

Permissions:

```yaml
permissions:
  contents: write
  issues: write
  pull-requests: read
```

The workflow checks out no PR code and executes only the default-branch
lifecycle script. Add it to the pinned-action workflow test list.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-lifecycle.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/submissions/project-submission-lifecycle.mjs scripts/submissions/project-submission-lifecycle.d.mts .github/workflows/project-submission-lifecycle.yml tests/unit/project-submission-lifecycle.test.ts tests/unit/workflows.test.ts
git commit -m "ci(submissions): close reviewed intake"
```

---

### Task 11: Build the static conditional submission experience

**Files:**

- Create: `src/app/submit/project/page.tsx`
- Create: `src/features/submissions/components/project-submission-builder.tsx`
- Create: `src/features/submissions/submission-transport.ts`
- Create: `src/styles/submission.css`
- Modify: `src/app/globals.css`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/app/about/page.tsx`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/unit/project-submission-transport.test.ts`
- Modify: `tests/e2e/contribution-links.spec.ts`
- Create: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**

- Page derives frontend choices from `loadCatalog().projects` where
  `kind === "frontend"`.
- Builder produces `ProjectSubmissionManifest`.
- `openProjectSubmission(formUrl, manifest)` returns
  `"prefilled" | "clipboard"` using the established Kit handoff pattern.

- [ ] **Step 1: Write failing builder behavior tests**

Test exact conditional behavior:

```tsx
test("requires supported frontends only for Extensions", async () => {
  render(<ProjectSubmissionBuilder frontends={frontends} />);
  await user.selectOptions(
    screen.getByLabelText("Project Type"),
    "extension",
  );
  expect(
    screen.getByRole("combobox", { name: "Search supported frontends" }),
  ).toBeVisible();
  expect(
    screen.queryByLabelText("Frontend-independent"),
  ).not.toBeInTheDocument();
});

test("allows a System Preset to be frontend-independent", async () => {
  render(<ProjectSubmissionBuilder frontends={frontends} />);
  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.click(screen.getByLabelText("Frontend-independent"));
  expect(screen.getByText("No frontend selection required.")).toBeVisible();
});
```

- [ ] **Step 2: Run builder tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts
```

Expected: FAIL because the page and components do not exist.

- [ ] **Step 3: Implement static page data and builder state**

The server page passes only:

```ts
type SubmissionFrontendOption = {
  id: string;
  label: string;
  canonicalUrl: string;
};
```

Derive `id` from each frontend card's single self-compatibility label. Render a
searchable checkbox list, selected chips, **Other or not listed**, name/URL
inputs, and the conditional frontend-independent control. Preserve keyboard
navigation, visible labels, inline errors, and an `aria-live` submission
status.

- [ ] **Step 4: Implement GitHub handoff**

Use form-prefill IDs from Task 1:

```ts
target.searchParams.set("template", "01-project-submission.yml");
target.searchParams.set("project-type", displayKind(manifest.project_type));
target.searchParams.set("project-url", manifest.source_url);
target.searchParams.set("project-name", manifest.name ?? "");
target.searchParams.set("project-description", manifest.description ?? "");
target.searchParams.set(
  "supported-frontends",
  readableFrontendSelection(manifest),
);
target.searchParams.set(
  "frontend-independent",
  manifest.frontend_independent ? "Yes" : "No",
);
target.searchParams.set(
  "additional-context",
  manifest.additional_context ?? "",
);
target.searchParams.set(
  "project-manifest",
  serializeProjectSubmissionManifest(manifest),
);
```

Use the Kit transport's 7,000-character ceiling and clipboard/manual-copy
fallback. Do not clear builder state until the handoff succeeds.

- [ ] **Step 5: Route existing submission links to the builder**

Replace the GitHub URL in `site-header.tsx` and `about/page.tsx` with
`./submit/project/` or a base-path-safe `Link`. Preserve the visible
**Submit Project** copy.

- [ ] **Step 6: Add production styling**

Import `submission.css` from `globals.css`. Reuse tokens, card surfaces,
existing button styles, 44 px touch targets, and the About-page content width.
Add mobile layout without horizontal overflow. Do not introduce a disposable
mockup visual language.

- [ ] **Step 7: Add E2E and mobile tests**

Test:

- header and About links reach the static builder;
- Frontend hides compatibility;
- Extension supports multiple current frontends;
- Preset supports frontend-independent;
- Other/not-listed collects name and URL;
- submit opens a GitHub URL containing the stable manifest;
- static export contains `/submit/project/index.html`;
- 320 px viewport has no horizontal overflow.

- [ ] **Step 8: Run UI verification**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/unit/issue-forms.test.ts
npm.cmd run build
npm.cmd run test:e2e -- project-submission.spec.ts contribution-links.spec.ts mobile.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the submission builder**

```powershell
git add -- src/app/submit/project/page.tsx src/features/submissions/components/project-submission-builder.tsx src/features/submissions/submission-transport.ts src/styles/submission.css src/app/globals.css src/features/catalog/components/site-header.tsx src/app/about/page.tsx tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/e2e/contribution-links.spec.ts tests/e2e/project-submission.spec.ts tests/e2e/mobile.spec.ts
git commit -m "feat(submissions): add project builder"
```

---

### Task 12: Update operations documentation and run full local verification

**Files:**

- Modify: `README.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/architecture/catalog-lifecycle.md`
- Create: `tests/unit/project-submission-docs.test.ts`

**Interfaces:**

- Documents the exact issue → triage → generated PR → merge/decline lifecycle.
- Documents repository setting: **Allow GitHub Actions to create and approve
  pull requests** must permit PR creation; automation does not self-approve.
- Documents manual recovery inputs and conflict behavior.

- [ ] **Step 1: Write failing documentation assertions**

Add assertions that the maintainer docs mention:

```ts
for (const phrase of [
  "generate-project-submission.yml",
  "submission-pr-open",
  "submission-declined",
  "force_regeneration",
  "automation/project-submission-<issue-number>",
]) {
  expect(runbook).toContain(phrase);
}
```

- [ ] **Step 2: Run documentation tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-docs.test.ts
```

Expected: FAIL because the new lifecycle is undocumented.

- [ ] **Step 3: Update contributor and maintainer documentation**

State clearly:

- contributors edit the issue only until a PR exists;
- duplicates close before PR generation;
- correctable failures stay open;
- the generated PR is the sole human review;
- maintainers correct generated files directly in the PR;
- merge publishes and closes the issue;
- close-without-merge declines it;
- regeneration defaults to non-destructive;
- external System Presets remain manually curated;
- frontend compatibility comes from current catalog data.

- [ ] **Step 4: Run the full deterministic gate**

Run:

```powershell
npm.cmd run check
```

Expected: format, lint, palette audit, catalog validation/build, typecheck, unit
tests, production build, and static-export verification all pass.

- [ ] **Step 5: Run full browser and visual gates**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 6: Review the complete diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm:

- no unrelated changes are staged;
- no generated browser catalog is tracked;
- no secret or live token appears;
- workflow permissions are minimal;
- every new module has focused tests;
- all action references are pinned.

- [ ] **Step 7: Commit documentation**

```powershell
git add -- README.md docs/contributing/submission-and-review.md docs/maintenance/operations-runbook.md docs/architecture/catalog-lifecycle.md tests/unit/project-submission-docs.test.ts
git commit -m "docs: explain submission review flow"
```

---

### Task 13: Perform controlled live GitHub certification

**Files:**

- Artifact only: GitHub test issue, generated PR, Actions runs, and deployed
  Pages result.
- No additional repository file is required unless certification exposes a
  defect.

**Interfaces:**

- Uses the production issue form and workflows on `main`.
- Requires explicit user approval immediately before creating the public test
  issue and consuming provider/API resources.

- [ ] **Step 1: Verify live prerequisites without mutation**

Confirm:

- all implementation commits are on the intended branch;
- repository Actions settings permit workflow-created pull requests;
- enrichment secrets are configured, or the deterministic fallback path is the
  explicitly expected canary behavior;
- `main` contains all new workflow files;
- no active submission issue already uses the chosen canary source;
- Pages and CI are healthy.

- [ ] **Step 2: Request approval for the live mutation**

Ask permission to create one controlled project-submission issue and allow its
workflow to create a branch and PR. Do not infer this permission from approval
of the implementation plan.

- [ ] **Step 3: Run the admitted canary**

Submit a real public GitHub-backed candidate that the user has approved for
catalog inclusion and that is not already present in Tavernary. Verify:

- generated issue title;
- admission labels/comment;
- deterministic branch;
- complete canonical record and initial snapshot;
- review PR body and `Closes #<issue>`;
- explicitly dispatched CI;
- generated card in the static build.

- [ ] **Step 4: Correct and merge the canary PR**

Make one harmless maintainer correction in the PR branch to prove the PR is the
review surface. Verify an ordinary rerun refuses to overwrite the correction.
Merge after all checks pass.

- [ ] **Step 5: Verify publication**

Verify:

- source issue closed automatically;
- generated branch removed safely;
- Pages deployed from the merged `main` commit;
- live card opens the correct canonical source;
- frontend filters and search include the project.

- [ ] **Step 6: Run the declined-path canary**

With separate approval if another public issue is required, create a controlled
submission, allow its generated PR, then close that PR unmerged. Verify
`submission-declined`, issue comment/closure, and guarded branch deletion.

- [ ] **Step 7: Record defects or complete certification**

If any live behavior fails, add a focused regression test before fixing it and
repeat only the affected canary path. Claim completion only after both admitted
and declined paths are proven.
