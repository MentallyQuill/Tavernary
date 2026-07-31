import { expect, test } from "vitest";

import {
  loadRedditRetryState,
  normalizeRedditRetryState,
  parseRedditRetryState,
  planRedditRetryTransition,
  REDDIT_RETRY_MARKER,
  renderRedditRetryState,
  upsertRedditRetryComment,
  type RedditRetryState,
} from "../../scripts/submissions/project-submission-retry-state.mjs";

function pendingState(
  overrides: Partial<RedditRetryState> = {},
): RedditRetryState {
  return {
    schema_version: 1,
    issue_number: 165,
    source_identity: "reddit:1v9u18m",
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending",
    ...overrides,
  };
}

test("schedules wave two one hour after first-wave exhaustion", () => {
  expect(
    planRedditRetryTransition({
      current: null,
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-rate-limited",
      now: "2026-07-30T18:00:00.000Z",
    }),
  ).toEqual({
    action: "schedule",
    state: {
      schema_version: 1,
      issue_number: 165,
      source_identity: "reddit:1v9u18m",
      completed_waves: 1,
      next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
      last_reason_code: "reddit-rate-limited",
      updated_at: "2026-07-30T18:00:00.000Z",
      outcome: "pending",
    },
  });
});

test("schedules wave three one hour after second-wave exhaustion", () => {
  expect(
    planRedditRetryTransition({
      current: pendingState(),
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-server-error",
      now: "2026-07-30T19:05:00.000Z",
    }),
  ).toMatchObject({
    action: "schedule",
    state: {
      completed_waves: 2,
      next_eligible_retry_at: "2026-07-30T20:05:00.000Z",
      last_reason_code: "reddit-server-error",
    },
  });
});

test("selects a placeholder after third-wave exhaustion", () => {
  expect(
    planRedditRetryTransition({
      current: pendingState({ completed_waves: 2 }),
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-post-unavailable",
      now: "2026-07-30T20:10:00.000Z",
    }),
  ).toMatchObject({
    action: "placeholder",
    state: {
      completed_waves: 3,
      next_eligible_retry_at: null,
      outcome: "placeholder",
    },
  });
});

test("refuses to advance a retry state for a different source", () => {
  expect(() =>
    planRedditRetryTransition({
      current: pendingState({ source_identity: "reddit:different" }),
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-fetch-failed",
      now: "2026-07-30T19:05:00.000Z",
    }),
  ).toThrow("Reddit retry state does not match the current submission.");
});

test("round-trips one strict issue-backed retry marker", () => {
  const state = pendingState();
  const rendered = renderRedditRetryState(state);

  expect(rendered).toBe(
    `${REDDIT_RETRY_MARKER}\n${JSON.stringify(state)}\n-->`,
  );
  expect(
    parseRedditRetryState(rendered, {
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
    }),
  ).toEqual(state);
});

test.each([
  [
    "unknown keys",
    pendingState({ unexpected: true } as Partial<RedditRetryState>),
  ],
  ["issue mismatch", pendingState({ issue_number: 166 })],
  ["source mismatch", pendingState({ source_identity: "reddit:different" })],
  [
    "invalid next retry timestamp",
    pendingState({ next_eligible_retry_at: "tomorrow" }),
  ],
  ["invalid pending wave", pendingState({ completed_waves: 3 })],
  [
    "invalid placeholder invariant",
    pendingState({
      completed_waves: 3,
      next_eligible_retry_at: "2026-07-30T21:00:00.000Z",
      outcome: "placeholder",
    }),
  ],
])("rejects retry state with %s", (_name, value) => {
  expect(
    normalizeRedditRetryState(value, {
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
    }),
  ).toBeNull();
});

test("loads retry state only from one owned generation-failure comment", () => {
  const marker = renderRedditRetryState(pendingState());
  const ordinaryComment = { id: 1, body: marker };
  const ownedComment = {
    id: 2,
    body: [
      "<!-- tavernary-project-generation-failure:project-submission -->",
      "Generation stopped.",
      marker,
    ].join("\n"),
  };
  const expected = {
    issueNumber: 165,
    sourceIdentity: "reddit:1v9u18m",
  } as const;

  expect(
    loadRedditRetryState([ordinaryComment, ownedComment], expected),
  ).toEqual(pendingState());
  expect(
    loadRedditRetryState([ownedComment, { ...ownedComment, id: 3 }], expected),
  ).toBeNull();
});

test("rejects duplicate retry markers in one comment", () => {
  const marker = renderRedditRetryState(pendingState());

  expect(
    parseRedditRetryState(`${marker}\n${marker}`, {
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
    }),
  ).toBeNull();
});

