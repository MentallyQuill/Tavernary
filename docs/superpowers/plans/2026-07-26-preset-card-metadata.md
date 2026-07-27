# Preset Card Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove inapplicable unavailable-state metadata from curated external System Preset cards while retaining known preset facts, actionable warnings, license state, and existing Frontend and Extension behavior.

**Architecture:** Keep registry and generated catalog data unchanged. Make `ProjectCard` apply a type-aware presentation policy: presets render only non-null preset facts and actionable state, while non-preset fallback behavior remains intact. Cover the policy first at the component boundary, then prove the real generated Pura's Director card in the browser.

**Tech Stack:** TypeScript 6, React 19, Testing Library, Vitest, Playwright, Next.js static export

## Global Constraints

- Do not modify registry records, generated catalog data, schemas, or source-status semantics.
- Do not introduce a new broken-source or unavailable-source state.
- Do not display `Manual source` on System Preset cards.
- Do not display unavailable-state replacements for missing preset activity, release, popularity, repository size, publication date, or artifact size.
- Preserve known preset version, publication date, and artifact size.
- Preserve provisional details, pending source, stale source, and license states.
- Leave Frontend and Extension card behavior unchanged.
- Removed visible labels must also be absent from the card's accessible description.

---

### Task 1: Apply the type-aware System Preset presentation policy

**Files:**
- Modify: `tests/unit/project-card.test.tsx:574-700`
- Modify: `src/features/catalog/components/project-card.tsx:44-84`
- Modify: `src/features/catalog/components/project-card.tsx:183-190`
- Modify: `src/features/catalog/components/project-card.tsx:267-294`

**Interfaces:**
- Consumes: `CatalogProject.kind`, `CatalogProject.metadataStatus`, `CatalogProject.sourceStatus`, `CatalogProject.preset`, and existing `Tooltip` rendering.
- Produces: unchanged `ProjectCard({ project, now }: { project: CatalogProject; now: string })` with type-aware preset metadata visibility; no new exported API.

- [ ] **Step 1: Add failing component tests for curated, known-fact, and actionable-state presets**

Add these tests after the existing manual-source fallback tests in
`tests/unit/project-card.test.tsx`:

```tsx
test("omits inapplicable unavailable facts from curated external presets", () => {
  render(
    <ProjectCard
      project={project("puras-director-v15", {
        name: "Pura's Director v15.0",
        kind: "preset",
        metadataStatus: "curated",
        sourceStatus: "manual",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
        latestReleaseAt: null,
        community: null,
        repositorySizeKb: null,
        license: {
          status: "missing",
          label: "Missing",
          tooltip: "No license information is published for this source.",
        },
        preset: {
          version: "15.0",
          publishedAt: null,
          artifactSizeBytes: null,
          modelFamilies: [],
          completionFormats: [],
        },
      })}
      now="2026-07-23T00:00:00Z"
    />,
  );

  const card = screen.getByRole("link", {
    name: "Pura's Director v15.0",
  });
  const descriptionId = card.getAttribute("aria-describedby");
  const description = document.getElementById(descriptionId!);

  expect(card.querySelector(".preset-version")).toHaveTextContent("v15.0");
  expect(card.querySelector(".preset-publication")).toBeNull();
  expect(card.querySelector(".preset-size")).toBeNull();
  expect(card.querySelector(".card-state-list")).toBeNull();
  expect(card).toHaveTextContent("Missing");

  for (const label of [
    "Manual source",
    "Activity unavailable",
    "Release unavailable",
    "Popularity unavailable",
    "Repository size unavailable",
  ]) {
    expect(card).not.toHaveTextContent(label);
    expect(description).not.toHaveTextContent(label);
  }
});

test("renders only known preset facts", () => {
  render(
    <ProjectCard
      project={project("known-preset", {
        kind: "preset",
        sourceStatus: "manual",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
        community: null,
        repositorySizeKb: null,
        preset: {
          version: "2.1",
          publishedAt: "2026-07-20T00:00:00Z",
          artifactSizeBytes: 2048,
          modelFamilies: [],
          completionFormats: [],
        },
      })}
      now="2026-07-23T00:00:00Z"
    />,
  );

  expect(document.querySelector(".preset-version")).toHaveTextContent("v2.1");
  expect(document.querySelector(".preset-publication")).toHaveTextContent(
    "Published 3d ago",
  );
  expect(document.querySelector(".preset-size")).toHaveTextContent("2 KB file");
  expect(document.querySelector(".card-state-list")).toBeNull();
});

test("keeps actionable preset state without unavailable-field noise", () => {
  const { rerender } = render(
    <ProjectCard
      project={project("pending-preset", {
        kind: "preset",
        metadataStatus: "provisional",
        sourceStatus: "pending",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
        community: null,
        repositorySizeKb: null,
        preset: {
          version: null,
          publishedAt: null,
          artifactSizeBytes: null,
          modelFamilies: [],
          completionFormats: [],
        },
      })}
      now="2026-07-23T00:00:00Z"
    />,
  );

  const notes = document.querySelectorAll(".card-state-note");
  expect([...notes].map((note) => note.textContent)).toEqual([
    "Provisional details",
    "Source pending",
  ]);
  expect(document.querySelector(".preset-development")).toBeNull();

  rerender(
    <ProjectCard
      project={project("stale-preset", {
        kind: "preset",
        metadataStatus: "curated",
        sourceStatus: "stale",
        staleSince: "2026-07-22T00:00:00Z",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
        community: null,
        repositorySizeKb: null,
        preset: {
          version: null,
          publishedAt: null,
          artifactSizeBytes: null,
          modelFamilies: [],
          completionFormats: [],
        },
      })}
      now="2026-07-23T00:00:00Z"
    />,
  );

  expect(
    [...document.querySelectorAll(".card-state-note")].map(
      (note) => note.textContent,
    ),
  ).toEqual(["Source stale"]);
});
```

