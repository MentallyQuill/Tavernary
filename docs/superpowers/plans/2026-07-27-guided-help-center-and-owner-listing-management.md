# Guided Help Center and Owner Listing Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tavernary's generic GitHub Help destination with a guided
static Help center and let verified personal GitHub repository owners propose
reviewable card edits, same-repository source moves, and delisting requests.

**Architecture:** Build the public Help experience as static Next.js routes
backed by shared, versioned manifest and GitHub handoff modules. Ordinary
reports are validated and labeled but never mutate catalog data. Owner requests
use a separate manifest, exact GitHub identity verification against the
record's immutable repository ID, and an issue-owned generated review PR before
any canonical registry change.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 6, Node.js 24 ESM,
GitHub Issue Forms, GitHub Actions, GitHub REST API, Vitest, Testing Library,
Playwright, AJV, YAML, and Prettier.

## Global Constraints

- Read
  `docs/superpowers/specs/2026-07-27-guided-help-center-and-owner-listing-management-design.md`
  before implementing any task.
- Tavernary remains static and build-time: no accounts, OAuth, runtime
  database, runtime API, or project hosting.
- Tavernary prepares requests; GitHub supplies authenticated identity, the
  final Create action, discussion, and audit history.
- No browser Help form submits a GitHub issue directly.
- Public Help form prose is never saved in `localStorage` or analytics.
- Private security content is never accepted, serialized, prefilled, or logged
  by Tavernary.
- The private security destination is
  `https://github.com/MentallyQuill/Tavernary/security/advisories/new`, with the
  repository Security page as its only fallback.
- Owner automation accepts only a public GitHub repository with a non-null
  stored `repository_id`, a current personal-user owner, and an issue author
  login matching that owner case-insensitively.
- Collaborators, maintainers, organization members, organizations, external
  URL records, and rights holders do not satisfy automated owner verification.
- An owner summary is single-line normalized plain text, required, and at most
  220 characters; it is not subject to the automatic two-sentence or 24–36-word
  contract.
- Owner card edits set `metadata_status: "curated"` and
  `enrichment_policy: "manual"` while preserving `refresh_policy`.
- Delisting retains the registry record and sets
  `visibility: "disabled"`, `visibility_reason: "removed"`,
  `refresh_policy: "paused"`, and `enrichment_policy: "manual"`.
- A source move may update only the current location of the same immutable
  GitHub repository ID.
- Canonical project records live in `data/registry/projects/*.json`.
- GitHub snapshots live in `data/snapshots/github/*.json`.
- `src/generated/catalog.json` is rebuilt for validation and is not staged by
  owner automation.
- JSON writers use `scripts/catalog/json-format.mjs`.
- All user text, URL parameters, issue fields, manifests, repository metadata,
  and original values supplied by the browser are untrusted.
- GitHub Actions use Node 24, pinned first-party action SHAs, minimal
  permissions, deterministic concurrency, and guarded branch updates.
- Generated owner PRs never auto-merge and never overwrite maintainer changes.
- Use `npm.cmd` for local Windows commands.
- Preserve unrelated worktree changes and stage only the files named by each
  task.
- At execution time, use `superpowers:using-git-worktrees` before production
  edits unless the user explicitly chooses the current worktree.

---

## File Structure

### Shared Help domain and handoff

- `src/features/help/help-manifest.mjs` — normalization and validation for the
  four public request manifests.
- `src/features/help/help-manifest.d.mts` — exact public manifest types.
- `src/features/help/help-transport.ts` — safe, bounded GitHub Issue Form
  handoff shared by all Help builders.
- `src/features/help/help-options.ts` — exact public categories, labels, copy,
  and route definitions.
- `src/features/help/components/help-page-shell.tsx` — common page navigation,
  heading, lead, fallback, and review framing.
- `src/features/help/components/help-review.tsx` — public-payload preview and
  Back/Cancel/Continue actions.
- `src/features/help/components/help-form-fields.tsx` — labeled controls,
  error summary, character count, and controlled option groups.

### Public Help routes

- `src/app/help/page.tsx` — approved five-choice hub and separate security
  notice.
- `src/app/help/report-project/page.tsx` — supplies catalog project options.
- `src/app/help/report-website/page.tsx` — website report route.
- `src/app/help/report-kit/page.tsx` — supplies published Kit options.
- `src/app/help/other/page.tsx` — other-help route and routing reminders.
- `src/app/help/security/page.tsx` — private-report guidance with no prose form.
- `src/features/help/components/project-report-form.tsx` — project report
  selection, conditional fields, review, and handoff.
- `src/features/help/components/website-report-form.tsx` — website diagnostic
  form and safe build context.
- `src/features/help/components/kit-report-form.tsx` — Kit selection,
  conditional affected-project selection, review, and handoff.
- `src/features/help/components/other-help-form.tsx` — constrained escape-hatch
  form.
- `src/styles/help.css` — production Help page and form styling.

### Public GitHub intake

- `.github/ISSUE_TEMPLATE/02-project-information.yml` — prefillable project
  report fallback.
- `.github/ISSUE_TEMPLATE/03-website-bug.yml` — prefillable website fallback.
- `.github/ISSUE_TEMPLATE/04-other.yml` — prefillable Other Help fallback.
- `.github/ISSUE_TEMPLATE/06-kit-report.yml` — prefillable Kit fallback.
- `scripts/help/parse-help-issue.mjs` — manifest-first parsing with readable
  heading fallback.
- `scripts/help/parse-help-issue.d.mts` — parser result types.
- `scripts/help/help-labels.mjs` — single owned label inventory and category
  mapping shared by admission and report triage.
- `scripts/help/help-labels.d.mts` — label mapping interfaces.
- `scripts/help/triage-help-issue.mjs` — current-issue validation and exact
  category-label synchronization.
- `scripts/help/triage-help-issue.d.mts` — triage interfaces.
- `.github/workflows/triage-help-request.yml` — read-only report triage.
- `scripts/submissions/admit-issue.mjs` — label/body routing and label
  provisioning for Help and owner requests.
- `.github/workflows/admit-issue.yml` — dispatches report and owner routes.

### Owner management browser experience

- `src/features/help/project-owner-manifest.mjs` — owner request normalization.
- `src/features/help/project-owner-manifest.d.mts` — owner request union types.
- `src/features/help/project-owner-record.mjs` — deterministic registry-record
  fingerprint shared by static build and workflow code.
- `src/features/help/project-owner-record.d.mts` — fingerprint interface.
- `src/lib/help/load-owner-project-options.ts` — static-build registry reader,
  source fingerprint, and owner eligibility DTO.
- `src/app/help/manage-project/page.tsx` — supplies owner-manageable records and
  controlled vocabularies.
- `src/features/help/components/project-owner-builder.tsx` — project selection,
  edit/source/delist branches, review, and handoff.
- `.github/ISSUE_TEMPLATE/08-project-owner-request.yml` — direct accessible
  owner-request fallback.

### Owner verification and mutation

- `scripts/help/project-owner-authority.mjs` — pure exact-owner and repository
  identity decisions.
- `scripts/help/project-owner-authority.d.mts` — authority interfaces.
- `scripts/help/apply-project-owner-request.mjs` — pure registry/snapshot
  mutations and changed-path report.
- `scripts/help/apply-project-owner-request.d.mts` — mutation interfaces.
- `scripts/help/triage-project-owner-request.mjs` — fetches issue and repository,
  re-reads registry, validates authority, and emits admitted generation input.
- `scripts/help/generate-project-owner-request.mjs` — revalidates and writes
  only approved registry/snapshot paths.
