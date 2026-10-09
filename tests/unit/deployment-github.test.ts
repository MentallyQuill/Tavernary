import { expect, test } from "vitest";
import { loadGithubRevisionManifest } from "../../scripts/automation/deployment-github.mjs";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";
test("exact Pages revision metadata is authenticated against main run, origin, numeric actor, archive hash and Git ancestry", async () => {
  const fixture = deploymentArtifactFixture();
  expect(await loadGithubRevisionManifest(fixture.input)).toEqual({
    runId: 42,
    manifest: fixture.manifest,
  });
});
test("artifact inventory reads a later page explicitly and refuses an over-cap search before pagination", async () => {
  const fixture = deploymentArtifactFixture();
  const native = fixture.input.gh;
  const calls: string[][] = [];
  let overloaded = false;
  fixture.input.gh = async (args) => {
    if (!args.some((arg) => /\/artifacts(?:\?|$)/u.test(arg)))
      return native(args);
    calls.push(args);
    return JSON.stringify([
      {
        total_count: overloaded ? 1001 : 101,
        artifacts: args.includes("page=2")
          ? [fixture.artifact]
          : Array.from({ length: 100 }, (_, index) => ({
              ...fixture.artifact,
              id: index + 1000,
              name: `unrelated-${index}`,
            })),
      },
    ]);
  };
  expect(await loadGithubRevisionManifest(fixture.input)).toHaveProperty(
    "manifest.sourceSha",
    fixture.manifest.sourceSha,
  );
  expect(calls).toHaveLength(2);
  expect(calls.every((args) => !args.includes("--paginate"))).toBe(true);
  calls.length = 0;
  overloaded = true;
  await expect(loadGithubRevisionManifest(fixture.input)).rejects.toThrow(
    /cap/u,
  );
  expect(calls).toHaveLength(1);
});
test.each([
  "actor",
  "fork",
  "workflow",
  "branch",
  "archive",
  "source",
  "ancestry",
  "expired",
])("untrusted %s deployment metadata fails closed", async (variant) => {
  const fixture = deploymentArtifactFixture();
  if (variant === "actor") fixture.run.actor.id++;
  if (variant === "fork") fixture.run.head_repository.id++;
  if (variant === "workflow")
    fixture.run.path = ".github/workflows/foreign.yml";
  if (variant === "branch") fixture.run.head_branch = "automation/foreign";
  if (variant === "archive")
    fixture.artifact.digest = `sha256:${"f".repeat(64)}`;
  if (variant === "source")
    fixture.artifact.name = `site-revision-${"f".repeat(40)}`;
  if (variant === "ancestry") fixture.input.isAncestor = () => null;
  if (variant === "expired") fixture.artifact.expired = true;
  await expect(loadGithubRevisionManifest(fixture.input)).rejects.toThrow();
});
test("a failed final public check can recover from the already validated build manifest", async () => {
  const fixture = deploymentArtifactFixture();
  fixture.run.conclusion = "failure";
  expect(await loadGithubRevisionManifest(fixture.input)).toHaveProperty(
    "manifest.sourceSha",
    fixture.manifest.sourceSha,
  );
});
