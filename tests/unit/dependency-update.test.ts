import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  inspectNpmDependencyUpdate,
  planDependencyUpdate,
  runDependencyWriter,
} from "../../scripts/automation/dependency-update.mjs";

const eligible = (): Parameters<typeof planDependencyUpdate>[0] => ({
  pull: {
    number: 42,
    state: "open",
    draft: false,
    user: { id: 49699333, type: "Bot" },
    head: {
      sha: "b".repeat(40),
      repo: { full_name: "MentallyQuill/Tavernary" },
    },
    base: { ref: "main", repo: { full_name: "MentallyQuill/Tavernary" } },
  },
  metadata: {
    ecosystem: "npm",
    provenance: true,
    permissionsChanged: false,
    updates: [{ name: "next", from: "16.3.4", to: "16.3.5" }],
  },
  files: ["package.json", "package-lock.json"],
  checks: ["verify", "visual"].map((name) => ({
    name,
    sha: "b".repeat(40),
    conclusion: "success",
    appId: 15368,
    workflow: ".github/workflows/ci.yml",
  })),
  currentMainSha: "a".repeat(40),
  mergeBaseSha: "a".repeat(40),
  allowedPackages: ["next"],
  deploymentHealthy: true,
});

test("an authenticated allowlisted patch with complete exact-head gates is eligible", () => {
  expect(planDependencyUpdate(eligible())).toEqual({
    action: "merge",
    headSha: "b".repeat(40),
    baseSha: "a".repeat(40),
    pullNumber: 42,
  });
});

test("a trusted major update remains an owner decision despite green CI", () => {
  const input = eligible();
  input.metadata.updates[0].to = "17.0.0";
  expect(planDependencyUpdate(input)).toEqual({
    action: "owner-review",
    reason: "version-policy",
  });
});

test("forged bot custody and stale or failed CI cannot authorize a dependency merge", () => {
  const forged = eligible();
  forged.pull.user.id = 42;
  expect(planDependencyUpdate(forged).action).toBe("owner-review");
  const stale = eligible();
  stale.checks[0].sha = "c".repeat(40);
  expect(planDependencyUpdate(stale)).toEqual({
    action: "wait",
    reason: "checks-unconfirmed",
  });
  const failed = eligible();
  failed.checks[1].conclusion = "failure";
  expect(planDependencyUpdate(failed)).toEqual({
    action: "wait",
    reason: "checks-unconfirmed",
  });
});

test("failed CI does not repeatedly update a dependency branch after main advances", () => {
  const input = eligible();
  input.mergeBaseSha = "c".repeat(40);
  input.checks[0].conclusion = "failure";
  expect(planDependencyUpdate(input)).toEqual({
    action: "wait",
    reason: "checks-unconfirmed",
  });
});

test("native manifest comparison derives the actual coupled update and rejects hidden scripts", async () => {
  const beforePackage = JSON.parse(await readFile("package.json", "utf8"));
  const beforeLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const afterPackage = structuredClone(beforePackage);
  const afterLock = structuredClone(beforeLock);
  const oldVersion = beforeLock.packages["node_modules/next"].version;
  const versionParts = oldVersion.split(".").map(Number);
  versionParts[2]++;
  const nextVersion = versionParts.join(".");
  const changes = ["next", "eslint-config-next"];
  for (const name of changes) {
    const field = name === "next" ? "dependencies" : "devDependencies";
    afterPackage[field][name] = `^${nextVersion}`;
    afterLock.packages[""][field][name] = `^${nextVersion}`;
    afterLock.packages[`node_modules/${name}`].version = nextVersion;
  }
  const input = { beforePackage, beforeLock, afterPackage, afterLock };
  expect(inspectNpmDependencyUpdate(input).updates).toEqual([
    {
      name: "eslint-config-next",
      from: beforeLock.packages["node_modules/eslint-config-next"].version,
      to: nextVersion,
    },
    { name: "next", from: oldVersion, to: nextVersion },
  ]);
  afterPackage.scripts.postinstall = "node surprise.mjs";
  expect(() => inspectNpmDependencyUpdate(input)).toThrow(
    "Dependency manifest policy changed",
  );
});

