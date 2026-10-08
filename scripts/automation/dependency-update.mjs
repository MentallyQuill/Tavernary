import { isDeepStrictEqual } from "node:util";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { assertCanonicalWriterContext } from "./github-inventory.mjs";
import { synchronizeWriterCheckout } from "./writer-runtime.mjs";
import {
  readAuthoritativeActiveDeployment,
  readLatestPublishableRevision,
} from "./deployment-gate.mjs";

export const ALLOWED_NPM_DEPENDENCIES = [
  "@fontsource-variable/inter",
  "ajv",
  "minisearch",
  "next",
  "react",
  "react-dom",
  "@playwright/test",
  "@testing-library/jest-dom",
  "@testing-library/react",
  "@testing-library/user-event",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "ajv-formats",
  "color-name",
  "eslint",
  "eslint-config-next",
  "fflate",
  "jsdom",
  "prettier",
  "typescript",
];
const sha = /^[a-f0-9]{40}$/u;

function version(value) {
  if (!/^\d+\.\d+\.\d+$/u.test(value ?? "")) return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function patchOrMinor(from, to) {
  const before = version(from),
    after = version(to);
  return Boolean(
    before &&
    after &&
    before[0] === after[0] &&
    (after[1] > before[1] || (after[1] === before[1] && after[2] > before[2])),
  );
}

export function inspectNpmDependencyUpdate({
  beforePackage,
  afterPackage,
  beforeLock,
  afterLock,
}) {
  const fields = ["dependencies", "devDependencies"];
  const without = (value, keys) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !keys.includes(key)),
    );
  if (
    !isDeepStrictEqual(
      without(beforePackage, fields),
      without(afterPackage, fields),
    )
  )
    throw new Error("Dependency manifest policy changed.");
  if (
    beforeLock.lockfileVersion !== 3 ||
    afterLock.lockfileVersion !== 3 ||
    !isDeepStrictEqual(
      without(beforeLock, ["packages"]),
      without(afterLock, ["packages"]),
    )
  )
    throw new Error("Dependency lock policy changed.");
  const beforeRoot = beforeLock.packages?.[""],
    afterRoot = afterLock.packages?.[""];
  if (
    !beforeRoot ||
    !afterRoot ||
    !isDeepStrictEqual(without(beforeRoot, fields), without(afterRoot, fields))
  )
    throw new Error("Dependency lock root policy changed.");
  const names = new Set();
  for (const field of fields) {
    const before = beforePackage[field] ?? {},
      after = afterPackage[field] ?? {};
    if (
      !isDeepStrictEqual(
        Object.keys(before).sort(),
        Object.keys(after).sort(),
      ) ||
      !isDeepStrictEqual(beforeRoot[field] ?? {}, before) ||
      !isDeepStrictEqual(afterRoot[field] ?? {}, after)
    )
      throw new Error("Dependency manifest and lock disagree.");
    for (const name of Object.keys(before)) {
      if (names.has(name)) throw new Error("Dependency name is duplicated.");
      names.add(name);
      if (before[name] === after[name]) continue;
      const oldRange = /^([~^]?)(\d+\.\d+\.\d+)$/u.exec(before[name]);
      const newRange = /^([~^]?)(\d+\.\d+\.\d+)$/u.exec(after[name]);
      if (
        !oldRange ||
        !newRange ||
        oldRange[1] !== newRange[1] ||
        !patchOrMinor(oldRange[2], newRange[2])
      )
        throw new Error("Dependency range requires owner review.");
    }
  }
  const combined = {
    ...afterPackage.dependencies,
    ...afterPackage.devDependencies,
  };
  for (const pair of [
    ["next", "eslint-config-next"],
    ["react", "react-dom"],
  ]) {
    if (
      pair.some((name) => combined[name]) &&
      combined[pair[0]] !== combined[pair[1]]
    )
      throw new Error("Coupled dependency versions disagree.");
  }
  for (const [path, value] of Object.entries(afterLock.packages)) {
    if (path === "") continue;
    const old = beforeLock.packages[path];
    if (isDeepStrictEqual(old, value)) continue;
    if (
      !path.startsWith("node_modules/") ||
      /[\\\u0000-\u001f]/u.test(path) ||
      path.split("/").some((part) => !part || [".", ".."].includes(part)) ||
      value.link ||
      !/^sha512-[A-Za-z0-9+/]+=*$/u.test(value.integrity ?? "")
    )
      throw new Error("Dependency lock provenance is invalid.");
    let url;
    try {
      url = new URL(value.resolved);
    } catch {
      throw new Error("Dependency lock provenance is invalid.");
    }
    if (
      url.protocol !== "https:" ||
      url.host !== "registry.npmjs.org" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error("Dependency lock provenance is invalid.");
  }
  for (const path of Object.keys(beforeLock.packages)) {
    if (
      path &&
      !path.startsWith("node_modules/") &&
      !isDeepStrictEqual(beforeLock.packages[path], afterLock.packages[path])
    )
      throw new Error("Local dependency policy changed.");
  }
  const updates = [...names].sort().flatMap((name) => {
    const before = beforeLock.packages[`node_modules/${name}`]?.version;
    const after = afterLock.packages[`node_modules/${name}`]?.version;
    if (before === after) return [];
    if (!version(before) || !version(after))
      throw new Error("Dependency version is invalid.");
    return [{ name, from: before, to: after }];
  });
  return {
    ecosystem: "npm",
    provenance: true,
    permissionsChanged: false,
    updates,
  };
}

