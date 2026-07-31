import { expect, test } from "vitest";

import {
  planProjectGenerationFailure,
  reconcileProjectGenerationFailure,
} from "../../scripts/submissions/project-generation-failure.mjs";
import { renderRedditRetryState } from "../../scripts/submissions/project-submission-retry-state.mjs";

function issue(labels: string[], state = "open") {
  return {
    number: 166,
    state,
    labels: labels.map((name) => ({ name })),
  };
}

test("moves an admitted failed generation without a PR to retryable", () => {
  expect(
    planProjectGenerationFailure({
      issue: issue([
        "issue-admitted",
        "project-owner-request",
        "needs-maintainer-review",
        "community-visible",
      ]),
      producer: "project-owner-request",
      ownedPull: null,
      runUrl:
        "https://github.com/MentallyQuill/Tavernary/actions/runs/30551455832",
      reasonCode: "generation-failed",
    }),
  ).toEqual({
    action: "reconcile",
    labels: [
      "issue-admitted",
      "project-owner-request",
      "community-visible",
      "submission-retryable",
    ],
    commentMarker:
      "<!-- tavernary-project-generation-failure:project-owner-request -->",
    commentBody: expect.stringContaining(
      "Generation stopped before publication",
    ),
  });
});

test("embeds sanitized Reddit retry state in the existing failure comment", () => {
  const redditRetryState = {
    schema_version: 1 as const,
    issue_number: 166,
    source_identity: "reddit:1v9u18m" as const,
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending" as const,
  };
  const plan = planProjectGenerationFailure({
    issue: issue([
      "issue-admitted",
      "project-submission",
      "needs-maintainer-review",
    ]),
    producer: "project-submission",
    ownedPull: null,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/7",
    reasonCode: "reddit-source-retry-scheduled",
    redditRetryState,
  });

  expect(plan.commentBody).toContain(renderRedditRetryState(redditRetryState));
  expect(plan.commentBody).toContain(
    "Tavernary will retry automatically after 2026-07-30T19:00:00.000Z.",
  );
  expect(plan.commentBody).not.toContain("Reddit post body");
});

test("does not attach Reddit retry state to an owner-request failure", () => {
  const plan = planProjectGenerationFailure({
    issue: issue(["issue-admitted", "project-owner-request"]),
    producer: "project-owner-request",
    ownedPull: null,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/8",
    reasonCode: "generation-failed",
    redditRetryState: {
      schema_version: 1,
      issue_number: 166,
      source_identity: "reddit:1v9u18m",
      completed_waves: 1,
      next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
      last_reason_code: "reddit-rate-limited",
      updated_at: "2026-07-30T18:00:00.000Z",
      outcome: "pending",
    },
  });

  expect(plan.commentBody).not.toContain(
    "<!-- tavernary-reddit-submission-retry",
  );
});

test("preserves review state when an owned PR exists", () => {
  const plan = planProjectGenerationFailure({
    issue: issue([
      "issue-admitted",
      "project-submission",
      "needs-maintainer-review",
    ]),
    producer: "project-submission",
    ownedPull: { state: "open" },
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/1",
    reasonCode: "generation-failed",
  });

  expect(plan).toMatchObject({
    action: "reconcile",
    labels: ["issue-admitted", "project-submission", "submission-pr-open"],
    commentBody: expect.stringContaining("review pull request already exists"),
  });
});

test("updates one existing sanitized failure comment idempotently", async () => {
  const calls: Array<{
    path: string;
    options: Record<string, unknown> | undefined;
  }> = [];
  const marker =
    "<!-- tavernary-project-generation-failure:project-owner-request -->";
  const request = async (path: string, options?: Record<string, unknown>) => {
    calls.push({ path, options });
    if (path.endsWith("/issues/166")) {
      return issue([
        "issue-admitted",
        "project-owner-request",
        "needs-maintainer-review",
      ]);
    }
    if (path.includes("/pulls?")) return [];
    if (path.endsWith("/issues/166/comments?per_page=100")) {
      return [{ id: 44, body: `${marker}\nOld failure.` }];
    }
    return {};
  };

  await reconcileProjectGenerationFailure({
    repository: "MentallyQuill/Tavernary",
    issueNumber: 166,
    producer: "project-owner-request",
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/2",
    reasonCode: "generation-failed",
    request,
  });

  expect(calls).toContainEqual({
    path: "/repos/MentallyQuill/Tavernary/issues/166/labels",
    options: expect.objectContaining({ method: "PUT" }),
  });
  expect(calls).toContainEqual({
    path: "/repos/MentallyQuill/Tavernary/issues/comments/44",
    options: expect.objectContaining({ method: "PATCH" }),
  });
  expect(
    calls.some(
      (call) =>
        call.path.endsWith("/issues/166/comments") &&
        call.options?.method === "POST",
    ),
  ).toBe(false);
});

