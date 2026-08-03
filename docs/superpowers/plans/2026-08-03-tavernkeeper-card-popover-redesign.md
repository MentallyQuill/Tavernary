# TavernKeeper Card Popover Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the TavernKeeper catalog popover into a compact status card with a linked scanned commit, clearer hierarchy, no redundant malicious-evidence quotation, and no single-point history dot.

**Architecture:** Keep validated presentation data in `tavernkeeper-status.ts`, including an explicit exact-commit URL derived from the matched GitHub assessment. Recompose the existing popover into semantic header, summary, counts, metadata, conditional history, and footer regions without changing its portal or interaction controller. Scope all visual changes to the existing catalog stylesheet and preserve the report and full-history UIs.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, CSS, Vitest with Testing Library, Playwright visual and end-to-end tests.

## Global Constraints

- Change only the catalog card popover; do not modify the TavernKeeper report UI or full history page.
- Preserve the exact visible heading `TavernKeeper Scan Results` and `role="dialog"` accessibility contract.
- Set the desktop popover width to 320px with the existing `calc(100vw - 16px)` narrow-screen bound.
- Use at least 12px body text and existing TavernKeeper risk colors with visible text labels.
- Remove the standalone `malicious_evidence` quotation from the popover but leave the assessment contract and imported data intact.
- Render the history strip only for two through twelve conclusions; retain the history action for a single conclusion.
- Link the seven-character SHA to `https://github.com/{repository}/commit/{full target SHA}` using validated report fields.
- Preserve hover, focus, click/tap, Escape, outside-click, collision, pointer-delay, one-open-at-a-time, reduced-motion, and coarse-pointer behavior.
- Do not add dependencies or modify generated catalog data.

---

## File map

- `src/features/catalog/tavernkeeper-status.ts` — project validated report identity into an explicit card commit URL.
- `src/features/catalog/components/tavernkeeper-scan-indicator.tsx` — render the approved semantic regions and manage the first focusable popover link.
- `src/features/catalog/components/tavernkeeper-history-strip.tsx` — suppress meaningless zero- and one-point strips.
- `src/styles/catalog.css` — style the wider status-card hierarchy and responsive footer.
- `tests/unit/tavernkeeper-status.test.ts` — prove exact commit URL derivation.
- `tests/unit/tavernkeeper-scan-indicator.test.tsx` — prove content, links, history threshold, and focus order.
- `tests/unit/project-card.test.tsx` — keep the typed card fixture aligned with the new summary contract.
- `tests/e2e/catalog.spec.ts` — prove hydrated content, exact GitHub commit link, and conditional history behavior.
- `tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-*-win32.png` — reviewed popover baselines at desktop, compact, landscape, and phone sizes.

---

### Task 1: Expose the validated scanned-commit URL

**Files:**
- Modify: `src/features/catalog/tavernkeeper-status.ts:43-62,163-184`
- Test: `tests/unit/tavernkeeper-status.test.ts:230-247`
- Test fixture: `tests/unit/project-card.test.tsx:146-164`

**Interfaces:**
- Consumes: `TavernKeeperAssessedReport.repository: string` and `TavernKeeperAssessedReport.target_sha: string`, already accepted only after `reportMatchesSource` validates GitHub identity and active policy.
- Produces: `TavernKeeperReportSummary.commitUrl: string` containing the exact GitHub commit URL.

- [ ] **Step 1: Write the failing status projection assertion**

Extend `projects the concise final assessment without technical findings`:

```ts
expect(status.report).toMatchObject({
  riskLevel: "low",
  headline: "Low concern",
  minorCautions: 1,
  materialConcerns: 0,
  highDanger: 0,
  synthesisModel: "gpt-5.6-luna",
  commitUrl: `https://github.com/owner/repo/commit/${currentSha}`,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-status.test.ts
```

Expected: FAIL because `commitUrl` is absent from the projected summary.

- [ ] **Step 3: Add the explicit summary field and derivation**

Add the interface property beside `scannedSha`:

```ts
commitUrl: string;
```

Add the projection beside `scannedSha` in `summarize`:

```ts
commitUrl: `https://github.com/${report.repository}/commit/${report.target_sha}`,
```

Add the same property to the typed `project-card.test.tsx` fixture:

```ts
commitUrl:
  "https://github.com/owner/repository/commit/abc1234def5678abc1234def5678abc1234def5678",
```

- [ ] **Step 4: Run status and card tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx
```

Expected: both files PASS.

- [ ] **Step 5: Commit the data-contract change**

```powershell
git add src/features/catalog/tavernkeeper-status.ts tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx
git commit -m "feat(tavernkeeper): link scanned commits"
```

