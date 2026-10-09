import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RUNTIME_PROPOSAL_PATHS,
  inspectRuntimeProposal,
  runtimeDocumentation,
  validateSupportedRuntimes,
  planRuntimeTransition,
} from "./runtime-policy.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { synchronizeWriterCheckout } from "./writer-runtime.mjs";
import { loadVerifiedDependencyChecks } from "./dependency-update.mjs";
import {
  readAuthoritativeActiveDeployment,
  readLatestPublishableRevision,
} from "./deployment-gate.mjs";
import { createHash } from "node:crypto";

const sha = /^[a-f0-9]{40}$/u;

export async function loadOfficialNodeSchedule({ gh = executeGh } = {}) {
  const text = await gh([
    "api",
    "repos/nodejs/Release/contents/schedule.json",
    "-H",
    "Accept: application/vnd.github.raw+json",
  ]);
  if (Buffer.byteLength(text) > 1_048_576)
    throw new Error("Official runtime schedule exceeds its bound.");
  return JSON.parse(text);
}

export async function readRuntimeFiles(root) {
  return Object.fromEntries(
    await Promise.all(
      RUNTIME_PROPOSAL_PATHS.map(async (path) => {
        const text = await readFile(resolve(root, path), "utf8");
        if (Buffer.byteLength(text) > 8_388_608)
          throw new Error("Runtime file exceeds its bound.");
        return [path, text];
      }),
    ),
  );
}

