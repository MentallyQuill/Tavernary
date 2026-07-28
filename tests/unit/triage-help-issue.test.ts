import { expect, test, vi } from "vitest";

import {
  HELP_TRIAGE_MARKER,
  processHelpIssueTriage,
} from "../../scripts/help/triage-help-issue.mjs";

function issueBody(fields: Array<[string, string]>) {
  return fields
    .map(([heading, value]) => `### ${heading}\n\n${value}`)
    .join("\n\n");
}

function event(issueNumber = 41) {
  return {
    repository: { full_name: "MentallyQuill/Tavernary" },
    inputs: { issue_number: issueNumber },
    issue: { number: 999, body: "stale event issue" },
  };
}

function websiteBody(manifest = "_No response_") {
  return issueBody([
    ["Category", "Accessibility"],
    ["Page URL", "https://tavernary.org/help/"],
    ["What happened?", "The focus indicator disappears."],
    ["What did you expect?", "The focused control remains visible."],
    ["Steps to reproduce", "Open Help and press Tab."],
    ["Browser", "Firefox 128"],
    ["Device", "Windows 11"],
    ["Additional context", "_No response_"],
    ["Help manifest", manifest],
  ]);
}

test("fetches the latest admitted issue and replaces only Help-owned labels", async () => {
  const latestIssue = {
    number: 41,
    state: "open",
    body: websiteBody(),
    labels: [
      { name: "issue-admitted" },
      { name: "website-bug" },
      { name: "rights-review" },
      { name: "maintainer-priority" },
    ],
  };
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (
        path === "/repos/MentallyQuill/Tavernary/issues/41" &&
        !options?.method
      ) {
        return latestIssue;
      }
      return null;
    },
  );

  await expect(
    processHelpIssueTriage({ event: event(), request }),
  ).resolves.toEqual({
    valid: true,
    issueNumber: 41,
    requestKind: "website-bug",
    labels: ["website-bug", "bug", "accessibility"],
  });
  expect(request.mock.calls[0]).toEqual([
    "/repos/MentallyQuill/Tavernary/issues/41",
  ]);
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/41/labels/rights-review",
    { method: "DELETE" },
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/41/labels",
    {
      method: "POST",
      body: JSON.stringify({
        labels: ["website-bug", "bug", "accessibility"],
      }),
    },
  );
  expect(
    request.mock.calls.some(([path]) =>
      String(path).includes("maintainer-priority"),
    ),
  ).toBe(false);
});

test("rejects a latest issue that is no longer admitted before mutation", async () => {
  const request = vi.fn(async () => ({
    number: 41,
    state: "open",
    body: websiteBody(),
    labels: [{ name: "website-bug" }],
  }));

  await expect(
    processHelpIssueTriage({ event: event(), request }),
  ).rejects.toThrow("Help issue is not open and admitted.");
  expect(request).toHaveBeenCalledTimes(1);
});

test("posts one marker-owned correction comment for invalid manifest input", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (
        path === "/repos/MentallyQuill/Tavernary/issues/41" &&
        !options?.method
      ) {
        return {
          number: 41,
          state: "open",
          body: websiteBody("```json\n{not-json}\n```"),
          labels: [{ name: "issue-admitted" }, { name: "website-bug" }],
        };
      }
      if (path.endsWith("/comments?per_page=100") && !options?.method)
        return [];
      return null;
    },
  );

  const decision = await processHelpIssueTriage({
    event: event(),
    request,
  });

  expect(decision).toEqual({
    valid: false,
    issueNumber: 41,
    errors: [
      "Help manifest is not valid JSON. Correct the Help manifest or leave it empty to use the readable fields.",
    ],
  });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/41/comments",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining(HELP_TRIAGE_MARKER),
    }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/41/labels") && options?.method === "POST",
    ),
  ).toBe(false);
});

test("updates the existing marker comment instead of posting a duplicate", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (
        path === "/repos/MentallyQuill/Tavernary/issues/41" &&
        !options?.method
      ) {
        return {
          number: 41,
          state: "open",
          body: websiteBody("not json"),
          labels: ["issue-admitted", "website-bug"],
        };
      }
      if (path.endsWith("/comments?per_page=100") && !options?.method) {
        return [
          {
            id: 700,
            body: `${HELP_TRIAGE_MARKER}\nOld correction`,
            user: { login: "github-actions[bot]" },
          },
        ];
      }
      return null;
    },
  );

  await processHelpIssueTriage({ event: event(), request });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/comments/700",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/41/comments") && options?.method === "POST",
    ),
  ).toBe(false);
});

test("does not overwrite a user-authored comment that contains the marker", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (
        path === "/repos/MentallyQuill/Tavernary/issues/41" &&
        !options?.method
      ) {
        return {
          number: 41,
          state: "open",
          body: websiteBody("not json"),
          labels: ["issue-admitted", "website-bug"],
        };
      }
      if (path.endsWith("/comments?per_page=100") && !options?.method) {
        return [
          {
            id: 701,
            body: `${HELP_TRIAGE_MARKER}\nUser-authored text`,
            user: { login: "reporter" },
          },
        ];
      }
      return null;
    },
  );

  await processHelpIssueTriage({ event: event(), request });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/41/comments",
    expect.objectContaining({ method: "POST" }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/comments/701") && options?.method === "PATCH",
    ),
  ).toBe(false);
});

test("rejects a mismatch between latest route labels and parsed request kind", async () => {
  const request = vi.fn(async (path: string, options?: { method?: string }) => {
    if (
      path === "/repos/MentallyQuill/Tavernary/issues/41" &&
      !options?.method
    ) {
      return {
        number: 41,
        state: "open",
        body: websiteBody(),
        labels: ["issue-admitted", "project-information"],
      };
    }
    if (path.endsWith("/comments?per_page=100")) return [];
    return null;
  });

  await expect(
    processHelpIssueTriage({ event: event(), request }),
  ).resolves.toEqual({
    valid: false,
    issueNumber: 41,
    errors: [
      "Help request kind website-bug does not match the admitted project-report route.",
    ],
  });
});
