import { assertCanonicalWriterContext } from "./github-inventory.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export const githubBackoffPath =
  "data/maintenance/automation/github-backoff.json";
export function validateGithubBackoff(value) {
  if (
    !value ||
    Object.keys(value).sort().join(",") !==
      "nextEligibleAt,reason,schemaVersion" ||
    value.schemaVersion !== 1 ||
    value.reason !== "github-rate-limit" ||
    typeof value.nextEligibleAt !== "string" ||
    !Number.isFinite(Date.parse(value.nextEligibleAt))
  )
    throw new Error("GitHub cooldown is invalid.");
  return value;
}
export async function loadGithubBackoff({ root }) {
  try {
    return validateGithubBackoff(
      JSON.parse(await readFile(resolve(root, githubBackoffPath), "utf8")),
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export async function runGithubWriterPass({
  loadCooldown,
  persistCooldown,
  gh,
  download,
  nowMs,
  now = () => nowMs,
  requestLimit = 1000,
  run,
}) {
  const cooldown = await loadCooldown();
  if (
    cooldown &&
    Date.parse(validateGithubBackoff(cooldown).nextEligibleAt) > nowMs
  )
    return {
      status: "waiting",
      reason: cooldown.reason,
      nextEligibleAt: cooldown.nextEligibleAt,
    };
  if (
    !Number.isSafeInteger(requestLimit) ||
    requestLimit < 1 ||
    requestLimit > 1000
  )
    throw new Error("GitHub request budget is invalid.");
  let stopped,
    requests = 0;
  const guardedRequest = async (request, args) => {
    if (stopped) throw stopped;
    if (requests++ >= requestLimit) {
      stopped = Object.assign(
        new Error("Writer GitHub request budget exhausted."),
        { code: "github-request-budget" },
      );
      throw stopped;
    }
    try {
      return await request(...args);
    } catch (error) {
      const status = githubFailureStatus(error);
      if (
        status === 429 ||
        (status === 403 &&
          /(?:API rate limit exceeded|secondary rate limit)/iu.test(
            error.message ?? "",
          ))
      )
        stopped = error;
      throw error;
    }
  };
  const guardedGh = (...args) => guardedRequest(gh, args);
  guardedGh.download = (args) => guardedRequest(download, [args]);
  let result, failure;
  try {
    result = await run(guardedGh);
  } catch (error) {
    failure = error;
  }
  nowMs = now();
  if (stopped?.code === "github-request-budget")
    return {
      status: "waiting",
      reason: "github-request-budget",
      nextEligibleAt: new Date(nowMs + 15 * 60000).toISOString(),
    };
  if (stopped) {
    const headers = Object.fromEntries(
      Object.entries(stopped.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const retryHeader = headers["retry-after"];
    const retry = Number.isFinite(Number(retryHeader))
      ? Number(retryHeader) * 1000
      : Date.parse(retryHeader ?? "") - nowMs;
    let reset = Number(headers["x-ratelimit-reset"]) * 1000;
    if (
      !(reset > nowMs) &&
      /API rate limit exceeded/iu.test(stopped.message ?? "") &&
      requests < requestLimit
    ) {
      try {
        const rate = JSON.parse(await gh(["api", "rate_limit"]));
        requests++;
        if (rate.resources?.core?.remaining === 0)
          reset = Number(rate.resources.core.reset) * 1000;
      } catch {
        /* GitHub metadata may be unavailable during an outage. */
      }
    }
    const fallback = /secondary rate limit/iu.test(stopped.message ?? "")
      ? 300000
      : 3600000;
    const delay =
      Number.isFinite(retry) && retry > 0
        ? retry
        : Number.isFinite(reset) && reset > nowMs
          ? reset - nowMs
          : fallback;
    const cooldown = {
      schemaVersion: 1,
      reason: "github-rate-limit",
      nextEligibleAt: new Date(
        nowMs + (delay > 0 && delay <= 24 * 3600000 ? delay : fallback),
      ).toISOString(),
    };
    await persistCooldown(cooldown);
    return {
      status: "waiting",
      reason: cooldown.reason,
      nextEligibleAt: cooldown.nextEligibleAt,
    };
  }
  if (failure) throw failure;
  return result;
}

export async function persistGithubBackoff({ root, env, cooldown, run }) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  validateGithubBackoff(cooldown);
  const { synchronizeWriterCheckout } = await import("./writer-runtime.mjs");
  await synchronizeWriterCheckout({
    root,
    env,
    run,
    apply: async (git, options) => {
      const current = await loadGithubBackoff({ root });
      if (
        current &&
        Date.parse(current.nextEligibleAt) >=
          Date.parse(cooldown.nextEligibleAt)
      )
        return;
      const value = cooldown;
      const target = resolve(root, githubBackoffPath);
      await mkdir(resolve(root, "data/maintenance/automation"), {
        recursive: true,
      });
      await writeFile(target, JSON.stringify(value, null, 2) + "\n");
      await git("git", ["add", "--", githubBackoffPath], options);
      await git(
        "git",
        [
          "-c",
          "user.name=Tavernary Automation",
          "-c",
          "user.email=automation@tavernary.dev",
          "commit",
          "--only",
          "-m",
          "chore(automation): defer GitHub requests until reset",
          "--",
          githubBackoffPath,
        ],
        options,
      );
      await git(
        "git",
        [
          "push",
          "https://github.com/" + env.GITHUB_REPOSITORY + ".git",
          "HEAD:refs/heads/main",
        ],
        options,
      );
    },
  });
}
