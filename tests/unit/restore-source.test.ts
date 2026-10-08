import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { expect, test, vi } from "vitest";
import { loadGithubRestoreSource } from "../../scripts/automation/restore-source.mjs";

function fixture() {
  const source = {
    schema_version: 1,
    runId: 88,
    runAttempt: 1,
    headSha: "d".repeat(40),
    ownerActorId: 2625904,
    releaseId: 77,
    sourceSha: "a".repeat(40),
    buildId: "run-42-attempt-1",
    buildDigest: "b".repeat(64),
    archiveDigest: `sha256:${"e".repeat(64)}`,
    catalogDigest: "c".repeat(64),
    targetDigest: "d".repeat(64),
    baselineSha: "d".repeat(40),
    reason: "Restore working presentation",
    dryRun: false,
  };
  const archive = zipSync({
    "restore-source.json": strToU8(JSON.stringify(source)),
  });
  const run = {
    id: 88,
    path: ".github/workflows/restore-site.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: source.headSha,
    actor: { id: 2625904 },
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    display_title: "Site restore 77",
    repository: { id: 100, full_name: "MentallyQuill/Tavernary" },
    head_repository: { id: 100, full_name: "MentallyQuill/Tavernary" },
  };
  const artifact = {
    id: 99,
    name: "site-restore-source-88-1",
    expired: false,
    size_in_bytes: archive.length,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: 88,
      head_sha: source.headSha,
      head_branch: "main",
      repository_id: 100,
      head_repository_id: 100,
    },
  };
  const input = {
    repository: "MentallyQuill/Tavernary",
    runId: 88,
    currentMainSha: source.headSha,
    isAncestor: () => true,
    gh: async (args: string[]) =>
      JSON.stringify(
        args[1].includes("artifacts?")
          ? { total_count: 1, artifacts: [artifact] }
          : run,
      ),
    download: vi.fn(async () => archive),
  };
  return { source, run, artifact, input };
}
test("completed owner restores recover their exact source even after a public verification failure", async () => {
  const data = fixture();
  expect(await loadGithubRestoreSource(data.input)).toEqual(data.source);
});
test.each(["actor", "fork", "attempt", "digest", "title"])(
  "a substituted restore %s cannot authorize a rollback",
  async (variant) => {
    const data = fixture();
    if (variant === "actor") data.run.actor.id = 4624827;
    if (variant === "fork") data.run.head_repository.id = 101;
    if (variant === "attempt") data.run.run_attempt = 2;
    if (variant === "digest") data.artifact.digest = `sha256:${"f".repeat(64)}`;
    if (variant === "title") data.run.display_title = "Site restore 76";
    await expect(loadGithubRestoreSource(data.input)).rejects.toThrow();
  },
);
