const generatedProjectBranchPattern =
  /^automation\/(?:project-submission|project-owner-request)-[1-9]\d*$/u;
const objectShaPattern = /^[0-9a-f]{40}$/iu;

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizeObjectSha(value, label) {
  if (typeof value !== "string" || !objectShaPattern.test(value)) {
    throw new Error(`${label} must be a 40-character hexadecimal SHA.`);
  }
  return value.toLowerCase();
}

function sameRepository(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

export function planGeneratedProjectBranchCleanup(input) {
  const repository = requireNonEmptyString(input?.repository, "repository");
  const defaultBranch = requireNonEmptyString(
    input?.defaultBranch,
    "default branch",
  );
  const expectedBranch = requireNonEmptyString(
    input?.expectedBranch,
    "expected branch",
  );
  if (!generatedProjectBranchPattern.test(expectedBranch)) {
    throw new Error("Expected branch is not a generated project branch.");
  }
  if (!Number.isSafeInteger(input?.pullNumber) || input.pullNumber <= 0) {
    throw new Error("Pull request number must be a positive integer.");
  }

  const expectedHeadSha = normalizeObjectSha(
    input?.expectedHeadSha,
    "expected head SHA",
  );
  const pull = input?.pull;
  if (!pull || typeof pull !== "object") {
    throw new Error("Pull request state is required.");
  }
  if (pull.number !== input.pullNumber) {
    throw new Error("Pull request number does not match the cleanup request.");
  }
  if (pull.state !== "closed") {
    throw new Error("Generated branch cleanup requires a closed pull request.");
  }

  const headRepository = requireNonEmptyString(
    pull.head?.repo?.full_name,
    "pull request head repository",
  );
  if (!sameRepository(headRepository, repository)) {
    throw new Error("Pull request head repository is outside this repository.");
  }
  const baseRepository = requireNonEmptyString(
    pull.base?.repo?.full_name,
    "pull request base repository",
  );
  if (!sameRepository(baseRepository, repository)) {
    throw new Error("Pull request base repository is outside this repository.");
  }
  if (pull.base?.ref !== defaultBranch) {
    throw new Error("Pull request does not target the default branch.");
  }
  if (pull.head?.ref !== expectedBranch) {
    throw new Error("Pull request head branch does not match cleanup input.");
  }
  const pullHeadSha = normalizeObjectSha(
    pull.head?.sha,
    "pull request head SHA",
  );
  if (pullHeadSha !== expectedHeadSha) {
    throw new Error("Pull request head SHA does not match cleanup input.");
  }

  const common = { branch: expectedBranch, expectedHeadSha };
  if (input.currentHeadSha === null || input.currentHeadSha === "") {
    return { action: "absent", ...common };
  }
  const currentHeadSha = normalizeObjectSha(
    input.currentHeadSha,
    "current head SHA",
  );
  if (currentHeadSha !== expectedHeadSha) {
    return { action: "moved", ...common, currentHeadSha };
  }
  return { action: "delete", ...common };
}
