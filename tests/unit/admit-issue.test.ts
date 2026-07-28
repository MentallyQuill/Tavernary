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

const ownerBody = [
  "### Request type",
  "",
  "Edit card details",
  "",
  "### Project ID",
  "",
  "owner-alpha",
  "",
  "### Current repository",
  "",
  "https://github.com/Owner/Alpha",
  "",
  "### Proposed display name",
  "",
  "Alpha",
  "",
  "### Proposed summary",
  "",
  "Owner-authored summary.",
  "",
  "### Supported frontends",
  "",
  "sillytavern",
  "",
  "### Primary function",
  "",
  "extension",
  "",
  "### Capabilities",
  "",
  "automation",
  "",
  "### Model families",
  "",
  "_No response_",
  "",
  "### Completion formats",
  "",
  "_No response_",
  "",
  "### Proposed repository",
  "",
  "_No response_",
  "",
  "### Explanation or public note",
  "",
  "_No response_",
  "",
  "### Delist confirmation",
  "",
  "_No response_",
  "",
  "### Owner request manifest",
  "",
  "_No response_",
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

test("restores a missing Kit route label during admission", async () => {
  const request = vi.fn(async () => null);
  const baseEvent = event(109, "COLLABORATOR");
  const kitEvent = {
    ...baseEvent,
    issue: { ...baseEvent.issue, body: kitBody },
  };

  const decision = await processIssueAdmission({ event: kitEvent, request });
  expect(decision).toMatchObject({ admitted: true, route: "kit" });
  expect(issueAdmissionOutputs(decision, kitEvent)).toMatchObject({
    route: "kit",
  });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/109/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["kit-submission"] }),
    }),
  );
  for (const name of [
    "project-submission",
    "kit-submission",
    "kit-withdrawal",
  ]) {
    expect(request).toHaveBeenCalledWith(
      "/repos/MentallyQuill/Tavernary/labels",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"name":"${name}"`),
      }),
    );
  }
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
  [["project-information"], "project-report"],
  [[{ name: "project-information" }], "project-report"],
  [["website-bug"], "website-bug"],
  [[{ name: "website-bug" }], "website-bug"],
  [["kit-report"], "kit-report"],
  [[{ name: "kit-report" }], "kit-report"],
  [["other"], "other-help"],
  [[{ name: "other" }], "other-help"],
  [["project-owner-request"], "project-owner"],
  [[{ name: "project-owner-request" }], "project-owner"],
  [[], "none"],
  [["bug"], "none"],
  [["project-submission", "kit-submission"], "conflict"],
  [["project-information", "website-bug"], "conflict"],
  [["project-owner-request", "project-information"], "conflict"],
  [["website-bug", "kit-report"], "conflict"],
  [["kit-report", "other"], "conflict"],
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

test("recovers only the complete owner-request form route", () => {
  expect(issueRouteFromBody(ownerBody)).toBe("project-owner");
  expect(effectiveIssueRoute({ body: ownerBody, labels: [] })).toBe(
    "project-owner",
  );
  expect(
    issueRouteFromBody(ownerBody.replace("### Owner request manifest", "")),
  ).toBe("none");
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

test.each([
  [
    [
      "### Project",
      "",
      "example — https://github.com/example/project",
      "",
      "### Category",
      "",
      "Incorrect or outdated card information",
      "",
      "### What should be reviewed?",
      "",
      "The summary is outdated.",
      "",
      "### Requested outcome",
      "",
      "_No response_",
      "",
      "### Supporting evidence",
      "",
      "_No response_",
      "",
      "### Help manifest",
      "",
      "_No response_",
    ].join("\n"),
    "project-report",
  ],
  [
    [
      "### Category",
      "",
      "Accessibility",
      "",
      "### Page URL",
      "",
      "https://tavernary.org/",
      "",
      "### What happened?",
      "",
      "Focus disappeared.",
      "",
      "### What did you expect?",
      "",
      "Visible focus.",
      "",
      "### Steps to reproduce",
      "",
      "Press Tab.",
      "",
      "### Browser",
      "",
      "Firefox",
      "",
      "### Device",
      "",
      "Desktop",
      "",
      "### Additional context",
      "",
      "_No response_",
      "",
      "### Help manifest",
      "",
      "_No response_",
    ].join("\n"),
    "website-bug",
  ],
  [
    [
      "### Kit ID",
      "",
      "example-kit",
      "",
      "### Kit share URL",
      "",
      "https://tavernary.org/?kit=example-kit",
      "",
      "### Category",
      "",
      "Duplicate Kit",
      "",
      "### Affected project IDs",
      "",
      "_No response_",
      "",
      "### Details",
      "",
      "Duplicates another Kit.",
      "",
      "### Supporting evidence",
      "",
      "_No response_",
      "",
      "### Help manifest",
      "",
      "_No response_",
    ].join("\n"),
    "kit-report",
  ],
  [
    [
      "### Category",
      "",
      "Using Tavernary",
      "",
      "### Subject",
      "",
      "Finding projects",
      "",
      "### Description",
      "",
      "How do filters work?",
      "",
      "### Relevant URL",
      "",
      "_No response_",
      "",
      "### Help manifest",
      "",
      "_No response_",
    ].join("\n"),
    "other-help",
  ],
])("recovers the %s Help route from exact fallback headings", (body, route) => {
  expect(issueRouteFromBody(body)).toBe(route);
});

test("fails closed when multiple complete Help route signatures conflict", () => {
  expect(
    issueRouteFromBody(
      [
        "### Project",
        "",
        "example — https://github.com/example/project",
        "",
        "### What should be reviewed?",
        "",
        "Outdated.",
        "",
        "### Requested outcome",
        "",
        "_No response_",
        "",
        "### Supporting evidence",
        "",
        "_No response_",
        "",
        "### Category",
        "",
        "Using Tavernary",
        "",
        "### Subject",
        "",
        "Help",
        "",
        "### Description",
        "",
        "Question.",
        "",
        "### Relevant URL",
        "",
        "_No response_",
        "",
        "### Help manifest",
        "",
        "_No response_",
      ].join("\n"),
    ),
  ).toBe("conflict");
});

test("restores a missing public Help route label during admission", async () => {
  const request = vi.fn(async () => null);
  const baseEvent = event(120, "COLLABORATOR");
  const helpEvent = {
    ...baseEvent,
    issue: {
      ...baseEvent.issue,
      body: [
        "### Category",
        "",
        "Using Tavernary",
        "",
        "### Subject",
        "",
        "Finding projects",
        "",
        "### Description",
        "",
        "How do filters work?",
        "",
        "### Relevant URL",
        "",
        "_No response_",
        "",
        "### Help manifest",
        "",
        "_No response_",
      ].join("\n"),
    },
  };

  await expect(
    processIssueAdmission({ event: helpEvent, request }),
  ).resolves.toMatchObject({ admitted: true, route: "other-help" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/120/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["other"] }),
    }),
  );
  for (const name of [
    "project-information",
    "website-bug",
    "kit-report",
    "other",
    "project-owner-request",
    "safety-review",
    "rights-review",
    "accessibility",
    "bug",
    "question",
    "duplicate-candidate",
  ]) {
    expect(request).toHaveBeenCalledWith(
      "/repos/MentallyQuill/Tavernary/labels",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"name":"${name}"`),
      }),
    );
  }
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