Keep the existing manual-source Extension tests unchanged. They are the
regression proof that Frontend and Extension behavior has not been broadened by
the preset-specific rule.

- [ ] **Step 2: Run the component tests and confirm the new expectations fail**

Run:

```powershell
npm test -- tests/unit/project-card.test.tsx
```

Expected: FAIL because the curated preset still renders `Manual source`,
unavailable-field notes, `Source linked`, and an empty preset-size element; the
all-null pending preset also still renders a `preset-development` container.

- [ ] **Step 3: Make detail-state generation type-aware**

Replace `sourceStatusLabel` and `detailItems` in
`src/features/catalog/components/project-card.tsx` with:

```tsx
function sourceStatusLabel(project: CatalogProject) {
  if (project.sourceStatus === "manual") {
    return project.kind === "preset" ? null : "Manual source";
  }
  if (project.sourceStatus === "pending") return "Source pending";
  if (project.sourceStatus === "stale") return "Source stale";
  return null;
}

function detailItems(project: CatalogProject) {
  const items: string[] = [];
  const shouldExplainUnknownFacts =
    project.metadataStatus === "provisional" ||
    project.sourceStatus !== "healthy";

  if (project.metadataStatus === "provisional") {
    items.push("Provisional details");
  }

  const sourceLabel = sourceStatusLabel(project);
  if (sourceLabel) {
    items.push(sourceLabel);
  }

  if (project.kind === "preset") {
    return items;
  }

  if (
    shouldExplainUnknownFacts &&
    !project.latestReleaseAt &&
    !project.preset?.publishedAt
  ) {
    items.push("Release unavailable");
  }
  if (shouldExplainUnknownFacts && project.community === null) {
    items.push("Popularity unavailable");
  }
  if (shouldExplainUnknownFacts && project.repositorySizeKb === null) {
    items.push("Repository size unavailable");
  }
  return items;
}
```

This early return is the type boundary: preset cards retain actionable project
state but do not translate null repository fields into visible metadata.

- [ ] **Step 4: Represent absent preset facts as `null`**

Replace the preset fact derivation near the top of `ProjectCard` with:

```tsx
const presetVersion = project.preset?.version
  ? formatVersion(project.preset.version)
  : null;
const presetPublishedAt = project.preset?.publishedAt ?? null;
const presetPublication = presetPublishedAt
  ? `Published ${relativeTime(presetPublishedAt, now)}`
  : null;
const presetSize = formatBytes(project.preset?.artifactSizeBytes ?? null);
```

Do not use `Preset`, `Source linked`, `File size unavailable`, or another
replacement string for absent values.

- [ ] **Step 5: Render only the known preset fact elements**

Replace the `project.kind === "preset"` branch in the card header with:

```tsx
{project.kind === "preset" ? (
  presetVersion || presetPublication || presetSize ? (
    <span className="development preset-development">
      {presetVersion ? (
        <Tooltip
          id={`${project.id}-preset-version`}
          label={`Preset version ${presetVersion}`}
          className="preset-version"
        >
          {presetVersion}
        </Tooltip>
      ) : null}
      {presetPublishedAt && presetPublication ? (
        <Tooltip
          id={`${project.id}-preset-publication`}
          label={`Published ${formatDate(presetPublishedAt)}`}
          className="preset-publication"
        >
          {presetPublication}
        </Tooltip>
      ) : null}
      {presetSize ? (
        <Tooltip
          id={`${project.id}-preset-size`}
          label={presetSize}
          className="preset-size"
        >
          {presetSize}
        </Tooltip>
      ) : null}
    </span>
  ) : null
) : (
  <span className="development">
    {hasActivityMetrics ? (
      <>
        <Tooltip
          id={activityId}
          label={activityLabel ?? ""}
          ariaLabel={activityLabel ?? undefined}
          className={`activity-score evidence-${evidenceStatus}`}
        >
          <b>
            {evidenceStatus === "provisional" ? "~" : ""}
            {activeWeeks12}/12
          </b>
          <ActivitySparkline weeks={weeklyActivity} />
        </Tooltip>
        {latestSourceActivityAt ? (
          <Tooltip
            id={commitId}
            label={`Last source activity ${formatDate(latestSourceActivityAt)} (${sourceActivityAge})`}
            className={`commit-age${project.activity.dormant ? " dormant" : ""}`}
            style={sourceActivityAgeStyle}
          >
            {sourceActivityAge}
          </Tooltip>
        ) : missingSourceActivity ? (
          <Tooltip
            id={commitId}
            label={missingSourceActivity.full}
            ariaLabel={missingSourceActivity.full}
            className="commit-age no-source-activity"
          >
            {missingSourceActivity.short}
          </Tooltip>
        ) : null}
      </>
    ) : (
      <Tooltip
        id={activityId}
        label="Activity unavailable"
        ariaLabel="Activity unavailable"
        className="development-unavailable"
      >
        No data
      </Tooltip>
    )}
    {project.community ? (
      <Tooltip
        id={communityId}
        label={`${project.community.aggregate} total: ${project.community.stars} stars, ${project.community.forks} forks, ${project.community.subscribers} subscribers`}
        className="community"
      >
        <CategoryIcon name="community" />
        <b>{project.community.aggregate}</b>
      </Tooltip>
    ) : null}
    {repositorySize ? (
      <Tooltip
        id={repositorySizeId}
        label={`${repositorySize.replace(" repo", "")} repository`}
        className="repository-size"
      >
        {repositorySize}
      </Tooltip>
    ) : null}
  </span>
)}
```