export async function buildRuntimeProposal({
  root,
  before,
  candidateMajor,
  run = (command, args, options) =>
    process.platform === "win32"
      ? promisify(execFile)(
          "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            "npm install --package-lock-only --ignore-scripts --no-audit --no-fund",
          ],
          options,
        )
      : promisify(execFile)(command, args, options),
}) {
  const policy = validateSupportedRuntimes(
    JSON.parse(before["config/supported-runtimes.json"]),
  );
  validateSupportedRuntimes({ ...policy, productionMajor: candidateMajor });
  if (candidateMajor <= policy.productionMajor)
    throw new Error("Runtime candidate is invalid.");
  const manifest = JSON.parse(before["package.json"]);
  manifest.engines = { node: `>=${candidateMajor} <${candidateMajor + 1}` };
  manifest.devDependencies["@types/node"] = `^${candidateMajor}.0.0`;
  try {
    await writeFile(
      resolve(root, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await run(
      "npm",
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      {
        cwd: root,
        timeout: 180_000,
        maxBuffer: 1_048_576,
        windowsHide: true,
      },
    );
    const after = {
      ".node-version": `${candidateMajor}\n`,
      "config/supported-runtimes.json": `${JSON.stringify({ ...policy, productionMajor: candidateMajor }, null, 2)}\n`,
      "docs/maintenance/supported-runtime.md":
        runtimeDocumentation(candidateMajor),
      "package.json": `${JSON.stringify(manifest, null, 2)}\n`,
      "package-lock.json": await readFile(
        resolve(root, "package-lock.json"),
        "utf8",
      ),
    };
    inspectRuntimeProposal({ before, after, candidateMajor });
    return after;
  } finally {
    await writeFile(resolve(root, "package.json"), before["package.json"]);
    await writeFile(
      resolve(root, "package-lock.json"),
      before["package-lock.json"],
    );
  }
}

export async function runRuntimeWriter({
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  availableSlots = 1,
  loadRuntime,
  buildProposal = buildRuntimeProposal,
  loadDeployment = async ({ revision }) => {
    const active = readAuthoritativeActiveDeployment({ root, revision });
    return (
      active?.mode === "ordinary" &&
      active.deployment.sourceSha ===
        readLatestPublishableRevision({ root, revision })
    );
  },
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID);
  assertCanonicalWriterContext(env, repository);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20 ||
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1
  )
    throw new Error("Runtime writer allowance or custody is invalid.");
  const api = async (path, method, body) => {
    const text = await gh(
      [
        "api",
        `repos/${repository}/${path}`,
        ...(method ? ["--method", method] : []),
        ...(body === undefined ? [] : ["--input", "-"]),
      ],
      body === undefined ? undefined : JSON.stringify(body),
    );
    if (Buffer.byteLength(text) > 12_582_912)
      throw new Error("Runtime response exceeds its bound.");
    return text.trim() ? JSON.parse(text) : null;
  };
  const currentMain = async () => {
    const ref = await api("git/ref/heads/main");
    if (ref.ref !== "refs/heads/main" || !sha.test(ref.object?.sha ?? ""))
      throw new Error("Runtime main reference is invalid.");
    return ref.object.sha;
  };
  const observation = await (
    loadRuntime ??
    (async () => {
      const revision = await currentMain();
      await synchronizeWriterCheckout({ root, env });
      if (
        execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        }).trim() !== revision
      )
        throw new Error("Runtime main advanced.");
      const history = await api(
        "actions/workflows/check-runtime.yml/runs?branch=main&status=completed&per_page=1",
      );
      if (
        !Array.isArray(history.workflow_runs) ||
        history.workflow_runs.length > 1
      )
        throw new Error("Runtime compatibility inventory is invalid.");
      const probe = history.workflow_runs[0];
      if (
        probe &&
        (!Number.isSafeInteger(probe.id) ||
          probe.id < 1 ||
          probe.path !== ".github/workflows/check-runtime.yml" ||
          probe.head_branch !== "main" ||
          !sha.test(probe.head_sha ?? "") ||
          probe.head_repository?.full_name !== repository ||
          probe.head_repository.id !== 1309605115 ||
          probe.status !== "completed" ||
          !["schedule", "workflow_dispatch"].includes(probe.event))
      )
        throw new Error("Runtime compatibility custody is invalid.");
      return {
        before: await readRuntimeFiles(root),
        revision,
        officialSchedule: await loadOfficialNodeSchedule({ gh }),
        nowMs: Date.now(),
        compatibilityFailed: Boolean(
          probe && !["success", "skipped"].includes(probe.conclusion),
        ),
      };
    })
  )();
  const supported = validateSupportedRuntimes(
    JSON.parse(observation.before["config/supported-runtimes.json"]),
  );
  const input = {
    supported,
    officialSchedule: observation.officialSchedule,
    candidateResults: [],
    nowMs: observation.nowMs,
  };
  let decision = planRuntimeTransition(input);
  if (observation.compatibilityFailed && decision.action !== "incident")
    decision = { ...decision, reason: "runtime-verification-failed" };
  if (!sha.test(observation.revision))
    throw new Error("Runtime observed revision is invalid.");
  if (!decision.candidateMajor)
    return {
      status: observation.compatibilityFailed ? "waiting" : "idle",
      reason:
        observation.compatibilityFailed && decision.action !== "incident"
          ? "runtime-verification-failed"
          : decision.reason,
      decision,
    };
  if (!availableSlots)
    return { status: "waiting", reason: "operation-limit", decision };
  const major = decision.candidateMajor,
    branch = `automation/runtime-node-${major}`;
  const marker = `<!-- tavernary-runtime:v1:${major} -->`;
  const owner = repository.split("/")[0];
  const readFiles = async (ref) =>
    Object.fromEntries(
      await Promise.all(
        RUNTIME_PROPOSAL_PATHS.map(async (path) => {
          let blob = await api(`contents/${path}?ref=${ref}`);
          if (
            blob.type !== "file" ||
            blob.path !== path ||
            !sha.test(blob.sha ?? "") ||
            !Number.isSafeInteger(blob.size) ||
            blob.size < 1 ||
            blob.size > 8_388_608
          )
            throw new Error("Runtime file custody is invalid.");
          const expected = blob.sha;
          if (!blob.content) blob = await api(`git/blobs/${expected}`);
          if (
            blob.encoding !== "base64" ||
            typeof blob.content !== "string" ||
            blob.sha !== expected
          )
            throw new Error("Runtime file encoding is invalid.");
          const bytes = Buffer.from(blob.content, "base64");
          if (
            bytes.length !== blob.size ||
            createHash("sha1")
              .update(`blob ${bytes.length}\0`)
              .update(bytes)
              .digest("hex") !== expected
          )
            throw new Error("Runtime file integrity is invalid.");
          return [path, bytes.toString("utf8")];
        }),
      ),
    );
  const pulls = await api(
    `pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=10`,
  );
  if (!Array.isArray(pulls) || pulls.length > 1)
    throw new Error("Runtime pull inventory is ambiguous.");
  if (!pulls.length) {
    const revision = observation.revision;
    if (!(await loadDeployment({ revision })))
      return { status: "waiting", reason: "deployment-unconfirmed", decision };
    let ref;
    try {
      ref = await api(`git/ref/heads/${branch}`);
    } catch (error) {
      if (githubFailureStatus(error) !== 404) throw error;
    }
    let head;
    if (ref) {
      head = ref.object?.sha;
      if (ref.ref !== `refs/heads/${branch}` || !sha.test(head ?? ""))
        throw new Error("Runtime proposal reference is invalid.");
      const comparison = await api(`compare/${revision}...${head}`);
      const base = comparison.merge_base_commit?.sha;
      if (
        !sha.test(base ?? "") ||
        !Array.isArray(comparison.files) ||
        comparison.files.length !== RUNTIME_PROPOSAL_PATHS.length ||
        comparison.files.some(
          (file) =>
            !RUNTIME_PROPOSAL_PATHS.includes(file.filename) ||
            file.status !== "modified" ||
            file.previous_filename,
        ) ||
        new Set(comparison.files.map((file) => file.filename)).size !==
          comparison.files.length
      )
        throw new Error("Runtime proposal branch policy changed.");
      const commit = await api(`commits/${head}`);
      if (
        commit.sha !== head ||
        commit.committer?.id !== publisherActorId ||
        commit.committer.type !== "Bot"
      )
        throw new Error("Runtime proposal branch custody changed.");
      inspectRuntimeProposal({
        before: base === revision ? observation.before : await readFiles(base),
        after: await readFiles(head),
        candidateMajor: major,
      });
    } else {
      const after = await buildProposal({
        root,
        before: observation.before,
        candidateMajor: major,
      });
      inspectRuntimeProposal({
        before: observation.before,
        after,
        candidateMajor: major,
      });
      if ((await currentMain()) !== revision)
        return { status: "waiting", reason: "input-superseded", decision };
      const parent = await api(`git/commits/${revision}`);
      if (parent.sha !== revision || !sha.test(parent.tree?.sha ?? ""))
        throw new Error("Runtime proposal parent is invalid.");
      const tree = [];
      for (const [path, content] of Object.entries(after)) {
        const blob = await api("git/blobs", "POST", {
          encoding: "base64",
          content: Buffer.from(content).toString("base64"),
        });
        if (!sha.test(blob.sha ?? ""))
          throw new Error("Runtime proposal blob is invalid.");
        tree.push({ path, type: "blob", mode: "100644", sha: blob.sha });
      }
      const createdTree = await api("git/trees", "POST", {
        base_tree: parent.tree.sha,
        tree,
      });
      if (!sha.test(createdTree.sha ?? ""))
        throw new Error("Runtime proposal tree is invalid.");
      const commit = await api("git/commits", "POST", {
        message: `chore(runtime): verify Node ${major} LTS`,
        tree: createdTree.sha,
        parents: [revision],
      });
      if (!sha.test(commit.sha ?? ""))
        throw new Error("Runtime proposal commit is invalid.");
      head = commit.sha;
      const created = await api("git/refs", "POST", {
        ref: `refs/heads/${branch}`,
        sha: head,
      });
      if (
        created.ref !== `refs/heads/${branch}` ||
        created.object?.sha !== head
      )
        throw new Error("Runtime proposal branch is unconfirmed.");
    }
    if ((await currentMain()) !== revision)
      return { status: "waiting", reason: "input-superseded", decision };
    const created = await api("pulls", "POST", {
      title: `Adopt supported Node ${major} LTS`,
      head: branch,
      base: "main",
      body: `Update the declared runtime, engines, Node declarations and runtime documentation together. This PR requires full candidate CI and full checks on the current runtime before the serialized writer can merge it. Failed checks preserve the working release.\n\n${marker}`,
    });
    if (
      !Number.isSafeInteger(created.number) ||
      created.number < 1 ||
      created.head?.sha !== head ||
      created.head.ref !== branch
    )
      throw new Error("Runtime proposal PR is unconfirmed.");
    return {
      status: "proposed",
      reason: "runtime-verification-pending",
      pullNumber: created.number,
      decision,
    };
  }
  const pull = await api(`pulls/${pulls[0].number}`);
  const owned = (value) =>
    value &&
    Number.isSafeInteger(value.number) &&
    value.number > 0 &&
    value.user?.id === publisherActorId &&
    value.user.type === "Bot" &&
    value.head?.ref === branch &&
    value.head.repo?.full_name === repository &&
    value.head.repo.id === 1309605115 &&
    value.base?.ref === "main" &&
    value.base.repo?.full_name === repository &&
    value.base.repo.id === 1309605115 &&
    sha.test(value.head.sha ?? "") &&
    value.body?.includes(marker);
  if (!owned(pull))
    return {
      status: "owner-review",
      reason: "runtime-custody-changed",
      decision,
    };
  if (pull.state !== "open" || pull.draft)
    return {
      status: "owner-review",
      reason: "runtime-owner-decision",
      decision,
    };
  const head = pull.head.sha,
    revision = observation.revision;
  const files = await api(`pulls/${pull.number}/files?per_page=100`);
  if (
    !Array.isArray(files) ||
    files.length !== RUNTIME_PROPOSAL_PATHS.length ||
    pull.changed_files !== files.length ||
    files.some(
      (file) =>
        !RUNTIME_PROPOSAL_PATHS.includes(file.filename) ||
        file.status !== "modified" ||
        file.previous_filename,
    ) ||
    new Set(files.map((file) => file.filename)).size !== files.length
  )
    return {
      status: "owner-review",
      reason: "runtime-policy-changed",
      decision,
    };
  const comparison = await api(`compare/${revision}...${head}`);
  const mergeBase = comparison.merge_base_commit?.sha;
  if (!sha.test(mergeBase ?? ""))
    throw new Error("Runtime merge base is invalid.");
  inspectRuntimeProposal({
    before: await readFiles(mergeBase),
    after: await readFiles(head),
    candidateMajor: major,
  });
  const commit = await api(`commits/${head}`);
  if (
    commit.sha !== head ||
    commit.committer?.id !== publisherActorId ||
    commit.committer.type !== "Bot"
  )
    return {
      status: "owner-review",
      reason: "runtime-custody-changed",
      decision,
    };
  if (!(await loadDeployment({ revision })))
    return { status: "waiting", reason: "deployment-unconfirmed", decision };
  const fresh = await api(`pulls/${pull.number}`);
  if (
    !owned(fresh) ||
    fresh.state !== "open" ||
    fresh.draft ||
    fresh.head.sha !== head ||
    (await currentMain()) !== revision
  )
    return { status: "waiting", reason: "input-superseded", decision };
  if (mergeBase !== revision) {
    await api(`pulls/${pull.number}/update-branch`, "PUT", {
      expected_head_sha: head,
    });
    return {
      status: "updated",
      reason: "runtime-verification-pending",
      pullNumber: pull.number,
      decision,
    };
  }
  const checks = await loadVerifiedDependencyChecks({
    headSha: head,
    repository,
    request: api,
  });
  const passed = (name) =>
    checks.some(
      (check) =>
        check.name === name &&
        check.sha === head &&
        check.appId === 15368 &&
        check.workflow === ".github/workflows/ci.yml" &&
        check.conclusion === "success",
    );
  decision = planRuntimeTransition({
    ...input,
    candidateResults: [
      {
        major,
        baseSha: revision,
        headSha: head,
        currentVerified:
          passed("runtime-current-linux") && passed("runtime-current-windows"),
        candidateVerified: passed("verify") && passed("visual"),
        coupledDiffVerified: true,
      },
    ],
  });
  if (
    observation.compatibilityFailed &&
    !["incident", "transition"].includes(decision.action)
  )
    decision = { ...decision, reason: "runtime-verification-failed" };
  if (decision.action !== "transition")
    return {
      status: "waiting",
      reason: checks.some(
        (check) =>
          check.sha === head &&
          check.appId === 15368 &&
          check.conclusion === "failure",
      )
        ? "runtime-verification-failed"
        : "runtime-verification-pending",
      pullNumber: pull.number,
      decision,
    };
  const final = await api(`pulls/${pull.number}`);
  if (
    !owned(final) ||
    final.state !== "open" ||
    final.draft ||
    final.head.sha !== head ||
    (await currentMain()) !== revision
  )
    return { status: "waiting", reason: "input-superseded", decision };
  const merged = await api(`pulls/${pull.number}/merge`, "PUT", {
    sha: head,
    merge_method: "squash",
    commit_title: `chore(runtime): adopt verified Node ${major} LTS`,
  });
  if (merged?.merged !== true || !sha.test(merged.sha ?? ""))
    throw new Error("Runtime merge is unconfirmed.");
  return {
    status: "merged",
    pullNumber: pull.number,
    sha: merged.sha,
    reason: decision.reason,
    decision,
  };
}