export function planDependencyUpdate(input) {
  if (input.metadata.permissionsChanged)
    return { action: "owner-review", reason: "expanded-policy" };
  const { pull, metadata, files, checks, currentMainSha, mergeBaseSha } = input;
  if (
    !Number.isSafeInteger(pull.number) ||
    pull.number < 1 ||
    pull.state !== "open" ||
    pull.draft ||
    pull.user.id !== 49699333 ||
    pull.user.type !== "Bot" ||
    pull.base.ref !== "main" ||
    pull.base.repo.full_name !== pull.head.repo.full_name ||
    !/^[a-f0-9]{40}$/u.test(pull.head.sha) ||
    !/^[a-f0-9]{40}$/u.test(currentMainSha) ||
    !metadata.provenance
  )
    return { action: "owner-review", reason: "untrusted-update" };
  if (
    metadata.ecosystem !== "npm" ||
    !metadata.updates.length ||
    metadata.updates.some(
      (update) => !input.allowedPackages.includes(update.name),
    )
  )
    return { action: "owner-review", reason: "unsupported-update" };
  if (metadata.updates.some((update) => !patchOrMinor(update.from, update.to)))
    return { action: "owner-review", reason: "version-policy" };
  if (
    !files.includes("package-lock.json") ||
    files.length > 2 ||
    files.some((path) => !["package.json", "package-lock.json"].includes(path))
  )
    return { action: "owner-review", reason: "expanded-policy" };
  if (!input.deploymentHealthy)
    return { action: "wait", reason: "deployment-unconfirmed" };
  if (
    !["verify", "visual"].every((name) => {
      const current = checks.filter(
        (check) =>
          check.name === name &&
          check.sha === pull.head.sha &&
          check.appId === 15368 &&
          check.workflow === ".github/workflows/ci.yml",
      );
      return current.length === 1 && current[0].conclusion === "success";
    })
  )
    return { action: "wait", reason: "checks-unconfirmed" };
  if (mergeBaseSha !== currentMainSha)
    return { action: "refresh-base", reason: "stale-base" };
  return {
    action: "merge",
    headSha: pull.head.sha,
    baseSha: currentMainSha,
    pullNumber: pull.number,
  };
}