- `scripts/help/project-owner-pr.mjs` — deterministic branch, marker, safe PR
  body, collision, and regeneration planning.
- `scripts/help/project-owner-pr.d.mts` — PR interfaces.
- `scripts/help/project-owner-lifecycle.mjs` — merged/declined cleanup plan.
- `scripts/help/project-owner-lifecycle.d.mts` — lifecycle interfaces.
- `.github/workflows/triage-project-owner-request.yml` — read-only authority
  gate and privileged-generation dispatch.
- `.github/workflows/generate-project-owner-request.yml` — guarded mutation
  branch and review PR generation.
- `.github/workflows/project-owner-request-lifecycle.yml` — issue/label/branch
  result synchronization from default-branch code.

---

## Wave A: Public Guided Help

### Task 1: Define public Help manifests and bounded GitHub transport

**Files:**

- Create: `src/features/help/help-manifest.mjs`
- Create: `src/features/help/help-manifest.d.mts`
- Create: `src/features/help/help-transport.ts`
- Create: `src/features/help/help-options.ts`
- Test: `tests/unit/help-manifest.test.ts`
- Test: `tests/unit/help-transport.test.ts`

**Interfaces:**

- Produces:
  `normalizeHelpManifest(value: unknown): HelpManifestValidation`
- Produces:
  `serializeHelpManifest(manifest: object): string`
- Produces:
  `openHelpRequest(input: HelpHandoffInput): Promise<"prefilled" | "clipboard">`
- `PublicHelpManifest` is:

```ts
type PublicHelpManifest =
  | HelpEnvelope<"project-report", ProjectReportPayload>
  | HelpEnvelope<"website-bug", WebsiteBugPayload>
  | HelpEnvelope<"kit-report", KitReportPayload>
  | HelpEnvelope<"other-help", OtherHelpPayload>;

interface HelpEnvelope<K extends string, P> {
  schema_version: 1;
  request_kind: K;
  origin: {
    page_url: string;
    site_revision: string;
  };
  payload: P;
}

interface HelpHandoffInput {
  formUrl: string | URL;
  template: string;
  manifest: object;
  manifestFieldId: "help-manifest" | "owner-request-manifest";
  prefills: Array<readonly [fieldId: string, value: string]>;
  pasteInstruction: string;
}
```

- `openHelpRequest` owns the 7,000-character URL ceiling and preserves prefills
  in caller-provided priority order.

- [ ] **Step 1: Write failing manifest boundary tests**

Add fixtures for every discriminant and exact limits:

```ts
test("normalizes a project report without trusting whitespace", () => {
  expect(
    normalizeHelpManifest({
      schema_version: 1,
      request_kind: "project-report",
      origin: { page_url: "/help/report-project/", site_revision: "abc123" },
      payload: {
        project_id: " example-project ",
        canonical_source: " https://github.com/Owner/Repo ",
        category: "incorrect-information",
        report: " The displayed frontend is wrong. ",
        requested_outcome: "",
        evidence: " https://github.com/Owner/Repo/blob/main/README.md ",
      },
    }),
  ).toMatchObject({
    valid: true,
    manifest: {
      payload: {
        project_id: "example-project",
        requested_outcome: null,
      },
    },
  });
});

test("rejects unknown kinds and oversized prose", () => {
  expect(
    normalizeHelpManifest({
      schema_version: 1,
      request_kind: "blank",
      origin: { page_url: "/help/", site_revision: "local" },
      payload: { details: "x".repeat(3_001) },
    }),
  ).toEqual({
    valid: false,
    errors: expect.arrayContaining(["Help request kind is invalid."]),
  });
});
```

- [ ] **Step 2: Run manifest tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/help-manifest.test.ts
```

Expected: FAIL because the Help manifest module does not exist.

- [ ] **Step 3: Implement exact public categories and normalizers**

Export frozen category arrays from `help-options.ts`:

```ts
export const PROJECT_REPORT_CATEGORIES = [
  "incorrect-information",
  "source-moved-or-unavailable",
  "duplicate-or-wrong-listing",
  "unsafe-or-malicious",
  "abusive-or-inappropriate",
  "rights-concern",
  "other-listing-concern",
] as const;

export const WEBSITE_BUG_CATEGORIES = [
  "search-filter-sort",
  "navigation-link",
  "display-layout-theme",
  "form-submission-handoff",
  "kit-builder-catalog-interaction",
  "accessibility",
  "performance-loading",
  "other-website-behavior",
] as const;
```

Also export the approved Kit and Other Help categories. The pure normalizer
must trim nullable fields, deduplicate affected project IDs, enforce HTTPS or
site-relative origin URLs, reject unknown object properties, and enforce the
spec's exact per-field limits.

- [ ] **Step 4: Write failing transport tests**

Cover normal handoff, prefill ordering, clipboard success, prompt fallback, and
an impossible oversized fallback:

```ts
test("opens a readable GitHub form with the authoritative manifest", async () => {
  await expect(
    openHelpRequest({
      formUrl: "https://github.com/example/repo/issues/new",
      template: "03-website-bug.yml",
      manifest: websiteManifest,
      manifestFieldId: "help-manifest",
      prefills: [
        ["category", "Accessibility problem"],
        ["page-url", "https://tavernary.org/"],
      ],
      pasteInstruction: "Paste the Help manifest copied by Tavernary here.",
    }),
  ).resolves.toBe("prefilled");
  const opened = new URL(vi.mocked(window.open).mock.calls[0][0] as string);
  expect(opened.searchParams.get("template")).toBe("03-website-bug.yml");
  expect(JSON.parse(opened.searchParams.get("help-manifest")!)).toMatchObject({
    request_kind: "website-bug",
  });
});
```

- [ ] **Step 5: Implement the shared transport**

Use the current project-submission safety behavior, but keep the generic module
independent of request copy:

```ts
for (const [fieldId, value] of input.prefills) {
  target.searchParams.set(fieldId, value);
}
target.searchParams.set(
  input.manifestFieldId,
  serializeHelpManifest(input.manifest),
);

if (target.toString().length <= MAX_PREFILL_URL_LENGTH) {
  window.open(target, "_blank", "noopener,noreferrer");
  return "prefilled";
}
```

On overflow, copy or expose the complete manifest, replace the caller-selected
manifest field with the paste instruction, add prefills in priority order only
while the URL remains within 7,000 characters, then open GitHub. If
`window.open` returns `null`, throw a handoff error and retain every form value
so the UI can expose the direct fallback link without claiming success.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/help-manifest.test.ts tests/unit/help-transport.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the shared Help domain**

```powershell
git add -- src/features/help/help-manifest.mjs src/features/help/help-manifest.d.mts src/features/help/help-transport.ts src/features/help/help-options.ts tests/unit/help-manifest.test.ts tests/unit/help-transport.test.ts
git commit -m "feat(help): define request manifests"
```

---

### Task 2: Build the Help hub, common shell, and private security route

**Files:**

- Create: `src/app/help/page.tsx`
- Create: `src/app/help/security/page.tsx`
- Create: `src/features/help/components/help-page-shell.tsx`
- Create: `src/features/help/components/help-review.tsx`
- Create: `src/features/help/components/help-form-fields.tsx`
- Create: `src/styles/help.css`
- Modify: `src/app/globals.css`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/app/about/page.tsx`
- Test: `tests/unit/help-page.test.tsx`
- Test: `tests/unit/about-page.test.tsx`
- Modify: `tests/e2e/contribution-links.spec.ts`

**Interfaces:**

- `HelpPageShell` receives `kicker`, `title`, `lead`, and `children`.
- `HelpReview` receives public labeled rows and async Continue callback; it
  never receives security prose.