function redditIssue(
  labels = ["issue-admitted", "project-submission", "submission-retryable"],
  sourceUrl = "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/demo/",
  state = "open",
) {
  const manifest = {
    schema_version: 4,
    project_type: "preset",
    primary_function: "preset",
    source_url: sourceUrl,
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    metadata: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    preset_compatibility: {
      model_families: { known_ids: ["model-agnostic"], other: [] },
      completion_formats: ["chat-completion"],
    },
  };
  return {
    number: 165,
    state,
    labels: labels.map((name) => ({ name })),
    body: `### Project manifest\n\n\`\`\`json\n${JSON.stringify(manifest)}\n\`\`\``,
  };
}

function terminalState(
  outcome: "source-ready" | "placeholder" = "source-ready",
): RedditRetryState {
  return {
    ...pendingState(),
    completed_waves: outcome === "placeholder" ? 3 : 1,
    next_eligible_retry_at: null,
    outcome,
  };
}

test("updates the existing owned retry marker after source recovery", async () => {
  const calls: Array<{
    path: string;
    options?: Record<string, unknown>;
  }> = [];
  const existingBody = [
    "<!-- tavernary-project-generation-failure:project-submission -->",
    "Generation stopped.",
    renderRedditRetryState(pendingState()),
  ].join("\n");
  const request = async (path: string, options?: Record<string, unknown>) => {
    calls.push({ path, options });
    if (path.endsWith("/issues/165")) return redditIssue();
    if (path.endsWith("/issues/165/comments?per_page=100")) {
      return [{ id: 55, body: existingBody }];
    }
    return {};
  };

  await expect(
    upsertRedditRetryComment({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      state: terminalState(),
      request,
    }),
  ).resolves.toEqual({ action: "update", commentId: 55 });

  const patch = calls.find(
    (call) =>
      call.path.endsWith("/issues/comments/55") &&
      call.options?.method === "PATCH",
  );
  expect(patch).toBeDefined();
  expect(JSON.parse(String(patch?.options?.body)).body).toContain(
    JSON.stringify(terminalState()),
  );
});

test.each([
  ["closed", redditIssue(undefined, undefined, "closed"), undefined],
  [
    "blocked",
    redditIssue(["issue-admitted", "project-submission", "needs-information"]),
    undefined,
  ],
  [
    "different source",
    redditIssue(
      undefined,
      "https://www.reddit.com/r/SillyTavernAI/comments/different/demo/",
    ),
    undefined,
  ],
  [
    "pending after PR open",
    redditIssue(["issue-admitted", "project-submission", "submission-pr-open"]),
    pendingState(),
  ],
] as const)(
  "does not mutate a %s retry comment",
  async (_name, issue, state) => {
    const calls: Array<{
      path: string;
      options?: Record<string, unknown>;
    }> = [];
    const request = async (path: string, options?: Record<string, unknown>) => {
      calls.push({ path, options });
      if (path.endsWith("/issues/165")) return issue;
      if (path.endsWith("/issues/165/comments?per_page=100")) {
        return [
          {
            id: 55,
            body: [
              "<!-- tavernary-project-generation-failure:project-submission -->",
              renderRedditRetryState(pendingState()),
            ].join("\n"),
          },
        ];
      }
      return {};
    };

    await expect(
      upsertRedditRetryComment({
        repository: "MentallyQuill/Tavernary",
        issueNumber: 165,
        sourceIdentity: "reddit:1v9u18m",
        state: state ?? terminalState(),
        request,
      }),
    ).resolves.toEqual({ action: "noop" });
    expect(calls.some((call) => call.options?.method === "PATCH")).toBe(false);
  },
);

test("allows terminal cleanup after the PR-open label is applied", async () => {
  const calls: string[] = [];
  const request = async (path: string, options?: Record<string, unknown>) => {
    calls.push(`${options?.method ?? "GET"} ${path}`);
    if (path.endsWith("/issues/165")) {
      return redditIssue([
        "issue-admitted",
        "project-submission",
        "submission-pr-open",
      ]);
    }
    if (path.endsWith("/issues/165/comments?per_page=100")) {
      return [
        {
          id: 55,
          body: [
            "<!-- tavernary-project-generation-failure:project-submission -->",
            renderRedditRetryState(pendingState()),
          ].join("\n"),
        },
      ];
    }
    return {};
  };

  await expect(
    upsertRedditRetryComment({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      state: terminalState(),
      request,
    }),
  ).resolves.toMatchObject({ action: "update" });
  expect(calls).toContain(
    "PATCH /repos/MentallyQuill/Tavernary/issues/comments/55",
  );
});
