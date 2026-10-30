import { retryGithubRequest } from "./github-retry.mjs";
import { pathToFileURL } from "node:url";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { classifyAutomationFailure } from "./failure.mjs";

// Only deterministic, operation-keyed preparations can safely repeat a dispatch.
const fieldsByWorkflow = {
  "refresh-catalog.yml": ["operation_key", "source_id", "mode"],
  "import-tavernkeeper-reports.yml": ["operation_key"],
};
function validateDispatch(args) {
  const fields = Object.hasOwn(fieldsByWorkflow, args[0])
    ? fieldsByWorkflow[args[0]]
    : undefined;
  if (!fields) throw new Error("Unsupported preparation workflow.");
  const values = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index],
      value = args[index + 1];
    if (!["--repo", "--ref", "-f"].includes(flag) || typeof value !== "string")
      throw new Error("Preparation dispatch arguments are invalid.");
    const pair =
      flag === "-f" ? /^([a-z_]+)=(.*)$/u.exec(value)?.slice(1) : [flag, value];
    if (
      !pair ||
      values.has(pair[0]) ||
      (flag === "-f" && !fields.includes(pair[0]))
    )
      throw new Error("Preparation dispatch fields are invalid.");
    values.set(pair[0], pair[1]);
  }
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(values.get("--repo") ?? "") ||
    values.get("--ref") !== "main" ||
    !/^[a-f0-9]{64}$/u.test(values.get("operation_key") ?? "") ||
    fields.some((field) => !values.has(field)) ||
    (args[0] === "refresh-catalog.yml" &&
      (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(values.get("source_id") ?? "") ||
        !["project", "forensic"].includes(values.get("mode"))))
  )
    throw new Error("Preparation dispatch identity is invalid.");
}

export async function runWorkflowDispatchCli(args, options = {}) {
  const write = options.write ?? console.log;
  const reportError = options.reportError ?? console.error;
  try {
    validateDispatch(args);
    const gh = options.gh ?? executeGh;
    const command = ["workflow", "run", ...args];
    const output = await retryGithubRequest(() => gh(command), {
      retryable: (error) => {
        const status = githubFailureStatus(error);
        return status >= 500 && status <= 599;
      },
      sleep: options.sleep,
      reportRetry: options.reportRetry,
    });
    if (output.trim()) write(output.trimEnd());
    return 0;
  } catch (error) {
    reportError(
      JSON.stringify({
        status: "unavailable",
        failure: classifyAutomationFailure({
          diagnosticCode: error?.code,
          httpStatus: githubFailureStatus(error),
        }),
      }),
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runWorkflowDispatchCli(process.argv.slice(2));
