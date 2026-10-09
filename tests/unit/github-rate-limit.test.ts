import { expect, test } from "vitest";
import { createGithubCliFailure } from "../../scripts/submissions/kit-submission-reconciliation.mjs";
import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";
import { githubFailureStatus } from "../../scripts/automation/github-inventory.mjs";

test.each([
  ["API rate limit exceeded (HTTP 403)", "transient", "provider-rate-limited"],
  [
    "You have exceeded a secondary rate limit (HTTP 403)",
    "transient",
    "provider-rate-limited",
  ],
  [
    "Resource not accessible by integration (HTTP 403)",
    "configuration",
    "authentication-unavailable",
  ],
])(
  "native GitHub CLI failure %s retains the correct retry classification",
  (message, kind, reasonCode) => {
    const error = createGithubCliFailure(
      ["api", "repos/MentallyQuill/Tavernary/issues"],
      1,
      message,
    );
    expect(error).toBeInstanceOf(Error);
    expect(
      classifyAutomationFailure({
        diagnosticCode: error.code,
        httpStatus: githubFailureStatus(error),
      }),
    ).toEqual({ kind, reasonCode });
  },
);