---

### Task 2: Recompose the popover and conditionally render history

**Files:**
- Modify: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx:120-380`
- Modify: `src/features/catalog/components/tavernkeeper-history-strip.tsx:18-52`
- Test: `tests/unit/tavernkeeper-scan-indicator.test.tsx:20-420`

**Interfaces:**
- Consumes: `TavernKeeperReportSummary.commitUrl`, existing assessment counts, dates, history, report URL, and `TavernKeeperCardStatus.freshness`.
- Produces: semantic `.tavernkeeper-popover-header`, `.tavernkeeper-summary`, `.tavernkeeper-scan-details`, `.tavernkeeper-recent-history`, and `.tavernkeeper-popover-actions` regions; `TavernKeeperHistoryStrip` returns `null` for fewer than two reports.

- [ ] **Step 1: Update the typed scan fixture and write failing content assertions**

Add to `scanReport`:

```ts
commitUrl:
  "https://github.com/owner/repository/commit/abc1234def5678abc1234def5678abc1234def5678",
```

Replace the current assessed-popover assertions with:

```ts
expect(panel).toHaveTextContent("High concern");
expect(panel).toHaveTextContent("current");
expect(panel).toHaveTextContent(redReport.summary);
expect(panel).toHaveTextContent("1 minor caution");
expect(panel).toHaveTextContent("2 material concerns");
expect(panel).toHaveTextContent("1 high-danger finding");
expect(panel).not.toHaveTextContent(redReport.maliciousEvidence);

const commitLink = within(panel).getByRole("link", {
  name: `View scanned commit ${redReport.scannedSha} on GitHub`,
});
expect(commitLink).toHaveTextContent(redReport.scannedSha.slice(0, 7));
expect(commitLink).toHaveAttribute("href", redReport.commitUrl);
expect(commitLink).toHaveAttribute("target", "_blank");
expect(commitLink).toHaveAttribute("rel", expect.stringContaining("noopener"));

expect(within(panel).getByRole("link", { name: "View full report" }))
  .toHaveAttribute("href", redReport.reportUrl);
expect(within(panel).getByRole("link", { name: "View scan history" }))
  .toHaveAttribute("href", redStatus.historyUrl);
expect(within(panel).queryByRole("group", {
  name: "Recent TavernKeeper scan history",
})).not.toBeInTheDocument();
```

- [ ] **Step 2: Add failing history-threshold tests**

Add a two-entry case before the existing twelve-entry test:

```ts
test("shows labeled history only when it communicates a trend", () => {
  const prior = scanReport({
    reportId: "report-prior",
    riskLevel: "material",
    reportUrl: "https://example.test/reports/prior",
    assessedAt: "2026-07-30T12:05:00.000Z",
  });
  render(
    <TavernKeeperScanIndicator
      projectId="history-threshold"
      status={{ ...tealStatus, history: [prior, tealReport] }}
    />,
  );
  fireEvent.click(screen.getByRole("button"));

  expect(screen.getByText("Recent scans")).toBeInTheDocument();
  expect(screen.getAllByRole("img", {
    name: /TavernKeeper scan history:/u,
  })).toHaveLength(2);
});
```

- [ ] **Step 3: Update the non-modal focus-order test for the new first link**

For the one-entry `redStatus`, assert this route:

```ts
await user.tab();
expect(trigger).toHaveFocus();
await user.tab();
expect(screen.getByRole("link", {
  name: `View scanned commit ${redReport.scannedSha} on GitHub`,
})).toHaveFocus();
await user.tab();
expect(screen.getByRole("link", { name: "View full report" })).toHaveFocus();
await user.tab();
expect(screen.getByRole("link", { name: "View scan history" })).toHaveFocus();
```

Then reverse the same route with Shift+Tab and preserve the linkless pending-panel assertion.

- [ ] **Step 4: Run the component tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-scan-indicator.test.tsx
```

Expected: FAIL on the missing commit link and regions, old malicious-evidence text, old history-link label, and one-point strip.

- [ ] **Step 5: Suppress history strips with fewer than two conclusions**

Change the history guard to:

```ts
const conclusions = history.slice(-12);
if (conclusions.length < 2) return null;
```

- [ ] **Step 6: Replace report-link focus state with first-link focus state**

Rename `reportLinkRef` and its callbacks to describe the first popover link:

```ts
const firstLinkRef = useRef<HTMLAnchorElement>(null);

const focusFirstLink = useCallback(
  (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Tab" || event.shiftKey || !open || !firstLinkRef.current) {
      return;
    }
    event.preventDefault();
    firstLinkRef.current.focus();
  },
  [open],
);
```

