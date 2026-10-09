import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readCanonicalFiles } from "./canonical-files.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { synchronizeWriterCheckout } from "./writer-runtime.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { backfillRepositoryIdentities } from "../catalog/repository-identity-backfill.mjs";
import { validateCatalog } from "../catalog/validate.mjs";
import { formatJson } from "../catalog/json-format.mjs";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const shaPattern = /^[a-f0-9]{40}$/u;

export async function runPublisherWriterVerification({
  runId,
  env = process.env,
  gh = executeGh,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (!Number.isSafeInteger(runId) || runId < 1)
    throw new Error("Publisher owner request is invalid.");
  const repository = env.GITHUB_REPOSITORY;
  const api = async (path, method, body) => {
    const text = await gh(
      [
        "api",
        `repos/${repository}/${path}`,
        ...(method ? ["--method", method] : []),
        ...(body !== undefined ? ["--input", "-"] : []),
      ],
      body === undefined ? undefined : JSON.stringify(body),
    );
    if (Buffer.byteLength(text) > 1_048_576)
      throw new Error("Publisher verification response exceeds its bound.");
    return text.trim() ? JSON.parse(text) : null;
  };
  const request = await api(`actions/runs/${runId}`);
  if (
    request.id !== runId ||
    request.actor?.id !== 2625904 ||
    request.event !== "workflow_dispatch" ||
    request.head_branch !== "main" ||
    !shaPattern.test(request.head_sha ?? "") ||
    request.head_repository?.full_name !== repository ||
    ![
      ".github/workflows/publisher-verification.yml",
      ".github/workflows/publisher-automation-branch-verification.yml",
    ].includes(request.path)
  )
    throw new Error(
      "Publisher verification requires an authenticated owner request.",
    );
  const reference = await api("git/ref/heads/main");
  const mainSha = reference.object?.sha;
  if (reference.ref !== "refs/heads/main" || !shaPattern.test(mainSha ?? ""))
    throw new Error("Publisher main reference is invalid.");
  const parent = await api(`git/commits/${mainSha}`);
  if (parent.sha !== mainSha || !shaPattern.test(parent.tree?.sha ?? ""))
    throw new Error("Publisher verification parent is invalid.");
  if (
    request.path ===
    ".github/workflows/publisher-automation-branch-verification.yml"
  ) {
    const branch = `automation/project-submission-0-${runId}`;
    const marker = `chore(security): verify Publisher branch custody (owner request ${runId})`;
    const read = `git/ref/heads/${branch}`,
      write = `git/refs/heads/${branch}`;
    let owned = false,
      base,
      tree = parent.tree.sha,
      tip;
    try {
      let existing;
      try {
        existing = await api(read);
      } catch (error) {
        if (githubFailureStatus(error) !== 404) throw error;
      }
      if (existing) {
        if (
          existing.ref !== `refs/heads/${branch}` ||
          !shaPattern.test(existing.object?.sha ?? "")
        )
          throw new Error("Publisher probe reference is invalid.");
        const previous = await api(`git/commits/${existing.object.sha}`);
        if (
          previous.sha !== existing.object.sha ||
          previous.message !== marker ||
          !shaPattern.test(previous.tree?.sha ?? "") ||
          previous.parents?.length !== 1 ||
          !shaPattern.test(previous.parents[0]?.sha ?? "")
        )
          throw new Error(
            "Publisher probe branch is not owned by this request.",
          );
        const previousParent = await api(
          `git/commits/${previous.parents[0].sha}`,
        );
        if (
          previousParent.sha !== previous.parents[0].sha ||
          previousParent.tree?.sha !== previous.tree.sha
        )
          throw new Error("Publisher probe branch contains a data change.");
        base = previous.sha;
        tree = previous.tree.sha;
        owned = true;
      } else {
        const created = await api("git/commits", "POST", {
          message: marker,
          tree,
          parents: [mainSha],
        });
        if (!shaPattern.test(created.sha ?? ""))
          throw new Error("Publisher probe base is invalid.");
        base = created.sha;
        const createdRef = await api("git/refs", "POST", {
          ref: `refs/heads/${branch}`,
          sha: base,
        });
        if (
          createdRef.ref !== `refs/heads/${branch}` ||
          createdRef.object?.sha !== base
        )
          throw new Error("Publisher branch creation is unconfirmed.");
        owned = true;
      }
      const advanced = await api("git/commits", "POST", {
        message: marker,
        tree,
        parents: [base],
      });
      if (!shaPattern.test(advanced.sha ?? ""))
        throw new Error("Publisher probe tip is invalid.");
      tip = advanced.sha;
      const updated = await api(write, "PATCH", { sha: tip, force: false });
      if (updated.ref !== `refs/heads/${branch}` || updated.object?.sha !== tip)
        throw new Error("Publisher branch advancement is unconfirmed.");
    } finally {
      if (owned) await api(write, "DELETE");
    }
    try {
      await api(read);
    } catch (error) {
      if (githubFailureStatus(error) === 404)
        return { status: "verified", lane: "branch", sha: tip };
      throw error;
    }
    throw new Error("Publisher probe branch deletion is unconfirmed.");
  }
  const message = `chore(security): verify Publisher write lane (owner request ${runId})`;
  if (parent.message === message) {
    if (
      parent.parents?.length !== 1 ||
      !shaPattern.test(parent.parents[0]?.sha ?? "")
    )
      throw new Error("Recorded Publisher probe parent is invalid.");
    const previous = await api(`git/commits/${parent.parents[0].sha}`);
    if (
      previous.sha !== parent.parents[0].sha ||
      previous.tree?.sha !== parent.tree.sha
    )
      throw new Error("Recorded Publisher probe is not content-neutral.");
    return { status: "verified", lane: "main", sha: mainSha };
  }
  const probe = await api("git/commits", "POST", {
    message,
    tree: parent.tree.sha,
    parents: [mainSha],
  });
  if (!shaPattern.test(probe.sha ?? ""))
    throw new Error("Publisher verification commit is invalid.");
  const updated = await api("git/refs/heads/main", "PATCH", {
    sha: probe.sha,
    force: false,
  });
  if (updated.ref !== "refs/heads/main" || updated.object?.sha !== probe.sha)
    throw new Error("Publisher write verification is unconfirmed.");
  return { status: "verified", lane: "main", sha: probe.sha };
}

async function loadIdentityState({ root, env }) {
  await synchronizeWriterCheckout({ root, env });
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 2_097_152,
    }).toString("utf8");
  const revision = git(["rev-parse", "HEAD"]).trim();
  const paths = git([
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    "data/registry/sources",
    "data/snapshots/github",
  ])
    .trim()
    .split("\n")
    .filter((path) =>
      /^data\/(?:registry\/sources|snapshots\/github)\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(
        path,
      ),
    );
  if (paths.length > 10_000)
    throw new Error("Identity inventory exceeds its bound.");
  const files = readCanonicalFiles({ root, revision, paths });
  const sources = [],
    snapshots = [];
  for (const path of paths) {
    if (!files[path]) throw new Error("Identity inventory is incomplete.");
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(files[path]),
    );
    if (path.startsWith("data/registry/sources/")) sources.push(value);
    else snapshots.push(value);
  }
  return { revision, sources, snapshots };
}

