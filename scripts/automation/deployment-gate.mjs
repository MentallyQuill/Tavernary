import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { planDeployment } from "./deployment-plan.mjs";
import {
  validateRevisionManifest,
  REVISION_LIMITS,
} from "./revision-manifest.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
import { validateActiveDeployment } from "./deployment-state.mjs";

const sha = /^[a-f0-9]{40}$/u;
function git(root, args, maxBuffer = 1024 * 1024) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function ancestry(root, ancestor, descendant) {
  try {
    git(root, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    return error.status === 1 ? false : null;
  }
}
export function readLatestPublishableRevision({ root, revision }) {
  if (!sha.test(revision ?? ""))
    throw new Error("Publishable revision is invalid.");
  // These paths are internal state only. Unknown paths deliberately require a deployment.
  const ignored = [
    "docs/**",
    "tests/**",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "data/maintenance/automation/**",
    "data/snapshots/policy-review/**",
    "data/reports/**",
  ];
  const latest = git(root, [
    "log",
    "-1",
    "--format=%H",
    revision,
    "--",
    ".",
    ...ignored.map((path) => `:(top,exclude,glob)${path}`),
  ]);
  if (!sha.test(latest)) throw new Error("Publishable history is unavailable.");
  return latest;
}
export function readAuthoritativeActiveDeployment({ root, revision }) {
  if (!sha.test(revision ?? ""))
    throw new Error("Active deployment revision is invalid.");
  const path = "data/maintenance/automation/deployments/current.json";
  const present = git(root, ["ls-tree", revision, "--", path]);
  if (!present) return null;
  if (
    !new RegExp(
      `^100644 blob [a-f0-9]{40}\\t${path.replaceAll(".", "\\.")}$`,
      "u",
    ).test(present)
  )
    throw new Error("Active deployment path or file mode is invalid.");
  const active = validateActiveDeployment(
    JSON.parse(git(root, ["show", `${revision}:${path}`], 64 * 1024)),
  );
  if (
    ancestry(root, active.deployment.sourceSha, revision) !== true ||
    (active.mode === "rollback" &&
      ancestry(root, active.rollbackBaselineSha, revision) !== true)
  )
    throw new Error("Active deployment ancestry is unavailable.");
  return active;
}
export function readAuthoritativeDeployedSha({ root, revision }) {
  const active = readAuthoritativeActiveDeployment({ root, revision });
  if (active) return active.deployment.sourceSha;
  const paths = git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    "data/maintenance/automation/deployments/",
  ])
    .split("\n")
    .filter(Boolean);
  if (paths.length > 2000)
    throw new Error("Deployment proof inventory exceeds its bound.");
  let latest = null;
  for (const path of paths) {
    if (
      !/^data\/maintenance\/automation\/deployments\/[a-f0-9]{40}\.json$/u.test(
        path,
      )
    )
      throw new Error("Deployment proof path is invalid.");
    const record = JSON.parse(
      git(root, ["show", `${revision}:${path}`], 64 * 1024),
    );
    if (
      path !==
      `data/maintenance/automation/deployments/${record.sourceSha}.json`
    )
      throw new Error("Deployment proof source and path differ.");
    if (
      !isConfirmedDeployment(record, {
        sha: record.sourceSha,
        catalogDigest: record.confirmation?.catalogDigest,
        targetDigest: record.confirmation?.targetDigest,
      })
    )
      continue;
    if (
      !sha.test(record.sourceSha ?? "") ||
      ancestry(root, record.sourceSha, revision) !== true
    )
      throw new Error("Deployment proof ancestry is unavailable.");
    if (latest === null || ancestry(root, latest, record.sourceSha) === true)
      latest = record.sourceSha;
    else if (ancestry(root, record.sourceSha, latest) !== true)
      throw new Error("Deployment proof history diverged.");
  }
  return latest;
}
export async function gateDeployment({
  root,
  manifest,
  requestedSha,
  currentMainSha,
  deployedSha,
  expectedBuildId,
}) {
  const verified = validateRevisionManifest(manifest);
  if (expectedBuildId !== undefined && verified.buildId !== expectedBuildId)
    return { action: "reject", reason: "artifact-build-mismatch" };
  return planDeployment({
    requestedSha,
    currentMainSha,
    deployedSha,
    validatedSha: verified.sourceSha,
    latestPublishableSha: readLatestPublishableRevision({
      root,
      revision: currentMainSha,
    }),
    isAncestor: (a, b) => ancestry(root, a, b),
    mode: "ordinary",
  });
}
export async function runDeploymentGate({
  root = process.cwd(),
  env = process.env,
  manifestPath,
  requestedSha,
}) {
  if (
    env.GITHUB_REPOSITORY !== "MentallyQuill/Tavernary" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_WORKFLOW_REF !==
      "MentallyQuill/Tavernary/.github/workflows/deploy-pages.yml@refs/heads/main" ||
    !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "") ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT ?? "") ||
    !sha.test(requestedSha ?? "")
  )
    throw new Error("Deployment workflow context is invalid.");
  const bytes = await readFile(resolve(root, manifestPath));
  if (bytes.length > REVISION_LIMITS.manifestBytes)
    throw new Error("Revision manifest exceeds its bound.");
  const currentMainSha = git(root, ["rev-parse", "origin/main"]);
  const result = await gateDeployment({
    root,
    manifest: JSON.parse(bytes.toString("utf8")),
    requestedSha,
    currentMainSha,
    deployedSha: readAuthoritativeDeployedSha({
      root,
      revision: currentMainSha,
    }),
    expectedBuildId: `run-${env.GITHUB_RUN_ID}-attempt-${env.GITHUB_RUN_ATTEMPT}`,
  });
  if (env.GITHUB_OUTPUT)
    await appendFile(env.GITHUB_OUTPUT, `action=${result.action}\n`);
  if (result.action === "reject")
    throw Object.assign(
      new Error("Final deployment guard rejected the artifact."),
      { code: "validation-failed" },
    );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [manifestPath, requestedSha] = process.argv.slice(2);
  console.log(
    JSON.stringify(await runDeploymentGate({ manifestPath, requestedSha })),
  );
}