Attach `onKeyDown={focusFirstLink}` to the trigger and attach `ref={firstLinkRef}` plus `onKeyDown={focusTrigger}` to the commit link. Later links use normal DOM tab order.

- [ ] **Step 7: Render the approved semantic status-card regions**

Replace the assessed-report fragment with this structure, preserving the existing state-copy and date helpers:

```tsx
<header className="tavernkeeper-popover-header">
  <h2 id={headingId}>TavernKeeper Scan Results</h2>
  {report ? (
    <span
      className={`tavernkeeper-popover-status tavernkeeper-popover-status-${status.state}`}
    >
      <strong>{riskGradeLabels[report.riskLevel]}</strong>
      <span>{freshnessLabels[status.freshness]}</span>
    </span>
  ) : null}
</header>
{report ? (
  <>
    <p className="tavernkeeper-summary">{content}</p>
    <p
      aria-label="Assessment finding counts"
      className="tavernkeeper-assessment-counts"
    >
      <span>{countLabel(report.minorCautions, "minor caution")}</span>
      <span>{countLabel(report.materialConcerns, "material concern")}</span>
      <span>{countLabel(report.highDanger, "high-danger finding")}</span>
    </p>
    <dl className="tavernkeeper-scan-details">
      <div>
        <dt>Scanned</dt>
        <dd>
          <time dateTime={report.scannedAt}>{formatDate(report.scannedAt)}</time>
          <span aria-hidden="true"> · </span>
          <a
            aria-label={`View scanned commit ${report.scannedSha} on GitHub`}
            href={report.commitUrl}
            onKeyDown={focusTrigger}
            ref={firstLinkRef}
            rel="noopener noreferrer"
            target="_blank"
          >
            {report.scannedSha.slice(0, 7)}
            <span aria-hidden="true"> ↗</span>
          </a>
        </dd>
      </div>
      <div>
        <dt>Assessed</dt>
        <dd>
          <time dateTime={report.assessedAt}>{formatDate(report.assessedAt)}</time>
          {" by Tavernary"}
        </dd>
      </div>
    </dl>
    {status.history.length >= 2 ? (
      <div className="tavernkeeper-recent-history">
        <span>Recent scans</span>
        <TavernKeeperHistoryStrip history={status.history} />
      </div>
    ) : null}
    <footer className="tavernkeeper-popover-actions">
      <a href={report.reportUrl} rel="noopener noreferrer" target="_blank">
        View full report<span aria-hidden="true"> ↗</span>
      </a>
      {status.historyUrl ? (
        <Link href={status.historyUrl}>
          View scan history<span aria-hidden="true"> →</span>
        </Link>
      ) : null}
    </footer>
  </>
) : (
  <p className="tavernkeeper-summary">{content}</p>
)}
```

- [ ] **Step 8: Run component tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-scan-indicator.test.tsx
```

Expected: PASS with the new link, content hierarchy, history threshold, and keyboard route.

- [ ] **Step 9: Commit the semantic component change**

```powershell
git add src/features/catalog/components/tavernkeeper-scan-indicator.tsx src/features/catalog/components/tavernkeeper-history-strip.tsx tests/unit/tavernkeeper-scan-indicator.test.tsx
git commit -m "refactor(tavernkeeper): simplify scan popover"
```

---

### Task 3: Style and verify the compact status card

**Files:**
- Modify: `src/styles/catalog.css:1497-1595`
- Modify: `tests/e2e/catalog.spec.ts:1150-1200`
- Update: `tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-*-win32.png`

**Interfaces:**
- Consumes: semantic class names produced by Task 2 and existing color, border, shadow, motion, and focus variables.
- Produces: a 320px responsive status-card layout with a structured header, readable body, secondary metadata, labeled multi-entry history, and grouped footer actions.

- [ ] **Step 1: Update hydrated end-to-end expectations before styling**

Replace paragraph-index assertions with semantic selectors and add the exact commit-link check:

```ts
await expect(panel.locator(".tavernkeeper-summary")).toHaveText(stateCopy);
await expect(
  panel.locator(".tavernkeeper-assessment-counts span"),
).toHaveCount(3);
await expect(panel.locator(".tavernkeeper-scan-details div")).toHaveCount(2);
await expect(panel.locator(".tavernkeeper-malicious-evidence")).toHaveCount(0);

