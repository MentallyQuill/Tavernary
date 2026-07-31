import { expect, test, vi } from "vitest";

import { renderRedditRetryState } from "../../scripts/submissions/project-submission-retry-state.mjs";
import { retryDueProjectSubmissionEnrichment } from "../../scripts/submissions/retry-project-submission-enrichment.mjs";

function issueBody(postId: string) {
  return [
    "### Project manifest",
    "",
    "```json",
    JSON.stringify({
      schema_version: 4,
      project_type: "preset",
      primary_function: "preset",
      source_url: `https://www.reddit.com/r/SillyTavernAI/comments/${postId}/demo/`,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic"],
          other: [],
        },
        completion_formats: ["chat-completion"],
      },
    }),
    "```",
  ].join("\n");
}

function retryComment(
  issueNumber: number,
  postId: string,
  nextEligibleRetryAt: string,
) {
  return {
    id: issueNumber,
    body: [
      "<!-- tavernary-project-generation-failure:project-submission -->",
      renderRedditRetryState({
        schema_version: 1,
        issue_number: issueNumber,
        source_identity: `reddit:${postId}`,
        completed_waves: 1,
        next_eligible_retry_at: nextEligibleRetryAt,
        last_reason_code: "reddit-rate-limited",
        updated_at: "2026-07-30T18:00:00.000Z",
        outcome: "pending",
      }),
    ].join("\n"),
  };
}

function candidate(number: number, postId: string, extraLabels: string[] = []) {
  return {
    number,
    state: "open",
    labels: [
      "issue-admitted",
      "project-submission",
      "submission-retryable",
      ...extraLabels,
    ].map((name) => ({ name })),
    body: issueBody(postId),
  };
}

test("dispatches only due, current Reddit submission retries", async () => {
  const due = candidate(165, "1v9u18m");
  const notDue = candidate(166, "notdue");
  const identityMismatch = candidate(167, "currentpost");
  const blocked = candidate(168, "blocked", ["needs-information"]);
  const pullRequest = {
    ...candidate(169, "pullrequest"),
    pull_request: { url: "https://api.github.com/pulls/169" },
  };
  const closed = { ...candidate(170, "closed"), state: "closed" };
  const pageOne = Array.from({ length: 100 }, (_, index) => ({
    ...candidate(1_000 + index, `filler${index}`),
    pull_request: { url: `https://api.github.com/pulls/${1_000 + index}` },
  }));
  const request = vi.fn(
    async (path: string, options?: Record<string, unknown>) => {
      if (
        path.endsWith(
          "issues?state=open&labels=issue-admitted%2Cproject-submission%2Csubmission-retryable&per_page=100&page=1",
        )
      ) {
        return pageOne;
      }
      if (
        path.endsWith(
          "issues?state=open&labels=issue-admitted%2Cproject-submission%2Csubmission-retryable&per_page=100&page=2",
        )
      ) {
        return [due, notDue, identityMismatch, blocked, pullRequest, closed];
      }
      if (path.endsWith("/issues/165/comments?per_page=100")) {
        return Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          body: "ordinary comment",
        }));
      }
      if (path.endsWith("/issues/165/comments?per_page=100&page=2")) {
        return [retryComment(165, "1v9u18m", "2026-07-30T19:00:00.000Z")];
      }
      if (path.endsWith("/issues/166/comments?per_page=100")) {
        return [retryComment(166, "notdue", "2026-07-30T20:00:00.000Z")];
      }
      if (path.endsWith("/issues/167/comments?per_page=100")) {
        return [retryComment(167, "differentpost", "2026-07-30T19:00:00.000Z")];
      }
      if (
        path.endsWith(
          "/actions/workflows/generate-project-submission.yml/dispatches",
        )
      ) {
        expect(options).toEqual({
          method: "POST",
          body: JSON.stringify({
            ref: "main",
            inputs: {
              issue_number: "165",
              force_regeneration: "false",
            },
          }),
        });
        return null;
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  );

  await expect(
    retryDueProjectSubmissionEnrichment({
      repository: "MentallyQuill/Tavernary",
      ref: "main",
      now: "2026-07-30T19:05:00.000Z",
      request,
    }),
  ).resolves.toEqual([165]);

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/actions/workflows/generate-project-submission.yml/dispatches",
    {
      method: "POST",
      body: JSON.stringify({
        ref: "main",
        inputs: {
          issue_number: "165",
          force_regeneration: "false",
        },
      }),
    },
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/165/comments?per_page=100&page=2",
  );
  expect(
    request.mock.calls.some(([path]) =>
      String(path).includes("/issues/168/comments"),
    ),
  ).toBe(false);
});
