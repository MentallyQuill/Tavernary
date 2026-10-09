import { expect, test } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  buildRuntimeProposal,
  runRuntimeWriter,
} from "../../scripts/automation/runtime-maintenance.mjs";
import {
  planRuntimeTransition,
  validateOfficialNodeSchedule,
  inspectRuntimeProposal,
  runtimeDocumentation,
} from "../../scripts/automation/runtime-policy.mjs";

const supported: Parameters<typeof planRuntimeTransition>[0]["supported"] = {
  schemaVersion: 1 as const,
  productionMajor: 24,
  warningDays: 90,
};
const officialSchedule = {
  v24: {
    start: "2025-05-06",
    lts: "2025-10-28",
    maintenance: "2026-10-20",
    end: "2028-04-30",
    codename: "Krypton",
  },
  v26: {
    start: "2026-05-05",
    lts: "2026-10-28",
    maintenance: "2027-10-20",
    end: "2029-04-30",
    codename: "",
  },
};

test("failed scheduled compatibility stays visible even when the current major is supported", async () => {
  const { before } = proposalFixture();
  const repository = "MentallyQuill/Tavernary";
  const result = await runRuntimeWriter({
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: "123",
    },
    loadRuntime: async () => ({
      before,
      revision: "a".repeat(40),
      officialSchedule,
      nowMs: Date.parse("2026-10-08T00:00:00Z"),
      compatibilityFailed: true,
    }),
    gh: async () => {
      throw new Error("No mutation permitted");
    },
  });
  expect(result).toMatchObject({
    status: "waiting",
    reason: "runtime-verification-failed",
  });
});

test("an expired production runtime remains unhealthy without complete successor proof", () => {
  const result = planRuntimeTransition({
    supported,
    officialSchedule,
    candidateResults: [],
    nowMs: Date.parse("2028-05-01T00:00:00Z"),
  });
  expect(result).toMatchObject({
    action: "incident",
    healthy: false,
    reason: "runtime-eol",
    candidateMajor: 26,
  });
});

test("the real official schedule format admits historical v0 releases and rejects impossible dates", () => {
  expect(
    validateOfficialNodeSchedule({
      "v0.12": { start: "2015-02-06", end: "2016-12-31" },
      ...officialSchedule,
    }),
  ).toHaveLength(3);
  expect(() =>
    validateOfficialNodeSchedule({
      v24: { ...officialSchedule.v24, lts: "2025-02-30" },
    }),
  ).toThrow(/date/);
});

test("only a stable LTS with complete current, candidate and coupled-diff checks can transition", () => {
  const input = {
    supported,
    officialSchedule,
    candidateResults: [],
    nowMs: Date.parse("2026-10-08T00:00:00Z"),
  };
  expect(planRuntimeTransition(input)).toMatchObject({
    action: "keep",
    healthy: true,
  });
  expect(planRuntimeTransition(input).candidateMajor).toBeUndefined();
  const ready = { ...input, nowMs: Date.parse("2026-10-29T00:00:00Z") };
  expect(planRuntimeTransition(ready)).toMatchObject({
    action: "verify",
    candidateMajor: 26,
  });
  const proof = {
    major: 26,
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    currentVerified: true,
    candidateVerified: true,
    coupledDiffVerified: true,
  };
  expect(
    planRuntimeTransition({ ...ready, candidateResults: [proof] }),
  ).toMatchObject({ action: "transition", candidateMajor: 26 });
  expect(
    planRuntimeTransition({
      ...ready,
      candidateResults: [{ ...proof, currentVerified: false }],
    }).action,
  ).toBe("verify");
  expect(
    planRuntimeTransition({
      ...ready,
      candidateResults: [{ ...proof, coupledDiffVerified: false }],
    }).action,
  ).toBe("verify");
  const warning = { ...ready, nowMs: Date.parse("2028-02-01T00:00:00Z") };
  expect(planRuntimeTransition(warning)).toMatchObject({
    action: "incident",
    reason: "runtime-eol-soon",
    healthy: true,
  });
});