- `HelpFormFields` exports `HelpErrorSummary`, `HelpTextField`,
  `HelpTextArea`, and `HelpChoiceGroup`.

- [ ] **Step 1: Write failing hub and security tests**

```tsx
test("shows five ordinary Help paths in approved order", () => {
  render(<HelpPage />);
  expect(
    screen.getAllByRole("link").map((link) => link.textContent?.trim()),
  ).toEqual(
    expect.arrayContaining([
      "Manage your project listing",
      "Report a project listing",
      "Report a website problem",
      "Report a Kit",
      "Get other help",
    ]),
  );
  expect(
    screen.getByRole("link", { name: "Open private security reporting" }),
  ).toHaveAttribute("href", "/help/security/");
});

test("never exposes a public issue link from the security page", () => {
  render(<SecurityHelpPage />);
  expect(
    screen.getByRole("link", { name: "Open GitHub's private report form" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/security/advisories/new",
  );
  expect(document.body.innerHTML).not.toContain("/issues/new");
});
```

- [ ] **Step 2: Run page tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/help-page.test.tsx tests/unit/about-page.test.tsx
```

Expected: FAIL because the Help routes do not exist and About still points to
GitHub's chooser.

- [ ] **Step 3: Implement the exact hub content**

Render semantic links with the approved title and description. Add quiet links
to Submit Project and catalog documentation. Render the security callout after
the ordinary paths and distinguish it with heading, icon-independent text, and
structure.

The security page must contain only explanatory copy and these actions:

```tsx
<a href="https://github.com/MentallyQuill/Tavernary/security/advisories/new">
  Open GitHub&apos;s private report form
</a>
<a href="https://github.com/MentallyQuill/Tavernary/security">
  Read the security policy
</a>
<Link href="/help/report-project/">
  Report an unsafe listed project instead
</Link>
```

- [ ] **Step 4: Implement reusable accessible form framing**

`HelpErrorSummary` is rendered only after validation, has `tabIndex={-1}`, and
is focused from an effect. Field errors are connected through
`aria-describedby`; counts use a polite status region. `HelpReview` provides
Back, Cancel, and Continue on GitHub without clearing form state before a
successful handoff.

- [ ] **Step 5: Route header and About Help links**

Use base-path-safe Next `Link` components:

```tsx
<Link className="top-link" href="/help/">
  Help
</Link>
```

Update About's Help report form and Get help links to `/help/`. Keep the direct
private security link in About aligned with the private Help page.

- [ ] **Step 6: Add production Help styling**

Import `help.css` from `globals.css`. Reuse the submission page's 760 px reading
width, existing tokens, 44 px controls, graphite surfaces, teal section
accents, and heritage-orange Continue action. At 320 px, choice cards, long
URLs, review rows, and actions must wrap without horizontal overflow.

- [ ] **Step 7: Run tests and static build**

Run:

```powershell
npm.cmd test -- tests/unit/help-page.test.tsx tests/unit/about-page.test.tsx
npm.cmd run build
npm.cmd run verify:export
```

Expected: PASS, with `out/help/index.html` and
`out/help/security/index.html`.

- [ ] **Step 8: Commit the Help shell**

```powershell
git add -- src/app/help/page.tsx src/app/help/security/page.tsx src/features/help/components/help-page-shell.tsx src/features/help/components/help-review.tsx src/features/help/components/help-form-fields.tsx src/styles/help.css src/app/globals.css src/features/catalog/components/site-header.tsx src/app/about/page.tsx tests/unit/help-page.test.tsx tests/unit/about-page.test.tsx tests/e2e/contribution-links.spec.ts
git commit -m "feat(help): add guided help hub"
```

---

### Task 3: Implement the project-listing report tree

**Files:**

- Create: `src/app/help/report-project/page.tsx`
- Create: `src/features/help/components/project-report-form.tsx`
- Test: `tests/unit/project-report-form.test.tsx`
- Test: `tests/unit/help-project-options.test.ts`
- Create: `tests/e2e/help-project-report.spec.ts`

**Interfaces:**

- The page maps `loadCatalog().projects` to:

```ts
interface HelpProjectOption {
  id: string;
  name: string;
  creator: string;
  canonicalUrl: string;
  searchableText: string;
}
```

- `ProjectReportForm` consumes `projects` and `siteRevision`; as a client
  component it reads and validates `project` with `useSearchParams()`. The
  static server page does not consume runtime query parameters.
- The route wraps the client form in `Suspense` with a text loading fallback;
  this is required for static export when `useSearchParams()` is used.

- [ ] **Step 1: Write failing project-selection and branch tests**

```tsx
test("preselects only an existing project from the query", () => {
  mockSearchParams("project=wandlight");
  render(<ProjectReportForm projects={projects} siteRevision="abc" />);
  expect(screen.getByLabelText("Project")).toHaveValue("wandlight");
});

test("shows category-specific correction guidance", async () => {
  renderProjectReport();
  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "duplicate-or-wrong-listing",
  );
  expect(screen.getByText(/which listing should remain/iu)).toBeVisible();
});
```

Also prove an unknown query ID is ignored, arbitrary unlisted URLs cannot be
submitted, owner guidance links to `/help/manage-project/`, and a Tavernary
vulnerability routes to `/help/security/`.

- [ ] **Step 2: Run project report tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-report-form.test.tsx tests/unit/help-project-options.test.ts
```

Expected: FAIL because the route and form do not exist.

- [ ] **Step 3: Implement catalog selection and conditional fields**

Use a labeled search input plus controlled project select. The form constructs
this payload:

```ts
const payload = {
  project_id: selected.id,
  canonical_source: selected.canonicalUrl,
  category,
  report: report.trim(),
  requested_outcome: nullable(requestedOutcome),
  evidence: nullable(evidence),
};
```

Derive `creator` from `project.attribution?.owner.login`; for records without
attribution, use the canonical URL hostname rather than inventing an owner.
Apply exact limits: report 3,000, outcome 1,000, evidence 2,000. Category copy
must match the approved design, including rights and public-information
warnings.

- [ ] **Step 4: Implement review and GitHub handoff**

Use `02-project-information.yml` and prioritized prefills:

```ts
[
  ["project", `${selected.name} — ${selected.canonicalUrl}`],
  ["category", displayProjectReportCategory(category)],
  ["report", report.trim()],
  ["requested-outcome", requestedOutcome.trim()],
  ["evidence", evidence.trim()],
]
```

Review must show exactly those public values. The manifest supplies project ID
and canonical source independently of the readable display string.

- [ ] **Step 5: Add focused browser coverage**

The E2E test opens `/help/report-project/?project=<id>`, completes a correction,
intercepts `window.open`, and asserts the generated GitHub URL includes the
template, readable values, and valid manifest without creating an issue.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-report-form.test.tsx tests/unit/help-project-options.test.ts tests/unit/help-manifest.test.ts tests/unit/help-transport.test.ts
npm.cmd run build
npm.cmd run test:e2e -- help-project-report.spec.ts
```

Expected: PASS.

Commit:

```powershell
git add -- src/app/help/report-project/page.tsx src/features/help/components/project-report-form.tsx tests/unit/project-report-form.test.tsx tests/unit/help-project-options.test.ts tests/e2e/help-project-report.spec.ts
git commit -m "feat(help): guide project reports"
```

---

### Task 4: Implement website-problem and Other Help trees

**Files:**

- Create: `src/app/help/report-website/page.tsx`
- Create: `src/app/help/other/page.tsx`
- Create: `src/features/help/components/website-report-form.tsx`
- Create: `src/features/help/components/other-help-form.tsx`
- Test: `tests/unit/website-report-form.test.tsx`
- Test: `tests/unit/other-help-form.test.tsx`
- Create: `tests/e2e/help-website-and-other.spec.ts`

**Interfaces:**

- `WebsiteReportForm` receives `siteRevision` and reads `from` through
  `useSearchParams()` in the client. It accepts the value only after safe route
  validation.
- `OtherHelpForm` receives `siteRevision`.
- The website route wraps its client form in `Suspense`; the Other Help form
  needs no query-param boundary.
- Server pages use
  `process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local"` and
  never expose other environment values.

