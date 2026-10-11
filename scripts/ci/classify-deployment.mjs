import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classifyPullRequestPaths } from "./classify-pr-paths.mjs";
import { readAuthoritativeActiveDeployment } from "../automation/deployment-gate.mjs";

const generatedOrPrivateData = [
  /^data\/maintenance\/automation\/github-backoff\.json$/u,
  /^public\/catalog\/tavernary-catalog(?:-v8)?\.json$/u,
  /^data\/snapshots\/(?:install|policy-review)\/[^/]+\.json$/u,
  /^data\/security\/tavernkeeper-(?:report-summaries|import-state)\.json$/u,
  /^data\/maintenance\/automation\/(?:operations|publications|metadata)\/[a-f0-9]{64}\.json$/u,
  /^data\/maintenance\/automation\/deployments\/(?:current|[a-f0-9]{40})\.json$/u,
  /^data\/maintenance\/automation\/model-budgets\/global\.json$/u,
];

export function classifyDeploymentPaths(paths) {
  const values = [...paths];
  if (values.length === 0) return "full";
  for (const value of values) {
    const classification = classifyPullRequestPaths([value]);
    if (classification.route === "content") continue;
    if (
      classification.reason !== "full-path" ||
      !generatedOrPrivateData.some((pattern) =>
        pattern.test(String(value).replaceAll("\\", "/")),
      )
    )
      return "full";
  }
  return "content";
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function runDeploymentClassification({
  root = process.cwd(),
  env = process.env,
} = {}) {
  let result = {
    route: "full",
    reason: "unverified-baseline",
    baselineSha: null,
  };
  try {
    if (
      env.GITHUB_REPOSITORY !== "MentallyQuill/Tavernary" ||
      env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !==
        "MentallyQuill/Tavernary/.github/workflows/deploy-pages.yml@refs/heads/main" ||
      !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)
    )
      throw new Error("Untrusted deployment context.");
    const revision = git(root, ["rev-parse", "HEAD"]).trim();
    const active = readAuthoritativeActiveDeployment({ root, revision });
    if (active?.mode === "ordinary") {
      const baselineSha = active.deployment.sourceSha;
      // Check the entire difference from confirmed production, including earlier queued commits.
      // --raw also detects symlinks/executable data; bounded Git output fails safely to full.
      const entries = git(root, [
        "diff",
        "--raw",
        "--abbrev=40",
        "--no-renames",
        "-z",
        baselineSha,
        revision,
      ]).split("\0");
      if (entries.at(-1) === "") entries.pop();
      if (entries.length % 2 !== 0)
        throw new Error("Invalid changed-file inventory.");
      const paths = [];
      for (let index = 0; index < entries.length; index += 2) {
        if (
          !/^:(?:000000|100644) (?:000000|100644) [a-f0-9]{40} [a-f0-9]{40} [AMDT]$/u.test(
            entries[index],
          )
        )
          throw new Error("Unsupported changed-file mode.");
        paths.push(entries[index + 1]);
      }
      const route = classifyDeploymentPaths(paths);
      result = {
        route,
        reason:
          route === "content"
            ? "content-only"
            : "implementation-or-unknown-path",
        baselineSha,
      };
    }
  } catch {
    // Classification is an optimization. Missing/invalid proof must never skip full verification.
  }
  if (env.GITHUB_OUTPUT)
    await appendFile(env.GITHUB_OUTPUT, `route=${result.route}\n`);
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(await runDeploymentClassification()));
}