function proposalFixture(): {
  before: Record<string, string>;
  after: Record<string, string>;
} {
  const packageJson = {
    name: "test",
    engines: { node: ">=24 <25" },
    scripts: { check: "safe" },
    devDependencies: { "@types/node": "^24.0.0" },
  };
  const nodeTypes = (major: number) => ({
    version: `${major}.1.0`,
    resolved: `https://registry.npmjs.org/@types/node/-/node-${major}.1.0.tgz`,
    integrity: "sha512-YWJjZA==",
    dev: true,
  });
  const lock = {
    name: "test",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "test",
        engines: packageJson.engines,
        devDependencies: packageJson.devDependencies,
      },
      "node_modules/@types/node": nodeTypes(24),
    },
  };
  const afterPackage = {
    ...packageJson,
    engines: { node: ">=26 <27" },
    devDependencies: { "@types/node": "^26.0.0" },
  };
  const before = {
    ".node-version": "24\n",
    "config/supported-runtimes.json": JSON.stringify(supported),
    "docs/maintenance/supported-runtime.md": runtimeDocumentation(24),
    "package.json": JSON.stringify(packageJson),
    "package-lock.json": JSON.stringify(lock),
  };
  const after = {
    ".node-version": "26\n",
    "config/supported-runtimes.json": JSON.stringify({
      ...supported,
      productionMajor: 26,
    }),
    "docs/maintenance/supported-runtime.md": runtimeDocumentation(26),
    "package.json": JSON.stringify(afterPackage),
    "package-lock.json": JSON.stringify({
      ...lock,
      packages: {
        "": {
          ...lock.packages[""],
          engines: afterPackage.engines,
          devDependencies: afterPackage.devDependencies,
        },
        "node_modules/@types/node": nodeTypes(26),
      },
    }),
  };
  return { before, after };
}

test("the coupled runtime diff rejects workflow permissions, other dependency changes and unaligned types", () => {
  const fixture = proposalFixture();
  expect(inspectRuntimeProposal({ ...fixture, candidateMajor: 26 })).toEqual({
    currentMajor: 24,
    candidateMajor: 26,
  });
  expect(() =>
    inspectRuntimeProposal({
      ...fixture,
      after: {
        ...fixture.after,
        ".github/workflows/ci.yml": "permissions: write-all",
      },
      candidateMajor: 26,
    }),
  ).toThrow(/paths/);
  const afterPackage = JSON.parse(fixture.after["package.json"]);
  expect(() =>
    inspectRuntimeProposal({
      ...fixture,
      after: {
        ...fixture.after,
        "package.json": JSON.stringify({
          ...afterPackage,
          scripts: { check: "unsafe" },
        }),
      },
      candidateMajor: 26,
    }),
  ).toThrow(/policy/);
  const afterLock = JSON.parse(fixture.after["package-lock.json"]);
  afterLock.packages["node_modules/@types/node"].version = "27.1.0";
  expect(() =>
    inspectRuntimeProposal({
      ...fixture,
      after: {
        ...fixture.after,
        "package-lock.json": JSON.stringify(afterLock),
      },
      candidateMajor: 26,
    }),
  ).toThrow(/types/);
});