export async function runRepositoryIdentityWriter({
  sourceIds = "",
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = () => loadIdentityState({ root, env }),
  validate = validateCatalog,
  commit = (input) => commitCanonicalData({ ...input, gh }),
} = {}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (typeof sourceIds !== "string" || Buffer.byteLength(sourceIds) > 32_768)
    throw new Error("Identity selection is invalid.");
  const selected = sourceIds
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    selected.length > 256 ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !idPattern.test(id))
  )
    throw new Error("Identity selection is invalid.");
  const state = await load();
  if (
    !shaPattern.test(state.revision) ||
    !Array.isArray(state.sources) ||
    !Array.isArray(state.snapshots) ||
    state.sources.some((source) => !idPattern.test(source.id)) ||
    new Set(state.sources.map((source) => source.id)).size !==
      state.sources.length
  )
    throw new Error("Identity inventory is invalid.");
  const known = new Set(state.sources.map((source) => source.id));
  if (selected.some((id) => !known.has(id)))
    throw new Error("Identity selection is unknown.");
  const result = backfillRepositoryIdentities(state.sources, state.snapshots, {
    sourceIds: selected.length ? new Set(selected) : null,
  });
  if (result.conflicts.length)
    throw new Error("Repository identity conflicts require an owner decision.");
  if (!result.updated.length) return { status: "unchanged", changed: 0 };
  if (result.updated.length > 256)
    throw new Error("Select at most 256 missing identities per publication.");
  const updates = new Map(result.updated.map((source) => [source.id, source]));
  const checked = await validate({
    sources: state.sources.map((source) => updates.get(source.id) ?? source),
    snapshots: state.snapshots,
  });
  if (checked.errors.length)
    throw new Error("Projected repository identities are invalid.");
  const files = await Promise.all(
    result.updated.map(async (source) => {
      const content = await formatJson(source);
      return {
        path: `data/registry/sources/${source.id}.json`,
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        baseDigest: null,
      };
    }),
  );
  const fresh = await load();
  if (fresh.revision !== state.revision)
    return { status: "superseded", changed: 0 };
  const published = await commit({
    repository: env.GITHUB_REPOSITORY,
    expectedMainSha: state.revision,
    files,
    message: "chore(catalog): backfill repository identities",
  });
  return { status: "published", changed: files.length, sha: published.sha };
}
