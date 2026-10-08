import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  loadPreparedGithubResult,
  loadPreparedGithubDiagnostic,
} from "../../scripts/automation/prepared-github.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";

function effects() {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  const archive = zipSync({ "result.json": strToU8(JSON.stringify(result)) });
  const run = {
    ...context.run,
    repository: { id: 42 },
    head_repository: { ...context.run.head_repository, id: 42 },
  };
  const artifact = {
    id: 501,
    name: `automation-prepared-${result.operationKey}`,
    expired: false,
    size_in_bytes: archive.length,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: run.id,
      repository_id: 42,
      head_repository_id: 42,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
    },
  };
  const downloads: string[][] = [];
  const calls: string[][] = [];
  const input = {
    ...context,
    repository: result.repository,
    runId: run.id,
    gh: async (args: string[]) => {
      calls.push(args);
      return args.includes("--paginate")
        ? JSON.stringify([{ total_count: 1, artifacts: [artifact] }])
        : JSON.stringify(run);
    },
    download: async (args: string[]) => {
      downloads.push(args);
      return archive;
    },
  };
  return { result, run, artifact, input, downloads, calls };
}

function diagnosticEffects(value?: Record<string, unknown>) {
  const fixture = effects();
  fixture.run.conclusion = "failure";
  const diagnostic = value ?? {
    schema_version: 1,
    operation_key: fixture.result.operationKey,
    failure: {
      kind: "configuration",
      reasonCode: "provider-authentication-failed",
    },
  };
  const archive = zipSync({
    "diagnostic.json": strToU8(JSON.stringify(diagnostic)),
  });
  fixture.artifact.name = `automation-failure-${fixture.result.operationKey}-${fixture.run.id}`;
  fixture.artifact.digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  fixture.artifact.size_in_bytes = archive.length;
  fixture.input.download = async (args) => {
    fixture.downloads.push(args);
    return archive;
  };
  return { ...fixture, diagnostic };
}

test("an authenticated failed preparation recovers its sanitized failure classification without permitting publication", async () => {
  const fixture = diagnosticEffects();
  expect(await loadPreparedGithubDiagnostic(fixture.input)).toEqual(
    fixture.diagnostic.failure,
  );
  await expect(loadPreparedGithubResult(fixture.input)).rejects.toThrow();
  expect(fixture.downloads).toHaveLength(1);
});

test.each(["key", "extra", "reason", "kind", "size", "actor"])(
  "a forged or unsafe diagnostic %s cannot become a failure receipt",
  async (variant) => {
    const key = preparedResultFixture().operationKey;
    const value: Record<string, unknown> = {
      schema_version: 1,
      operation_key: key,
      failure: {
        kind: "configuration",
        reasonCode: "provider-authentication-failed",
      },
    };
    if (variant === "key") value.operation_key = "c".repeat(64);
    if (variant === "extra") value.message = "provider secret output";
    if (variant === "reason")
      value.failure = { kind: "unknown", reasonCode: "raw-provider-output" };
    if (variant === "kind")
      value.failure = {
        kind: "permanent",
        reasonCode: "provider-authentication-failed",
      };
    if (variant === "size") value.padding = "a".repeat(20_000);
    const fixture = diagnosticEffects(value);
    if (variant === "actor") fixture.run.actor.id++;
    await expect(loadPreparedGithubDiagnostic(fixture.input)).rejects.toThrow();
  },
);
test("the writer downloads only the exact named artifact of the trusted producer run", async () => {
  const fixture = effects();
  expect(await loadPreparedGithubResult(fixture.input)).toEqual(fixture.result);
  expect(fixture.downloads).toEqual([
    ["api", "repos/MentallyQuill/Tavernary/actions/artifacts/501/zip"],
  ]);
  expect(fixture.calls[1]).toContain("--paginate");
});
test.each([
  "actor",
  "fork",
  "branch",
  "workflow",
  "failure",
  "run",
  "artifact-run",
  "artifact-head",
  "artifact-repo",
  "name",
  "expired",
  "digest",
  "size",
])("untrusted producer/artifact %s fails before download", async (variant) => {
  const fixture = effects();
  if (variant === "actor") fixture.run.actor.id++;
  if (variant === "fork")
    fixture.run.head_repository.full_name = "foreign/Tavernary";
  if (variant === "branch") fixture.run.head_branch = "feature";
  if (variant === "workflow") fixture.run.path = ".github/workflows/ci.yml";
  if (variant === "failure") fixture.run.conclusion = "failure";
  if (variant === "run") fixture.run.id++;
  if (variant === "artifact-run") fixture.artifact.workflow_run.id++;
  if (variant === "artifact-head")
    fixture.artifact.workflow_run.head_sha = "f".repeat(40);
  if (variant === "artifact-repo")
    fixture.artifact.workflow_run.head_repository_id++;
  if (variant === "name") fixture.artifact.name = "foreign-result";
  if (variant === "expired") fixture.artifact.expired = true;
  if (variant === "digest") fixture.artifact.digest = "missing";
  if (variant === "size") fixture.artifact.size_in_bytes = 100_000_000;
  await expect(loadPreparedGithubResult(fixture.input)).rejects.toThrow();
  expect(fixture.downloads).toEqual([]);
});
test("ambiguous repeated artifacts cannot select an arbitrary producer attempt", async () => {
  const fixture = effects();
  const original = fixture.input.gh;
  fixture.input.gh = async (args) =>
    args.includes("--paginate")
      ? JSON.stringify([
          {
            total_count: 2,
            artifacts: [fixture.artifact, { ...fixture.artifact, id: 502 }],
          },
        ])
      : original(args);
  await expect(loadPreparedGithubResult(fixture.input)).rejects.toThrow();
  expect(fixture.downloads).toEqual([]);
});