Do not change the non-preset branch's activity, community, repository-size, or
tooltip behavior.

- [ ] **Step 6: Run the focused component suite**

Run:

```powershell
npm test -- tests/unit/project-card.test.tsx
```

Expected: PASS, including the unchanged manual-source Extension, source-pending,
and source-stale regression tests.

- [ ] **Step 7: Format the two modified source files and rerun the focused suite**

Run:

```powershell
npx.cmd prettier --write src/features/catalog/components/project-card.tsx tests/unit/project-card.test.tsx
npm test -- tests/unit/project-card.test.tsx
```

Expected: Prettier completes without error and the focused suite remains PASS.

- [ ] **Step 8: Commit the component behavior**

```powershell
git add -- src/features/catalog/components/project-card.tsx tests/unit/project-card.test.tsx
git commit -m "fix(cards): hide inapplicable preset metadata"
```

### Task 2: Prove the real generated preset card and full catalog remain healthy

**Files:**
- Modify: `tests/e2e/catalog.spec.ts:655-763`

**Interfaces:**
- Consumes: the generated `puras-director-v15` catalog record and the
  `ProjectCard` behavior from Task 1.
- Produces: browser-level regression coverage for the actual Pura's Director
  card; no application API.

- [ ] **Step 1: Add a browser regression for Pura's Director**

Add this test before `explains every card fact with hover help` in
`tests/e2e/catalog.spec.ts`:

```tsx
test("omits inapplicable metadata from curated external preset cards", async ({
  page,
}) => {
  const presetCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", {
      name: "Pura's Director v15.0",
      exact: true,
    }),
  });

  await expect(presetCard.locator(".preset-version")).toHaveText("v15.0");
  await expect(presetCard.locator(".preset-publication")).toHaveCount(0);
  await expect(presetCard.locator(".preset-size")).toHaveCount(0);
  await expect(presetCard.locator(".card-state-list")).toHaveCount(0);
  await expect(presetCard.locator(".license")).toHaveText("Missing");

  const descriptionId = await presetCard.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  const description = page.locator(`#${descriptionId}`);

  for (const label of [
    "Manual source",
    "Activity unavailable",
    "Release unavailable",
    "Popularity unavailable",
    "Repository size unavailable",
  ]) {
    await expect(presetCard).not.toContainText(label);
    await expect(description).not.toContainText(label);
  }
});
```

In `explains every card fact with hover help`, use
`LE_EMOTIONALISM 1.1.5` as the known-fact preset, require tooltip anchors for
`.preset-version` and `.preset-size`, and assert that
`.preset-publication` has count zero. The generated catalog has no preset with
a publication date, so the component fixture remains the publication-date
coverage.

- [ ] **Step 2: Run the catalog browser suite**

Run:

```powershell
npm run test:e2e -- catalog.spec.ts
```

Expected: PASS. The existing `LE_EMOTIONALISM 1.1.5` tooltip assertions also
prove that known preset version and file-size facts remain interactive; the
component test covers a known publication date because no generated preset
currently supplies one.

- [ ] **Step 3: Run the complete project verification**

Run:

```powershell
npm run check
```

Expected: PASS for formatting, lint, palette audit, catalog validation,
generated catalog build, typecheck, unit tests, production build, and static
export verification.

- [ ] **Step 4: Inspect the final scoped diff**

Run:

```powershell
git status --short
git diff --check
git diff -- src/features/catalog/components/project-card.tsx tests/unit/project-card.test.tsx tests/e2e/catalog.spec.ts
```

Expected: no whitespace errors and only the approved card logic and regression
tests are present. Generated catalog output must not be modified.

- [ ] **Step 5: Commit the browser regression**

```powershell
git add -- tests/e2e/catalog.spec.ts
git commit -m "test(cards): cover external preset metadata"
```
