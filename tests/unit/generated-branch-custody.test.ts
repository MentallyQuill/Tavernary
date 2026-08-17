import { describe, expect, test } from "vitest";

import { planGeneratedProjectBranchCleanup } from "../../scripts/security/generated-branch-custody.mjs";

const repository = "MentallyQuill/Tavernary";
const headSha = "a".repeat(40);

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 72,
    state: "closed",
    head: {
      ref: "automation/project-submission-72",
      sha: headSha,
      repo: { full_name: repository },
    },
    base: {
      ref: "main",
      repo: { full_name: repository },
    },
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    repository,
    defaultBranch: "main",
    pullNumber: 72,
    expectedBranch: "automation/project-submission-72",
    expectedHeadSha: headSha,
    currentHeadSha: headSha,
    pull: pull(),
    ...overrides,
  };
}

describe("generated project branch cleanup", () => {
  test("deletes only the unchanged head of an exact closed submission PR", () => {
    expect(planGeneratedProjectBranchCleanup(input())).toEqual({
      action: "delete",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("accepts the numeric owner-request namespace", () => {
    const branch = "automation/project-owner-request-290";
    expect(
      planGeneratedProjectBranchCleanup(
        input({
          expectedBranch: branch,
          pull: pull({
            head: {
              ref: branch,
              sha: headSha,
              repo: { full_name: repository },
            },
          }),
        }),
      ),
    ).toEqual({ action: "delete", branch, expectedHeadSha: headSha });
  });

  test("normalizes hexadecimal SHA case", () => {
    expect(
      planGeneratedProjectBranchCleanup(
        input({
          expectedHeadSha: headSha.toUpperCase(),
          currentHeadSha: headSha.toUpperCase(),
        }),
      ),
    ).toEqual({
      action: "delete",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("treats an already absent branch as an idempotent no-op", () => {
    expect(
      planGeneratedProjectBranchCleanup(input({ currentHeadSha: null })),
    ).toEqual({
      action: "absent",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("preserves a branch that moved after pull-request closure", () => {
    expect(
      planGeneratedProjectBranchCleanup(
        input({ currentHeadSha: "b".repeat(40) }),
      ),
    ).toEqual({
      action: "moved",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
      currentHeadSha: "b".repeat(40),
    });
  });

  test.each([
    ["an open pull request", { pull: pull({ state: "open" }) }, "closed"],
    [
      "a foreign head repository",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-72",
            sha: headSha,
            repo: { full_name: "attacker/Tavernary" },
          },
        }),
      },
      "head repository",
    ],
    [
      "a foreign base repository",
      {
        pull: pull({
          base: { ref: "main", repo: { full_name: "attacker/Tavernary" } },
        }),
      },
      "base repository",
    ],
    [
      "a non-default base branch",
      {
        pull: pull({
          base: { ref: "release", repo: { full_name: repository } },
        }),
      },
      "default branch",
    ],
    ["a different pull request", { pull: pull({ number: 73 }) }, "number"],
    [
      "a mismatched head branch",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-73",
            sha: headSha,
            repo: { full_name: repository },
          },
        }),
      },
      "head branch",
    ],
    [
      "a mismatched head SHA",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-72",
            sha: "c".repeat(40),
            repo: { full_name: repository },
          },
        }),
      },
      "head SHA",
    ],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() => planGeneratedProjectBranchCleanup(input(overrides))).toThrow(
      message,
    );
  });

  test.each([
    "automation/project-submission-0",
    "automation/project-submission-72/extra",
    "automation/project-owner-request-canary",
    "feat/project-submission-72",
    "automation/project-submission-72%2Fextra",
  ])("rejects non-production generated branch %s", (expectedBranch) => {
    expect(() =>
      planGeneratedProjectBranchCleanup(input({ expectedBranch })),
    ).toThrow("generated project branch");
  });

  test.each(["a".repeat(39), "g".repeat(40), `${headSha};echo unsafe`, ""])(
    "rejects malformed expected SHA %s",
    (expectedHeadSha) => {
      expect(() =>
        planGeneratedProjectBranchCleanup(input({ expectedHeadSha })),
      ).toThrow("expected head SHA");
    },
  );

  test("rejects a malformed current ref SHA", () => {
    expect(() =>
      planGeneratedProjectBranchCleanup(
        input({ currentHeadSha: `${headSha};echo unsafe` }),
      ),
    ).toThrow("current head SHA");
  });
});
