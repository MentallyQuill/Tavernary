import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { classifyPullRequestPaths } from "../../scripts/ci/classify-pr-paths.mjs";

describe("pull request CI path classification", () => {
  test.each([
    "data/registry/projects/example-extension.json",
    "data/registry/projects/example-frontend.json",
    "data/registry/projects/example-preset.json",
    "data/registry/sources/github-42.json",
    "data/registry/kits/example-kit.json",
    "data/snapshots/github/example-extension.json",
    "data/snapshots/codeberg/example-extension.json",
    "data/snapshots/github/kits/example-kit.json",
    "data/snapshots/github-refresh.json",
    "data/vocabularies/frontends.json",
    "data/vocabularies/model-families.json",
    "data/vocabularies/completion-formats.json",
  ])("routes published content %s through focused CI", (path) => {
    expect(classifyPullRequestPaths([path])).toEqual({
      route: "content",
      reason: "content-only",
    });
  });

  test("routes multiple published content files together", () => {
    expect(
      classifyPullRequestPaths([
        "data/registry/projects/example.json",
        "data/snapshots/github/example.json",
        "data/vocabularies/frontends.json",
      ]),
    ).toEqual({ route: "content", reason: "content-only" });
  });

  test("routes exact owner-edit and owner-move paths through focused CI", () => {
    expect(
      classifyPullRequestPaths(["data/registry/projects/owner-alpha.json"]),
    ).toEqual({ route: "content", reason: "content-only" });
    expect(
      classifyPullRequestPaths([
        "data/registry/projects/owner-alpha.json",
        "data/snapshots/github/owner-alpha.json",
      ]),
    ).toEqual({ route: "content", reason: "content-only" });
  });

  test.each([
    "docs/owner-alpha.md",
    "scripts/help/owner-alpha.mjs",
    ".github/workflows/owner-alpha.yml",
    "data/schemas/project.schema.json",
  ])(
    "fails owner generation additions closed through full CI for %s",
    (path) => {
      expect(
        classifyPullRequestPaths([
          "data/registry/projects/owner-alpha.json",
          path,
        ]),
      ).toMatchObject({ route: "full", path });
    },
  );

  test.each([
    "src/features/catalog/components/project-card.tsx",
    "scripts/catalog/build.mjs",
    "tests/unit/build-catalog.test.ts",
    ".github/workflows/ci.yml",
    "data/schemas/project.schema.json",
    "data/moderation/blocked-github-users.json",
    "data/reports/enrichment-report.json",
    "data/catalog/projects.json",
    "docs/README.md",
    "package.json",
  ])("routes non-content path %s through full CI", (path) => {
    expect(classifyPullRequestPaths([path])).toEqual({
      route: "full",
      reason: "full-path",
      path,
    });
  });

  test.each([
    "scripts/security/tavernkeeper-reports.mjs",
    "data/schemas/tavernkeeper-report-index.v4.schema.json",
    ".github/workflows/import-tavernkeeper-reports.yml",
    "src/features/catalog/components/tavernkeeper-scan-indicator.tsx",
  ])("routes TavernKeeper implementation path %s through full CI", (path) => {
    expect(classifyPullRequestPaths([path]).route).toBe("full");
  });

  test("routes mixed content and code through full CI", () => {
    expect(
      classifyPullRequestPaths([
        "data/registry/projects/example.json",
        "src/app/page.tsx",
      ]),
    ).toEqual({
      route: "full",
      reason: "full-path",
      path: "src/app/page.tsx",
    });
  });

  test.each([
    "data/snapshots/codeberg/nested/example.json",
    "data/snapshots/codeberg/example.yaml",
  ])("fails closed for unsafe Codeberg snapshot path %s", (path) => {
    expect(classifyPullRequestPaths([path])).toEqual({
      route: "full",
      reason: "full-path",
      path,
    });
  });

  test.each([
    { paths: [] },
    { paths: [""] },
    { paths: ["   "] },
    { paths: ["../data/registry/projects/example.json"] },
    { paths: ["/data/registry/projects/example.json"] },
    { paths: ["data/registry/projects/nested/example.json"] },
    { paths: ["data/registry/projects/example.yaml"] },
  ])("fails closed for malformed paths %#", ({ paths }) => {
    expect(classifyPullRequestPaths(paths).route).toBe("full");
  });

  test("normalizes Windows path separators", () => {
    expect(
      classifyPullRequestPaths([
        "data\\registry\\projects\\example-extension.json",
      ]),
    ).toEqual({ route: "content", reason: "content-only" });
  });

  test.each([
    {
      paths: [
        "data/registry/projects/example.json",
        "data/snapshots/github/example.json",
      ],
      expected: "content",
    },
    { paths: [], expected: "full" },
  ])(
    "classifies a real NUL-delimited CLI file as $expected",
    async ({ paths, expected }) => {
      const directory = await mkdtemp(join(tmpdir(), "tavernary-ci-paths-"));
      const pathFile = join(directory, "paths.bin");

      try {
        await writeFile(
          pathFile,
          Buffer.from(paths.length > 0 ? `${paths.join("\0")}\0` : ""),
        );
        const result = spawnSync(
          process.execPath,
          [
            resolve("scripts/ci/classify-pr-paths.mjs"),
            "--paths-file",
            pathFile,
          ],
          { encoding: "utf8" },
        );

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe(expected);
      } finally {
        await rm(directory, { recursive: true });
      }
    },
  );
});