- [ ] **Step 1: Write failing routing and data-minimization tests**

```tsx
test("routes feature ideas away from website bugs", async () => {
  renderWebsiteForm();
  await user.click(screen.getByRole("link", { name: /suggest an improvement/i }));
  expect(window.location.pathname).toBe("/help/other/");
});

test("serializes only approved website diagnostics", async () => {
  await completeWebsiteReport();
  const manifest = openedHelpManifest();
  expect(manifest.payload).not.toHaveProperty("search");
  expect(manifest.payload).not.toHaveProperty("viewport");
  expect(manifest.origin.site_revision).toBe("abc123");
});
```

For Other Help, prove the page routes project submissions, Kit author work,
external project support, and security before presenting the escape-hatch
form.

- [ ] **Step 2: Run form tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/website-report-form.test.tsx tests/unit/other-help-form.test.tsx
```

Expected: FAIL because the routes and forms do not exist.

- [ ] **Step 3: Implement website report validation and context**

Allow only a site-relative path or `https://tavernary.org/` URL from `from`.
Require category, page URL, actual behavior, expected behavior, and reproduction
steps. Apply limits from the spec. Browser and device remain optional.

Render the screenshot instruction:

> GitHub cannot receive attachments through this handoff. You can add
> screenshots or recordings on GitHub before creating the issue.

- [ ] **Step 4: Implement Other Help reminders and form**

Render routing reminders as links before the form. Categories are:

```ts
[
  "using-tavernary",
  "existing-request",
  "suggest-improvement",
  "documentation-policy",
  "other",
]
```

Require subject (120) and description (3,000); allow one relevant URL (500).
For `existing-request`, label the URL field as a GitHub issue or PR and keep it
optional at browser validation so a visitor can explain a missing link.

- [ ] **Step 5: Implement review and handoff**