test("proposal preparation runs npm without scripts and restores the trusted writer checkout", async () => {
  const { before, after } = proposalFixture();
  const root = await mkdtemp(join(tmpdir(), "runtime-proposal-test-"));
  try {
    for (const path of ["package.json", "package-lock.json"])
      await writeFile(join(root, path), before[path]);
    let commands = 0;
    const result = await buildRuntimeProposal({
      root,
      before,
      candidateMajor: 26,
      run: async (command, args, options) => {
        commands++;
        expect(command).toMatch(/^npm(?:\.cmd)?$/);
        expect(args).toContain("--ignore-scripts");
        expect(args).toContain("--package-lock-only");
        expect(options.timeout).toBeLessThanOrEqual(180_000);
        const changed = JSON.parse(
          await readFile(join(root, "package.json"), "utf8"),
        );
        expect(changed.engines).toEqual({ node: ">=26 <27" });
        await writeFile(
          join(root, "package-lock.json"),
          after["package-lock.json"],
        );
      },
    });
    expect(commands).toBe(1);
    expect(
      inspectRuntimeProposal({ before, after: result, candidateMajor: 26 }),
    ).toEqual({ currentMajor: 24, candidateMajor: 26 });
    for (const path of ["package.json", "package-lock.json"])
      expect(await readFile(join(root, path), "utf8")).toBe(before[path]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the native runtime writer requires full current and candidate CI for the exact constrained PR head", async () => {
  const { before, after } = proposalFixture();
  const base = "a".repeat(40),
    head = "b".repeat(40),
    branch = "automation/runtime-node-26";
  const repository = "MentallyQuill/Tavernary";
  const repo = { id: 1309605115, full_name: repository };
  const pull = {
    number: 55,
    state: "open",
    draft: false,
    user: { id: 123, type: "Bot" },
    body: "<!-- tavernary-runtime:v1:26 -->",
    changed_files: 5,
    head: { sha: head, ref: branch, repo },
    base: { ref: "main", repo },
  };
  const values: Record<string, unknown> = {
    "git/ref/heads/main": { ref: "refs/heads/main", object: { sha: base } },
    [`pulls?state=all&head=MentallyQuill%3Aautomation%2Fruntime-node-26&per_page=10`]:
      [pull],
    "pulls/55": pull,
    "pulls/55/files?per_page=100": Object.keys(after).map((filename) => ({
      filename,
      status: "modified",
    })),
    [`compare/${base}...${head}`]: { merge_base_commit: { sha: base } },
    [`commits/${head}`]: { sha: head, committer: { id: 123, type: "Bot" } },
    [`actions/runs/123`]: {
      id: 123,
      path: ".github/workflows/ci.yml",
      event: "workflow_dispatch",
      head_sha: head,
      head_branch: branch,
      head_repository: repo,
      status: "completed",
      conclusion: "success",
    },
    "pulls/55/merge": { merged: true, sha: "c".repeat(40) },
  };
  const checks = (names: string[]) => ({
    total_count: names.length,
    check_runs: names.map((name) => ({
      name,
      head_sha: head,
      conclusion: "success",
      app: { id: 15368 },
      details_url: `https://github.com/${repository}/actions/runs/123/job/456`,
    })),
  });
  values[`commits/${head}/check-runs?filter=latest&per_page=100`] = checks([
    "verify",
    "visual",
  ]);
  for (const [revision, files] of [
    [base, before],
    [head, after],
  ] as const)
    for (const [path, text] of Object.entries(files)) {
      const bytes = Buffer.from(text);
      values[`contents/${path}?ref=${revision}`] = {
        type: "file",
        path,
        encoding: "base64",
        size: bytes.length,
        sha: createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex"),
        content: bytes.toString("base64"),
      };
    }
  const mutations: string[] = [];
  const options = {
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: "123",
    },
    gh: async (args: string[]) => {
      const path = args
        .find((value) => value.startsWith(`repos/${repository}/`))!
        .slice(`repos/${repository}/`.length);
      if (
        args.includes("PUT") ||
        args.includes("POST") ||
        args.includes("PATCH")
      )
        mutations.push(path);
      if (!(path in values)) throw new Error(`Unexpected endpoint ${path}`);
      return JSON.stringify(values[path]);
    },
    loadRuntime: async () => ({
      before,
      revision: base,
      officialSchedule,
      nowMs: Date.parse("2026-10-29T00:00:00Z"),
    }),
    loadDeployment: async () => true,
  };
  expect(await runRuntimeWriter(options)).toMatchObject({
    status: "waiting",
    reason: "runtime-verification-pending",
  });
  expect(mutations).toEqual([]);
  values[`commits/${head}/check-runs?filter=latest&per_page=100`] = checks([
    "verify",
    "visual",
    "runtime-current-linux",
    "runtime-current-windows",
  ]);
  expect(await runRuntimeWriter(options)).toMatchObject({
    status: "merged",
    pullNumber: 55,
    sha: "c".repeat(40),
  });
  expect(mutations).toEqual(["pulls/55/merge"]);
  mutations.length = 0;
  (values["actions/runs/123"] as { head_sha: string }).head_sha = base;
  expect((await runRuntimeWriter(options)).status).toBe("waiting");
  expect(mutations).toEqual([]);
});

test("a lost runtime PR handoff recovers the owned branch without generating a second commit", async () => {
  const { before, after } = proposalFixture();
  const revision = "a".repeat(40),
    head = "b".repeat(40),
    tree = "c".repeat(40),
    repository = "MentallyQuill/Tavernary",
    branch = "automation/runtime-node-26";
  let branchExists = false,
    builds = 0,
    commits = 0,
    failPull = true;
  const mutations: string[] = [];
  const gh = async (args: string[], body?: string) => {
    const path = args
      .find((value) => value.startsWith(`repos/${repository}/`))!
      .slice(`repos/${repository}/`.length);
    const method = args.includes("POST") ? "POST" : "GET";
    if (method === "POST") mutations.push(path);
    if (path === "git/ref/heads/main")
      return JSON.stringify({
        ref: "refs/heads/main",
        object: { sha: revision },
      });
    if (path.startsWith("pulls?")) return "[]";
    if (path === `git/ref/heads/${branch}`) {
      if (!branchExists)
        throw Object.assign(new Error("HTTP 404"), { status: 404 });
      return JSON.stringify({
        ref: `refs/heads/${branch}`,
        object: { sha: head },
      });
    }
    if (path === `git/commits/${revision}`)
      return JSON.stringify({ sha: revision, tree: { sha: tree } });
    if (path === "git/blobs") return JSON.stringify({ sha: "d".repeat(40) });
    if (path === "git/trees") return JSON.stringify({ sha: "e".repeat(40) });
    if (path === "git/commits") {
      commits++;
      expect(JSON.parse(body!).parents).toEqual([revision]);
      return JSON.stringify({ sha: head });
    }
    if (path === "git/refs") {
      branchExists = true;
      return JSON.stringify({
        ref: `refs/heads/${branch}`,
        object: { sha: head },
      });
    }
    if (path === `compare/${revision}...${head}`)
      return JSON.stringify({
        status: "ahead",
        merge_base_commit: { sha: revision },
        files: Object.keys(after).map((filename) => ({
          filename,
          status: "modified",
        })),
      });
    if (path === `commits/${head}`)
      return JSON.stringify({ sha: head, committer: { id: 123, type: "Bot" } });
    if (path.startsWith("contents/")) {
      const file = path.slice(9).split("?ref=")[0],
        bytes = Buffer.from(after[file]);
      return JSON.stringify({
        type: "file",
        path: file,
        encoding: "base64",
        size: bytes.length,
        sha: createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex"),
        content: bytes.toString("base64"),
      });
    }
    if (path === "pulls" && method === "POST") {
      if (failPull) throw new Error("transport response lost");
      return JSON.stringify({ number: 55, head: { sha: head, ref: branch } });
    }
    throw new Error(`Unexpected endpoint ${path}`);
  };
  const options = {
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: "123",
    },
    gh,
    loadRuntime: async () => ({
      before,
      revision,
      officialSchedule,
      nowMs: Date.parse("2026-10-29T00:00:00Z"),
    }),
    loadDeployment: async () => true,
    buildProposal: async () => {
      builds++;
      return after;
    },
  };
  await expect(runRuntimeWriter(options)).rejects.toThrow(/lost/);
  failPull = false;
  expect(await runRuntimeWriter(options)).toMatchObject({
    status: "proposed",
    pullNumber: 55,
  });
  expect(builds).toBe(1);
  expect(commits).toBe(1);
  expect(mutations.filter((path) => path === "git/refs")).toHaveLength(1);
});
