import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { GithubRevisionInput } from "../../scripts/automation/deployment-github.mjs";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { revisionFixture } from "./deployment-fixtures";
export function deploymentArtifactFixture() {
  const manifest = buildRevisionManifest(
    revisionFixture({ buildId: "run-42-attempt-1" }),
  );
  const run = {
    id: 42,
    path: ".github/workflows/deploy-pages.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "d".repeat(40),
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    display_title: `Site: Deploy ${manifest.sourceSha}`,
    actor: { id: 4624827, type: "Bot" },
    repository: { id: 100, full_name: "MentallyQuill/Tavernary" },
    head_repository: { id: 100, full_name: "MentallyQuill/Tavernary" },
  };
  const archive = zipSync({
    "revision.json": strToU8(JSON.stringify(manifest)),
  });
  const artifact = {
    id: 88,
    name: `site-revision-${manifest.sourceSha}`,
    size_in_bytes: archive.length,
    expired: false,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: run.id,
      repository_id: 100,
      head_repository_id: 100,
      head_branch: "main",
      head_sha: run.head_sha,
    },
  };
  const input: GithubRevisionInput = {
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 4624827,
    runId: 42,
    currentMainSha: "d".repeat(40),
    isAncestor: () => true,
    gh: async (args) =>
      args.some((arg) => arg.endsWith("/artifacts"))
        ? JSON.stringify([{ total_count: 1, artifacts: [artifact] }])
        : JSON.stringify(run),
    download: async () => archive,
  };
  return { input, manifest, run, artifact };
}