test("restores a missing Kit route label on an admitted issue edit", async () => {
  const request = vi.fn(async () => null);
  const baseEvent = event(109, "NONE", "edited", ["issue-admitted"]);
  const kitEvent = {
    ...baseEvent,
    issue: { ...baseEvent.issue, body: kitBody },
  };

  await expect(
    processIssueAdmission({ event: kitEvent, request }),
  ).resolves.toMatchObject({
    admitted: true,
    reason: "existing-admission",
    route: "kit",
  });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/109/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["kit-submission"] }),
    }),
  );
});

test("provisions public Help labels before routing an admitted issue edit", async () => {
  const request = vi.fn(
    async (_path: string, _options?: { method?: string; body?: string }) =>
      null,
  );

  await expect(
    processIssueAdmission({
      event: event(121, "NONE", "edited", ["issue-admitted", "website-bug"]),
      request,
    }),
  ).resolves.toMatchObject({
    admitted: true,
    reason: "existing-admission",
    route: "website-bug",
  });
  for (const name of ["website-bug", "bug", "accessibility"]) {
    expect(request).toHaveBeenCalledWith(
      "/repos/MentallyQuill/Tavernary/labels",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"name":"${name}"`),
      }),
    );
  }
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/121/labels") && options?.method === "POST",
    ),
  ).toBe(false);
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
