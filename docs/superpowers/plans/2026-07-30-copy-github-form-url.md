# Copy GitHub Form URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in square action beside the project review's GitHub button that copies the exact completed Issue Form URL without opening GitHub.

**Architecture:** Separate deterministic GitHub handoff preparation from its open and copy side effects. The project transport exposes open and copy functions backed by the same prepared URL, while the shared review component renders the copy control only when the project flow supplies its optional callback.

**Tech Stack:** Node.js 24, TypeScript 6, React 19, Next.js 16 static export, Vitest, Testing Library, Playwright, existing Tavernary tooltip and icon components.

## Global Constraints

- Keep Tavernary static-first; add no backend, OAuth flow, account system, runtime dependency, or GitHub API call.
- Preserve project-submission manifest version 4, Issue Form fields, readable prefills, and manifest-only automation authority unchanged.
- Preserve the existing 7,000-character safe URL threshold and the normal oversized-manifest recovery.
- The copy action must never call `window.open`, navigate, clear the review, or mark the normal GitHub handoff as opened.
- The copied short URL must be byte-for-byte identical to the URL the normal action opens.
- Enable the control only for project submissions; existing Kit and Help review screens remain unchanged.
- Reuse `CategoryIcon` with `name="copy-link"` and the shared `Tooltip`.
- Use a 44 by 44 pixel square copy target at desktop, tablet, and mobile widths.
- Tooltip copy is **Copy URL and paste into browser**; accessible name is **Copy GitHub form URL**.
- Successful status copy is **GitHub form URL copied. Paste it into your browser's address bar.**
- Clipboard failure reveals selectable, non-clickable URL text.
- Oversized submissions do not copy an incomplete URL and direct the user to **Continue on GitHub**.
- Use red-green-refactor for each task and preserve unrelated working-tree changes.

---

## File Map

- Modify `src/features/submissions/github-handoff.ts`
  - Prepare one safe handoff result before either opening or copying it.
  - Add the non-navigating URL-copy operation and its typed failures.
- Modify `src/features/submissions/submission-transport.ts`
  - Build project handoff input once and expose project-specific open and copy functions.
- Modify `src/features/submissions/components/submission-review.tsx`
  - Add the optional copy callback, action state, icon/tooltip control, helper copy, and selectable recovery URL.
- Modify `src/features/submissions/components/project-submission-builder.tsx`
  - Revalidate the reviewed manifest and opt the project review into URL copying.
- Modify `src/styles/submission.css`
  - Group the primary and square actions and preserve their row at narrow widths.
- Modify `tests/unit/github-handoff.test.ts`
  - Cover exact URL parity, non-navigation, clipboard failure, and oversized rejection.
- Modify `tests/unit/project-submission-transport.test.ts`
  - Prove project open and copy operations consume identical prepared URLs.
- Modify `tests/unit/submission-review.test.tsx`
  - Cover the opt-in UI, status, tooltip, non-clickable recovery, and unchanged non-project reviews.
- Modify `tests/unit/project-submission-builder.test.tsx`
  - Prove the reviewed manifest reaches the copy transport without invoking the open transport.
- Modify `tests/e2e/project-submission.spec.ts`
  - Prove clipboard/open URL parity and no navigation in a real browser.
- Modify `tests/e2e/mobile.spec.ts`
  - Prove the adjacent 44-pixel action layout and absence of horizontal overflow at 320 pixels.
- Modify `tests/visual/theme.visual.spec.ts`
  - Prove the secondary control uses the existing graphite/teal interaction treatment and tooltip.

---

### Task 1: Separate Handoff Preparation From Open and Copy

**Files:**

- Modify: `src/features/submissions/github-handoff.ts`
- Modify: `src/features/submissions/submission-transport.ts`
- Test: `tests/unit/github-handoff.test.ts`
- Test: `tests/unit/project-submission-transport.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function prepareGitHubReview(
    input: GitHubHandoffInput,
  ): GitHubHandoffResult;

  export async function copyGitHubReviewUrl(
    input: GitHubHandoffInput,
  ): Promise<GitHubHandoffResult>;

  export async function copyProjectSubmissionUrl(
    formUrl: string | URL,
    manifest: ProjectSubmissionManifest,
  ): Promise<GitHubHandoffResult>;
  ```