test("the dependency writer authenticates native Git objects and CI before one head-bound merge", async () => {
  const beforePackage = JSON.parse(await readFile("package.json", "utf8"));
  const beforeLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const afterPackage = structuredClone(beforePackage),
    afterLock = structuredClone(beforeLock);
  const oldVersion = beforeLock.packages["node_modules/next"].version;
  const parts = oldVersion.split(".").map(Number);
  parts[2]++;
  const target = parts.join(".");
  for (const [name, field] of [
    ["next", "dependencies"],
    ["eslint-config-next", "devDependencies"],
  ]) {
    afterPackage[field][name] = `^${target}`;
    afterLock.packages[""][field][name] = `^${target}`;
    afterLock.packages[`node_modules/${name}`].version = target;
  }
  const pull = eligible().pull;
  const calls: Array<{ args: string[]; body?: string }> = [];
  const values: Record<string, unknown> = {
    "git/ref/heads/main": {
      ref: "refs/heads/main",
      object: { sha: "a".repeat(40) },
    },
    "pulls?state=open&sort=created&direction=asc&per_page=20": [pull],
    "pulls/42": pull,
    [`compare/${"a".repeat(40)}...${"b".repeat(40)}`]: {
      merge_base_commit: { sha: "a".repeat(40) },
    },
    "pulls/42/files?per_page=100": ["package.json", "package-lock.json"].map(
      (filename) => ({ filename, status: "modified" }),
    ),
    [`git/commits/${"a".repeat(40)}`]: {
      sha: "a".repeat(40),
      tree: { sha: "c".repeat(40) },
    },
    [`git/commits/${"b".repeat(40)}`]: {
      sha: "b".repeat(40),
      tree: { sha: "d".repeat(40) },
    },
    [`git/trees/${"c".repeat(40)}`]: {
      sha: "c".repeat(40),
      tree: ["package.json", "package-lock.json"].map((path, i) => ({
        path,
        type: "blob",
        mode: "100644",
        sha: (i ? "f" : "e").repeat(40),
      })),
    },
    [`git/trees/${"d".repeat(40)}`]: {
      sha: "d".repeat(40),
      tree: ["package.json", "package-lock.json"].map((path, i) => ({
        path,
        type: "blob",
        mode: "100644",
        sha: (i ? "h" : "g")
          .repeat(40)
          .replaceAll("h", "8")
          .replaceAll("g", "7"),
      })),
    },
    [`commits/${"b".repeat(40)}/check-runs?filter=latest&per_page=100`]: {
      total_count: 2,
      check_runs: ["verify", "visual"].map((name) => ({
        name,
        head_sha: "b".repeat(40),
        conclusion: "success",
        app: { id: 15368 },
        details_url:
          "https://github.com/MentallyQuill/Tavernary/actions/runs/123/job/456",
      })),
    },
    "actions/runs/123": {
      id: 123,
      path: ".github/workflows/ci.yml",
      event: "pull_request",
      head_sha: "b".repeat(40),
      head_repository: { full_name: "MentallyQuill/Tavernary" },
      status: "completed",
      conclusion: "success",
    },
    "pulls/42/merge": { merged: true, sha: "9".repeat(40) },
  };
  for (const [key, data] of [
    ["e", beforePackage],
    ["f", beforeLock],
    ["7", afterPackage],
    ["8", afterLock],
  ] as const) {
    const bytes = Buffer.from(JSON.stringify(data));
    values[`git/blobs/${key.repeat(40)}`] = {
      sha: key.repeat(40),
      encoding: "base64",
      size: bytes.length,
      content: bytes.toString("base64"),
    };
  }
  const gh = async (args: string[], body?: string) => {
    calls.push({ args, body });
    const path = args
      .find((value) => value.startsWith("repos/"))!
      .slice("repos/MentallyQuill/Tavernary/".length);
    if (!(path in values)) throw new Error(`Unexpected endpoint ${path}`);
    return JSON.stringify(values[path]);
  };
  const result = await runDependencyWriter({
    pullNumbers: [42],
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
    },
    gh,
    loadDeployment: async () => true,
  });
  expect(result.status).toBe("merged");
  expect(
    calls.some((call) =>
      call.args.some((value) => value.includes("pulls?state=")),
    ),
  ).toBe(false);
  const merges = calls.filter(
    (call) =>
      call.args.includes("PUT") &&
      call.args.some((value) => value.endsWith("/merge")),
  );
  expect(merges).toHaveLength(1);
  expect(JSON.parse(merges[0].body!)).toMatchObject({
    sha: "b".repeat(40),
    merge_method: "squash",
  });

  calls.length = 0;
  (values["actions/runs/123"] as { head_sha: string }).head_sha = "a".repeat(
    40,
  );
  await runDependencyWriter({
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
    },
    gh,
    loadDeployment: async () => true,
  });
  expect(calls.some((call) => call.args.includes("PUT"))).toBe(false);

  calls.length = 0;
  (values["actions/runs/123"] as { head_sha: string }).head_sha = "b".repeat(
    40,
  );
  await runDependencyWriter({
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
    },
    gh,
    loadDeployment: async () => false,
  });
  expect(calls.some((call) => call.args.includes("PUT"))).toBe(false);
});

test("an exhausted controller pass makes no dependency requests or writes", async () => {
  let requests = 0;
  expect(
    await runDependencyWriter({
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
      },
      availableSlots: 0,
      gh: async () => {
        requests++;
        throw new Error("Unexpected dependency request");
      },
    }),
  ).toMatchObject({ status: "waiting", reason: "operation-limit" });
  expect(requests).toBe(0);
});

test("a patch update cannot smuggle workflow permissions", () => {
  expect(
    planDependencyUpdate({
      pull: {
        number: 42,
        state: "open",
        draft: false,
        user: { id: 49699333, type: "Bot" },
        head: {
          sha: "b".repeat(40),
          repo: { full_name: "MentallyQuill/Tavernary" },
        },
        base: { ref: "main", repo: { full_name: "MentallyQuill/Tavernary" } },
      },
      metadata: {
        ecosystem: "npm",
        provenance: true,
        permissionsChanged: true,
        updates: [{ name: "next", from: "16.3.4", to: "16.3.5" }],
      },
      files: ["package-lock.json", ".github/workflows/ci.yml"],
      checks: [],
      currentMainSha: "a".repeat(40),
      mergeBaseSha: "a".repeat(40),
      allowedPackages: ["next"],
      deploymentHealthy: true,
    }),
  ).toEqual({ action: "owner-review", reason: "expanded-policy" });
});