test.each([
  ["closed issue", issue(["issue-admitted", "project-submission"], "closed")],
  [
    "needs information",
    issue(["issue-admitted", "project-submission", "needs-information"]),
  ],
  [
    "declined submission",
    issue(["issue-admitted", "project-submission", "submission-declined"]),
  ],
])("does not overwrite %s", (_name, protectedIssue) => {
  expect(
    planProjectGenerationFailure({
      issue: protectedIssue,
      producer: "project-submission",
      ownedPull: null,
      runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/3",
      reasonCode: "generation-failed",
    }),
  ).toEqual({ action: "noop" });
});

test("does not overwrite a newer successful PR-open state", () => {
  expect(
    planProjectGenerationFailure({
      issue: issue([
        "issue-admitted",
        "project-submission",
        "submission-pr-open",
      ]),
      producer: "project-submission",
      ownedPull: null,
      runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/4",
      reasonCode: "generation-failed",
    }),
  ).toEqual({ action: "noop" });
});

test("re-reads issue state immediately before label mutation", async () => {
  let issueReads = 0;
  const calls: string[] = [];
  const request = async (path: string, options?: Record<string, unknown>) => {
    calls.push(`${options?.method ?? "GET"} ${path}`);
    if (path.endsWith("/issues/166")) {
      issueReads += 1;
      return issueReads === 1
        ? issue([
            "issue-admitted",
            "project-owner-request",
            "needs-maintainer-review",
          ])
        : issue([
            "issue-admitted",
            "project-owner-request",
            "needs-information",
          ]);
    }
    if (path.includes("/pulls?")) return [];
    return [];
  };

  await expect(
    reconcileProjectGenerationFailure({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 166,
      producer: "project-owner-request",
      runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/5",
      reasonCode: "generation-failed",
      request,
    }),
  ).resolves.toEqual({ action: "noop" });

  expect(issueReads).toBe(2);
  expect(calls.some((call) => call.startsWith("PUT "))).toBe(false);
  expect(calls.some((call) => call.startsWith("PATCH "))).toBe(false);
  expect(calls.some((call) => call.startsWith("POST "))).toBe(false);
});

test("paginates comments before updating the owned failure marker", async () => {
  const marker =
    "<!-- tavernary-project-generation-failure:project-owner-request -->";
  const calls: string[] = [];
  const request = async (path: string, options?: Record<string, unknown>) => {
    calls.push(`${options?.method ?? "GET"} ${path}`);
    if (path.endsWith("/issues/166")) {
      return issue([
        "issue-admitted",
        "project-owner-request",
        "needs-maintainer-review",
      ]);
    }
    if (path.includes("/pulls?")) return [];
    if (path.endsWith("/issues/166/comments?per_page=100")) {
      return Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        body: "ordinary comment",
      }));
    }
    if (path.endsWith("/issues/166/comments?per_page=100&page=2")) {
      return [{ id: 144, body: `${marker}\nOld failure.` }];
    }
    return {};
  };

  await reconcileProjectGenerationFailure({
    repository: "MentallyQuill/Tavernary",
    issueNumber: 166,
    producer: "project-owner-request",
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/6",
    reasonCode: "generation-failed",
    request,
  });

  expect(calls).toContain(
    "GET /repos/MentallyQuill/Tavernary/issues/166/comments?per_page=100&page=2",
  );
  expect(calls).toContain(
    "PATCH /repos/MentallyQuill/Tavernary/issues/comments/144",
  );
  expect(calls).not.toContain(
    "POST /repos/MentallyQuill/Tavernary/issues/166/comments",
  );
});