- `GitHubHandoffResult` remains `{ mode: "prefilled" | "clipboard"; url: string }`.
- `openGitHubReview(input)` continues to own manifest-copy recovery and `window.open`.

- [ ] **Step 1: Add failing shared handoff tests**

  Extend `tests/unit/github-handoff.test.ts` with focused assertions:

  ```ts
  test("copies the exact short review URL without opening it", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(window);
    const writeText = vi.mocked(navigator.clipboard.writeText);

    const result = await copyGitHubReviewUrl(input());

    expect(result.mode).toBe("prefilled");
    expect(writeText).toHaveBeenCalledWith(result.url);
    expect(open).not.toHaveBeenCalled();
  });

  test("returns the prepared URL when URL copying is denied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    await expect(copyGitHubReviewUrl(input())).rejects.toMatchObject({
      message:
        "Tavernary could not copy the GitHub form URL. Copy it below instead.",
      url: expect.stringContaining("manifest="),
    });
  });

  test("does not copy an incomplete URL for an oversized submission", async () => {
    const writeText = vi.mocked(navigator.clipboard.writeText);

    await expect(
      copyGitHubReviewUrl(
        input({ serializedManifest: "x".repeat(7_100) }),
      ),
    ).rejects.toMatchObject({
      message:
        "This submission is too large to fit in a single URL. Use Continue on GitHub so Tavernary can copy the manifest separately.",
      url: null,
    });
    expect(writeText).not.toHaveBeenCalled();
  });
  ```

  Add an exact-parity test that runs `copyGitHubReviewUrl(input())`, clears the clipboard mock, runs `openGitHubReview(input())`, and compares the copied string with the first `window.open` argument.

- [ ] **Step 2: Run the shared tests red**

  ```powershell
  npm.cmd test -- tests/unit/github-handoff.test.ts
  ```

  Expected: FAIL because `copyGitHubReviewUrl` and `prepareGitHubReview` are not exported.

- [ ] **Step 3: Extract deterministic preparation**

  Move current URL construction into `prepareGitHubReview(input)`. It returns:

  - `{ mode: "prefilled", url: completeUrl }` when the complete URL is at most 7,000 characters;
  - `{ mode: "clipboard", url: recoveryUrl }` when the manifest must be copied separately; or
  - `GitHubHandoffError("GitHub review URL exceeds the safe handoff limit.", null)` when even the recovery URL is unsafe.

  Refactor `openGitHubReview(input)` to call this function. For `"clipboard"`, preserve the existing exact manifest clipboard/prompt behavior before opening `result.url`. For `"prefilled"`, open `result.url` directly. Keep popup-null recovery unchanged.

- [ ] **Step 4: Implement the non-navigating copy operation**

  Add:

  ```ts
  export async function copyGitHubReviewUrl(
    input: GitHubHandoffInput,
  ): Promise<GitHubHandoffResult> {
    const prepared = prepareGitHubReview(input);
    if (prepared.mode === "clipboard") {
      throw new GitHubHandoffError(
        "This submission is too large to fit in a single URL. Use Continue on GitHub so Tavernary can copy the manifest separately.",
        null,
      );
    }
    try {
      await navigator.clipboard.writeText(prepared.url);
    } catch {
      throw new GitHubHandoffError(
        "Tavernary could not copy the GitHub form URL. Copy it below instead.",
        prepared.url,
      );
    }
    return prepared;
  }
  ```

  Do not use `window.prompt`, `window.open`, an anchor click, or navigation in this operation.

