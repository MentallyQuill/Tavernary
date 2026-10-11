import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";
import {
  classifyDeploymentPaths,
  runDeploymentClassification,
} from "../../scripts/ci/classify-deployment.mjs";
import { createActiveDeployment } from "../../scripts/automation/deployment-state.mjs";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { revisionFixture } from "../helpers/deployment-fixtures";

test("Kit data and generated catalogs use focused deployment checks", () => {
  expect(
    classifyDeploymentPaths([
      "data/registry/kits/example.json",
      "data/snapshots/github/kits/example.json",
      "public/catalog/tavernary-catalog.json",
      "public/catalog/tavernary-catalog-v8.json",
      `data/maintenance/automation/publications/${"a".repeat(64)}.json`,
      "data/maintenance/automation/deployments/current.json",
    ]),
  ).toBe("content");
  expect(
    classifyDeploymentPaths([
      "data/snapshots/install/github-42.json",
      "data/security/tavernkeeper-report-summaries.json",
      "data/security/tavernkeeper-import-state.json",
    ]),
  ).toBe("content");
});

test("implementation, policy, unknown and malformed paths require full deployment checks", () => {
  for (const path of [
    "src/app/page.tsx",
    "package-lock.json",
    ".github/workflows/deploy-pages.yml",
    "data/schemas/kit.schema.json",
    "data/vocabularies/tags.json",
    "data/moderation/blocked-github-users.json",
    "public/catalog/unknown.json",
    "data/maintenance/automation/publications/unknown.json",
    "../data/registry/kits/example.json",
  ])
    expect(
      classifyDeploymentPaths(["data/registry/kits/example.json", path]),
      path,
    ).toBe("full");
  expect(classifyDeploymentPaths([])).toBe("full");
});

test("native deployment classification uses confirmed Git history and defaults safely", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tavernary-deploy-route-"));
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
  const put = async (path: string, content: string) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content);
  };
  const commit = () => {
    git(["add", "."]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "fixture",
    ]);
    return git(["rev-parse", "HEAD"]);
  };
  const output = resolve(root, ".git/route-output.txt");
  const env = {
    NODE_ENV: "test" as const,
    GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
    GITHUB_REF: "refs/heads/main",
    GITHUB_WORKFLOW_REF:
      "MentallyQuill/Tavernary/.github/workflows/deploy-pages.yml@refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_OUTPUT: output,
  };
  try {
    git(["init", "--initial-branch=main"]);
    await put("src/app/page.tsx", "original");
    const baseline = commit();
    expect(await runDeploymentClassification({ root, env })).toMatchObject({
      route: "full",
    });
    const manifest = buildRevisionManifest(
      revisionFixture({ sourceSha: baseline }),
    );
    const nowMs = Date.now();
    const active = createActiveDeployment({
      deployment: {
        schema_version: 1,
        sourceSha: baseline,
        status: "confirmed",
        workflowRunId: 42,
        buildId: manifest.buildId,
        bundleDigest: manifest.buildDigest,
        confirmedAt: new Date(nowMs).toISOString(),
        confirmation: {
          sourceSha: baseline,
          catalogDigest: manifest.catalogDigest,
          targetDigest: manifest.targetDigest,
          buildDigest: manifest.buildDigest,
          essentialSmokePassed: true,
        },
      },
      confirmingRunId: 42,
      nowMs,
    });
    const marker = "data/maintenance/automation/deployments/current.json";
    await put(marker, JSON.stringify(active));
    await put("data/registry/kits/example.json", "{}");
    commit();
    expect(await runDeploymentClassification({ root, env })).toMatchObject({
      route: "content",
      baselineSha: baseline,
    });
    expect(await readFile(output, "utf8")).toContain("route=content\n");
    // Comparing only the latest commit would miss this earlier implementation change.
    await put("src/app/page.tsx", "changed");
    commit();
    await put("data/registry/kits/example.json", '{"title":"new"}');
    commit();
    expect(await runDeploymentClassification({ root, env })).toMatchObject({
      route: "full",
    });
    await put("src/app/page.tsx", "original");
    commit();
    expect(await runDeploymentClassification({ root, env })).toMatchObject({
      route: "content",
    });
    const blob = git(["rev-parse", `HEAD:${marker}`]);
    git(["update-index", "--cacheinfo", `120000,${blob},${marker}`]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "invalid marker mode",
    ]);
    expect(await runDeploymentClassification({ root, env })).toMatchObject({
      route: "full",
    });
    expect(
      await runDeploymentClassification({
        root,
        env: { ...env, GITHUB_REF: "refs/heads/other" },
      }),
    ).toMatchObject({ route: "full" });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { force: true });
  }
});

test("shared GitHub cooldown is internal data without admitting other unknown automation files", () => {
  expect(
    classifyDeploymentPaths([
      "data/maintenance/automation/github-backoff.json",
    ]),
  ).toBe("content");
  expect(
    classifyDeploymentPaths(["data/maintenance/automation/other-backoff.json"]),
  ).toBe("full");
});
