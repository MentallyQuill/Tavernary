import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { loadGithubSiteBundle } from "../../scripts/automation/deployment-github.mjs";
import { encodeSiteBundle } from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";
function input() {
  const fixture = deploymentArtifactFixture();
  const bundle = encodeSiteBundle(bundleFixture());
  const archive = zipSync({ "site-bundle.tsb.gz": bundle.archive });
  fixture.artifact.name = "site-bundle-" + fixture.manifest.sourceSha;
  fixture.artifact.size_in_bytes = archive.length;
  fixture.artifact.digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  fixture.input.download = async () => archive;
  return { fixture, bundle, archive };
}
test("the complete bundle uses the same authenticated Pages run and bounded single-file ZIP provenance", async () => {
  const data = input();
  const loaded = await loadGithubSiteBundle(data.fixture.input);
  expect(loaded.bundle.manifest).toEqual(bundleFixture().manifest);
  expect(loaded.bundle.archiveDigest).toBe(data.bundle.archiveDigest);
});
test.each(["actor", "fork", "digest", "path", "build"])(
  "untrusted %s complete bundles cannot be retained or restored",
  async (variant) => {
    const data = input();
    if (variant === "actor") data.fixture.run.actor.id++;
    if (variant === "fork") data.fixture.run.head_repository.id++;
    if (variant === "digest")
      data.fixture.artifact.digest = `sha256:${"f".repeat(64)}`;
    if (variant === "path") {
      const archive = zipSync({ "../site-bundle.tsb.gz": data.bundle.archive });
      data.fixture.artifact.digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
      data.fixture.artifact.size_in_bytes = archive.length;
      data.fixture.input.download = async () => archive;
    }
    if (variant === "build") data.fixture.run.run_attempt++;
    await expect(loadGithubSiteBundle(data.fixture.input)).rejects.toThrow();
  },
);