- [ ] **Step 5: Add the project transport adapter red test**

  In `tests/unit/project-submission-transport.test.ts`, import `copyProjectSubmissionUrl`. Copy the project URL, then open the same manifest and assert:

  ```ts
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    String(windowOpen.mock.calls[0]?.[0]),
  );
  ```

  Also assert the copied URL contains the v4 `project-manifest` and all existing readable prefills.

- [ ] **Step 6: Implement one project input builder**

  In `submission-transport.ts`, extract:

  ```ts
  function projectHandoffInput(
    formUrl: string | URL,
    manifest: ProjectSubmissionManifest,
  ): GitHubHandoffInput;
  ```

  Make both public adapters consume it:

  ```ts
  export function openProjectSubmission(formUrl, manifest) {
    return openGitHubReview(projectHandoffInput(formUrl, manifest));
  }

  export function copyProjectSubmissionUrl(formUrl, manifest) {
    return copyGitHubReviewUrl(projectHandoffInput(formUrl, manifest));
  }
  ```

  Do not change serialization, prefills, template ID, or copy instructions.

- [ ] **Step 7: Run focused transport tests green**

  ```powershell
  npm.cmd test -- tests/unit/github-handoff.test.ts tests/unit/project-submission-transport.test.ts tests/unit/submission-transport.test.ts tests/unit/help-transport.test.ts
  ```

  Expected: PASS; existing Kit and Help handoffs retain their current behavior.

- [ ] **Step 8: Commit the transport boundary**

  ```powershell
  git add src/features/submissions/github-handoff.ts src/features/submissions/submission-transport.ts tests/unit/github-handoff.test.ts tests/unit/project-submission-transport.test.ts
  git commit -m "feat(submissions): add URL copy transport"
  ```

---

### Task 2: Add the Opt-In Review Action

**Files:**