export async function runDependencyWriter({
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  availableSlots = 1,
  pullNumbers,
  loadDeployment = async ({ revision }) => {
    await synchronizeWriterCheckout({ root, env });
    const active = readAuthoritativeActiveDeployment({ root, revision });
    return (
      active?.mode === "ordinary" &&
      active.deployment.sourceSha ===
        readLatestPublishableRevision({ root, revision })
    );
  },
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20
  )
    throw new Error("Dependency operation allowance is invalid.");
  if (availableSlots === 0)
    return { status: "waiting", reason: "operation-limit", decisions: [] };
  const api = async (path, method, body) => {
    const value = await gh(
      [
        "api",
        `repos/${repository}/${path}`,
        ...(method ? ["--method", method] : []),
        ...(body === undefined ? [] : ["--input", "-"]),
      ],
      body === undefined ? undefined : JSON.stringify(body),
    );
    if (Buffer.byteLength(value) > 2_097_152)
      throw new Error("Dependency API response exceeds its bound.");
    return value.trim() ? JSON.parse(value) : null;
  };
  const currentMain = async () => {
    const reference = await api("git/ref/heads/main");
    if (
      reference.ref !== "refs/heads/main" ||
      !sha.test(reference.object?.sha ?? "")
    )
      throw new Error("Dependency main reference is invalid.");
    return reference.object.sha;
  };
  const revision = await currentMain();
  const decisions = [];
  if (!(await loadDeployment({ revision })))
    return { status: "waiting", reason: "deployment-unconfirmed", decisions };
  if (
    pullNumbers !== undefined &&
    (!Array.isArray(pullNumbers) ||
      pullNumbers.length > 20 ||
      new Set(pullNumbers).size !== pullNumbers.length ||
      pullNumbers.some((number) => !Number.isSafeInteger(number) || number < 1))
  )
    throw new Error("Dependency selection is invalid.");
  const pulls =
    pullNumbers === undefined
      ? await api("pulls?state=open&sort=created&direction=asc&per_page=20")
      : pullNumbers.map((number) => ({
          number,
          user: { id: 49699333, type: "Bot" },
        }));
  if (!Array.isArray(pulls) || pulls.length > 20)
    throw new Error("Dependency inventory exceeds its bound.");
  const readPackages = async (revision) => {
    if (!sha.test(revision)) throw new Error("Dependency revision is invalid.");
    const commit = await api(`git/commits/${revision}`);
    if (commit.sha !== revision || !sha.test(commit.tree?.sha ?? ""))
      throw new Error("Dependency Git commit is invalid.");
    const tree = await api(`git/trees/${commit.tree.sha}`);
    if (
      tree.sha !== commit.tree.sha ||
      tree.truncated ||
      !Array.isArray(tree.tree) ||
      tree.tree.length > 1000
    )
      throw new Error("Dependency Git tree is unavailable.");
    const result = {};
    for (const path of ["package.json", "package-lock.json"]) {
      const matches = tree.tree.filter((entry) => entry.path === path);
      const entry = matches[0];
      if (
        matches.length !== 1 ||
        entry.mode !== "100644" ||
        entry.type !== "blob" ||
        !sha.test(entry.sha)
      )
        throw new Error("Dependency path is not a regular Git blob.");
      const blob = await api(`git/blobs/${entry.sha}`);
      if (
        blob.sha !== entry.sha ||
        blob.encoding !== "base64" ||
        !Number.isSafeInteger(blob.size) ||
        blob.size < 0 ||
        blob.size > 1_048_576
      )
        throw new Error("Dependency Git blob is invalid.");
      const content = Buffer.from(blob.content, "base64");
      if (content.length !== blob.size)
        throw new Error("Dependency Git blob size differs.");
      result[path] = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(content),
      );
    }
    return result;
  };
  const loadChecks = async (headSha) => {
    const result = await api(
      `commits/${headSha}/check-runs?filter=latest&per_page=100`,
    );
    if (
      !Array.isArray(result.check_runs) ||
      result.total_count > 100 ||
      result.check_runs.length > 100
    )
      throw new Error("Dependency checks exceed their bound.");
    const runs = new Map();
    const checks = [];
    for (const check of result.check_runs.filter((check) =>
      ["verify", "visual"].includes(check.name),
    )) {
      let workflow = "";
      if (check.app?.id === 15368 && check.head_sha === headSha) {
        const url = new URL(check.details_url);
        const prefix = `/${repository}/actions/runs/`;
        const id = url.pathname.startsWith(prefix)
          ? url.pathname.slice(prefix.length).split("/")[0]
          : "";
        if (
          url.protocol === "https:" &&
          url.host === "github.com" &&
          !url.username &&
          !url.password &&
          /^[1-9]\d*$/u.test(id) &&
          Number.isSafeInteger(Number(id))
        ) {
          if (!runs.has(id)) runs.set(id, await api(`actions/runs/${id}`));
          const run = runs.get(id);
          if (
            run.id === Number(id) &&
            run.path === ".github/workflows/ci.yml" &&
            ["pull_request", "workflow_dispatch"].includes(run.event) &&
            run.head_sha === headSha &&
            run.head_repository?.full_name === repository &&
            run.status === "completed" &&
            run.conclusion === "success"
          )
            workflow = run.path;
        }
      }
      checks.push({
        name: check.name,
        sha: check.head_sha,
        appId: check.app?.id,
        conclusion: check.conclusion,
        workflow,
      });
    }
    return checks;
  };
  for (const candidate of pulls) {
    if (
      candidate.user?.id !== 49699333 ||
      candidate.user?.type !== "Bot" ||
      !Number.isSafeInteger(candidate.number) ||
      candidate.number < 1
    )
      continue;
    try {
      const pull = await api(`pulls/${candidate.number}`);
      if (
        pull.state !== "open" ||
        pull.draft ||
        pull.user?.id !== 49699333 ||
        pull.user?.type !== "Bot" ||
        pull.head?.repo?.full_name !== repository ||
        pull.base?.repo?.full_name !== repository ||
        pull.base?.ref !== "main" ||
        !sha.test(pull.head?.sha ?? "")
      )
        continue;
      const files = await api(`pulls/${pull.number}/files?per_page=100`);
      if (
        !Array.isArray(files) ||
        files.length > 2 ||
        files.some(
          (file) =>
            file.status !== "modified" ||
            file.previous_filename ||
            !["package.json", "package-lock.json"].includes(file.filename),
        )
      ) {
        decisions.push({
          pullNumber: pull.number,
          action: "owner-review",
          reason: "expanded-policy",
        });
        continue;
      }
      const comparison = await api(`compare/${revision}...${pull.head.sha}`);
      const mergeBaseSha = comparison.merge_base_commit?.sha;
      const before = await readPackages(mergeBaseSha),
        after = await readPackages(pull.head.sha);
      const metadata = inspectNpmDependencyUpdate({
        beforePackage: before["package.json"],
        afterPackage: after["package.json"],
        beforeLock: before["package-lock.json"],
        afterLock: after["package-lock.json"],
      });
      const input = {
        pull,
        metadata,
        files: files.map((file) => file.filename),
        checks: await loadChecks(pull.head.sha),
        currentMainSha: revision,
        mergeBaseSha,
        allowedPackages: ALLOWED_NPM_DEPENDENCIES,
        deploymentHealthy: true,
      };
      const decision = planDependencyUpdate(input);
      decisions.push({ pullNumber: pull.number, ...decision });
      if (!["merge", "refresh-base"].includes(decision.action)) continue;
      const fresh = await api(`pulls/${pull.number}`);
      if (
        fresh.state !== "open" ||
        fresh.draft ||
        fresh.head?.sha !== pull.head.sha ||
        fresh.user?.id !== 49699333 ||
        fresh.head?.repo?.full_name !== repository ||
        fresh.base?.repo?.full_name !== repository ||
        fresh.base?.ref !== "main" ||
        (await currentMain()) !== revision
      )
        return { status: "waiting", reason: "input-superseded", decisions };
      if (decision.action === "refresh-base") {
        const updated = await api(`pulls/${pull.number}/update-branch`, "PUT", {
          expected_head_sha: pull.head.sha,
        });
        return {
          status: updated ? "updated" : "waiting",
          pullNumber: pull.number,
          decisions,
        };
      }
      if (
        planDependencyUpdate({
          ...input,
          checks: await loadChecks(pull.head.sha),
        }).action !== "merge"
      )
        return { status: "waiting", reason: "checks-unconfirmed", decisions };
      const merged = await api(`pulls/${pull.number}/merge`, "PUT", {
        sha: decision.headSha,
        merge_method: "squash",
        commit_title: `Update verified dependencies PR #${pull.number}`,
      });
      if (merged?.merged !== true || !sha.test(merged.sha ?? ""))
        throw new Error("Dependency merge is unconfirmed.");
      return {
        status: "merged",
        pullNumber: pull.number,
        sha: merged.sha,
        decisions,
      };
    } catch {
      decisions.push({
        pullNumber: candidate.number,
        action: "owner-review",
        reason: "transaction-unconfirmed",
      });
    }
  }
  return { status: "idle", decisions };
}
