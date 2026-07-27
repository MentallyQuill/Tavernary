import { expect, test, vi } from "vitest";

import {
  effectiveIssueRoute,
  issueRouteFromBody,
  issueRouteFromLabels,
  issueAdmissionOutputs,
  listOpenIssues,
  processIssueAdmission,
} from "../../scripts/submissions/admit-issue.mjs";

const kitBody = [
  "### Kit title",
  "",
  "Super Awesome Test Kit",
  "",
  "### Kit description",
  "",
  "Testing.",
  "",
  "### Kit manifest",
  "",
  "```json",
  '{"operation":"create","kit_id":null,"title":"Super Awesome Test Kit","description":"Testing.","project_ids":["sillytavern-sillytavern"]}',
  "```",
].join("\n");

function event(
  number = 11,
  association = "NONE",
  action: "opened" | "reopened" | "edited" = "opened",
  labels: Array<string | { name: string }> = [],
) {
  return {
    action,
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: {
      number,
      state: "open",
      created_at: `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
      author_association: association,
      user: { id: 42, login: "submitter" },
      labels,
    },
  };
}

function openIssues(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    created_at: `2026-07-25T00:${String(index + 1).padStart(2, "0")}:00Z`,
    user: { id: 42 },
  }));
}

test("paginates open issues and preserves numeric identity data", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    created_at: "2026-07-25T00:00:00Z",
    user: { id: 42 },
  }));
  const request = vi
    .fn()
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce([
      {
        number: 101,
        created_at: "2026-07-25T00:00:00Z",
        user: { id: 42 },
      },
    ]);

  await expect(
    listOpenIssues({
      repository: "MentallyQuill/Tavernary",
      creator: "submitter",
      request,
    }),
  ).resolves.toHaveLength(101);
  expect(request).toHaveBeenNthCalledWith(
    2,
    "/repos/MentallyQuill/Tavernary/issues?state=open&creator=submitter&per_page=100&page=2",
  );
});

test("admits an issue within the oldest ten", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("?state=open")) return openIssues(10);
    return null;
  });

  await expect(
    processIssueAdmission({ event: event(10), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "within-limit" });
  expect(request.mock.calls.map(([path]) => path)).toContain(
    "/repos/MentallyQuill/Tavernary/issues/10/labels/issue-limit-reached",
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/10/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("closes the eleventh issue with one neutral marker comment", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (path.includes("?state=open")) return openIssues(11);
      if (path.includes("/comments?") && !options?.method) return [];
      return null;
    },
  );

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: false, reason: "over-limit" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11",
    {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
    },
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path === "/repos/MentallyQuill/Tavernary/issues/11/comments" &&
        options?.method === "POST" &&
        options.body?.includes("tavernary-open-issue-limit"),
    ),
  ).toBe(true);
});

test("rechecks a reopened issue and updates its existing marker comment", async () => {
  const request = vi.fn(
    async (path: string, options?: { method?: string; body?: string }) => {
      if (path.includes("?state=open")) return openIssues(11);
      if (path.includes("/comments?") && !options?.method) {
        return [
          {
            id: 700,
            body: "<!-- tavernary-open-issue-limit -->\nOld copy",
          },
        ];
      }
      return null;
    },
  );

  await processIssueAdmission({
    event: event(11, "NONE", "reopened"),
    request,
  });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/comments/700",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/11/comments") && options?.method === "POST",
    ),
  ).toBe(false);
});

test("fails open when the open-issue lookup fails", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("?state=open")) throw new Error("GitHub 503");
    return null;
  });

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "lookup-failed" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("trusted collaborators bypass lookup and admission limits", async () => {
  const request = vi.fn(async (_path: string) => null);

  await expect(
    processIssueAdmission({
      event: event(50, "COLLABORATOR"),
      request,
    }),
  ).resolves.toMatchObject({ admitted: true, reason: "trusted" });
  expect(
    request.mock.calls.some(([path]) => String(path).includes("?state=open")),
  ).toBe(false);
});

test("reports admission outputs for downstream workflow dispatch", () => {
  expect(
    issueAdmissionOutputs(
      { admitted: true },
      event(21, "COLLABORATOR", "opened", ["kit-submission"]),
    ),
  ).toEqual({
    admitted: "true",
    issue_number: "21",
    route: "kit",
  });
});

test.each([
  [["project-submission"], "project"],
  [[{ name: "project-submission" }], "project"],
  [["kit-submission"], "kit"],
  [[{ name: "kit-submission" }], "kit"],
  [["kit-withdrawal"], "kit-withdrawal"],
  [[{ name: "kit-withdrawal" }], "kit-withdrawal"],
  [[], "none"],
  [["bug"], "none"],
  [["project-submission", "kit-submission"], "conflict"],
  [["project-submission", "kit-withdrawal"], "conflict"],
  [["kit-submission", "kit-withdrawal"], "conflict"],
  [["project-submission", "kit-submission", "kit-withdrawal"], "conflict"],
])("classifies issue labels %j as route %s", (labels, expected) => {
  expect(issueRouteFromLabels(labels)).toBe(expected);
});

test("recovers an unlabeled Kit route from the complete structured form", () => {
  expect(issueRouteFromBody(kitBody)).toBe("kit");
  expect(effectiveIssueRoute({ body: kitBody, labels: [] })).toBe("kit");
});

test("recovers an unlabeled Project route from the complete structured form", () => {
  expect(
    issueRouteFromBody(
      [
        "### Project Type",
        "",
        "Extension",
        "",
        "### Project URL",
        "",
        "https://github.com/example/project",
        "",
        "### Frontend-independent",
        "",
        "No",
      ].join("\n"),
    ),
  ).toBe("project");
});

test("recovers an unlabeled Kit withdrawal route from the complete structured form", () => {
  expect(
    issueRouteFromBody(
      [
        "### Kit ID",
        "",
        "story-kit-1",
        "",
        "### Kit share URL",
        "",
        "https://tavernary.org/?kit=story-kit-1",
        "",
        "### Confirmation",
        "",
        "- [x] I request withdrawal of this Kit.",
      ].join("\n"),
    ),
  ).toBe("kit-withdrawal");
});

test("fails closed when complete structured form shapes conflict", () => {
  expect(
    issueRouteFromBody(
      [
        kitBody,
        "",
        "### Kit ID",
        "",
        "story-kit-1",
        "",
        "### Kit share URL",
        "",
        "https://tavernary.org/?kit=story-kit-1",
        "",
        "### Confirmation",
        "",
        "- [x] I request withdrawal of this Kit.",
      ].join("\n"),
    ),
  ).toBe("conflict");
});

test("does not recover a route from a partial form or title", () => {
  expect(issueRouteFromBody("### Kit title\n\nIncomplete")).toBe("none");
  expect(
    effectiveIssueRoute({
      title: "[Kit submission]: title only",
      body: "ordinary issue body",
      labels: [],
    }),
  ).toBe("none");
});

test("keeps explicit routing labels authoritative", () => {
  expect(
    effectiveIssueRoute({
      body: kitBody,
      labels: ["project-submission"],
    }),
  ).toBe("project");
});

test("routes an admitted issue edit without changing admission state", async () => {
  const request = vi.fn();

  await expect(
    processIssueAdmission({
      event: event(21, "NONE", "edited", [
        { name: "issue-admitted" },
        { name: "project-submission" },
      ]),
      request,
    }),
  ).resolves.toMatchObject({
    admitted: true,
    reason: "existing-admission",
  });
  expect(request).not.toHaveBeenCalled();
});

test("does not route an unadmitted issue edit", async () => {
  const request = vi.fn();

  await expect(
    processIssueAdmission({
      event: event(21, "NONE", "edited", ["kit-submission"]),
      request,
    }),
  ).resolves.toMatchObject({
    admitted: false,
    reason: "existing-admission",
  });
  expect(request).not.toHaveBeenCalled();
});