- Modify: `src/features/submissions/components/submission-review.tsx`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/styles/submission.css`
- Test: `tests/unit/submission-review.test.tsx`
- Test: `tests/unit/project-submission-builder.test.tsx`

**Interfaces:**

- Consumes:

  ```ts
  copyProjectSubmissionUrl(
    formUrl: string | URL,
    manifest: ProjectSubmissionManifest,
  ): Promise<GitHubHandoffResult>;
  ```

- Produces the optional shared-review prop:

  ```ts
  copyReviewUrl?: () => Promise<GitHubHandoffResult>;
  ```

- [ ] **Step 1: Add failing shared-review tests**

  Extend `tests/unit/submission-review.test.tsx` to prove:

  - omitting `copyReviewUrl` renders no **Copy GitHub form URL** button or helper line;
  - providing it renders a button containing `[data-icon="copy-link"]`;
  - hover and keyboard focus expose the tooltip **Copy URL and paste into browser**;
  - clicking calls only `copyReviewUrl` and announces the exact success message;
  - `GitHubHandoffError` with a URL reveals a readonly textbox named **GitHub form URL**, with no link;
  - `GitHubHandoffError` with `url: null` shows only the oversized message; and
  - copying remains available after the normal review has opened.

  Use this success test shape:

  ```tsx
  const copyReviewUrl = vi.fn().mockResolvedValue({
    mode: "prefilled",
    url: "https://github.com/example/prepared",
  });
  const openReview = vi.fn();
  render(<SubmissionReview {...props({ copyReviewUrl, openReview })} />);

  await user.click(
    screen.getByRole("button", { name: "Copy GitHub form URL" }),
  );

  expect(copyReviewUrl).toHaveBeenCalledOnce();
  expect(openReview).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "GitHub form URL copied. Paste it into your browser's address bar.",
  );
  ```

- [ ] **Step 2: Run the component test red**

  ```powershell
  npm.cmd test -- tests/unit/submission-review.test.tsx
  ```

  Expected: FAIL because `copyReviewUrl` is not part of `SubmissionReviewProps`.

- [ ] **Step 3: Implement independent copy state and recovery**

  Add an independent state:

  ```ts
  type CopyState =
    | { phase: "idle" }
    | { phase: "copying" }
    | { phase: "copied" }
    | { phase: "recovery"; message: string; url: string | null };
  ```

  `handleCopy()` calls only `copyReviewUrl`. A success writes the exact status copy. A failure preserves `GitHubHandoffError.url`.

  For a recoverable URL, render a visible label and readonly text input:

  ```tsx
  <label htmlFor={`${headingId}-copy-url`}>GitHub form URL</label>
  <input
    id={`${headingId}-copy-url`}
    readOnly
    value={copyState.url}
    onFocus={(event) => event.currentTarget.select()}
  />
  ```

  Do not render this value through `<a>`.

- [ ] **Step 4: Render the grouped action**

  Import `Tooltip` and `CategoryIcon`. Wrap the normal continue/reopen button and the optional copy control in `.submission-review-primary-actions`. Render:

  ```tsx
  <Tooltip
    id={`${headingId}-copy-url-tooltip`}
    label="Copy URL and paste into browser"
    className="control-tooltip"
  >
    <button
      type="button"
      className="submission-review-copy-url"
      aria-label="Copy GitHub form URL"
      onClick={() => void handleCopy()}
      disabled={copyState.phase === "copying"}
    >
      <CategoryIcon name="copy-link" />
    </button>
  </Tooltip>
  ```

  When `copyReviewUrl` exists, render the helper line:

  > Prefer to open it yourself? Copy the completed URL and paste it into your browser.

  Keep the copy control available in idle, opened, and normal handoff-recovery states.

- [ ] **Step 5: Add failing project-builder wiring test**

  Extend the hoisted transport mock in `project-submission-builder.test.tsx` with `copyProjectSubmissionUrl`. Complete a valid project, enter review, click **Copy GitHub form URL**, and assert:

  - `copyProjectSubmissionUrl` receives the same form URL and normalized v4 manifest used by `openProjectSubmission`;
  - `openProjectSubmission` is not called;
  - the review remains visible; and
  - the copied status is announced.

- [ ] **Step 6: Wire only project submissions**

  Add `copyReviewUrl()` beside `openReview()` in `project-submission-builder.tsx`. It rebuilds and revalidates the current manifest, retains `reviewManifest`, and calls `copyProjectSubmissionUrl(projectSubmissionUrl, manifest)`.

  Pass `copyReviewUrl={copyReviewUrl}` to the project `SubmissionReview`. Do not modify Kit or Help call sites.

- [ ] **Step 7: Implement responsive action styling**

  In `submission.css`:

  ```css
  .submission-review-primary-actions {
    display: flex;
    align-items: stretch;
    gap: 8px;
  }

  .submission-review-primary-actions .submission-review-continue {
    flex: 1 1 auto;
  }

  .submission-review-primary-actions > .control-tooltip {
    display: inline-flex;
    flex: 0 0 44px;
  }

  .submission-review-copy-url {
    width: 44px;
    min-width: 44px;
    padding: 0;
    color: var(--color-text-primary);
    background: var(--color-bg-surface);
  }

  .submission-review-copy-url svg {
    width: 20px;
    height: 20px;
  }
  ```

  At `max-width: 560px`, keep `.submission-review-primary-actions` at
  `width: 100%`; override the existing full-width button rule so only the
  continue button grows and `.submission-review-copy-url` remains 44 pixels.
  Style the helper as muted copy and the recovery input with the existing
  submission control border/focus tokens.

- [ ] **Step 8: Run component and builder tests green**

  ```powershell
  npm.cmd test -- tests/unit/submission-review.test.tsx tests/unit/project-submission-builder.test.tsx
  npm.cmd run typecheck
  ```

  Expected: PASS; all pre-existing shared review consumers compile without the optional prop.

- [ ] **Step 9: Commit the review action**

  ```powershell
  git add src/features/submissions/components/submission-review.tsx src/features/submissions/components/project-submission-builder.tsx src/styles/submission.css tests/unit/submission-review.test.tsx tests/unit/project-submission-builder.test.tsx
  git commit -m "feat(submissions): add URL copy action"
  ```

---

### Task 3: Prove Browser Behavior and Responsive Layout

**Files:**

- Modify: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/visual/theme.visual.spec.ts`
- Modify only feature-owned files required to repair failures caused by this change.

