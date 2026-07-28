# Project Submission PR URL Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve exact HTTPS destinations when project-submission report URLs are rendered in generated pull request descriptions.

**Architecture:** Keep `safeText()` as the prose escaper and add a URL-specific renderer selected by report-field key. URL destinations are parsed, constrained to HTTPS, serialized, and emitted inside an explicit angle-bracketed Markdown destination; invalid URL diagnostics fall back to safe prose.

**Tech Stack:** Node.js 24, ECMAScript modules, TypeScript test fixtures, Vitest, GitHub CLI, GitHub-flavored Markdown.

## Global Constraints

- Preserve the existing prose escaping behavior.
- Recognize only `source_url` and `canonical_url` as URL-valued report fields.
- Require `https:` before emitting an explicit link.
- Invalid URL-keyed input must render safely instead of throwing.
- Do not change admission, source identity, enrichment, generated catalog data, or workflow regeneration semantics.
- Preserve all unrelated working-tree changes.
- Execute implementation in an isolated worktree because the primary worktree
  currently contains unrelated staged changes and unresolved conflicts.
- Use the GitHub CLI for GitHub reads and writes.

---

## File Structure

- Modify `scripts/submissions/project-submission-pr.mjs`: distinguish prose
  values from URL-valued report fields and render safe explicit links.
- Modify `tests/unit/project-submission-pr.test.ts`: prove exact URL
  destinations, Markdown-safe visible labels, canonical URL handling, and
  invalid-value fallback.
- Update GitHub pull request 85's description through `gh`: repair the two
  already-generated broken links after local verification.

### Task 1: Render submitted source URLs as explicit links

**Files:**

- Modify: `tests/unit/project-submission-pr.test.ts:23-43,82-96`
- Modify: `scripts/submissions/project-submission-pr.mjs:3-24`

**Interfaces:**

- Consumes: report entries passed to `renderGroup(values)`.
- Produces: `renderGroupValue(key, value)` returning safe Markdown and
  `renderUrlValue(value)` returning an explicit link for valid HTTPS input.

- [ ] **Step 1: Add one failing underscore-URL regression**

Add `source_url` to `reviewFixture.report.submitted`:

```typescript
submitted: {
  name: "Owner [Repo]",
  description: "Submitted description.",
  source_url: "https://github.com/envy-ai/ai_rpg",
},
```

Add this assertion to the existing renderer test:

```typescript
expect(body).toContain(
  "- **Source url:** [https://github.com/envy-ai/ai\\_rpg](<https://github.com/envy-ai/ai_rpg>)",
);
```

- [ ] **Step 2: Run the focused test and verify the existing renderer fails**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: FAIL because the current body contains the escaped autolink text
`https://github.com/envy-ai/ai\_rpg` without an explicit destination.

- [ ] **Step 3: Implement the smallest valid source-URL renderer**

Add below `safeText()`:

```javascript
const urlFieldKeys = new Set(["source_url"]);

function renderUrlValue(value) {
  if (typeof value !== "string") return safeText(value);
  const url = new URL(value);
  if (url.protocol !== "https:") return safeText(value);
  return `[${safeText(url.href)}](<${url.href}>)`;
}

function renderGroupValue(key, value) {
  return urlFieldKeys.has(key) ? renderUrlValue(value) : safeText(value);
}
```

Change the mapping in `renderGroup()`:

```javascript
.map(
  ([key, value]) =>
    `- **${labelFor(key)}:** ${renderGroupValue(key, value)}`,
)
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: PASS, including the exact unescaped `ai_rpg` link destination and
the still-escaped visible label.

- [ ] **Step 5: Commit the first red-green slice**

```powershell
git add -- scripts/submissions/project-submission-pr.mjs tests/unit/project-submission-pr.test.ts
git commit -m "fix(submissions): preserve source URL links"
```

### Task 2: Cover canonical URLs and malformed diagnostics

**Files:**

- Modify: `tests/unit/project-submission-pr.test.ts:23-100`
- Modify: `scripts/submissions/project-submission-pr.mjs:15-32`

**Interfaces:**

- Consumes: `renderUrlValue(value)` and `urlFieldKeys` from Task 1.
- Produces: URL rendering for both approved report keys with safe fallback for
  invalid or non-HTTPS input.

- [ ] **Step 1: Add one failing canonical-URL regression**

Add `canonical_url` to `reviewFixture.report.observed`:

```typescript
observed: {
  repository: "Owner/Repo",
  repository_id: 42,
  canonical_url: "https://example.com/a_(b)?x=1&y=2",
},
```

Add this assertion to the existing renderer test:

```typescript
expect(body).toContain(
  "- **Canonical url:** [https://example.com/a\\_\\(b\\)?x=1&y=2](<https://example.com/a_(b)?x=1&y=2>)",
);
```

- [ ] **Step 2: Run the focused test and verify canonical URLs still fail**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: FAIL because `canonical_url` is not yet in `urlFieldKeys`.

- [ ] **Step 3: Recognize canonical URL fields**

Change the URL key set to:

```javascript
const urlFieldKeys = new Set(["canonical_url", "source_url"]);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: PASS with the exact parenthesized path and query string in the link
destination.

- [ ] **Step 5: Add one failing malformed-URL fallback regression**

