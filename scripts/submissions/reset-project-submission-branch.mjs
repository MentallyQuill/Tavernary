import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const generatedProjectBranchPattern = /^automation\/project-submission-\d+$/u;

export function resetProjectSubmissionBranch({ branch, cwd = process.cwd() }) {
  if (!generatedProjectBranchPattern.test(branch)) {
    throw new Error(`Refusing unsafe generated project branch: ${branch}`);
  }
  execFileSync("git", ["checkout", "-B", branch, "origin/main"], {
    cwd,
    stdio: "inherit",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { branch: { type: "string" } },
  });
  if (!values.branch) throw new Error("--branch is required.");
  resetProjectSubmissionBranch({ branch: values.branch });
}
