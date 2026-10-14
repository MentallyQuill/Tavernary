import { githubFailureStatus } from "./github-inventory.mjs";

export async function readProjectPublicationEnabled({
  repository,
  gh,
  env = process.env,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ""))
    throw new Error("Publication setting repository is invalid.");
  const token = env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN;
  if (typeof token !== "string" || !token.trim())
    throw Object.assign(
      new Error("Publication setting read authority is unavailable."),
      { code: "publisher-authentication-failed" },
    );
  try {
    const value = JSON.parse(
      await gh(
        [
          "api",
          `repos/${repository}/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED`,
        ],
        undefined,
        { token },
      ),
    );
    return value?.value === "true";
  } catch (error) {
    const status = githubFailureStatus(error);
    if (
      [401, 403].includes(status) &&
      error?.code !== "provider-rate-limited" &&
      !/(?:API rate limit exceeded|secondary rate limit)/iu.test(
        error?.message ?? "",
      )
    )
      error.code = "publisher-authentication-failed";
    throw error;
  }
}