Add a separate test:

```typescript
test("renders invalid URL diagnostics safely instead of throwing", () => {
  const body = renderSubmissionPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      submitted: {
        ...reviewFixture.report.submitted,
        source_url: "not_[a]_url",
      },
    },
  });

  expect(body).toContain("- **Source url:** not\\_\\[a\\]\\_url");
});
```

- [ ] **Step 6: Run the focused test and verify URL parsing throws**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: FAIL with `TypeError: Invalid URL`.

- [ ] **Step 7: Add safe URL parsing fallback**

Replace `renderUrlValue()` with:

```javascript
function renderUrlValue(value) {
  if (typeof value !== "string") return safeText(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return safeText(value);
    return `[${safeText(url.href)}](<${url.href}>)`;
  } catch {
    return safeText(value);
  }
}
```

- [ ] **Step 8: Run the focused test and verify all renderer cases pass**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: PASS for the complete file with no thrown invalid-URL error.

- [ ] **Step 9: Commit the URL edge-case slice**

```powershell
git add -- scripts/submissions/project-submission-pr.mjs tests/unit/project-submission-pr.test.ts
git commit -m "test(submissions): cover review PR URLs"
```

### Task 3: Verify the repository change

**Files:**

- Verify: `scripts/submissions/project-submission-pr.mjs`
- Verify: `tests/unit/project-submission-pr.test.ts`

**Interfaces:**

- Consumes: completed renderer and regression tests from Tasks 1 and 2.
- Produces: fresh evidence that the focused module and repository gates pass.

- [ ] **Step 1: Check formatting for only the touched implementation files**

Run:

```powershell
npm.cmd exec prettier -- --check scripts/submissions/project-submission-pr.mjs tests/unit/project-submission-pr.test.ts
```

Expected: both files use Prettier formatting.

- [ ] **Step 2: Run lint for only the touched implementation files**

Run:

```powershell
npm.cmd exec eslint -- scripts/submissions/project-submission-pr.mjs tests/unit/project-submission-pr.test.ts
```

Expected: zero lint errors.

- [ ] **Step 3: Run the focused regression suite**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-submission-pr.test.ts
```

Expected: all project-submission PR renderer tests pass.

- [ ] **Step 4: Run the full unit suite**

Run:

```powershell
npm.cmd test
```

Expected: all Vitest files pass. If unrelated dirty-tree work causes a failure,
record the failing test and prove the touched renderer test remains green
instead of altering unrelated files.

- [ ] **Step 5: Inspect the final implementation diff**

Run:

```powershell
git diff HEAD~2 --check
git diff HEAD~2 -- scripts/submissions/project-submission-pr.mjs tests/unit/project-submission-pr.test.ts
git status --short
```

Expected: no whitespace errors; the two implementation commits contain only
the renderer and its tests; pre-existing unrelated changes remain present and
untouched.

### Task 4: Repair and verify pull request 85

**Files:**

- External update: `MentallyQuill/Tavernary` pull request 85 description.

**Interfaces:**

- Consumes: the corrected explicit-link syntax proven in Tasks 1 through 3.
- Produces: two correct `https://github.com/envy-ai/ai_rpg` destinations in
  GitHub's rendered PR description and no `%5C` destination.

- [ ] **Step 1: Confirm the current broken occurrences before mutation**

Run:

```powershell
$pr85 = gh pr view 85 --json body,url | ConvertFrom-Json
$brokenUrl = 'https://github.com/envy-ai/ai\_rpg'
$brokenCount = ([regex]::Matches($pr85.body, [regex]::Escape($brokenUrl))).Count
if ($brokenCount -ne 2) { throw "Expected 2 broken URL occurrences; found $brokenCount" }
```

Expected: `brokenCount` is exactly `2`, covering Submitted `source_url` and
Observed `canonical_url`.

- [ ] **Step 2: Replace only the two broken rendered values**

Run:

```powershell
$fixedUrl = '[https://github.com/envy-ai/ai\_rpg](<https://github.com/envy-ai/ai_rpg>)'
$updatedBody = $pr85.body.Replace($brokenUrl, $fixedUrl)
$updatedBody | gh pr edit 85 --body-file -
```

Expected: GitHub accepts the updated automation-owned PR description.

- [ ] **Step 3: Verify GitHub's rendered destinations**

Run:

```powershell
$renderedBody = gh api 'repos/MentallyQuill/Tavernary/pulls/85' -H 'Accept: application/vnd.github.full+json' --jq '.body_html'
$correctHrefCount = ([regex]::Matches($renderedBody, 'href="https://github\.com/envy-ai/ai_rpg"')).Count
if ($correctHrefCount -ne 2) { throw "Expected 2 correct rendered links; found $correctHrefCount" }
if ($renderedBody -match 'ai%5C_rpg') { throw 'Broken encoded-backslash URL remains' }
```

Expected: exactly two correct rendered links and no encoded-backslash URL.

- [ ] **Step 4: Report the local commits and external repair**

Run:

```powershell
git log -n 3 --oneline
git status --short
gh pr view 85 --json url,title,state
```

Expected: the renderer commits are present locally, unrelated dirty-tree work
is preserved, and pull request 85 remains open with its repaired description.