**Interfaces:**

- Consumes the accessible names, tooltip copy, status copy, and CSS classes defined in Task 2.
- Produces no new runtime interface.

- [ ] **Step 1: Add the real-browser copy-path test**

  In `project-submission.spec.ts`, grant clipboard permissions, install the existing GitHub review recorder, complete a minimal valid Frontend submission, and enter review. Then:

  ```ts
  const copy = page.getByRole("button", { name: "Copy GitHub form URL" });
  await copy.hover();
  await expect(
    page.getByRole("tooltip", {
      name: "Copy URL and paste into browser",
    }),
  ).toBeVisible();

  await copy.click();
  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(await openedGitHubReviews(page)).toHaveLength(0);
  await expect(page.getByRole("status")).toHaveText(
    "GitHub form URL copied. Paste it into your browser's address bar.",
  );

  await page.getByRole("button", { name: "Continue on GitHub" }).click();
  expect((await openedGitHubReviews(page))[0]).toBe(copiedUrl);
  ```

  Decode `project-manifest` from `copiedUrl` and assert `schema_version: 4` plus the submitted project URL.

- [ ] **Step 2: Run the project browser test red, then green**

  ```powershell
  node scripts/run-playwright.mjs tests/e2e/project-submission.spec.ts
  ```

  Expected before Task 2 implementation: FAIL because the copy control is absent. Expected after Task 2: PASS.

- [ ] **Step 3: Add 320-pixel layout assertions**

  Extend the existing mobile submission test to complete a valid project and enter review. Assert:

  - **Continue on GitHub** and **Copy GitHub form URL** are both visible;
  - the copy button bounding box is at least 44 by 44 pixels;
  - both controls' vertical centers differ by no more than one pixel;
  - the copy button sits to the right of the primary button;
  - the helper line is visible; and
  - `document.documentElement.scrollWidth - window.innerWidth <= 0`.

- [ ] **Step 4: Add tablet and visual interaction assertions**

  In `theme.visual.spec.ts`, use an 820-pixel viewport and the project review fixture. Assert the copy button uses the secondary background/text tokens, retains a 44-pixel square, and shows the approved tooltip on hover. Then repeat the width/adjacency assertion at 1440 pixels without adding a new screenshot unless an existing baseline changes.

- [ ] **Step 5: Run focused browser and visual coverage**

  ```powershell
  node scripts/run-playwright.mjs tests/e2e/project-submission.spec.ts tests/e2e/mobile.spec.ts
  node scripts/run-playwright.mjs tests/visual/theme.visual.spec.ts
  ```

  Expected: PASS at desktop, tablet, and 320-pixel widths with no popup caused by the copy path.

- [ ] **Step 6: Run the complete repository gate**

  ```powershell
  npm.cmd run check
  npm.cmd run test:e2e
  ```

  Expected: formatting, lint, palette audit, catalog validation/build, typecheck, all Vitest tests, static build/export verification, and all E2E tests PASS.

- [ ] **Step 7: Inspect scope and commit verification**

  ```powershell
  git status --short
  git diff --check
  git diff --stat ce2eca4b..HEAD
  ```

  Confirm no schema, Issue Form, catalog data, dependency, Kit, or Help behavior changed. Then commit browser coverage:

  ```powershell
  git add tests/e2e/project-submission.spec.ts tests/e2e/mobile.spec.ts tests/visual/theme.visual.spec.ts
  git commit -m "test(submissions): verify URL copy flow"
  ```

- [ ] **Step 8: Perform completion verification**

  Invoke `superpowers:verification-before-completion`, rerun the focused unit
  tests and `git status --short`, and report exact commands, pass counts,
  commit range, and any unrelated pre-existing failures separately.
