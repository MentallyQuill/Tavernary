import { githubFailureStatus } from "./github-inventory.mjs";
export function createProjectReconciliationRequest({
  repository,
  request,
  gh,
  publish,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ""))
    throw new Error("Project reconciliation repository is invalid.");
  const root = `/repos/${repository}/`;
  return async (path, options = {}) => {
    if (
      !path.startsWith(root) &&
      path !== `/repos/${repository}` &&
      !path.startsWith("/users/")
    )
      throw new Error("Project reconciliation request changed repository.");
    if (
      path ===
        `${root}actions/workflows/publish-project-transaction.yml/dispatches` &&
      options.method === "POST"
    ) {
      const body = JSON.parse(options.body ?? "{}");
      if (
        body.ref !== "main" ||
        !/^[1-9]\d*$/u.test(String(body.inputs?.validation_run_id ?? ""))
      )
        throw new Error("Project publication dispatch is invalid.");
      await publish();
      return null;
    }
    if (options.method === "POST" && path.startsWith(`${root}actions/`)) {
      const allowed =
        /\/actions\/(?:workflows\/(?:ci|generate-project-submission|generate-project-owner-request)\.yml\/dispatches|runs\/[1-9]\d*\/rerun(?:-failed-jobs)?)$/u.test(
          path,
        );
      if (!allowed)
        throw new Error("Project reconciliation dispatch is not allowed.");
      try {
        const result = await gh(
          [
            "api",
            "--method",
            "POST",
            path.slice(1),
            ...(options.body ? ["--input", "-"] : []),
          ],
          options.body,
        );
        return result ? JSON.parse(result) : null;
      } catch (error) {
        error.status = githubFailureStatus(error);
        throw error;
      }
    }
    return request(path, options);
  };
}
