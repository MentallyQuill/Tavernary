import { expect, test } from "vitest";

import {
  buildIssueLimitComment,
  decideIssueAdmission,
  ISSUE_ADMISSION_LABEL,
  ISSUE_LIMIT_LABEL,
  OPEN_ISSUE_LIMIT,
} from "../../scripts/submissions/issue-admission.mjs";

function issue(
  number: number,
  userId = 42,
  options: { pullRequest?: boolean; createdAt?: string } = {},
) {
  return {
    number,
    created_at:
      options.createdAt ??
      `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
    user: { id: userId },
    ...(options.pullRequest
      ? { pull_request: { url: "https://example.test" } }
      : {}),
  };
}

test("admits the oldest ten open issues for one numeric identity", () => {
  const openItems = Array.from({ length: 11 }, (_, index) => issue(index + 1));

  expect(
    decideIssueAdmission({
      currentIssue: issue(10),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    reason: "within-limit",
    admittedIssueNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  });
  expect(
    decideIssueAdmission({
      currentIssue: issue(11),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({ admitted: false, reason: "over-limit" });
});

test("counts every issue type while excluding pull requests and other users", () => {
  const openItems = [
    ...Array.from({ length: 9 }, (_, index) => issue(index + 1)),
    issue(10, 42, { pullRequest: true }),
    issue(11, 99),
    issue(12),
  ];

  expect(
    decideIssueAdmission({
      currentIssue: issue(12),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    openIssueCount: 10,
  });
});

test("restores admission when an older issue closes", () => {
  const openItems = Array.from({ length: 10 }, (_, index) => issue(index + 2));

  expect(
    decideIssueAdmission({
      currentIssue: issue(11),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    openIssueCount: 10,
  });
});

test.each(["OWNER", "MEMBER", "COLLABORATOR"])(
  "exempts trusted association %s",
  (authorAssociation) => {
    expect(
      decideIssueAdmission({
        currentIssue: issue(50),
        openItems: Array.from({ length: 50 }, (_, index) => issue(index + 1)),
        authorAssociation,
      }),
    ).toMatchObject({ admitted: true, reason: "trusted" });
  },
);

test("uses issue number to break equal creation timestamps", () => {
  const createdAt = "2026-07-25T12:00:00Z";
  const openItems = Array.from({ length: 11 }, (_, index) =>
    issue(11 - index, 42, { createdAt }),
  );

  expect(
    decideIssueAdmission({
      currentIssue: issue(11, 42, { createdAt }),
      openItems,
      authorAssociation: "NONE",
    }).admitted,
  ).toBe(false);
});

test("publishes stable admission constants and neutral recovery copy", () => {
  expect(OPEN_ISSUE_LIMIT).toBe(10);
  expect(ISSUE_ADMISSION_LABEL).toBe("issue-admitted");
  expect(ISSUE_LIMIT_LABEL).toBe("issue-limit-reached");
  expect(buildIssueLimitComment()).toBe(
    [
      "<!-- tavernary-open-issue-limit -->",
      "Tavernary keeps at most 10 issues open per external GitHub account at one time.",
      "",
      "This issue was closed because this account already has 10 older open issues. Close or resolve one of those issues, then reopen this issue to use the available slot.",
    ].join("\n"),
  );
});