const commitLink = panel.getByRole("link", {
  name: /View scanned commit [0-9a-f]{40} on GitHub/u,
});
await expect(commitLink).toHaveAttribute(
  "href",
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{40}$/u,
);
await expect(commitLink).toHaveAttribute("target", "_blank");
await expect(commitLink).toHaveAttribute("rel", /\bnoopener\b/u);
await expect(
  panel.getByRole("link", { name: "View scan history" }),
).toHaveAttribute(
  "href",
  /\/security\/tavernkeeper\/history\/github-\d+\/?$/u,
);
```

For the fixture's single-report states, assert `.tavernkeeper-history-strip` has count zero. Keep the separate multi-report visual test's existing history-count assertion.

- [ ] **Step 2: Run focused unit and scan end-to-end tests**

Run:

```powershell
npm.cmd run test:scan-e2e
```

Expected: PASS behaviorally before snapshot refresh.

- [ ] **Step 3: Apply the approved scoped CSS**

Replace the popover presentation rules with:

```css
.tavernkeeper-popover {
  position: fixed;
  z-index: 120;
  display: grid;
  width: min(320px, calc(100vw - 16px));
  max-height: calc(
    100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
  );
  gap: 12px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--color-text-primary);
  background: var(--color-bg-surface-raised);
  box-shadow: var(--shadow-overlay);
  font-size: 12px;
  line-height: 1.5;
}

.tavernkeeper-popover-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}

.tavernkeeper-popover-status {
  display: grid;
  border-left: 2px solid currentColor;
  padding-left: 8px;
  text-align: right;
}

.tavernkeeper-popover-status > span {
  color: var(--color-text-secondary);
  font-size: 10px;
  text-transform: capitalize;
}

.tavernkeeper-summary {
  color: var(--color-text-primary);
}

.tavernkeeper-assessment-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 0;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.tavernkeeper-assessment-counts span + span::before {
  display: inline-block;
  height: 0.85em;
  margin: 0 8px;
  border-left: 1px solid var(--color-border-strong);
  content: "";
  vertical-align: -0.05em;
}

.tavernkeeper-scan-details {
  display: grid;
  gap: 4px;
  margin: 0;
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 10px;
  color: var(--color-text-secondary);
}

.tavernkeeper-scan-details div {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
}

.tavernkeeper-scan-details dt,
.tavernkeeper-scan-details dd {
  margin: 0;
}

.tavernkeeper-scan-details dt {
  font-weight: 650;
}

.tavernkeeper-recent-history {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.tavernkeeper-popover-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 16px;
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 10px;
}
```

Keep the existing scoped anchor, focus-visible, history-color, hover, and reduced-motion rules. Use an existing border token verified in `catalog.css`; if `--color-border-subtle` is not defined, use the existing `--color-border` token rather than adding a new global token.

- [ ] **Step 4: Run formatting, lint, types, and focused unit tests**

Run:

```powershell
npm.cmd run format -- src/features/catalog/tavernkeeper-status.ts src/features/catalog/components/tavernkeeper-scan-indicator.tsx src/features/catalog/components/tavernkeeper-history-strip.tsx src/styles/catalog.css tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx tests/unit/tavernkeeper-scan-indicator.test.tsx tests/e2e/catalog.spec.ts
npm.cmd run lint
npm.cmd run typecheck
npx.cmd vitest run tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx tests/unit/tavernkeeper-scan-indicator.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 5: Refresh focused scan visual baselines**

Run:

```powershell
npm.cmd run test:scan-visual -- --update-snapshots
```

Expected: Playwright passes and updates only `scan-popover-*-win32.png` snapshots affected by the new layout.

- [ ] **Step 6: Inspect representative desktop and phone baselines**

Open and verify:

```text
tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-desktop-short-win32.png
tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-phone-short-win32.png
tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-history-desktop-win32.png
```

Confirm the panel stays within the viewport, the header does not collide, the summary reads as one paragraph, counts remain legible, the SHA looks clickable, multi-scan history is labeled, and footer actions do not resemble a bulleted list.

- [ ] **Step 7: Run the complete focused TavernKeeper verification**

Run:

```powershell
npm.cmd run test:scan
npm.cmd run test:scan-e2e
npm.cmd run test:scan-visual
```

Expected: all focused behavioral, mobile, performance, and visual checks PASS without further snapshot changes.

- [ ] **Step 8: Review the final diff and commit**

Run:

```powershell
git diff --check
git status --short
```

Verify only the planned source, tests, and scan-popover snapshots changed, then commit:

```powershell
git add src/styles/catalog.css tests/e2e/catalog.spec.ts tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-*-win32.png
git commit -m "style(tavernkeeper): refine scan popover"
```

---

## Final verification

- [ ] Run `git status --short` and confirm the worktree is clean.
- [ ] Run `git log -5 --oneline` and confirm the design, plan, data, component, and styling commits are present in logical order.
- [ ] Record exact focused test results and the representative baselines inspected in the implementation handoff.
