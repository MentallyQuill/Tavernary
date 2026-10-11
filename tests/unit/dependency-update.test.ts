import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  inspectNpmDependencyUpdate,
  inspectActionsDependencyUpdate,
  resolveVerifiedActionVersion,
  planDependencyUpdate,
  runDependencyWriter,
  selectDependencyPullNumbers,
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

test("old closed dependency history does not hide current open bot candidates", () => {
  const closed = Array.from({ length: 200 }, (_, index) => ({
    number: index + 1,
    state: "closed",
    user: { id: 49699333, type: "Bot" },
  }));
  const owner = {
    number: 201,
    state: "open",
    user: { id: 2625904, type: "User" },
  };
  const current = {
    number: 242,
    state: "open",
    user: { id: 49699333, type: "Bot" },
  };
  expect(selectDependencyPullNumbers([...closed, owner, current])).toEqual([
    242,
  ]);
  expect(selectDependencyPullNumbers(closed)).toEqual([]);
});

test("an Actions pin update preserves workflow policy and proves its stable versions", async () => {
  const path = ".github/workflows/automation-writer.yml";
  const before = (await readFile(path, "utf8")).replace(
    /actions\/create-github-app-token@[a-f0-9]{40}(?: #[^\n]*)?/u,
    "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
  );
  const after = before.replace(
    "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
    `actions/create-github-app-token@${"1".repeat(40)} # v3.2.1`,
  );
  const resolveVersion = async (action: string, pin: string) => {
    expect(action).toBe("actions/create-github-app-token");
    return pin === "1".repeat(40) ? "3.2.1" : "3.2.0";
  };
  const metadata = await inspectActionsDependencyUpdate({
    before: { [path]: before },
    after: { [path]: after },
    resolveVersion,
  });
  expect(metadata).toMatchObject({
    ecosystem: "github-actions",
    provenance: true,
    updates: [
      { name: "actions/create-github-app-token", from: "3.2.0", to: "3.2.1" },
    ],
  });
  await expect(
    inspectActionsDependencyUpdate({
      before: { [path]: before },
      after: { [path]: after.replace("contents: read", "contents: write") },
      resolveVersion,
    }),
  ).rejects.toThrow("Actions workflow policy changed");
});

test("native Actions provenance follows annotated stable tags and rejects a moved release", async () => {
  const action = "actions/checkout",
    pin = "a".repeat(40);
  const content = Buffer.from(JSON.stringify({ version: "7.0.1" }));
  let moved = false;
  const gh = async (args: string[]) => {
    const route = args[1].slice(`repos/${action}/`.length);
    const responses: Record<string, unknown> = {
      [`git/commits/${pin}`]: { sha: pin, tree: { sha: "b".repeat(40) } },
      [`git/trees/${"b".repeat(40)}`]: {
        sha: "b".repeat(40),
        tree: [
          {
            path: "package.json",
            mode: "100644",
            type: "blob",
            sha: "c".repeat(40),
          },
        ],
      },
      [`git/blobs/${"c".repeat(40)}`]: {
        sha: "c".repeat(40),
        size: content.length,
        encoding: "base64",
        content: content.toString("base64"),
      },
      "git/ref/tags/v7.0.1": {
        ref: "refs/tags/v7.0.1",
        object: { type: "tag", sha: "d".repeat(40) },
      },
      [`git/tags/${"d".repeat(40)}`]: {
        sha: "d".repeat(40),
        object: { type: "commit", sha: moved ? "e".repeat(40) : pin },
      },
    };
    if (!(route in responses))
      throw new Error(`Unexpected action endpoint ${route}`);
    return JSON.stringify(responses[route]);
  };
  expect(await resolveVerifiedActionVersion({ action, pin, gh })).toBe("7.0.1");
  moved = true;
  await expect(
    resolveVerifiedActionVersion({ action, pin, gh }),
  ).rejects.toThrow("Actions release provenance is invalid");
});

test("an authenticated allowlisted patch with complete exact-head gates is eligible", () => {
  expect(planDependencyUpdate(eligible())).toEqual({
    action: "merge",
    headSha: "b".repeat(40),
    baseSha: "a".repeat(40),
    pullNumber: 42,
  });
});

test("verified stable Actions patches use the same exact-head gate", () => {
  const input = eligible();
  input.metadata = {
    ecosystem: "github-actions",
    provenance: true,
    permissionsChanged: false,
    updates: [{ name: "actions/checkout", from: "7.0.1", to: "7.0.2" }],
  };
  input.files = [".github/workflows/ci.yml"];
  input.allowedPackages = ["actions/checkout"];
  expect(planDependencyUpdate(input).action).toBe("merge");
  input.metadata.updates[0].to = "8.0.0";
  expect(planDependencyUpdate(input)).toEqual({
    action: "owner-review",
    reason: "version-policy",
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
    const endpoint = args.find((value) => value.startsWith("repos/"))!;
    const prefix = "repos/MentallyQuill/Tavernary/";
    const path = endpoint.startsWith(prefix)
      ? endpoint.slice(prefix.length)
      : endpoint;
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

  // Green CI must survive controller bookkeeping without admitting substantive
  // or non-regular changes. Use real Git ancestry, paths and modes for the proof.
  const receiptRoot = await mkdtemp(
    join(tmpdir(), "tavernary-dependency-base-"),
  );
  const receiptPath = `data/maintenance/automation/operations/${"1".repeat(64)}.json`;
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: receiptRoot,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Tavernary owned test fixture");
    git("config", "user.email", "fixture@example.invalid");
    await mkdir(join(receiptRoot, "data/maintenance/automation/operations"), {
      recursive: true,
    });
    await writeFile(join(receiptRoot, receiptPath), '{"stage":"confirmed"}\n');
    git("add", ".");
    git("commit", "--quiet", "-m", "Owned receipt baseline");
    const base = git("rev-parse", "HEAD");
    values[`git/commits/${base}`] = {
      sha: base,
      tree: { sha: "c".repeat(40) },
    };
    values["pulls/42/update-branch"] = { message: "Updating branch" };
    await writeFile(join(receiptRoot, receiptPath), '{"stage":"finalized"}\n');
    for (const scenario of [
      { path: receiptPath, mode: "100644", expected: "merged" },
      {
        path: "data/maintenance/automation/github-backoff.json",
        mode: "100644",
        expected: "merged",
      },
      {
        path: "data/maintenance/automation/other-backoff.json",
        mode: "100644",
        expected: "updated",
      },
      { path: "tests/changed.test.ts", mode: "100644", expected: "updated" },
      { path: "scripts/changed.mjs", mode: "100644", expected: "updated" },
      { path: receiptPath, mode: "100755", expected: "updated" },
      { path: receiptPath, mode: "120000", expected: "updated" },
      {
        path: receiptPath,
        mode: "100644",
        missingHistory: true,
        expected: "updated",
      },
      {
        path: receiptPath,
        mode: "100644",
        mainMoved: true,
        expected: "waiting",
      },
    ]) {
      git("read-tree", base);
      const blob = git("hash-object", "-w", join(receiptRoot, receiptPath));
      git(
        "update-index",
        "--add",
        "--cacheinfo",
        scenario.mode,
        blob,
        scenario.path,
      );
      const tree = git("write-tree");
      const main = git(
        "commit-tree",
        tree,
        "-p",
        base,
        "-m",
        "Owned base drift",
      );
      values["git/ref/heads/main"] = {
        ref: "refs/heads/main",
        object: { sha: main },
      };
      const comparedBase = scenario.missingHistory ? "f".repeat(40) : base;
      values[`git/commits/${comparedBase}`] = {
        sha: comparedBase,
        tree: { sha: "c".repeat(40) },
      };
      values[`compare/${main}...${"b".repeat(40)}`] = {
        merge_base_commit: { sha: comparedBase },
      };
      calls.length = 0;
      let mainReads = 0;
      const driftResult = await runDependencyWriter({
        root: receiptRoot,
        pullNumbers: [42],
        env: {
          GITHUB_REF: "refs/heads/main",
          GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF:
            "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
        },
        gh: async (args, body) => {
          const response = await gh(args, body);
          if (
            args.some((arg) => arg.endsWith("git/ref/heads/main")) &&
            scenario.mainMoved &&
            mainReads++ > 0
          )
            return JSON.stringify({
              ref: "refs/heads/main",
              object: { sha: "a".repeat(40) },
            });
          return response;
        },
        loadDeployment: async () => true,
      });
      expect(driftResult.status, `${scenario.path} ${scenario.mode}`).toBe(
        scenario.expected,
      );
      const effects = calls.filter((call) => call.args.includes("PUT"));
      if (scenario.expected === "waiting") {
        expect(driftResult.reason).toBe("input-superseded");
        expect(effects).toHaveLength(0);
        continue;
      }
      expect(effects).toHaveLength(1);
      expect(effects[0].args).toContain(
        `repos/MentallyQuill/Tavernary/pulls/42/${scenario.expected === "merged" ? "merge" : "update-branch"}`,
      );
      expect(JSON.parse(effects[0].body!)).toMatchObject(
        scenario.expected === "merged"
          ? { sha: "b".repeat(40) }
          : { expected_head_sha: "b".repeat(40) },
      );
    }
  } finally {
    if (!receiptRoot.startsWith(join(tmpdir(), "tavernary-dependency-base-")))
      throw new Error("Owned fixture cleanup path is invalid.");
    await rm(receiptRoot, { recursive: true, force: true });
    values["git/ref/heads/main"] = {
      ref: "refs/heads/main",
      object: { sha: "a".repeat(40) },
    };
  }

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

  calls.length = 0;
  const workflowPath = ".github/workflows/automation-writer.yml";
  const action = "actions/create-github-app-token";
  const oldPin = "bcd2ba49218906704ab6c1aa796996da409d3eb1";
  const newPin = "1".repeat(40);
  const beforeWorkflow = (await readFile(workflowPath, "utf8")).replace(
    /actions\/create-github-app-token@[a-f0-9]{40}(?: #[^\n]*)?/u,
    `${action}@${oldPin} # v3.2.0`,
  );
  const afterWorkflow = beforeWorkflow.replace(
    `${action}@${oldPin} # v3.2.0`,
    `${action}@${newPin} # v3.2.1`,
  );
  values["pulls/42/files?per_page=100"] = [
    { filename: workflowPath, status: "modified" },
  ];
  const setBlob = (path: string, blobSha: string, text: string) => {
    const bytes = Buffer.from(text);
    values[`${path}git/blobs/${blobSha}`] = {
      sha: blobSha,
      size: bytes.length,
      encoding: "base64",
      content: bytes.toString("base64"),
    };
  };
  for (const [root, folder, workflows, blob, text] of [
    [
      "c".repeat(40),
      "ab".repeat(20),
      "ac".repeat(20),
      "ad".repeat(20),
      beforeWorkflow,
    ],
    [
      "d".repeat(40),
      "ae".repeat(20),
      "af".repeat(20),
      "ba".repeat(20),
      afterWorkflow,
    ],
  ]) {
    values[`git/trees/${root}`] = {
      sha: root,
      tree: [{ path: ".github", mode: "040000", type: "tree", sha: folder }],
    };
    values[`git/trees/${folder}`] = {
      sha: folder,
      tree: [
        { path: "workflows", mode: "040000", type: "tree", sha: workflows },
      ],
    };
    values[`git/trees/${workflows}`] = {
      sha: workflows,
      tree: [
        {
          path: "automation-writer.yml",
          mode: "100644",
          type: "blob",
          sha: blob,
        },
      ],
    };
    setBlob("", blob, text);
  }
  const actionPrefix = `repos/${action}/`;
  for (const [pin, version, tree, blob] of [
    [oldPin, "3.2.0", "bc".repeat(20), "bd".repeat(20)],
    [newPin, "3.2.1", "be".repeat(20), "bf".repeat(20)],
  ]) {
    values[`${actionPrefix}git/commits/${pin}`] = {
      sha: pin,
      tree: { sha: tree },
    };
    values[`${actionPrefix}git/trees/${tree}`] = {
      sha: tree,
      tree: [{ path: "package.json", mode: "100644", type: "blob", sha: blob }],
    };
    setBlob(actionPrefix, blob, JSON.stringify({ version }));
    values[`${actionPrefix}git/ref/tags/v${version}`] = {
      ref: `refs/tags/v${version}`,
      object: { type: "commit", sha: pin },
    };
  }
  const actionOptions = {
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
  };
  const actionResult = await runDependencyWriter(actionOptions);
  expect(actionResult.status).toBe("merged");
  expect(calls.filter((call) => call.args.includes("PUT"))).toHaveLength(1);
  expect(
    calls.some((call) =>
      call.args.includes(`${actionPrefix}git/ref/tags/v3.2.1`),
    ),
  ).toBe(true);

  calls.length = 0;
  setBlob(
    "",
    "ba".repeat(20),
    afterWorkflow.replace("contents: read", "contents: write"),
  );
  await runDependencyWriter(actionOptions);
  expect(calls.some((call) => call.args.includes("PUT"))).toBe(false);
}, 15000);

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
