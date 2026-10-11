import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import { loadWorkerGithubDiagnostic } from "../../scripts/automation/worker-diagnostic.mjs";

const repository = "MentallyQuill/Tavernary";
const operationKey = "a".repeat(64);
const publisherActorId = 41_982_982;
function fixture() {
  const run = {
    id: 702,
    run_attempt: 2,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "c".repeat(40),
    repository: { id: 42, full_name: repository },
    head_repository: { id: 42, full_name: repository },
    actor: { id: publisherActorId, type: "Bot" },
    display_title: `Automation ${operationKey}`,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-08T00:00:00Z",
    run_started_at: "2026-10-08T12:00:00Z",
    updated_at: "2026-10-08T12:02:00Z",
  };
  const value = {
    schema_version: 1,
    operation_key: operationKey,
    failure: {
      kind: "configuration",
      reasonCode: "publisher-authentication-failed",
    },
  };
  const archive = zipSync({
    "automation-diagnostic.json": strToU8(JSON.stringify(value)),
  });
  const artifact = {
    id: 900,
    name: "automation-diagnostic-702",
    expired: false,
    size_in_bytes: archive.byteLength,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    created_at: "2026-10-08T12:01:00Z",
    workflow_run: {
      id: 702,
      repository_id: 42,
      head_repository_id: 42,
      head_branch: "main",
      head_sha: run.head_sha,
    },
  };
  return { run, value, archive, artifact };
}
function loader(context = fixture()) {
  return {
    gh: async (args: string[]) => {
      expect(args).toContain(`repos/${repository}/actions/runs/702/artifacts`);
      return JSON.stringify([
        { total_count: 1, artifacts: [context.artifact] },
      ]);
    },
    download: async (args: string[]) => {
      expect(args).toEqual([
        "api",
        `repos/${repository}/actions/artifacts/900/zip`,
      ]);
      return context.archive;
    },
    repository,
    operationKey,
    publisherActorId,
    run: context.run,
  };
}
test("the failed native wrapper loads its sanitized current-attempt diagnostic", async () => {
  expect(await loadWorkerGithubDiagnostic(loader())).toEqual({
    schema_version: 1,
    operation_key: operationKey,
    failure: {
      kind: "configuration",
      reasonCode: "publisher-authentication-failed",
    },
    runId: 702,
    runAttempt: 2,
    sourceSha: "c".repeat(40),
  });
});

test.each([
  { head_repository: { id: 42, full_name: "Foreign/Tavernary" } },
  { head_repository: { id: 99, full_name: repository } },
  { actor: { id: 9, type: "Bot" } },
  { path: ".github/workflows/automation-writer.yml" },
  { event: "pull_request" },
  { head_branch: "feature" },
  { display_title: `Automation ${"f".repeat(64)}` },
  { run_attempt: 0 },
])(
  "a foreign or malformed native wrapper cannot supply diagnostics: %j",
  async (overrides) => {
    const context = fixture();
    Object.assign(context.run, overrides);
    await expect(
      loadWorkerGithubDiagnostic({
        ...loader(context),
        gh: async () => {
          throw new Error("Must authenticate before reading artifacts");
        },
      }),
    ).rejects.toMatchObject({ code: "worker-diagnostic-invalid" });
  },
);

test.each([
  { created_at: "2026-10-08T11:59:59Z" },
  { created_at: "2026-10-08T12:03:00Z" },
  { expired: true },
  { size_in_bytes: 16_385 },
  { digest: "sha256:invalid" },
  {
    workflow_run: {
      id: 703,
      repository_id: 42,
      head_repository_id: 42,
      head_branch: "main",
      head_sha: "c".repeat(40),
    },
  },
  {
    workflow_run: {
      id: 702,
      repository_id: 99,
      head_repository_id: 42,
      head_branch: "main",
      head_sha: "c".repeat(40),
    },
  },
])(
  "an artifact from another attempt or origin supplies no failure authority: %j",
  async (overrides) => {
    const context = fixture();
    Object.assign(context.artifact, overrides);
    await expect(
      loadWorkerGithubDiagnostic(loader(context)),
    ).rejects.toMatchObject({ code: "worker-diagnostic-invalid" });
  },
);

test.each([
  { operation_key: "f".repeat(64) },
  { schema_version: 2 },
  {
    failure: {
      kind: "permanent",
      reasonCode: "publisher-authentication-failed",
    },
  },
  { failure: { kind: "configuration", reasonCode: "invented-code" } },
  {
    failure: {
      kind: "configuration",
      reasonCode: "publisher-authentication-failed",
      message: "unsafe details",
    },
  },
  { token: "unexpected secret" },
])(
  "malformed or foreign diagnostic payloads are denied: %j",
  async (overrides) => {
    const context = fixture();
    context.archive = zipSync({
      "automation-diagnostic.json": strToU8(
        JSON.stringify({ ...context.value, ...overrides }),
      ),
    });
    context.artifact.digest = `sha256:${createHash("sha256").update(context.archive).digest("hex")}`;
    context.artifact.size_in_bytes = context.archive.byteLength;
    await expect(
      loadWorkerGithubDiagnostic(loader(context)),
    ).rejects.toMatchObject({ code: "worker-diagnostic-invalid" });
  },
);

test("a wrapper without a retained diagnostic supplies no classification", async () => {
  await expect(
    loadWorkerGithubDiagnostic({
      ...loader(),
      gh: async () => JSON.stringify([{ total_count: 0, artifacts: [] }]),
    }),
  ).resolves.toBeNull();
});

test("GitHub availability failures remain visible to the controller", async () => {
  const error = Object.assign(new Error("Unavailable"), { status: 429 });
  await expect(
    loadWorkerGithubDiagnostic({
      ...loader(),
      gh: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});