Website uses `03-website-bug.yml`; Other uses `04-other.yml`. Both include
readable category text and `help-manifest`. Security links never call
`openHelpRequest`.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/website-report-form.test.tsx tests/unit/other-help-form.test.tsx tests/unit/help-manifest.test.ts tests/unit/help-transport.test.ts
npm.cmd run build
npm.cmd run test:e2e -- help-website-and-other.spec.ts
```

Expected: PASS.

Commit:

```powershell
git add -- src/app/help/report-website/page.tsx src/app/help/other/page.tsx src/features/help/components/website-report-form.tsx src/features/help/components/other-help-form.tsx tests/unit/website-report-form.test.tsx tests/unit/other-help-form.test.tsx tests/e2e/help-website-and-other.spec.ts
git commit -m "feat(help): guide site and other requests"
```

---

### Task 5: Implement Kit reporting and contextual deep links

**Files:**

- Create: `src/app/help/report-kit/page.tsx`
- Create: `src/features/help/components/kit-report-form.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Test: `tests/unit/kit-report-form.test.tsx`
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`

**Interfaces:**

- Page maps published catalog Kits to:

```ts
interface HelpKitOption {
  id: string;
  title: string;
  author: string;
  shareUrl: string;
  publishedAt: string;
  projects: Array<{ id: string; name: string }>;
}
```

- Existing card and inspector reports navigate to
  `/help/report-kit/?kit=<encoded-id>`.
- `KitReportForm` reads and validates `kit` with `useSearchParams()` so the
  route remains compatible with static export.
- The Kit report route wraps the client form in `Suspense`.
- Existing withdrawal remains on `07-kit-withdrawal.yml`.

- [ ] **Step 1: Write failing Kit branch tests**

Prove:

- a valid query preselects the Kit;
- an invalid query does not;
- affected-project choices contain only selected Kit projects;
- duplicate asks for another Kit;
- unsafe underlying-project guidance links to project reporting;
- author edit and withdrawal guidance uses existing Kit surfaces; and
- review does not mention reactions, Trending, or author penalties.

```tsx
test("limits affected projects to the selected Kit", async () => {
  mockSearchParams("kit=alpha-kit");
  renderKitReport();
  await user.selectOptions(
    screen.getByLabelText("What is wrong?"),
    "compatibility-problem",
  );
  expect(screen.getByLabelText("Extension Alpha")).toBeVisible();
  expect(screen.queryByLabelText("Unrelated Project")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run Kit report tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-report-form.test.tsx
```

Expected: FAIL because the Kit report route does not exist.

- [ ] **Step 3: Implement Kit selection and conditional fields**

Require Kit, category, and details (3,000). Evidence is optional (2,000).
Deduplicate affected project IDs and reject IDs not in the selected Kit before
review.

- [ ] **Step 4: Replace direct GitHub report links**

In `CatalogPage`, use `useRouter()` so Next applies the configured base path:

```ts
router.push(`/help/report-kit/?kit=${encodeURIComponent(kit.id)}`);
```

In `KitBuilderPanel`, use a Next `Link` with the same `href`. Keep **Request
withdrawal** on its existing author workflow. Update tooltip copy from “Report
this Kit on GitHub” to “Report this Kit” because Tavernary now owns the first
step.

- [ ] **Step 5: Implement GitHub handoff**

Use `06-kit-report.yml`. Tavernary supplies Kit ID, share URL, category,
affected project IDs, details, evidence, and the manifest. The visible fallback
form uses text controls for category and affected IDs so URL prefilling works.

- [ ] **Step 6: Update Kit E2E and visual expectations**

Assert card and inspector Report actions land on the Help route with the Kit
selected. Complete one report through intercepted GitHub handoff. Update only
snapshots that change because of intentional copy or link behavior.

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/kit-report-form.test.tsx tests/unit/help-manifest.test.ts tests/unit/help-transport.test.ts
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e -- kits.spec.ts
npm.cmd run test:kits-visual -- kits.visual.spec.ts
```

Expected: PASS.

Commit:

```powershell
git add -- src/app/help/report-kit/page.tsx src/features/help/components/kit-report-form.tsx src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-builder-panel.tsx tests/unit/kit-report-form.test.tsx tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts
git commit -m "feat(help): guide Kit reports"
```

---

### Task 6: Validate public Help issues and synchronize exact triage labels

**Files:**

- Modify: `.github/ISSUE_TEMPLATE/02-project-information.yml`
- Modify: `.github/ISSUE_TEMPLATE/03-website-bug.yml`
- Modify: `.github/ISSUE_TEMPLATE/04-other.yml`
- Modify: `.github/ISSUE_TEMPLATE/06-kit-report.yml`
- Create: `scripts/help/parse-help-issue.mjs`
- Create: `scripts/help/parse-help-issue.d.mts`
- Create: `scripts/help/help-labels.mjs`
- Create: `scripts/help/help-labels.d.mts`
- Create: `scripts/help/triage-help-issue.mjs`
- Create: `scripts/help/triage-help-issue.d.mts`
- Create: `.github/workflows/triage-help-request.yml`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `.github/workflows/admit-issue.yml`
- Test: `tests/unit/parse-help-issue.test.ts`
- Test: `tests/unit/help-labels.test.ts`
- Test: `tests/unit/triage-help-issue.test.ts`
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `tests/unit/issue-forms.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:
  `parseHelpIssue(body: string): HelpIssueParseResult`
- Produces:
  `categoryLabels(manifest: PublicHelpManifest): string[]`
- Produces:
  `HELP_LABEL_DEFINITIONS: Readonly<Record<string, LabelDefinition>>`
- Produces:
  `processHelpIssueTriage({event, request}): Promise<HelpTriageDecision>`
- Admission route values add:
  `project-report`, `website-bug`, `kit-report`, and `other-help`.

- [ ] **Step 1: Write failing Issue Form and parser tests**

Require each form to expose readable prefillable controls followed by optional
`help-manifest`. For example, project information IDs are:

```ts
[
  "project",
  "category",
  "report",
  "requested-outcome",
  "evidence",
  "help-manifest",
]
```

Test manifest-first behavior and fallback headings. A malformed non-empty
manifest must fail rather than trust visible headings.

- [ ] **Step 2: Run parser/form tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/parse-help-issue.test.ts tests/unit/issue-forms.test.ts
```

Expected: FAIL because the parser and revised forms do not exist.

- [ ] **Step 3: Implement readable fallback forms**

Use inputs/textareas rather than dropdowns for values Tavernary prefills.
Describe exact accepted category labels in field help. Keep direct GitHub entry
usable and require only fields that apply to every category.

Add `08-project-owner-request.yml` only in Task 7; Task 6 updates expected form
order through `07-kit-withdrawal.yml`.

- [ ] **Step 4: Implement manifest-first parsing**

Reuse one heading parser and exact display-label-to-ID maps. Fallback parsing
constructs the same envelope with:

```js
origin: {
  page_url: "direct-github-fallback",
  site_revision: "unknown",
}
```

Unknown categories and invalid limits return actionable validation errors.

- [ ] **Step 5: Write failing label and admission tests**

Assert exact label outcomes:

```ts
expect(categoryLabels(unsafeProjectReport)).toEqual([
  "project-information",
  "safety-review",
]);
expect(categoryLabels(rightsProjectReport)).toEqual([
  "project-information",
  "rights-review",
]);
expect(categoryLabels(accessibilityBug)).toEqual([
  "website-bug",
  "bug",
  "accessibility",
]);
expect(categoryLabels(duplicateKitReport)).toEqual([
  "kit-report",
  "duplicate-candidate",
]);
```

Admission must restore route labels from unambiguous headings, reject multiple
Help routes as conflict, and apply the existing public open-issue limit.

- [ ] **Step 6: Implement label inventory and report routing**

Define and provision these exact labels through `help-labels.mjs`; import the
same definitions in `admit-issue.mjs` and the same mapping in triage:

```js
"project-information"
"website-bug"
"kit-report"
"other"
"project-owner-request"
"safety-review"
"rights-review"
"accessibility"
"bug"
"question"
"duplicate-candidate"
```

Add body-heading signatures for each fallback form.

`admit-issue.yml` dispatches all four public report routes to
`triage-help-request.yml` with only `issue_number`; triage derives and verifies
the request kind from the latest issue.

- [ ] **Step 7: Implement read-only Help triage**

The workflow grants `contents: read` and `issues: write`, checks out default
branch code, fetches the latest issue, validates `issue-admitted`, parses the
body, replaces only Help-owned category labels, and posts one marker-owned
correction comment on invalid input. It never dispatches CI, writes catalog
files, or creates a PR.

- [ ] **Step 8: Run focused automation tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/parse-help-issue.test.ts tests/unit/help-labels.test.ts tests/unit/triage-help-issue.test.ts tests/unit/admit-issue.test.ts tests/unit/issue-forms.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- .github/ISSUE_TEMPLATE/02-project-information.yml .github/ISSUE_TEMPLATE/03-website-bug.yml .github/ISSUE_TEMPLATE/04-other.yml .github/ISSUE_TEMPLATE/06-kit-report.yml scripts/help/parse-help-issue.mjs scripts/help/parse-help-issue.d.mts scripts/help/help-labels.mjs scripts/help/help-labels.d.mts scripts/help/triage-help-issue.mjs scripts/help/triage-help-issue.d.mts .github/workflows/triage-help-request.yml scripts/submissions/admit-issue.mjs .github/workflows/admit-issue.yml tests/unit/parse-help-issue.test.ts tests/unit/help-labels.test.ts tests/unit/triage-help-issue.test.ts tests/unit/admit-issue.test.ts tests/unit/issue-forms.test.ts tests/unit/workflows.test.ts
git commit -m "ci(help): triage guided reports"
```

---

## Wave B: Owner Listing Management

### Task 7: Define owner requests and build the static owner-management form

**Files:**

- Create: `src/features/help/project-owner-manifest.mjs`
- Create: `src/features/help/project-owner-manifest.d.mts`
- Create: `src/features/help/project-owner-record.mjs`
- Create: `src/features/help/project-owner-record.d.mts`
- Create: `src/lib/help/load-owner-project-options.ts`
- Create: `src/app/help/manage-project/page.tsx`
- Create: `src/features/help/components/project-owner-builder.tsx`
- Create: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Test: `tests/unit/project-owner-manifest.test.ts`
- Test: `tests/unit/project-owner-record.test.ts`
- Test: `tests/unit/load-owner-project-options.test.ts`
- Test: `tests/unit/project-owner-builder.test.tsx`
- Modify: `tests/unit/issue-forms.test.ts`
- Create: `tests/e2e/help-project-owner.spec.ts`

**Interfaces:**

- Produces:
  `normalizeProjectOwnerManifest(value, vocabularies): OwnerManifestValidation`
- Produces:
  `fingerprintProjectRecord(record: object): string`
- Produces:
  `loadOwnerProjectOptions(root?: string): Promise<OwnerProjectOption[]>`
- `ProjectOwnerManifest` is:

```ts
type ProjectOwnerManifest =
  | OwnerEnvelope<"edit-card", OwnerCardEdit>
  | OwnerEnvelope<"move-source", OwnerSourceMove>
  | OwnerEnvelope<"delist", OwnerDelist>;

interface OwnerEnvelope<K extends string, P> {
  schema_version: 1;
  request_kind: "project-owner";
  operation: K;
  project_id: string;
  repository_id: number;
  source_fingerprint: string;
  original: Record<string, unknown>;
  proposed: P;
  explanation: string | null;
}

interface OwnerProjectOption {
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  sourceType: "github" | "github-organization" | "url";
  repository: string | null;
  repositoryId: number | null;
  eligibleShape: boolean;
  ineligibilityReason: string | null;
  sourceFingerprint: string;
  editable: {
    name: string;
    summary: string;
    frontends: string[];
    primaryFunction: string;
    capabilities: string[];
    modelFamilies: string[];
    completionFormats: string[];
  };
}
```

- [ ] **Step 1: Write failing owner manifest tests**

Cover all operations, unknown vocabularies, kind-specific Preset fields,
unchanged edits, summary normalization, name limit, and different-ID source
replacement rejection at server validation.

```ts
test("normalizes owner summary line breaks without model word rules", () => {
  const result = normalizeProjectOwnerManifest(
    editFixture({ summary: "A concise owner summary.\nWith another detail." }),
    vocabularies,
  );
  expect(result).toMatchObject({
    valid: true,
    manifest: {
      proposed: {
        summary: "A concise owner summary. With another detail.",
      },
    },
  });
});

test("rejects owner summaries beyond 220 characters", () => {
  expect(
    normalizeProjectOwnerManifest(
      editFixture({ summary: "x".repeat(221) }),
      vocabularies,
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "Owner summary must be 220 characters or fewer.",
    ]),
  });
});
```

- [ ] **Step 2: Run owner domain tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-record.test.ts tests/unit/load-owner-project-options.test.ts
```

Expected: FAIL because owner modules do not exist.

- [ ] **Step 3: Implement static registry loading**

Read registry JSON only in the server-side static-build module. Both static
build and workflow code call the same line-ending-independent fingerprint:

```ts
const sourceFingerprint = createHash("sha256")
  .update(JSON.stringify(record), "utf8")
  .digest("hex");
```

`eligibleShape` is true only for `source.type === "github"` with a positive
repository ID. Do not infer whether the owner is a user or organization in the
browser; the GitHub workflow decides that authoritatively.

- [ ] **Step 4: Write failing builder tests**

Prove:

- project search and selection;
- ineligible record explanation and report fallback;
- edit/source/delist branch separation;
- live 220 summary counter;
- exact controlled metadata;
- Preset-only compatibility;
- delist confirmation;
- review policy explanation; and
- no browser-side claim that identity has already been verified.

- [ ] **Step 5: Implement owner builder and fallback form**

The builder sends only one operation per issue. `edit-card` includes every
current/proposed editable field so diff review is deterministic. `move-source`
accepts one public GitHub URL. `delist` requires the exact confirmation.

The fallback Issue Form uses IDs:

```ts
[
  "request-type",
  "project-id",
  "repository",
  "proposed-name",
  "proposed-summary",
  "supported-frontends",
  "primary-function",
  "capabilities",
  "model-families",
  "completion-formats",
  "proposed-repository",
  "explanation",
  "delist-confirmation",
  "owner-request-manifest",
]
```

Only request type, project ID, and repository are schema-required. Workflow
validation enforces operation-specific fields.

- [ ] **Step 6: Implement review and handoff**

Use `openHelpRequest` with template `08-project-owner-request.yml`. Review
states plainly:

- GitHub will verify the issue author against the current personal owner.
- A card edit changes model enrichment to manual.
- A source move must retain repository ID.
- Delisting disables, pauses, and retains the record.

Pass `manifestFieldId: "owner-request-manifest"`; public report builders pass
`manifestFieldId: "help-manifest"`.

- [ ] **Step 7: Run UI, form, and static-export tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-record.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/issue-forms.test.ts
npm.cmd run build
npm.cmd run verify:export
npm.cmd run test:e2e -- help-project-owner.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the owner browser experience**

```powershell
git add -- src/features/help/project-owner-manifest.mjs src/features/help/project-owner-manifest.d.mts src/features/help/project-owner-record.mjs src/features/help/project-owner-record.d.mts src/lib/help/load-owner-project-options.ts src/app/help/manage-project/page.tsx src/features/help/components/project-owner-builder.tsx .github/ISSUE_TEMPLATE/08-project-owner-request.yml tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-record.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/issue-forms.test.ts tests/e2e/help-project-owner.spec.ts
git commit -m "feat(help): add owner listing form"
```

---

### Task 8: Verify exact owner authority and apply pure catalog mutations

**Files:**

- Create: `scripts/help/project-owner-authority.mjs`
- Create: `scripts/help/project-owner-authority.d.mts`
- Create: `scripts/help/apply-project-owner-request.mjs`
- Create: `scripts/help/apply-project-owner-request.d.mts`
- Test: `tests/unit/project-owner-authority.test.ts`
- Test: `tests/unit/apply-project-owner-request.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**

- Produces:
  `verifyProjectOwnerAuthority(input): OwnerAuthorityDecision`
- Produces:
  `detectOwnerRequestConflict(input): OwnerConflictDecision`
- Produces:
  `applyProjectOwnerRequest(input): OwnerMutationResult`

```ts
interface GitHubRepositoryIdentity {
  id: number;
  fullName: string;
  htmlUrl: string;
  visibility: string;
  owner: { login: string; type: string };
}

interface OwnerMutationResult {
  record: ProjectRegistryRecord;
  snapshot: RepositorySnapshot | null;
  changedPaths: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
```

- [ ] **Step 1: Write failing authority matrix tests**

Cover exact success and every exclusion:

```ts
test("admits the current personal owner case-insensitively", () => {
  expect(
    verifyProjectOwnerAuthority({
      issueAuthor: "owner",
      manifestRepositoryId: 42,
      record: githubRecord({ repository_id: 42 }),
      repository: githubIdentity({
        id: 42,
        owner: { login: "Owner", type: "User" },
      }),
    }),
  ).toEqual({ authorized: true, ownerLogin: "Owner" });
});

test.each([
  ["organization", { owner: { login: "Org", type: "Organization" } }],
  ["wrong author", { owner: { login: "Other", type: "User" } }],
  ["private", { visibility: "private" }],
  ["identity mismatch", { id: 99 }],
])("rejects %s", (_name, repositoryPatch) => {
  expect(verifyProjectOwnerAuthority(authorityFixture(repositoryPatch))).toMatchObject({
    authorized: false,
  });
});
```

Also prove commit authors, profile names, emails, collaborators, and
`author_association` are never considered.

- [ ] **Step 2: Run authority tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-authority.test.ts
```

Expected: FAIL because authority code does not exist.

- [ ] **Step 3: Implement pure authority and overlap checks**

Compare:

```js
issueAuthor.toLocaleLowerCase() ===
  repository.owner.login.toLocaleLowerCase()
```

Require stored, manifest, and API repository IDs to be equal positive integers;
require `owner.type === "User"` and public visibility.

Conflict detection compares current values only for fields changed by the
operation. A fingerprint change outside those fields is recorded as a warning,
not a false conflict. Any changed original value overlapping the request stops
generation with `stale-owner-request`.

- [ ] **Step 4: Write failing mutation tests**

Test:

- card edit changes only approved fields plus curated/manual policy;
- summary whitespace normalization;
- automatic refresh preservation;
- same-ID source move updates record and snapshot owner/name/url;
- different-ID move rejection;
- delisting tombstone values;
- no-op rejection;
- Preset field parity; and
- formatted JSON round trip.

```ts
test("protects an approved owner card edit from enrichment", () => {
  const result = applyProjectOwnerRequest(editMutationFixture());
  expect(result.record).toMatchObject({
    summary: "Owner-authored summary.",
    metadata_status: "curated",
    refresh_policy: "automatic",
    enrichment_policy: "manual",
    enrichment_note:
      "Owner-authored catalog details approved through issue #123.",
  });
});
```

- [ ] **Step 5: Implement mutations without widening the catalog schema**

Enforce the 100-character display-name limit in the owner manifest and apply
boundary only; do not change the global project-name contract for ordinary
submissions or maintainer curation. Do not add provenance fields to the schema;
issue and git history are the provenance. For source move, update:

```js
record.source.repository = repository.fullName;
record.source.repository_id = repository.id;
snapshot.repository.owner = repository.owner.login;
snapshot.repository.name = repository.fullName.split("/")[1];
snapshot.repository.url = repository.htmlUrl;
```

For delist, preserve all other record fields and snapshot history.

- [ ] **Step 6: Prove enrichment and refresh separation**

Add an enrichment regression where selection occurs before the owner edit, the
record is re-read as manual at write time, and the owner summary is not
overwritten. Keep existing refresh eligibility tests proving manual enrichment
does not imply paused refresh.

- [ ] **Step 7: Run focused data tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-authority.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/validate-catalog.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/help/project-owner-authority.mjs scripts/help/project-owner-authority.d.mts scripts/help/apply-project-owner-request.mjs scripts/help/apply-project-owner-request.d.mts tests/unit/project-owner-authority.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/enrich-readmes.test.ts
git commit -m "feat(help): enforce owner mutations"
```

---

### Task 9: Build owner request triage, generation, and safe PR state

**Files:**

- Create: `scripts/help/triage-project-owner-request.mjs`
- Create: `scripts/help/triage-project-owner-request.d.mts`
- Create: `scripts/help/generate-project-owner-request.mjs`
- Create: `scripts/help/project-owner-pr.mjs`
- Create: `scripts/help/project-owner-pr.d.mts`
- Test: `tests/unit/triage-project-owner-request.test.ts`
- Test: `tests/unit/generate-project-owner-request.test.ts`
- Test: `tests/unit/project-owner-pr.test.ts`

**Interfaces:**

- Produces:
  `processProjectOwnerTriage({issue, record, repository, vocabularies})`
- Produces:
  `generateProjectOwnerRequest({issue, root, request, now})`
- Produces:
  `ownerRequestBranch(issueNumber): string`
- Produces:
  `renderOwnerRequestPullRequest(input): string`
- Produces:
  `parseOwnerRequestPullRequestMarker(body): OwnerPrMarker | null`
- Produces:
  `planOwnerPrUpdate(input): OwnerPrUpdatePlan`

- [ ] **Step 1: Write failing triage chronology tests**

Inject GitHub request and filesystem reads. Assert triage:

1. parses latest issue;
2. loads record by project ID;
3. fetches `/repositories/<stored-id>`;
4. checks authority;
5. checks overlapping stale values;
6. refreshes issue before returning admitted; and
7. never writes a repository file.

Temporary API failures return `retryable`; deterministic owner mismatch returns
`needs-information` with the literal-owner rule.

- [ ] **Step 2: Run triage tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/triage-project-owner-request.test.ts
```

Expected: FAIL because triage does not exist.

- [ ] **Step 3: Implement owner issue parsing and triage**

Use manifest-first parsing from `Owner request manifest`; direct fallback
constructs the owner manifest from visible headings and validates it. Require
open issue, `issue-admitted`, and `project-owner-request`.

Do not trust a repository URL supplied in the issue. Resolve current identity
from the registry's immutable ID:

```js
const repository = await request(
  `/repositories/${record.source.repository_id}`,
);
```

- [ ] **Step 4: Write failing PR state and rendering tests**

```ts
test("uses one deterministic owner issue branch", () => {
  expect(ownerRequestBranch(123)).toBe(
    "automation/project-owner-request-123",
  );
});

test("renders verified identity, before/after values, and policy effects", () => {
  const body = renderOwnerRequestPullRequest(reviewFixture);
  expect(body).toContain("Closes #123");
  expect(body).toContain("Verified repository owner: `Owner`");
  expect(body).toContain("## Before");
  expect(body).toContain("## After");
  expect(body).toContain("Enrichment policy");
  expect(parseOwnerRequestPullRequestMarker(body)).toEqual(reviewFixture.marker);
});
```

Test create, safe update, no-op, maintainer divergence, path collision with an
open owner or project-submission PR, and explicit regeneration refusal after
divergence.

- [ ] **Step 5: Implement safe PR planning**

Marker fields are:

```ts
interface OwnerPrMarker {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  operation: "edit-card" | "move-source" | "delist";
  repository_id: number;
  verified_owner_login: string;
  generated_head_sha: string;
  generated_paths: string[];
}
```

Escape and bound untrusted Markdown. Allowed generated paths are exactly the
selected project registry JSON and, for source moves only, its GitHub snapshot.

- [ ] **Step 6: Implement generation with final revalidation**

Generation fetches the issue, record, repository, and vocabularies again. It
repeats authority and stale-state checks immediately before calling
`applyProjectOwnerRequest`. Write changed JSON with `formatJson`; write a report
outside the repository output containing operation, verified owner, before,
after, warnings, and generated paths.

- [ ] **Step 7: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- scripts/help/triage-project-owner-request.mjs scripts/help/triage-project-owner-request.d.mts scripts/help/generate-project-owner-request.mjs scripts/help/project-owner-pr.mjs scripts/help/project-owner-pr.d.mts tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts
git commit -m "feat(help): generate owner review changes"
```

---

### Task 10: Wire owner workflows, labels, generated branches, and lifecycle

**Files:**

- Create: `.github/workflows/triage-project-owner-request.yml`
- Create: `.github/workflows/generate-project-owner-request.yml`
- Create: `scripts/help/project-owner-lifecycle.mjs`
- Create: `scripts/help/project-owner-lifecycle.d.mts`
- Create: `.github/workflows/project-owner-request-lifecycle.yml`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `.github/workflows/admit-issue.yml`
- Test: `tests/unit/project-owner-lifecycle.test.ts`
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/unit/classify-pr-paths.test.ts`

**Interfaces:**

- Admission route adds `project-owner`.
- Triage workflow input: required numeric `issue_number`.
- Generation workflow inputs: required numeric `issue_number` and optional
  boolean `force_regeneration` default false.
- Lifecycle plans `merged`, `decline`, or `ignore`.

- [ ] **Step 1: Write failing workflow permission and dispatch tests**

Assert:

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
expect(lifecycle.permissions).toEqual({
  contents: "write",
  issues: "write",
  "pull-requests": "read",
});
```

Admission must dispatch owner triage only for the owner label/body route.
Ordinary reports must never dispatch owner generation.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/admit-issue.test.ts
```

Expected: FAIL because owner workflows are absent.

- [ ] **Step 3: Implement read-only owner triage workflow**

After `triage-project-owner-request.mjs` emits `admitted=true`, dispatch:

```yaml
- name: Generate admitted owner request
  if: steps.triage.outputs.admitted == 'true'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ISSUE_NUMBER: ${{ inputs.issue_number }}
  run: >
    gh workflow run generate-project-owner-request.yml
    --ref main
    -f issue_number="$ISSUE_NUMBER"
    -f force_regeneration=false
```

Triage owns only `needs-information`, `needs-maintainer-review`, and
`submission-retryable` state for this route.

- [ ] **Step 4: Implement guarded generation workflow**

The workflow:

1. checks out full current `main`;
2. installs repository dependencies only;
3. identifies any existing marked PR and expected remote SHA;
4. refuses maintainer divergence;
5. checks out or recreates
   `automation/project-owner-request-<issue>`;
6. runs the generator against latest issue and latest main;
7. allows only registry path plus source-move snapshot path;
8. runs `catalog:validate`, `catalog:build`, focused owner tests, and
   `check:content`;
9. rejects path collisions with open generated PRs;
10. commits with
    `feat(catalog): apply owner request #<issue>`;
11. pushes normally or with exact `--force-with-lease`;
12. creates/updates a review PR with the owner marker;
13. changes issue state label to `submission-pr-open`;
14. uploads the sanitized generation report; and
15. dispatches `ci.yml` for the generated branch.

It never stages `src/generated/catalog.json`, workflow files, scripts, or
unrelated records.

- [ ] **Step 5: Write and implement lifecycle tests**

```ts
test("declines an unmerged marked owner PR", () => {
  expect(
    planProjectOwnerClosure({
      merged: false,
      headRef: "automation/project-owner-request-123",
      headRepository: "MentallyQuill/Tavernary",
      baseRepository: "MentallyQuill/Tavernary",
      body: markedOwnerBody(123),
    }),
  ).toMatchObject({
    action: "decline",
    issueNumber: 123,
    addLabels: ["submission-declined"],
    deleteBranch: "automation/project-owner-request-123",
  });
});
```

Lifecycle executes only default-branch code. On merge, remove queue labels and
allow `Closes #<issue>` to close the issue. On decline, comment with the PR URL,
apply `submission-declined`, close as not planned, and delete the branch only
if its ref still matches the closed PR head SHA.

- [ ] **Step 6: Confirm content CI remains fail-closed**

Owner PR paths are already registry/snapshot content paths. Add tests proving
an owner PR containing docs, scripts, workflows, schema, or multiple unrelated
records routes through full CI or is rejected by generation before push.

- [ ] **Step 7: Run workflow/lifecycle tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-lifecycle.test.ts tests/unit/workflows.test.ts tests/unit/admit-issue.test.ts tests/unit/classify-pr-paths.test.ts
```

Expected: PASS.

Commit:

```powershell
git add -- .github/workflows/triage-project-owner-request.yml .github/workflows/generate-project-owner-request.yml scripts/help/project-owner-lifecycle.mjs scripts/help/project-owner-lifecycle.d.mts .github/workflows/project-owner-request-lifecycle.yml scripts/submissions/admit-issue.mjs .github/workflows/admit-issue.yml tests/unit/project-owner-lifecycle.test.ts tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts tests/unit/classify-pr-paths.test.ts
git commit -m "ci(help): review owner listing requests"
```

---

## Wave C: Product Integration and Certification

### Task 11: Align documentation, static routes, and full browser coverage

**Files:**

- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/contributing/contribution-overview.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/contributing/kits.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/guides/using-the-catalog.md`
- Modify: `src/app/about/page.tsx`
- Create: `tests/unit/help-docs.test.ts`
- Create: `tests/e2e/help-center.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/visual/theme.visual.spec.ts`

**Interfaces:**

- Documentation names the exact five public paths and private-security path.
- Operations docs describe report triage, owner eligibility, owner PR recovery,
  policy transitions, delisting tombstones, and failure reason codes.

- [ ] **Step 1: Write failing documentation contract tests**

Assert canonical docs contain:

```ts
for (const phrase of [
  "/help/",
  "Manage your project listing",
  "Report a project listing",
  "Report a website problem",
  "Report a Kit",
  "Get other help",
  "security/advisories/new",
  "project-owner-request",
  "automation/project-owner-request-<issue-number>",
]) {
  expect(documentationCorpus).toContain(phrase);
}
```

Also assert About no longer promises owner automation to maintainers,
organizations, or rights holders; it distinguishes verified personal owners
from human-reviewed reports.

- [ ] **Step 2: Run documentation tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/help-docs.test.ts
```

Expected: FAIL because docs still describe the GitHub chooser.

- [ ] **Step 3: Update public and maintainer documentation**

Document:

- Help hub routes and contextual deep links;
- public GitHub visibility of ordinary report text;
- no third-party project support;
- private Tavernary security path;
- exact owner eligibility and organization limitation;
- edit/source/delist effects;
- owner summary manual-enrichment protection;
- refresh/enrichment distinction;
- generated PR review and regeneration safety;
- direct GitHub fallback forms; and
- GitHub chooser remaining broader than Tavernary Help.

- [ ] **Step 4: Add complete Help center E2E coverage**

Test from the header:

1. every hub path and back link;
2. every branch's required validation;
3. review/back preserves form state;
4. cancel returns without opening GitHub;
5. Continue opens the correct prefilled template;
6. query IDs are safely validated;
7. no security path contains `/issues/new`;
8. 320 px has no horizontal overflow;
9. keyboard completion and error-summary focus; and
10. static export contains every approved route.

- [ ] **Step 5: Add restrained visual coverage**

Capture Help hub desktop/mobile, one conditional report form, one review state,
owner edit state near 220 characters, and private security callout. Use Windows
visual baselines and update only intentional new snapshots.

- [ ] **Step 6: Run documentation, browser, and visual gates**

Run:

```powershell
npm.cmd test -- tests/unit/help-docs.test.ts tests/unit/help-page.test.tsx tests/unit/project-report-form.test.tsx tests/unit/website-report-form.test.tsx tests/unit/kit-report-form.test.tsx tests/unit/other-help-form.test.tsx tests/unit/project-owner-builder.test.tsx
npm.cmd run build
npm.cmd run test:e2e -- help-center.spec.ts help-project-report.spec.ts help-website-and-other.spec.ts help-project-owner.spec.ts contribution-links.spec.ts mobile.spec.ts
npm.cmd run test:visual -- theme.visual.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit integration and docs**

```powershell
git add -- README.md SECURITY.md docs/contributing/contribution-overview.md docs/contributing/submission-and-review.md docs/contributing/kits.md docs/maintenance/operations-runbook.md docs/guides/using-the-catalog.md src/app/about/page.tsx tests/unit/help-docs.test.ts tests/e2e/help-center.spec.ts tests/e2e/mobile.spec.ts tests/visual/theme.visual.spec.ts
git commit -m "docs(help): publish guided support paths"
```

---

### Task 12: Run deterministic gates and controlled live GitHub certification

**Files:**

- No planned source file.
- Live artifacts: prefilled URLs, test issues, generated owner PR, Actions runs,
  and deployed Pages route.
- If certification exposes a defect, add the smallest regression test beside
  the owning module before fixing it.

**Interfaces:**

- Uses current repository Issue Forms and workflows on `main`.
- Any public test issue, branch, PR, or merge requires explicit user approval
  immediately before that mutation.

- [ ] **Step 1: Run the full deterministic repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all unit tests, production build, and static-export verification pass.

- [ ] **Step 2: Run all browser and visual gates**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 3: Audit the final diff and workflow safety**

Run:

```powershell
git diff --check
git status --short
git diff --stat
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
```

Confirm no unrelated file is staged, no secret is present, action SHAs are
pinned, permissions are minimal, public forms contain no private-security
destination, owner generation allows only one registry path plus an optional
same-project snapshot, and `src/generated/catalog.json` is not staged.

- [ ] **Step 4: Verify live Help prefills without creating issues**

Using the deployed or local static export, open each generated GitHub URL and
inspect rendered values for:

- project report;
- website problem;
- Kit report;
- Other Help;
- owner card edit;
- owner source move; and
- owner delist.

Do not select GitHub's final Create action. Confirm private security opens the
private advisory form rather than Issues.

- [ ] **Step 5: Request approval for owner workflow mutation**

Ask permission to create one owner card-edit issue for a personal repository
owned by the user's authenticated GitHub account and allow automation to create
its branch and PR. This approval is not implied by plan approval.

- [ ] **Step 6: Certify one owner summary edit**

Use a harmless 220-or-fewer-character summary change. Verify:

- issue author matches current API owner;
- immutable repository ID matches registry and API;
- triage labels are correct;
- deterministic branch and marked PR are created;
- PR changes only the selected registry record;
- summary is normalized;
- enrichment becomes manual while refresh remains automatic;
- content and full CI routes behave as designed; and
- maintainers can edit the PR without regeneration overwriting their changes.

Merge only after explicit user direction.

- [ ] **Step 7: Prove post-merge policy behavior**

After an approved merge, run or simulate the exact enrichment write path and
prove the owner summary remains unchanged. Run the refresh eligibility path and
prove repository observation remains automatic.

- [ ] **Step 8: Certify failure boundaries without public mutation where possible**

Use mocked or read-only live API checks for:

- organization-owned repository;
- wrong issue author;
- missing repository ID;
- different repository ID;
- private/unavailable repository;
- stale overlapping card change; and
- transient GitHub API failure.

If a second public issue is necessary to prove decline lifecycle, request
separate approval before creating it.

- [ ] **Step 9: Record evidence and finish**

Record issue, PR, Actions, and deployment URLs in the final handoff, not in
canonical catalog records. Report any skipped public canary explicitly. Claim
completion only after deterministic gates and the user-approved live path both
pass.
