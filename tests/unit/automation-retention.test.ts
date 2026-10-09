import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planAutomationRetention,
  loadRetiredAutomationReceipts,
  runAutomationStateRetention,
} from "../../scripts/automation/retention.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import {
  AUTOMATION_NOW,
  preparedResultFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
function fixture() {
  const result = preparedResultFixture();
  const operation = preparedResultContextFixture().operation;
  const publication = createCanonicalPublicationRecord({ operation, result });
  const revision = "d".repeat(40);
  const finalized = {
    ...operation,
    stage: "finalized" as const,
    expectedSha: revision,
    workerRunId: null,
    retry: null,
    nextEligibleAt: null,
  };
  const receipt = {
    schema_version: 1 as const,
    operation: finalized,
    updatedAt: new Date(AUTOMATION_NOW).toISOString(),
    completedAt: new Date(AUTOMATION_NOW).toISOString(),
  };
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 4624827,
    nowMs: AUTOMATION_NOW + 120 * 86400000,
    remote: { mainHeadSha: "b".repeat(40), issues: [], pulls: [], runs: [] },
    receipts: [receipt],
    operations: [finalized],
    local: {
      revision: "b".repeat(40),
      deployments: [],
      publications: [{ record: publication, revision }],
      publicationFileDigests: Object.fromEntries(
        result.files.map((file) => [`${revision}:${file.path}`, file.sha256]),
      ),
      confirmedRevisions: [revision],
    },
  };
  return { result, operation, publication, receipt, state };
}
test("terminal retirement preserves an idempotency marker and deletes only the paired hot records", () => {
  const data = fixture();
  const plan = planAutomationRetention({ state: data.state });
  expect(plan.files).toHaveLength(1);
  expect(plan.files[0].path).toBe(
    `data/maintenance/automation/terminal/${data.operation.key.slice(0, 2)}/${data.operation.key}.json`,
  );
  expect(JSON.parse(plan.files[0].content)).toMatchObject({
    operationKey: data.operation.key,
    expectedSha: data.receipt.operation.expectedSha,
    retiredFromSha: data.state.local.revision,
  });
  expect(plan.removeFiles.map((file) => file.path)).toEqual([
    `data/maintenance/automation/operations/${data.operation.key}.json`,
    `data/maintenance/automation/publications/${data.operation.key}.json`,
  ]);
  expect(
    plan.removeFiles.every((file) => /^[a-f0-9]{40}$/u.test(file.gitBlobSha)),
  ).toBe(true);
});
test.each([
  "pending",
  "recent",
  "canonical-missing",
  "public-missing",
  "digest-missing",
  "current-work",
])("%s state cannot retire a receipt or its publication", (variant) => {
  const data = fixture();
  if (variant === "pending") {
    data.receipt.operation.stage = "published" as never;
    data.receipt.completedAt = null as never;
  }
  if (variant === "recent") data.state.nowMs = AUTOMATION_NOW + 89 * 86400000;
  if (variant === "canonical-missing") data.state.local.publications = [];
  if (variant === "public-missing") data.state.local.confirmedRevisions = [];
  if (variant === "digest-missing")
    data.state.local.publicationFileDigests = {};
  if (variant === "current-work")
    data.state.operations = [{ ...data.operation, stage: "published" }];
  expect(planAutomationRetention({ state: data.state })).toEqual({
    files: [],
    removeFiles: [],
  });
});
test("retirement cannot touch tombstones and leaves the latest and protected deployment proofs", () => {
  const data = fixture();
  const deployments = Array.from({ length: 7 }, (_, index) => {
    const sourceSha = String(index + 1).repeat(40);
    return {
      schema_version: 1,
      sourceSha,
      buildId: `run-${index + 1}-attempt-1`,
      workflowRunId: index + 1,
      status: "confirmed",
      confirmedAt: new Date(AUTOMATION_NOW - index * 86400000).toISOString(),
      bundleDigest: "e".repeat(64),
      confirmation: {
        sourceSha,
        catalogDigest: "a".repeat(64),
        targetDigest: "c".repeat(64),
        buildDigest: "e".repeat(64),
        essentialSmokePassed: true,
      },
    };
  });
  data.state.local.deployments = deployments;
  const plan = planAutomationRetention({
    state: data.state,
    protectedSourceShas: [deployments[6].sourceSha],
    pruneDeployments: true,
  });
  expect(
    plan.removeFiles
      .filter((file) => file.path.includes("/deployments/"))
      .map((file) => file.path),
  ).toEqual(
    deployments
      .slice(3, 6)
      .map(
        (record) =>
          `data/maintenance/automation/deployments/${record.sourceSha}.json`,
      ),
  );
  expect(
    plan.removeFiles.some((file) =>
      /registry|security|tombstone/u.test(file.path),
    ),
  ).toBe(false);
  data.state.local.activeDeployment = { deployment: deployments[4] };
  expect(
    planAutomationRetention({
      state: data.state,
      pruneDeployments: true,
    }).removeFiles.some((file) => file.path.includes(deployments[4].sourceSha)),
  ).toBe(false);
  deployments[3].buildId = "run-4-attempt-NaN";
  expect(
    planAutomationRetention({
      state: data.state,
      pruneDeployments: true,
    }).removeFiles.some((file) => file.path.includes(deployments[3].sourceSha)),
  ).toBe(false);
  data.state.operations = [
    {
      ...data.operation,
      stage: "published",
      expectedSha: deployments[5].sourceSha,
    },
  ];
  expect(
    planAutomationRetention({
      state: data.state,
      pruneDeployments: true,
    }).removeFiles.some((file) => file.path.includes(deployments[5].sourceSha)),
  ).toBe(false);
});
const temporary: string[] = [];
const writerEnv = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_EVENT_NAME: "schedule",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
};
test("native retirement uses a fresh observation and one shared-lane slot", async () => {
  const data = fixture();
  let loads = 0,
    commits = 0;
  const input = {
    env: writerEnv,
    availableSlots: 1,
    load: async () => {
      loads++;
      return data.state;
    },
    gh: async () => {
      throw new Error("No GitHub read needed for paired receipts");
    },
    commit: async (proposal: {
      expectedMainSha: string;
      files: unknown[];
      removeFiles?: unknown[];
    }) => {
      commits++;
      expect(proposal.expectedMainSha).toBe(data.state.local.revision);
      expect(proposal.files).toHaveLength(1);
      expect(proposal.removeFiles).toHaveLength(2);
      return { sha: "e".repeat(40) };
    },
  };
  expect(
    await runAutomationStateRetention({ ...input, availableSlots: 0 }),
  ).toMatchObject({ status: "waiting" });
  expect(loads).toBe(0);
  expect(commits).toBe(0);
  expect(await runAutomationStateRetention(input)).toMatchObject({
    status: "retired",
    removed: 2,
  });
  expect(commits).toBe(1);
  data.state.operations = [{ ...data.operation, stage: "published" }];
  expect(await runAutomationStateRetention(input)).toMatchObject({
    status: "idle",
  });
  expect(commits).toBe(1);
});
test("a release inventory outage prevents deployment-proof cleanup", async () => {
  const data = fixture();
  data.state.local.deployments = [
    { confirmedAt: new Date(AUTOMATION_NOW).toISOString() },
  ];
  let commits = 0;
  await expect(
    runAutomationStateRetention({
      env: { ...writerEnv, TAVERNARY_IMMUTABLE_RELEASES_ENABLED: "true" },
      availableSlots: 1,
      load: async () => data.state,
      gh: async () => {
        throw { status: 503 };
      },
      commit: async () => {
        commits++;
        return { sha: "e".repeat(40) };
      },
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(commits).toBe(0);
});
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
test("a fresh checkout recovers the exact finalized receipt from a canonical retirement marker", async () => {
  const data = fixture();
  const root = await mkdtemp(join(tmpdir(), "tavernary-retention-"));
  temporary.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  git("init", "-q");
  git("config", "core.autocrlf", "false");
  git("config", "user.email", "retention@example.invalid");
  git("config", "user.name", "Retention fixture");
  const receiptPath = `data/maintenance/automation/operations/${data.operation.key}.json`;
  const publicationPath = `data/maintenance/automation/publications/${data.operation.key}.json`;
  for (const [path, content] of [[publicationPath, json(data.publication)]]) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git("add", ".");
  git("commit", "-qm", "canonical publication");
  const publishedSha = git("rev-parse", "HEAD");
  data.receipt.operation.expectedSha = publishedSha;
  data.state.local.publications = [
    { record: data.publication, revision: publishedSha },
  ];
  data.state.local.confirmedRevisions = [publishedSha];
  data.state.local.publicationFileDigests = Object.fromEntries(
    data.result.files.map((file) => [
      `${publishedSha}:${file.path}`,
      file.sha256,
    ]),
  );
  await mkdir(join(root, receiptPath, ".."), { recursive: true });
  await writeFile(join(root, receiptPath), json(data.receipt));
  git("add", ".");
  git("commit", "-qm", "canonical terminal receipt");
  data.state.local.revision = git("rev-parse", "HEAD");
  const plan = planAutomationRetention({ state: data.state });
  for (const file of plan.files) {
    await mkdir(join(root, file.path, ".."), { recursive: true });
    await writeFile(join(root, file.path), file.content);
  }
  for (const file of plan.removeFiles) await rm(join(root, file.path));
  git("add", ".");
  git("commit", "-qm", "retire confirmed terminal state");
  const revision = git("rev-parse", "HEAD");
  const input = {
    root,
    revision,
    operations: [data.operation],
    nowMs: data.state.nowMs,
  };
  expect(await loadRetiredAutomationReceipts(input)).toEqual([data.receipt]);
  expect(await loadRetiredAutomationReceipts(input)).toEqual([data.receipt]);
  // Dirty or forged markers cannot turn pending work into completed work.
  await writeFile(
    join(root, plan.files[0].path),
    plan.files[0].content.replace(data.operation.key, "f".repeat(64)),
  );
  await expect(loadRetiredAutomationReceipts(input)).rejects.toThrow();
});
